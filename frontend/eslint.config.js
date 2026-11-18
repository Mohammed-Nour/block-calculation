//  @ts-check

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import js from '@eslint/js';
import { tanstackConfig } from '@tanstack/eslint-config';
import pluginRouter from '@tanstack/eslint-plugin-router';
import prettier from 'eslint-config-prettier/flat';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// Every directory listed here is checked by eslint-plugin-boundaries. Anything
// omitted is silently skipped even if `boundaries/no-unknown-files` is on, so
// this list must stay in sync with the `boundaries/elements` patterns below.
// Absolute so `eslint-module-utils` loads it regardless of which directory it
// resolves resolver names against.
const aliasResolver = path.join(import.meta.dirname, 'eslint-resolver.cjs');

// Exported (ESLint ignores named exports) so scripts/tests/eslint-architecture
// .test.ts can assert that every `src/` directory is covered.
export const boundaryInclude = [
  'src/routes/**/*',
  'src/features/**/*',
  'src/components/**/*',
  'src/lib/**/*',
  'src/hooks/**/*',
  'src/providers/**/*',
  'src/types/**/*',
  'src/schema/**/*',
  'src/data/**/*',
  'src/stores/**/*',
  'src/api/**/*',
  // Shared-layer tests. Outside this list they were skipped entirely: a test
  // here could import a feature's store and lint said nothing.
  'src/tests/**/*',
  'src/styles.css',
];

// A relative parent import bypasses the alias convention
// (docs/frontend/coding-standards.md "Naming": `@/` always) and every path-keyed rule below.
const relativeParentImport = {
  // Any `..` segment, not only a leading one: `./../x` and `@/a/../b` reach the
  // same files and would slip past every path-keyed rule below.
  regex: '(^|/)\\.\\.(/|$)',
  message:
    'Import through the @/ alias, with no `..` segment (docs/frontend/coding-standards.md "Naming") — a parent path also slips past the pure-layer API ban.',
};
// ── Restricted imports and syntax ────────────────────────────────────────────
// Flat config *replaces* a repeated rule for a matching file rather than
// merging it, so two entries that both set `no-restricted-imports` for one file
// leave only the later one in force. Every entry for these two rules is
// therefore built by `restrictedRules`, which appends the shared patterns and
// selectors itself — nothing has to be copied by hand into each file set.

/** A feature importing `@/features/<itself>` — only `import/no-cycle` caught it. */
const selfBarrelImport = (feature) => ({
  regex: `^@/features/${feature}(/index(\\.tsx?)?)?/?$`,
  message: `A feature must not import its own barrel (@/features/${feature}); import the module directly. The barrel is for routes and other features' consumers.`,
});

// `boundaries` allows app → feature at any depth, so docs/frontend/architecture.md §1's
// "features meet in a route, through the barrel — never a deep path" needs this.
const deepFeatureImport = {
  regex: '^@/features/[^/]+/.+',
  message:
    "A route reaches a feature only through its barrel (@/features/<f>), never a deep path (docs/frontend/architecture.md §1). Export what the route needs from the feature's index.ts.",
};

// The shadcn primitives own the focus ring, the disabled state, the size scale
// and the a11y wiring. A hand-rolled `<button>` or `<input>` compiles and
// renders fine and then ships without them, which is why "it looks right on my
// screen" never caught this. `src/components/ui/**` (the shadcn primitives, CLI-managed)
// is the one hand-written place no file set below reaches (`routeTree.gen.ts` is ignored outright).
const rawInteractiveElement = {
  selector:
    'JSXOpeningElement[name.name=/^(button|input|select|textarea|dialog)$/]',
  message:
    'Use the shadcn primitive from `@/components/ui` (`Button`, `Input`, `Select`, `Textarea`, `Dialog`; `IconButton` from `@/components/common` for icon-only controls) instead of a raw interactive element. The primitive carries the focus ring, disabled state, a11y wiring and theming that the raw element loses.',
};

