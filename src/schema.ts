import { type PromptCapability, clearable } from '@sektek/generator';

import { resolvePackageScopeDefault } from './package-scope.js';

export type OptionKind = 'text' | 'boolean' | 'select' | 'list';

export type OptionSpec = {
  key: string;
  flag: string;
  // 'list' kind only: a second, repeatable flag contributing to the same
  // `key` as `flag`'s comma-delimited value — e.g. `flag: '--dependencies
  // <list>'` alongside `repeatFlag: '--dependency <pkg>'`. Both may be
  // given in the same invocation; their values concatenate (comma-split
  // `flag` value first, then each `repeatFlag` occurrence), never one
  // replacing the other. See options.ts's `flagsGivenFor()`.
  repeatFlag?: string;
  prompt: string;
  // Shown by `--help` instead of `prompt`, when set. `prompt` is written as
  // a natural Yes/No question for the wizard (see wizard-steps.ts's
  // choicesFor()) — for a negated boolean flag (--no-<x>), that same
  // wording reads backwards next to its flag in --help output (e.g.
  // "--no-git-init  Initialize a local git repo...?" looks like the flag
  // enables the thing it actually disables). Falls back to `prompt` when
  // omitted.
  helpText?: string;
  // 'list' kind only: --help text for `repeatFlag` specifically, when
  // `helpText`/`prompt`'s wording (written for the comma-delimited `flag`)
  // wouldn't fit a single-value-per-occurrence flag. Falls back to
  // `helpText ?? prompt` when omitted.
  repeatHelpText?: string;
  // A short description shown in the wizard's status bar alongside the
  // key-instruction hints (see wizard.tsx's StatusBar) — distinct from
  // `helpText`, which is CLI --help text and never reaches the wizard.
  // Mirrors @sektek/generator's Prompt.hint.
  hint?: string;
  kind: OptionKind;
  choices?: readonly string[];
  default?: unknown;
  required?: boolean;
  // Self-contained, opt-in wizard behaviors — mirrors @sektek/generator's
  // Prompt.capabilities, so a Prompt's capabilities carry straight through
  // once SEK-106 wires the adapter's output in here. 'text' specs only,
  // for now (the only kind wizard.tsx knows how to apply either capability
  // to — see wizard-steps.ts's reloadableCapability()/clearableCapability()
  // and wizard.tsx's GeneratedTextInput):
  // - `reloadable`: the wizard pre-fills the input with the resolved
  //   `provider` value as real, editable text (not ghost placeholder
  //   text) and lets the user regenerate a fresh one with ctrl+r while the
  //   field still shows that value unedited. Generalizes the wizard's
  //   former generateDefault-only mechanism (the synthetic project-name
  //   step's own regenerate).
  // - `clearable`: lets ctrl+x blank the field to the capability's own
  //   `value` (default `undefined`) rather than typing over it — only
  //   fires while the field still shows its resolved value unedited, same
  //   as ctrl+r. Generalizes the former allowClear boolean.
  // `default`/`generateDefaultAsync` below still govern *what* a reloadable
  // spec's initial value is: `default` short-circuits (an already-known
  // value skips calling `provider`/`generateDefaultAsync` again), same as
  // before.
  capabilities?: PromptCapability[];
  // 'text' specs only, independent of `capabilities`. An async default
  // depending on the answers collected so far in this run — same
  // pre-filled-editable-text treatment as a `reloadable` capability, but
  // resolved once (no ctrl+r) since the derivation is deterministic given
  // the same answers. `resolve()` (the non-interactive path) needs an
  // equivalent too — see cli.ts's `resolveAnswers`, which resolves the
  // same derivation eagerly.
  generateDefaultAsync?: (answers: Record<string, unknown>) => Promise<string>;
};

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

// Options for generator-js's `dependencies` sub-generator (SEK-87):
// user-supplied npm packages to add as dependencies/devDependencies, each
// entry a `package-name` or `package-name@version` string (scoped packages
// supported, e.g. `@scope/name@1.2.3`). JS/TS-only, so merged only into
// schemaFor()'s @sektek/js:* branch below, not CORE_OPTIONS. Deliberately
// excluded from the interactive wizard (see wizard-steps.ts's
// pendingSpecs()) — CLI flags or a config file only, per the ticket
// ("the wizard should not provide the option to add when being run
// interactively").
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

// Options for the (not-yet-built) `git` sub-generator. Reachable from both
// @sektek/base:app and (transitively) @sektek/js:app, so merged into both
// schemaFor() branches below.
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

// Options for the (not-yet-built) `github` sub-generator. Reachable from
// both @sektek/base:app and (transitively) @sektek/js:app, so merged into
// both schemaFor() branches below.
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
 * unchanged regardless of which one runs. GIT_OPTIONS, GITHUB_OPTIONS, and
 * CONFIG_OPTIONS are merged into both branches, since the `git`/`github`/
 * `config` sub-generators they back are reachable from both
 * `@sektek/base:app` and (transitively) `@sektek/js:app`.
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
