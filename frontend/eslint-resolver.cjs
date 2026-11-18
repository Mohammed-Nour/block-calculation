// Module resolver for eslint-plugin-boundaries.
//
// The plugin resolves every import through `eslint-module-utils/resolve`, which
// defaults to the Node resolver. That resolver cannot see the `@/*` alias, so
// every aliased import — which is *all* cross-folder imports in this codebase —
// silently resolved to nothing and boundaries skipped it. The layering rules ran
// but never saw a dependency. See docs/architecture.md for the layers themselves.
//
// `boundaries/alias` does not fix this (it is a no-op in v5), and
// `eslint-import-resolver-typescript` is blocked by the `minimumReleaseAge`
// policy in pnpm-workspace.yaml, so resolution lives here instead. The aliases
// are read from `compilerOptions.paths` in tsconfig.json, so a new path alias
// needs no edit here. Tested by scripts/tests/eslint-resolver.test.ts.

const fs = require('node:fs');
const path = require('node:path');

const ts = require('typescript');

const TSCONFIG_PATH = path.join(__dirname, 'tsconfig.json');

/**
 * `compilerOptions.paths` as prefix → absolute target directories, longest
 * prefix first so a more specific alias wins over a broader one.
 *
 * `ts.readConfigFile` rather than `JSON.parse`: tsconfig allows comments and
 * trailing commas. Each entry is `"<prefix>*": ["./<dir>/*", …]`; targets are
 * relative to `baseUrl` when set, else to the tsconfig's own directory. An
 * entry without a trailing `*` (an exact-match alias) is skipped — none
 * exists, and resolving one needs different matching. `extends` is not
 * followed: this tsconfig has none, so a `paths` moved into a base config
 * would need `ts.parseJsonConfigFileContent` here.
 */
function readAliases() {
  const { config, error } = ts.readConfigFile(TSCONFIG_PATH, ts.sys.readFile);
  if (error) {
    throw new Error(
      `eslint-resolver: cannot read ${TSCONFIG_PATH}: ${ts.flattenDiagnosticMessageText(error.messageText, '\n')}`,
    );
  }

  const options = config.compilerOptions ?? {};
  const base = path.resolve(__dirname, options.baseUrl ?? '.');

  return Object.entries(options.paths ?? {})
    .filter(([pattern]) => pattern.endsWith('*'))
    .map(([pattern, targets]) => ({
      prefix: pattern.slice(0, -1),
      targets: targets
        .filter((target) => target.endsWith('*'))
        .map((target) => path.resolve(base, target.slice(0, -1))),
    }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
}

const ALIASES = readAliases();

// Order matters: the first extension that exists on disk wins, matching how
// Vite and tsc pick a file when the import omits one.
const EXTENSIONS = [
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
];

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

/** `./foo` → `./foo.ts`, `./foo/index.ts`, or the exact file if it has an extension. */
function resolveFile(basePath) {
  if (isFile(basePath)) return basePath;

  for (const ext of EXTENSIONS) {
    const withExtension = basePath + ext;
    if (isFile(withExtension)) return withExtension;
  }

  for (const ext of EXTENSIONS) {
    const indexFile = path.join(basePath, `index${ext}`);
    if (isFile(indexFile)) return indexFile;
  }

  return null;
}

exports.interfaceVersion = 2;

/** Exposed for the resolver tests, which check every alias lands on disk. */
exports.aliases = ALIASES;

exports.resolve = function resolve(source, file) {
  // Vite query suffixes (`@/styles.css?url`) are not part of the path.
  const specifier = source.split('?')[0];

  if (specifier.startsWith('.')) {
    const resolved = resolveFile(path.resolve(path.dirname(file), specifier));
    return resolved ? { found: true, path: resolved } : { found: false };
  }

  const alias = ALIASES.find(({ prefix }) => specifier.startsWith(prefix));
  if (alias) {
    // Like tsc, try each target in order; the first that exists wins.
    const rest = specifier.slice(alias.prefix.length);
    for (const target of alias.targets) {
      const resolved = resolveFile(path.join(target, rest));
      if (resolved) return { found: true, path: resolved };
    }
    return { found: false };
  }

  // A bare specifier is a package. Reporting it as unresolved is what makes
  // boundaries treat it as external and skip it, which is what we want.
  return { found: false };
};
