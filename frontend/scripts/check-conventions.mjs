#!/usr/bin/env node
// Convention guard — the parts of docs/coding-standards.md that ESLint cannot
// express, because they are about *where* a thing lives and *whether it already
// exists*, not about how it is written.
//
//   1. Hook files belong in `hooks/`. A `use-*.ts` sitting next to components is
//      invisible to anyone browsing the feature: the folder is what says what is
//      stateful, and this rule keeps that promise true.
//   2. Do not re-declare what `src/lib/*` or `src/features/**/utils/*` already
//      exports. Two `normalize`s in a codebase is how the placement-math bug
//      survived — one copy got the fix, the other did not — so the shared name
//      has to stay the only one.
//   3. An exported React component in `src/components/**` or
//      `src/features/**/components/**` is declared as `export function Name(...)`.
//      Named, hoisted, and greppable: the declaration style is what makes
//      "where is this rendered from" a one-second question, and two styles
//      drifting back-to-back is how a codebase loses that. `src/components/ui/**`
//      is exempt — that tree is shadcn CLI output, not hand style.
//   4. One exported component per component file. A file that exports two
//      components is where the import graph goes fuzzy; private sub-components
//      inside the file are fine (and currently unmarked — marking them is the
//      follow-up task, this check only counts *exports*).
//
// (Former rule 5, raw interactive HTML outside `src/components/ui/**`, moved to
// ESLint's `no-restricted-syntax` in 025/005 so each rule has one enforcer.)
//
// Only *function-valued* declarations count for (2). `const length =
// Math.hypot(...)` is a number that happens to share a name with a vector
// helper; flagging it would train everyone to ignore the script. `function
// normalize(...)` is the thing the rule is for.
//
// Where a local name is *deliberately* different from the shared one, say so on
// the line and the check leaves it alone:
//
//   // conventions-allow: returns null below the threshold, unlike vec3.normalize
//   function normalize(v) { … }
//
// Exits non-zero when anything is found, so it belongs in `pnpm check` ahead of
// format/lint — it fails in one readable line instead of surfacing as a lint
// error that looks unrelated to the convention.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
// CHECK_CONVENTIONS_SRC lets the test suite point every check at a fixture
// tree; production runs never set it.
const srcRoot = process.env.CHECK_CONVENTIONS_SRC
  ? path.resolve(process.env.CHECK_CONVENTIONS_SRC)
  : path.join(repoRoot, 'src');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const MARKER = 'conventions-allow:';

/** Test files are exempt from both checks: a fixture named `normalize` beside
 *  27 hook-named test files is not a convention problem. */
const isTestFile = (relativePath) =>
  /\.[cm]?[jt]sx?$/.test(relativePath) &&
  /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relativePath);

const hasSegment = (relativePath, name) =>
  relativePath.split('/').includes(name);

/** Component territory, `srcRoot`-relative: everything under `components/`
 *  plus each feature's `components/` folder. */
const isComponentScope = (relativeToSrc) =>
  /^components\//.test(relativeToSrc) ||
  // `(?:[^/]+\/)+` and not `[^/]+\/`, so components nested one level deeper
  // inside a feature are still checked.
  /^features\/(?:[^/]+\/)+components\//.test(relativeToSrc);

/** shadcn CLI output — exempt from the declaration-style checks. */
const isUiPath = (relativeToSrc) => relativeToSrc.startsWith('components/ui/');

/**
 * Targets that must stay `export default function` because something resolves
 * the *default* export of the module. Keyed srcRoot-relative.
 *
 * React.lazy reads `module.default`, so a lazy target's default declaration
 * is load-bearing, not style. This map grows only for that reason.
 */
const LAZY_DEFAULT_EXPORTS = new Map([]);

/** `function foo(` / `const foo = (…) =>` — the two shapes that define a name. */
const FUNCTION_DECLARATION =
  /^[ \t]*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm;
const BINDING =
  /^[ \t]*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;\n]+)?=\s*/gm;

/** An opening JSX tag: `<div`, `<Foo.Bar `, `</span>`. Generic constraints
 *  (`<T extends`) are excluded so type syntax does not read as markup. */
const JSX_TAG =
  /(?<![A-Za-z0-9_$.])<(\/?[A-Za-z][\w.-]*)\b(?=[\s/>])(?!\s+extends)/;