// Zustand's `setState` bypasses the store's actions — and with them the
// clamping, scoping and invariants the actions enforce. The selector keys on
// the `useXStore.setState(...)` naming convention: a destructured `setState`,
// an aliased store or computed access (`useXStore['setState']`) slips past it,
// so review still owns those.
const storeSetState = {
  selector:
    "CallExpression[callee.property.name='setState'][callee.object.name=/^use[A-Z]\\w*Store$/]",
  message:
    'Mutate a store through its actions; only the store file itself and tests (which may arrange state with setState) call setState directly.',
};

// Pure layers hold the functions a feature can test without a network: they
// may read the API's *shapes* but never call it. `boundaries` cannot say this —
// `utils` may import all of `shared`, and the API clients
// and React Query all sit in `shared`. The ban uses the
// typescript-eslint rule, not the core one: a different rule name adds to each
// file set's `no-restricted-imports` instead of replacing it, and it can let
// type-only imports through.
const PURE_LAYER_MESSAGE =
  'utils/, data/, types/, schema/ and src/lib/ are pure: read API shapes (types from @/api/types) and leave fetching to hooks/ (docs/frontend/architecture.md §2). Calling an endpoint, the API client or React Query from here makes the module untestable without a network.';
const pureLayerApiBan = {
  files: [
    'src/features/**/{utils,data,types,schema}/**/*.{ts,tsx}',
    'src/{lib,data,types,schema}/**/*.{ts,tsx}',
  ],
  // Test helpers (a QueryClient wrapper in tests/utils/) are not pure layers.
  ignores: ['**/tests/**', '**/*.test.{ts,tsx}'],
  rules: {
    '@typescript-eslint/no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'axios',
            allowImportNames: ['isAxiosError'],
            allowTypeImports: true,
            message: `${PURE_LAYER_MESSAGE} (\`isAxiosError\` is the one allowed import.)`,
          },
        ],
        patterns: [
          {
            regex: '^@/api/(client|http|mock)(/|$)',
            allowTypeImports: true,
            message: PURE_LAYER_MESSAGE,
          },
          {
            regex: '^@tanstack/(react-)?query',
            allowTypeImports: true,
            message: PURE_LAYER_MESSAGE,
          },
        ],
      },
    ],
  },
};

/** Files where `storeSetState` does not apply. */
const storeOrTestFiles = '**/{*.store.ts,tests/**}';

/**
 * The `no-restricted-imports` and `no-restricted-syntax` entries for one file
 * set. `importPatterns` are the set's own patterns; `relativeParentImport`, the
 * `feature`'s self-barrel ban, the raw-element selector and the setState ban
 * are appended here. Returns two entries: the second re-states the syntax rule
 * without the setState ban for the set's store and test files (`files` given
 * as nested arrays means "matches both", i.e. the intersection).
 */
function restrictedRules({
  files,
  ignores = [],
  feature,
  importPatterns = [],
}) {
  const patterns = [
    ...importPatterns,
    ...(feature ? [selfBarrelImport(feature)] : []),
    relativeParentImport,
  ];
  return [
    {
      files,
      ignores,
      rules: {
        'no-restricted-imports': ['error', { patterns }],
        'no-restricted-syntax': ['error', rawInteractiveElement, storeSetState],
      },
    },
    {
      files: files.map((glob) => [glob, storeOrTestFiles]),
      ignores,
      rules: { 'no-restricted-syntax': ['error', rawInteractiveElement] },
    },
  ];
}

const SOURCE = '**/*.{ts,tsx}';
const featuresDir = path.join(import.meta.dirname, 'src/features');
const features = (
  existsSync(featuresDir)
    ? readdirSync(featuresDir, { withFileTypes: true })
    : []
)
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

// Order matters: a later entry replaces an earlier one for the files both
// match, so each set is listed after any broader set containing it.
const restrictedRuleSets = [
  ...restrictedRules({
    files: [
      `src/{api,hooks,lib,stores,schema,data,types,providers,tests}/${SOURCE}`,
      `src/components/${SOURCE}`,
    ],
    ignores: ['src/components/ui/**'],
  }),
  ...restrictedRules({
    files: [`src/routes/${SOURCE}`, 'src/router.tsx'],
    importPatterns: [deepFeatureImport],
  }),
  ...features.flatMap((feature) =>
    restrictedRules({ files: [`src/features/${feature}/${SOURCE}`], feature }),
  ),
];

