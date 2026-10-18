import type { OptionSpec } from '../../types/index.js';

export const textSpec: OptionSpec = {
  key: 'description',
  flag: '--description <value>',
  prompt: 'Project description',
  kind: 'text',
};

export const selectSpec: OptionSpec = {
  key: 'language',
  flag: '--language <value>',
  prompt: 'Language',
  kind: 'select',
  choices: ['javascript', 'typescript'],
  default: 'javascript',
};

export const booleanSpec: OptionSpec = {
  key: 'private',
  flag: '--no-private',
  prompt: 'Private package?',
  kind: 'boolean',
  default: true,
};

// Default is deliberately not the first choice, to exercise
// defaultIndexFor() actually finding it rather than always landing on 0.
export const selectSpecDefaultSecond: OptionSpec = {
  key: 'runtime',
  flag: '--runtime <value>',
  prompt: 'Runtime',
  kind: 'select',
  choices: ['node', 'deno'],
  default: 'deno',
};

export const booleanSpecDefaultFalse: OptionSpec = {
  key: 'verbose',
  flag: '--verbose',
  prompt: 'Verbose output?',
  kind: 'boolean',
  default: false,
};

export const selectSpecNoChoices: OptionSpec = {
  key: 'target',
  flag: '--target <value>',
  prompt: 'Target',
  kind: 'select',
};

export const listSpec: OptionSpec = {
  key: 'dependencies',
  flag: '--dependencies <list>',
  repeatFlag: '--dependency <pkg>',
  prompt: 'Dependencies to add',
  kind: 'list',
  default: [],
};