function lineOf(source, index) {
  return source.slice(0, index).split('\n').length - 1;
}

/**
 * What kind of value follows the `=`: `'function'`, `'arrow'` (a direct arrow,
 * parameter list balanced), or `null` (anything else — `forwardRef(...)` and
 * `createContext(...)` are wrappers, not arrow declarations, so they stay out
 * of rule (3)'s net). The paren scan exists so `const x = (1 + 2) * 3` is not
 * mistaken for `const x = (a) => …`.
 */
function initKind(source, start) {
  let i = start;
  const skip = () => {
    while (i < source.length && /\s/.test(source[i])) i += 1;
  };
  skip();
  if (source.startsWith('async', i) && /\s/.test(source[i + 5] ?? '')) {
    i += 6;
    skip();
  }
  if (source.startsWith('function', i)) return 'function';
  if (source[i] !== '(') {
    return /^[A-Za-z_$][\w$]*\s*=>/.test(source.slice(i)) ? 'arrow' : null;
  }

  let depth = 0;
  for (let j = i; j < source.length; j += 1) {
    if (source[j] === '(') depth += 1;
    else if (source[j] !== ')') continue;
    else {
      depth -= 1;
      if (depth > 0) continue;
      // `=> ` may be preceded by a return-type annotation, but nothing else:
      // a `(` in that gap means this was a call or a ternary, not parameters.
      return /^\s*(:[^()]*)?=>/.test(source.slice(j + 1, j + 201))
        ? 'arrow'
        : null;
    }
  }
  return null;
}

const isFunctionInit = (source, start) => initKind(source, start) !== null;

/** Names a file makes available to the rest of the app (values only). */
function exportedNames(source) {
  const names = new Set();
  const single = [
    /export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /export\s+class\s+([A-Za-z_$][\w$]*)/g,
  ];
  for (const pattern of single) {
    for (const match of source.matchAll(pattern)) names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(',')) {
      const specifier = part.trim();
      if (!specifier) continue;
      const asMatch = specifier.match(/\bas\s+([A-Za-z_$][\w$]*)$/);
      const name = asMatch ? asMatch[1] : specifier.replace(/^type\s+/, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    }
  }
  return names;
}

/** Function-valued declarations defined locally in `source`. */
function declaredFunctions(source) {
  const hits = [];
  for (const match of source.matchAll(FUNCTION_DECLARATION)) {
    hits.push({ name: match[1], line: lineOf(source, match.index) });
  }
  for (const match of source.matchAll(BINDING)) {
    if (!isFunctionInit(source, match.index + match[0].length)) continue;
    hits.push({ name: match[1], line: lineOf(source, match.index) });
  }
  return hits;
}

/**
 * True when the declaration's own region contains JSX. The region runs from
 * the `export` keyword to the next top-level `export` (or EOF) — close enough
 * to "this declaration's body" without a parser, and conservative: a PascalCase
 * factory that builds no markup reads as a util, not a component.
 */
function regionHasJsx(source, start) {
  const rest = source.slice(start);
  const next = /^export\s/m.exec(rest.slice(1));
  const region = next ? rest.slice(0, next.index + 1) : rest;
  return JSX_TAG.test(region);
}

/**
 * Exported *components* of `source`: PascalCase exports whose declaration
 * renders markup. `kind` is `'function'`, `'arrow'` or `'default'`; wrappers
 * like `forwardRef(...)` are deliberately not classified (they are neither
 * `export function` nor a bare arrow, and false positives are worse here).
 */
function exportedComponents(source) {
  const hits = [];
  const push = (name, index, kind) =>
    hits.push({ name, line: lineOf(source, index), kind });

  for (const match of source.matchAll(
    /^[ \t]*export\s+(?:async\s+)?function\s+([A-Z][\w$]*)/gm,
  )) {
    if (regionHasJsx(source, match.index))
      push(match[1], match.index, 'function');
  }
  for (const match of source.matchAll(
    /^[ \t]*export\s+(?:const|let|var)\s+([A-Z][\w$]*)\s*(?::[^=;\n]+)?=\s*/gm,
  )) {
    if (initKind(source, match.index + match[0].length) === null) continue;
    if (regionHasJsx(source, match.index)) push(match[1], match.index, 'arrow');
  }
  for (const match of source.matchAll(
    /^[ \t]*export\s+default\s+(?:async\s+)?function\s+([A-Z][\w$]*)/gm,
  )) {
    if (regionHasJsx(source, match.index))
      push(match[1], match.index, 'default');
  }
  return hits;
}

