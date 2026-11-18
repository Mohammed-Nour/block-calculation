import { readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `eslint-resolver.cjs` is what lets eslint-plugin-boundaries see `@/`
 * imports at all. When it resolves nothing, boundaries does not fail — it
 * silently checks no dependencies (CLAUDE.md "Gotchas"). These tests pin the
 * behaviour the layering rules depend on, including the `found: false` for
 * packages that makes boundaries treat them as external.
 */

interface ResolveResult {
  found: boolean;
  path?: string;
}

interface AliasResolver {
  interfaceVersion: number;
  resolve: (source: string, file: string) => ResolveResult;
  aliases: ReadonlyArray<{ prefix: string; targets: readonly string[] }>;
}

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const require = createRequire(import.meta.url);
const resolver = require(
  path.join(repoRoot, 'eslint-resolver.cjs'),
) as AliasResolver;

/** A real file to resolve from; relative specifiers are taken against it. */
const importer = path.join(repoRoot, 'src/lib/utils.ts');

const resolved = (source: string) => resolver.resolve(source, importer);
const inRepo = (relative: string) => path.join(repoRoot, relative);

describe('eslint-resolver', () => {
  it('speaks resolver interface v2', () => {
    expect(resolver.interfaceVersion).toBe(2);
  });

  it('resolves an alias with no extension', () => {
    expect(resolved('@/lib/utils')).toEqual({
      found: true,
      path: inRepo('src/lib/utils.ts'),
    });
  });

  it('resolves an alias with an explicit .ts extension', () => {
    expect(resolved('@/lib/utils.ts')).toEqual({
      found: true,
      path: inRepo('src/lib/utils.ts'),
    });
  });

  it('resolves a directory to its index file', () => {
    expect(resolved('@/lib')).toEqual({
      found: true,
      path: inRepo('src/lib/index.ts'),
    });
  });

  it('resolves a relative specifier against the importing file', () => {
    expect(resolved('./get-error-message')).toEqual({
      found: true,
      path: inRepo('src/lib/get-error-message.ts'),
    });
  });

  it('drops a Vite query suffix', () => {
    expect(resolved('@/styles.css?url')).toEqual({
      found: true,
      path: inRepo('src/styles.css'),
    });
  });

  it('resolves a .css file', () => {
    expect(resolved('@/styles.css')).toEqual({
      found: true,
      path: inRepo('src/styles.css'),
    });
  });

  it('reports a bare package specifier as not found, so boundaries treats it as external', () => {
    expect(resolved('react')).toEqual({ found: false });
  });

  it('reports a missing module as not found', () => {
    expect(resolved('@/lib/does-not-exist')).toEqual({ found: false });
  });

  describe('aliases come from tsconfig.json', () => {
    it('reads at least the @/ alias', () => {
      expect(resolver.aliases.map((alias) => alias.prefix)).toContain('@/');
    });

    it.each(resolver.aliases.map((alias) => [alias.prefix, alias] as const))(
      'resolves a real file through %s',
      (prefix, alias) => {
        // Any file directly in the alias's first target directory will do:
        // the point is that the mapping lands on disk, not which file it is.
        const dir = alias.targets[0];
        if (dir === undefined) throw new Error(`${prefix} has no target`);
        const file = readdirSync(dir).find((name) =>
          statSync(path.join(dir, name)).isFile(),
        );
        expect(file).toBeDefined();

        expect(resolved(`${prefix}${file ?? ''}`)).toEqual({
          found: true,
          path: path.join(dir, file ?? ''),
        });
      },
    );
  });
});
