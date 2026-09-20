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
  {
    // @sektek/eslint-plugin extends eslint-plugin-jsdoc's flat/recommended
    // (-typescript) without setting `publicOnly`, so require-jsdoc's own
    // default (only FunctionDeclaration is checked, but for *every* one,
    // exported or not) fires on private/internal helpers too — not the
    // intent (see SEK-107, filed to fix this upstream in
    // @sektek/eslint-plugin so every consumer gets it, not just this repo).
    // Local override until that lands: only a function this module actually
    // exports needs JSDoc.
    rules: {
      'jsdoc/require-jsdoc': ['warn', { publicOnly: true }],
    },
  },
]);