/**
 * A hit is silenced by `conventions-allow: <reason>` written on the declaration
 * line or anywhere in the comment block directly above it, so the reason can
 * live with the doc comment that explains it instead of being squeezed into one
 * line. Scanning stops at the first non-comment line: an allow two paragraphs up
 * is not an allow for this line.
 */
function isAllowed(lines, lineIndex) {
  if ((lines[lineIndex] ?? '').includes(MARKER)) return true;
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const line = (lines[index] ?? '').trim();
    if (line.includes(MARKER)) return true;
    const isComment =
      line.startsWith('//') || line.startsWith('/*') || line.startsWith('*');
    if (!isComment) return false;
  }
  return false;
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) yield full;
  }
}

async function main() {
  const files = [];
  for await (const file of walk(srcRoot)) files.push(file);

  // Shared surface: every name lib/ and utils/ already exports. Keyed by name
  // to the files that export it, so a file is never its own duplicate.
  const homes = new Map();
  for (const file of files) {
    const relative = path.relative(repoRoot, file);
    if (!relative.startsWith('src/lib/') && !hasSegment(relative, 'utils')) {
      continue;
    }
    for (const name of exportedNames(await readFile(file, 'utf8'))) {
      const owners = homes.get(name) ?? new Set();
      owners.add(file);
      homes.set(name, owners);
    }
  }

  const violations = [];
  for (const file of files) {
    const relative = path.relative(repoRoot, file);
    const relSrc = path.relative(srcRoot, file);
    if (isTestFile(relative)) continue;
    const source = await readFile(file, 'utf8');
    const lines = source.split('\n');
    const ext = path.extname(file);

    // (a) hooks must live in hooks/
    const base = path.basename(file);
    if (/^use-.+\.(?:ts|tsx)$/.test(base) && !hasSegment(relative, 'hooks')) {
      violations.push({
        text: `${relative}:1  '${base}' is a hook file outside any hooks/ directory — move it, or rename it if it is not a hook.`,
      });
    }

    // (b) local functions that restate a shared export
    for (const hit of declaredFunctions(source)) {
      const owners = homes.get(hit.name);
      if (!owners || owners.has(file) || isAllowed(lines, hit.line)) continue;
      const owner = [...owners].sort((a, b) =>
        path.relative(repoRoot, a).localeCompare(path.relative(repoRoot, b)),
      )[0];
      violations.push({
        text: `${relative}:${hit.line + 1}  \`${hit.name}\` is declared here but exported by ${path.relative(repoRoot, owner)} — import it instead of restating it. If this one is intentionally different, put \`// ${MARKER} <why>\` above the line.`,
      });
    }

    const inComponents = isComponentScope(relSrc) && !isUiPath(relSrc);

    if (inComponents) {
      const components = exportedComponents(source);

      // (c) declaration style: `export function Name(...)` only
      for (const hit of components) {
        if (hit.kind === 'arrow') {
          violations.push({
            text: `${relative}:${hit.line + 1}  \`${hit.name}\` is an exported component declared as an arrow function — declare it as \`export function ${hit.name}(...)\`.`,
          });
        } else if (hit.kind === 'default') {
          if (LAZY_DEFAULT_EXPORTS.has(relSrc)) continue;
          violations.push({
            text: `${relative}:${hit.line + 1}  \`${hit.name}\` uses \`export default function\` — components here are named exports; only a lazy-import target may keep the default (see LAZY_DEFAULT_EXPORTS).`,
          });
        }
      }

      // (d) one exported component per file (private sub-components are not
      //     counted yet — they get markers in the follow-up task)
      if (ext === '.tsx' && components.length > 1) {
        const names = components.map((hit) => hit.name).join(', ');
        violations.push({
          text: `${relative}:${components[1].line + 1}  exports ${components.length} components (${names}) — keep exactly one exported component per file and move the rest to their own files.`,
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log('check-conventions: clean.');
    return;
  }

  console.error(`check-conventions: ${violations.length} violation(s)`);
  for (const violation of violations.sort((a, b) =>
    a.text.localeCompare(b.text),
  )) {
    console.error(`  ${violation.text}`);
  }
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('check-conventions: failed to run');
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
