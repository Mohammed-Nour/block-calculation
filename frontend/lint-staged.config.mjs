import micromatch from 'micromatch';

const ignored = [];

const buildCommands = (files, commands) => {
  const matched = micromatch.not(files, ignored);
  if (matched.length === 0) {
    return [];
  }

  const fileArgs = matched.map((file) => `"${file}"`).join(' ');
  return commands.map((command) => `${command} ${fileArgs}`);
};

const lintStagedConfig = {
  '*.{js,jsx,ts,tsx,mjs,cjs}': (files) =>
    buildCommands(files, [
      'eslint --max-warnings=0 --no-warn-ignored --fix',
      'prettier --write',
    ]),
  '*.{css,md,json,yml,yaml}': (files) =>
    buildCommands(files, ['prettier --write']),
};

export default lintStagedConfig;