export default [
  ...tanstackConfig,
  ...tseslint.configs.recommendedTypeChecked.flat(),
  ...pluginRouter.configs['flat/recommended'],
  js.configs.recommended,
  prettier,
  reactHooks.configs.flat['recommended-latest'],
  {
    ignores: [
      'out/**',
      'build/**',
      'dist/**',
      '.output/**',
      '.tanstack/**',
      'src/routeTree.gen.ts',
    ],
  },
  // Repo tooling (`scripts/**`) is Node, not the app, and is deliberately not
  // in `tsconfig.json`. `recommendedTypeChecked` is applied globally above, so
  // without this the first typed rule that asks for a program fails the whole
  // run with "don't have parserOptions set to generate type information" rather
  // than reporting the script. Only the *type-aware* rules go away — the
  // syntactic ones (unused vars, shadowing, style) still check the script.
  {
    // Root tooling configs join `scripts/**`: none is in the TS program
    // (no `allowJs`), so without this block the
    // lint config and the resolver were checked by nothing.
    files: [
      'scripts/**/*.{mjs,cjs,js}',
      'eslint.config.js',
      'eslint-resolver.cjs',
      'prettier.config.js',
      'lint-staged.config.mjs',
    ],
    ...tseslint.configs.disableTypeChecked,
    // Spread order matters: `disableTypeChecked` brings its own
    // `languageOptions`, so this block has to restate them to keep the
    // "no program" settings. `no-undef` survives (it is a syntactic rule), so
    // the Node globals a script actually uses have to be declared —
    // `@types/node` does not reach a file that is not in the program.
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
  // The resolver has to be CommonJS (`eslint-module-utils` `require`s it), so
  // `require`/`exports`/`__dirname` are its module system, not a style choice.
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'writable',
        exports: 'writable',
        __dirname: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  // Root TS tooling configs run in Node. `no-undef` is the core rule (tsc
  // already checks names), so the one Node global they read is declared.
  {
    files: ['vite.config.ts', 'vitest.config.ts', 'vitest.setup.ts'],
    languageOptions: { globals: { process: 'readonly' } },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        project: null,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { boundaries },
    settings: {
      // boundaries resolves imports through `eslint-module-utils/resolve`, whose
      // default Node resolver cannot see the `@/*` alias. Without this every
      // aliased import — all of them — resolved to nothing and the rules below
      // ran against no dependencies at all. See eslint-resolver.cjs.
      'import/resolver': { [aliasResolver]: {} },
      // The TanStack config registers eslint-plugin-import-x under the
      // `import/` rule prefix, but import-x reads its *settings* under
      // `import-x/`. With only the `import/` resolver above, `import/no-cycle`
      // resolved nothing and silently checked nothing; it also needs the TS
      // extensions to follow a module at all.
      'import-x/resolver': { [aliasResolver]: {} },
      'import-x/extensions': ['.ts', '.tsx'],
      'boundaries/include': boundaryInclude,
      // The default checks only `import … from`. A barrel is nothing but
      // `export … from`, and a lazy route is a dynamic `import()`: without
      // these a barrel could re-export another feature's internals, or a
      // shared module lazy-load a feature, and boundaries would never see it.
      'boundaries/dependency-nodes': ['import', 'export', 'dynamic-import'],
      'boundaries/elements': [
        {
          mode: 'full',
          type: 'shared',
          pattern: [
            'src/api/**/*',
            'src/components/**/*',
            'src/lib/**/*',
            'src/hooks/**/*',
            'src/providers/**/*',
            'src/types/**/*',
            'src/schema/**/*',
            'src/data/**/*',
            'src/stores/**/*',
            'src/tests/**/*',
          ],
        },
        // The `*/**/` in each pattern is what lets a large feature split itself into
        // internal slices — `features/projects/list/utils/…` is typed `utils` just
        // like `features/projects/utils/…`, because `**` also matches zero segments and
        // the first `*` still captures the feature name in both shapes. Without it a
        // sliced folder falls through to the `feature` catch-all below and silently
        // stops being layer-checked.
        {
          mode: 'full',
          type: 'model',
          capture: ['featureName'],
          pattern: [
            'src/features/*/**/types/**/*',
            'src/features/*/**/schema/**/*',
          ],
        },
        {
          mode: 'full',
          type: 'data',
          capture: ['featureName'],
          pattern: ['src/features/*/**/data/**/*'],
        },
        {
          mode: 'full',
          type: 'utils',
          capture: ['featureName'],
          pattern: ['src/features/*/**/utils/**/*'],
        },
        {
          mode: 'full',
          type: 'tests',
          capture: ['featureName'],
          pattern: ['src/features/*/**/tests/**/*'],
        },
        {
          mode: 'full',
          type: 'feature',
          capture: ['featureName'],
          pattern: ['src/features/*/**/*'],
        },
        {
          mode: 'full',
          type: 'app',
          capture: ['fileName'],
          pattern: ['src/routes/**/*'],
        },
        {
          mode: 'full',
          type: 'style',
          pattern: ['src/**/*.css'],
        },
      ],
    },
    rules: {
      semi: ['error', 'always'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      'import/no-cycle': 'error',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/array-type': 'off',
      'boundaries/no-unknown': 'error',
      'boundaries/no-unknown-files': 'error',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          // Layers, innermost first. Each may only import layers above it plus
          // `shared`, and never another feature. See docs/frontend/architecture.md.
          //   model  → types & zod schemas
          //   data   → static config (no logic); may derive one constant from
          //            another in the same feature
          //   utils  → all pure functions, generic or domain-aware
          //   feature  → stores, hooks, components (the only layer with React state)
          //   tests    → may reach anything inside its own feature
          rules: [
            { from: ['shared'], allow: ['shared'] },
            {
              from: ['model'],
              allow: [
                'shared',
                // A type built from another type in the same feature is "derive,
                // never restate", not a layering violation — the same allowance
                // `data` and `utils` already have for their own layer. Restating a
                // type is the thing the rule exists to prevent.
                ['model', { featureName: '${from.featureName}' }],
              ],
            },
            {
              from: ['data'],
              allow: [
                'shared',
                ['model', { featureName: '${from.featureName}' }],
                ['data', { featureName: '${from.featureName}' }],
              ],
            },
            {
              from: ['utils'],
              allow: [
                'shared',
                ['model', { featureName: '${from.featureName}' }],
                ['data', { featureName: '${from.featureName}' }],
                ['utils', { featureName: '${from.featureName}' }],
              ],
            },
            {
              from: ['feature'],
              allow: [
                'shared',
                ['model', { featureName: '${from.featureName}' }],
                ['data', { featureName: '${from.featureName}' }],
                ['utils', { featureName: '${from.featureName}' }],
                ['feature', { featureName: '${from.featureName}' }],
              ],
            },
            {
              from: ['tests'],
              allow: [
                'shared',
                ['model', { featureName: '${from.featureName}' }],
                ['data', { featureName: '${from.featureName}' }],
                ['utils', { featureName: '${from.featureName}' }],
                ['feature', { featureName: '${from.featureName}' }],
                ['tests', { featureName: '${from.featureName}' }],
              ],
            },
            { from: ['app'], allow: ['shared', 'feature', 'style'] },
          ],
        },
      ],
    },
  },
  // ── Convention guards ──────────────────────────────────────────────────────
  // The rules below exist so that a reviewer or CI catches convention drift
  // instead of a senior developer noticing it in review. They are deliberately
  // mechanical: each one encodes something docs/frontend/coding-standards.md already
  // states, in a form a machine can check.

  // Named function declarations produce a real `name` binding, so React DevTools,
  // stack traces and `Component.displayName` fallbacks all show what the reader
  // already sees in the source. `export const X = () => {}` shows `(anonymous)`
  // in a profile and hides the component's identity behind the file it came
  // from. Call-expression initializers are not function *expressions*, so
  // `export const IconButton = forwardRef(…)` is untouched by the rule — only
  // the arrow/function literal is.
  {
    files: [
      'src/components/common/**/*.{ts,tsx}',
      'src/features/**/components/**/*.{ts,tsx}',
    ],
    rules: {
      'func-style': ['error', 'declaration'],
    },
  },

  ...restrictedRuleSets,
  pureLayerApiBan,
];
