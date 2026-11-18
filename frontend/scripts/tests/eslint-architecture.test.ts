import path from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * Proves the architecture rules in eslint.config.js still fire. Snippets are
 * linted under a virtual `filePath` inside `src/`; only import targets must
 * exist on disk. Typed rules are switched off, so no TS program is built.
 * Every rule has a positive control that must produce zero messages.
 */

const repoRoot = path.resolve(import.meta.dirname, '..', '..');
const WARM_UP_TIMEOUT_MS = 60_000;

let eslint: ESLint;

beforeAll(async () => {
  eslint = new ESLint({
    cwd: repoRoot,
    overrideConfig: tseslint.configs.disableTypeChecked,
  });
  await eslint.lintText('export {};\n', {
    filePath: path.join(repoRoot, 'src/lib/warm-up.ts'),
  });
}, WARM_UP_TIMEOUT_MS);

async function ruleIds(relativePath: string, code: string) {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(repoRoot, relativePath),
  });
  return (result?.messages ?? []).map((message) => message.ruleId);
}

describe('architecture rules', () => {
  it('bans `..` imports and allows the @/ alias', async () => {
    expect(
      await ruleIds(
        'src/lib/format.ts',
        "export { cn } from '../lib/utils';\n",
      ),
    ).toContain('no-restricted-imports');
    expect(
      await ruleIds('src/lib/format.ts', "export { cn } from '@/lib/utils';\n"),
    ).toEqual([]);
  });

  it('bans raw interactive elements outside components/ui', async () => {
    const code = (tag: string) =>
      `export function Thing() {\n  return <${tag} />;\n}\n`;
    expect(
      await ruleIds('src/components/common/thing.tsx', code('button')),
    ).toContain('no-restricted-syntax');
    expect(
      await ruleIds('src/components/common/thing.tsx', code('section')),
    ).toEqual([]);
  });

  it('keeps pure layers free of API calls', async () => {
    expect(
      await ruleIds(
        'src/lib/format.ts',
        "import axios from 'axios';\n\nexport const a = axios;\n",
      ),
    ).toContain('@typescript-eslint/no-restricted-imports');
    expect(
      await ruleIds(
        'src/lib/format.ts',
        "import { isAxiosError } from 'axios';\n\nexport const a = isAxiosError;\n",
      ),
    ).toEqual([]);
  });

  it('stops shared code from importing a route', async () => {
    expect(
      await ruleIds(
        'src/lib/format.ts',
        "export { Route } from '@/routes/index';\n",
      ),
    ).toContain('boundaries/element-types');
  });

  it('stops one feature from importing another', async () => {
    expect(
      await ruleIds(
        'src/features/projects/components/thing.tsx',
        "export { SettingsForm } from '@/features/settings/components/settings-form';\n",
      ),
    ).toContain('boundaries/element-types');
    expect(
      await ruleIds(
        'src/features/projects/components/thing.tsx',
        "export { FormField } from '@/components/common';\n",
      ),
    ).toEqual([]);
  });

  it('lets routes use only feature barrels', async () => {
    expect(
      await ruleIds(
        'src/routes/thing.tsx',
        "export { SettingsForm } from '@/features/settings/components/settings-form';\n",
      ),
    ).toContain('no-restricted-imports');
    expect(
      await ruleIds(
        'src/routes/thing.tsx',
        "export { SettingsForm } from '@/features/settings';\n",
      ),
    ).toEqual([]);
  });
});
