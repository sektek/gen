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

// Mirrors GIT_OPTIONS + GITHUB_OPTIONS from schema.ts, for exercising
// createRepoImpliedAnswers/gitInitImpliedAnswers against the real shape of
// that block.
export const gitInitSpec: OptionSpec = {
  key: 'gitInit',
  flag: '--no-git-init',
  prompt: 'Initialize a local git repo with an initial commit?',
  kind: 'boolean',
  default: true,
};

export const createRepoSpec: OptionSpec = {
  key: 'createRepo',
  flag: '--create-repo',
  prompt: 'Create a GitHub repo and push?',
  kind: 'boolean',
  default: false,
};

export const repoVisibilitySpec: OptionSpec = {
  key: 'repoVisibility',
  flag: '--repo-visibility <value>',
  prompt: 'Repo visibility',
  kind: 'select',
  choices: ['public', 'private'],
  default: 'private',
};

export const repoOwnerSpec: OptionSpec = {
  key: 'repoOwner',
  flag: '--repo-owner <value>',
  prompt: 'GitHub org (blank = your account)',
  kind: 'text',
};

export const githubTokenSpec: OptionSpec = {
  key: 'githubToken',
  flag: '--github-token <value>',
  prompt: 'GitHub token (blank = env/gh CLI)',
  kind: 'text',
};

export const pushSpec: OptionSpec = {
  key: 'push',
  flag: '--no-push',
  prompt: 'Push after committing?',
  kind: 'boolean',
  default: true,
};

export const githubSchema: OptionSpec[] = [
  gitInitSpec,
  createRepoSpec,
  repoVisibilitySpec,
  repoOwnerSpec,
  githubTokenSpec,
  pushSpec,
];
