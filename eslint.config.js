import { defineConfig } from 'eslint/config';
import sektek from '@sektek/eslint-plugin';

export default defineConfig([
  sektek.configs.typescript,
  {
    // check-file's naming rule only covers .js/.ts by default; extend it
    // to .tsx too, kebab-case to match every other file in this repo
    // (not React's usual PascalCase).
    files: ['**/*.tsx'],
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.tsx': 'KEBAB_CASE' },
      ],
    },
  },
]);
