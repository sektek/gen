import { clearable } from '@sektek/generator';

import type { OptionSpec } from './types/index.js';
import { resolvePackageScopeDefault } from './package-scope.js';

// Options every generator understands, since CoreGenerator applies these
// as workspace-wide defaults regardless of which sub-generator runs.
export const CORE_OPTIONS: OptionSpec[] = [
  {
    key: 'profile',
    flag: '--profile <value>',
    prompt: 'Profile',
    kind: 'text',
    default: 'default',
  },
  {
    key: 'description',
    flag: '--description <value>',
    prompt: 'Project description',
    kind: 'text',
  },
];

// Options specific to the @sektek/js:* generator family.
export const JS_OPTIONS: OptionSpec[] = [
  {
    key: 'language',
    flag: '--language <value>',
    prompt: 'Language',
    kind: 'select',
    choices: ['javascript', 'typescript'],
    default: 'javascript',
  },
  {
    key: 'testFramework',
    flag: '--test-framework <value>',
    prompt: 'Test framework',
    kind: 'select',
    choices: ['mocha', 'vitest', 'none'],
    default: 'mocha',
  },
  {
    key: 'author',
    flag: '--author <value>',
    prompt: 'Author',
    kind: 'text',
  },
  {
    key: 'license',
    flag: '--license <value>',
    prompt: 'License',
    kind: 'text',
    default: 'UNLICENSED',
  },
  {
    // --no-private, not --private: commander's convention for a boolean
    // that defaults true and needs to stay overridable to false.
    key: 'private',
    flag: '--no-private',
    prompt: 'Private package?',
    kind: 'boolean',
    default: true,
  },
];

// User-supplied npm packages to add as dependencies/devDependencies, each
// entry a `package-name` or `package-name@version` string. JS/TS-only, so
// merged only into schemaFor()'s @sektek/js:* branch. Deliberately excluded
// from the interactive wizard (see wizard/steps's pendingSpecs()) — CLI
// flags or a config file only.
export const DEPENDENCY_OPTIONS: OptionSpec[] = [
  {
    key: 'dependencies',
    flag: '--dependencies <list>',
    repeatFlag: '--dependency <pkg>',
    prompt: 'Dependencies to add (package or package@version, comma-delimited)',
    repeatHelpText: 'Add a dependency (package or package@version); repeatable',
    kind: 'list',
    default: [],
  },
  {
    key: 'devDependencies',
    flag: '--dev-dependencies <list>',
    repeatFlag: '--dev-dependency <pkg>',
    prompt:
      'Dev dependencies to add (package or package@version, comma-delimited)',
    repeatHelpText:
      'Add a dev dependency (package or package@version); repeatable',
    kind: 'list',
    default: [],
  },
];

// Options for the `git` sub-generator, reachable from both @sektek/base:app
// and (transitively) @sektek/js:app, so merged into both schemaFor()
// branches below.
export const GIT_OPTIONS: OptionSpec[] = [
  {
    // --no-git-init, not --git-init: this one defaults true and needs to
    // stay overridable to false (commander's convention, matching
    // JS_OPTIONS's existing --no-private).
    key: 'gitInit',
    flag: '--no-git-init',
    prompt: 'Initialize a local git repo with an initial commit?',
    helpText: 'Skip initializing a local git repo with an initial commit',
    kind: 'boolean',
    default: true,
  },
];

// Options for the `github` sub-generator, reachable from both
// @sektek/base:app and (transitively) @sektek/js:app, so merged into both
// schemaFor() branches below.
export const GITHUB_OPTIONS: OptionSpec[] = [
  {
    key: 'createRepo',
    flag: '--create-repo',
    prompt: 'Create a GitHub repo and push?',
    kind: 'boolean',
    default: false,
  },
  {
    key: 'repoVisibility',
    flag: '--repo-visibility <value>',
    prompt: 'Repo visibility',
    kind: 'select',
    choices: ['public', 'private'],
    default: 'private',
  },
  {
    key: 'repoOwner',
    flag: '--repo-owner <value>',
    prompt: 'GitHub org (blank = your account)',
    kind: 'text',
  },
  {
    key: 'githubToken',
    flag: '--github-token <value>',
    prompt: 'GitHub token (blank = env/gh CLI)',
    kind: 'text',
  },
  {
    // --no-push, not --push: same convention as --no-git-init/--no-private.
    key: 'push',
    flag: '--no-push',
    prompt: 'Push after committing?',
    helpText: 'Skip pushing after committing',
    kind: 'boolean',
    default: true,
  },
];

// The npm-scope option for the @sektek/js:* generator family — its own
// array, positioned in schemaFor() *after* GITHUB_OPTIONS rather than
// grouped into JS_OPTIONS, since its default depends on those answers.
export const PACKAGE_SCOPE_OPTIONS: OptionSpec[] = [
  {
    key: 'packageScope',
    flag: '--package-scope <value>',
    prompt: 'npm scope',
    kind: 'text',
    capabilities: [clearable],
    generateDefaultAsync: answers =>
      resolvePackageScopeDefault({
        createRepo: answers.createRepo === true,
        repoOwner:
          typeof answers.repoOwner === 'string' ? answers.repoOwner : undefined,
        githubToken:
          typeof answers.githubToken === 'string'
            ? answers.githubToken
            : undefined,
      }),
  },
];

// Options for the `config` sub-generator. Reachable from both
// @sektek/base:app and (transitively) @sektek/js:app, so merged into both
// schemaFor() branches below.
export const CONFIG_OPTIONS: OptionSpec[] = [
  {
    key: 'configFile',
    flag: '--config-file <path>',
    prompt:
      'gen.config.* path (blank = gen.config.yaml at the destination root)',
    kind: 'text',
  },
];

/**
 * Returns the option schema for a generator namespace, scoped per package
 * family (`@sektek/base:*` vs `@sektek/js:*`) rather than per individual
 * sub-generator, since composeWith passes the whole options object through
 * unchanged regardless of which one runs.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @returns The option specs relevant to that namespace's package family.
 */
export function schemaFor(namespace: string): OptionSpec[] {
  return namespace.startsWith('@sektek/js:')
    ? [
        ...CORE_OPTIONS,
        ...JS_OPTIONS,
        ...DEPENDENCY_OPTIONS,
        ...GIT_OPTIONS,
        ...GITHUB_OPTIONS,
        ...PACKAGE_SCOPE_OPTIONS,
        ...CONFIG_OPTIONS,
      ]
    : [...CORE_OPTIONS, ...GIT_OPTIONS, ...GITHUB_OPTIONS, ...CONFIG_OPTIONS];
}

/**
 * Overrides each spec's `default` with `configDefaults`'s value for that
 * key, if any — for pre-filling/pre-highlighting a wizard prompt's initial
 * value without skipping it (only an actual CLI flag does that). A key in
 * `configDefaults` with no matching spec is ignored.
 *
 * @param schema - The option specs to layer config defaults onto.
 * @param configDefaults - Values resolved via `resolveConfigDefaults()`.
 * @returns A new spec array; `schema` itself is left unchanged.
 */
export function withConfigDefaults(
  schema: OptionSpec[],
  configDefaults: Record<string, unknown>,
): OptionSpec[] {
  return schema.map(spec =>
    configDefaults[spec.key] === undefined
      ? spec
      : { ...spec, default: configDefaults[spec.key] },
  );
}
