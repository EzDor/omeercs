// @ts-check
import rootConfig from '../eslint.config.mjs';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...rootConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
