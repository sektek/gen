/* eslint-disable no-console */
import { basename, resolve as resolvePath } from 'node:path';
import { homedir } from 'node:os';

import {
  type DestinationMode,
  type PromptContext,
  projectNamePrompt,
  resolveConfigDefaults,
} from '@sektek/generator';
import { type ProviderFn, getComponent } from '@sektek/utility-belt';
import { Command } from 'commander';
import chalk from 'chalk';
import { omit } from 'lodash-es';

import { type OptionSpec, PACKAGE_SCOPE_OPTIONS } from './schema.js';
import { REGISTRY, destinationModeFor } from './registry.js';
import { addSchemaOptions, flagsGivenFor, resolve } from './options.js';
import {
  locateNewProject,
  resolveDestinationRoot,
} from './destination-root.js';
import { applyGitInitImplications } from './git-init-implications.js';
import { applyLicenseImplications } from './license-implications.js';
import { deriveAuthorFromGitConfig } from './git-identity.js';
import { explicitOptionKeysFromWizard } from './wizard-steps.js';
import { promptsToOptionSpecs } from './prompt-adapter.js';
import { resolvePackageScopeDefault } from './package-scope.js';
import { runGenerator } from './run.js';
import { runWizard } from './run-wizard.js';

// Package aliases "js"/"base" resolve to.
const PREFIX_ALIASES: Record<string, string> = {
  base: '@sektek/base',
  js: '@sektek/js',
};

/**
 * The prefixes (`"base"`/`"js"`) whose package has a sub-generator named
 * `name` — e.g. `["base"]` for `"editorconfig"`, `["base", "js"]` for
 * `"app"`. A bare name never resolves through this any more (it always
 * means `@sektek/base:<name>`) — this only powers the "did you mean
 * 'js:<name>'" hint on an unknown-bare-name error.
 *
 * @param name - A bare sub-generator name, with no package prefix.
 * @param knownNamespaces - Every namespace `REGISTRY` actually knows about.
 * @returns The matching prefixes, if any.
 */
function prefixesFor(
  name: string,
  knownNamespaces: readonly string[],
): string[] {
  return knownNamespaces
    .filter(ns => ns.split(':')[1] === name)
    .map(
      ns =>
        Object.entries(PREFIX_ALIASES).find(
          ([, pkg]) => pkg === ns.split(':')[0],
        )?.[0],
    )
    .filter((prefix): prefix is string => prefix !== undefined);
}

/**
 * Builds the error for a `<prefix>:<name>` input whose prefix isn't a known
 * package alias.
 *
 * @param input - The generator argument as typed on the command line.
 * @returns An error describing why `input` couldn't be resolved.
 */
function unknownPrefixError(input: string): Error {
  return new Error(
    `Unknown generator '${input}'. Expected 'base', 'js', 'base:<name>', 'js:<name>', or a fully-qualified '@sektek/<pkg>:<name>' namespace — a bare '<name>' with no prefix defaults to '@sektek/base:<name>'. Run 'gen list' to see every available generator.`,
  );
}

/**
 * Builds the error for a bare name with no colon that isn't `js`/`base` and
 * doesn't resolve to a `@sektek/base:<name>` generator. Hints at `js:<name>`
 * when that namespace exists — a message nicety only, never a fallback: the
 * caller still has to type the prefix themselves to actually run it.
 *
 * @param name - The bare generator name as typed on the command line.
 * @param knownNamespaces - Every namespace `REGISTRY` actually knows about.
 * @returns An error describing why `name` couldn't be resolved.
 */
function unknownBareNameError(
  name: string,
  knownNamespaces: readonly string[],
): Error {
  const hint = prefixesFor(name, knownNamespaces).includes('js')
    ? ` Did you mean 'js:${name}'?`
    : '';

  return new Error(
    `Unknown generator '${name}'.${hint} Run 'gen list' to see every available generator.`,
  );
}

/**
 * Resolves a generator argument (e.g. "js", "js:workspace",
 * "@sektek/base:app", "gitconfig") into a namespace, validated against the
 * known namespace list. From-scratch rather than yeoman-environment's own
 * alias(), which only handles single-segment names.
 *
 * A bare name with no prefix always means `@sektek/base:<name>` (matching
 * how `yo` used to default to `generator-base`) — it never falls back to
 * `@sektek/js` even when only `js` has a matching generator.
 *
 * @param input - The generator argument as typed on the command line.
 * @param knownNamespaces - Every namespace `REGISTRY` actually knows about.
 * @returns The resolved, validated namespace.
 */
export function resolveNamespace(
  input: string,
  knownNamespaces: readonly string[],
): string {
  if (input.startsWith('@')) {
    return validateNamespace(input, knownNamespaces);
  }

  const colonIndex = input.indexOf(':');

  if (colonIndex === -1) {
    if (Object.hasOwn(PREFIX_ALIASES, input)) {
      return validateNamespace(`${PREFIX_ALIASES[input]}:app`, knownNamespaces);
    }

    const namespace = `${PREFIX_ALIASES.base}:${input}`;
    if (!knownNamespaces.includes(namespace)) {
      throw unknownBareNameError(input, knownNamespaces);
    }
    return namespace;
  }

  const prefix = input.slice(0, colonIndex);
  const alias = PREFIX_ALIASES[prefix];
  if (!alias) {
    throw unknownPrefixError(input);
  }

  const name = input.slice(colonIndex + 1);
  return validateNamespace(`${alias}:${name}`, knownNamespaces);
}

/**
 * Validates a fully-resolved namespace against the known namespace list.
 *
 * @param namespace - The resolved namespace to validate.
 * @param knownNamespaces - Every namespace `REGISTRY` actually knows about.
 * @returns `namespace`, unchanged.
 */
function validateNamespace(
  namespace: string,
  knownNamespaces: readonly string[],
): string {
  if (!knownNamespaces.includes(namespace)) {
    throw new Error(
      `Unknown generator '${namespace}'. Run 'gen list' to see every available generator.`,
    );
  }

  return namespace;
}

/**
 * Prints every `REGISTRY` namespace, grouped by package.
 */
function printList(): void {
  const groups = new Map<string, string[]>();
  for (const { namespace } of REGISTRY) {
    const [pkg, name] = namespace.split(':');
    const names = groups.get(pkg) ?? [];
    names.push(name);
    groups.set(pkg, names);
  }

  for (const [pkg, names] of groups) {
    console.log(chalk.bold(pkg));
    for (const name of names) {
      const namespace = `${pkg}:${name}`;
      console.log(`  ${chalk.cyan(namespace)}`);
    }
  }
}

/**
 * Prints top-level usage: how to list generators and how to run one.
 */
function printUsage(): void {
  console.log(
    [
      'Usage: gen <generator> [options]',
      '       gen list',
      '',
      "A bare '<name>' with no prefix defaults to '@sektek/base:<name>';",
      "use 'js:<name>' to reach a @sektek/js generator instead.",
      '',
      'Examples:',
      '  $ gen list',
      '  $ gen js:app --yes --language typescript --dest ./my-project',
      '  $ gen readme',
      '  $ gen base:readme',
    ].join('\n'),
  );
}

/**
 * True when the wizard should run: an interactive terminal and no --yes.
 *
 * @param yes - Whether --yes/-y was given.
 * @returns Whether to run the interactive wizard.
 */
function isInteractive(yes: boolean | undefined): boolean {
  return !yes && Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY);
}

/**
 * The automated (`!interactive`) path's equivalent of `packageScope`'s
 * `generateDefaultAsync` — `resolve()` never reads that (only a spec's
 * static `default`), and there's no wizard on this path to compute it live
 * either way, so this resolves the same derivation eagerly from
 * `flagsGiven` and folds it in as an `extraSpecs` entry for `resolve()`.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param flagsGiven - Option values already supplied via CLI flags.
 * @param configDefaults - Values resolved via `resolveConfigDefaults()`.
 * @returns A one-entry `extraSpecs` array for `resolve()`, or `[]` when
 *   irrelevant (a non-js namespace, or `--package-scope` already given).
 */
async function packageScopeExtraSpecs(
  namespace: string,
  flagsGiven: Record<string, unknown>,
  configDefaults: Record<string, unknown>,
): Promise<OptionSpec[]> {
  const merged = { ...configDefaults, ...flagsGiven };
  if (
    !namespace.startsWith('@sektek/js:') ||
    merged.packageScope !== undefined
  ) {
    return [];
  }

  const packageScope = await resolvePackageScopeDefault({
    createRepo: merged.createRepo === true,
    repoOwner:
      typeof merged.repoOwner === 'string' ? merged.repoOwner : undefined,
    githubToken:
      typeof merged.githubToken === 'string' ? merged.githubToken : undefined,
  });

  // generateDefaultAsync comes along for the ride; harmless, since
  // resolve() never reads it.
  return [{ ...PACKAGE_SCOPE_OPTIONS[0], default: packageScope }];
}

type ResolveAnswersArgs = {
  namespace: string;
  flagsGiven: Record<string, unknown>;
  configDefaults: Record<string, unknown>;
  interactive: boolean;
  promptSpecs: OptionSpec[];
  promptContext: Pick<PromptContext, 'configDefaults' | 'workspace'>;
  destCwd: string;
};

type ResolvedAnswers = {
  answers: Record<string, unknown>;
  explicitOptionKeys: string[];
};

/**
 * Resolves this run's answers: the interactive wizard (seeded with
 * `flagsGiven`, asking `promptSpecs` first) or, automated, `flagsGiven`
 * folded straight through `resolve()`.
 *
 * @param args - Everything either path needs.
 * @param args.namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param args.flagsGiven - Option values already supplied via CLI flags.
 * @param args.configDefaults - Values resolved via `resolveConfigDefaults()`.
 * @param args.interactive - Whether to run the interactive wizard at all.
 * @param args.promptSpecs - Prompt-sourced specs schema.ts doesn't cover (see `promptSpecsFor()`).
 * @param args.promptContext - What prompt providers see beyond the running answers.
 * @param args.destCwd - The directory a project-name answer would be created under.
 * @returns The fully-resolved answers, and which option keys were explicit.
 */
async function resolveAnswers({
  namespace,
  flagsGiven,
  configDefaults,
  interactive,
  promptSpecs,
  promptContext,
  destCwd,
}: ResolveAnswersArgs): Promise<ResolvedAnswers> {
  if (!interactive) {
    return {
      answers: resolve(namespace, flagsGiven, configDefaults, [
        ...(await packageScopeExtraSpecs(
          namespace,
          flagsGiven,
          configDefaults,
        )),
        ...promptSpecs,
      ]),
      explicitOptionKeys: Object.keys(flagsGiven),
    };
  }

  const wizardResult = await runWizard(namespace, flagsGiven, configDefaults, {
    leadingSpecs: promptSpecs,
    destCwd,
    promptContext,
  });

  return {
    // The wizard never prompts for a 'list' spec, so its answers alone
    // would leave dependencies/devDependencies undefined; resolve() layers
    // in their schema/config default, same as the non-interactive path.
    answers: resolve(
      namespace,
      wizardResult.answers,
      configDefaults,
      promptSpecs,
    ),
    explicitOptionKeys: explicitOptionKeysFromWizard(
      flagsGiven,
      wizardResult.answeredKeys,
    ),
  };
}

/**
 * The prompt-sourced specs a namespace gets on top of its schema.ts ones:
 * `projectNamePrompt` for a `newProjectDir` generator, nothing otherwise.
 *
 * @param mode - The target generator's `destinationMode()`.
 * @param context - What `projectNamePrompt`'s provider resolves its default against.
 * @returns The specs to register, prompt for and resolve alongside the schema.
 */
function promptSpecsFor(
  mode: DestinationMode,
  context: PromptContext,
): Promise<OptionSpec[]> {
  return promptsToOptionSpecs(
    mode.kind === 'newProjectDir' ? [projectNamePrompt] : [],
    context,
  );
}

/**
 * The config-default layer: the git-derived author, overridden by whatever
 * `gen.config.*` files are found from cwd upward and in the home directory.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @returns The merged config defaults.
 */
async function loadConfigDefaults(
  namespace: string,
): Promise<Record<string, unknown>> {
  const gitIdentityDefaults = { author: await deriveAuthorFromGitConfig() };
  const configFromFile = await resolveConfigDefaults(namespace, {
    cwd: process.cwd(),
    homeDir: homedir(),
  });
  // A JS config file can define a key as undefined (e.g. derived from an
  // unset env var) — filtered out here for the same reason resolve() does
  // it (options.ts): an own `undefined` key would otherwise win a spread
  // over gitIdentityDefaults's real value, unlike a key that's simply
  // absent.
  return {
    ...gitIdentityDefaults,
    ...Object.fromEntries(
      Object.entries(configFromFile).filter(([, value]) => value !== undefined),
    ),
  };
}

type CliOptions = {
  yes?: boolean;
  install?: boolean;
  force?: boolean;
  dest: string;
  [schemaKey: string]: unknown;
};

/**
 * Parses argv and either lists every generator or runs the one resolved
 * from the `<generator>` argument, in automated or interactive mode.
 *
 * @param argv - Full `process.argv` (including the node/script entries).
 */
export async function main(argv: string[]): Promise<void> {
  const rawArgs = argv.slice(2);

  if (rawArgs[0] === 'list') {
    printList();
    return;
  }

  // Must be the first token: scanning for "the first non-dash token"
  // instead would grab an option's own value (e.g. "/tmp" out of
  // "--dest /tmp js:app") whenever a flag precedes the generator.
  const generatorArg =
    rawArgs[0] && !rawArgs[0].startsWith('-') ? rawArgs[0] : undefined;

  // --help/-h alone falls through to commander below once a generator is
  // resolved, which shows that generator's schema-driven options instead.
  if (!generatorArg) {
    printUsage();
    return;
  }

  const knownNamespaces = REGISTRY.map(entry => entry.namespace);

  let namespace: string;
  try {
    namespace = resolveNamespace(generatorArg, knownNamespaces);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const program = new Command();
  program
    .name('gen')
    .description(`Run the ${namespace} generator`)
    .argument('<generator>', 'Generator to run, e.g. "js:app" or "base:readme"')
    .option('-y, --yes', 'Force automated mode even in an interactive terminal')
    .option(
      '--install',
      'Run the package manager install step (skipped by default)',
    )
    .option('--force', 'Overwrite files that already exist without prompting')
    .option('--dest <path>', 'Destination directory', process.cwd())
    .addHelpText(
      'after',
      `\nExample:\n  $ gen ${namespace} --yes --dest ./my-project\n`,
    );

  const mode = await destinationModeFor(namespace);
  // Only the flag shape matters before parsing; defaults are re-resolved
  // below once configDefaults and the workspace are known.
  const flagSpecs = await promptSpecsFor(mode, {
    answers: {},
    flagsGiven: {},
    configDefaults: {},
  });

  addSchemaOptions(program, namespace, flagSpecs);
  program.parse(argv);

  const { yes, install, force, dest } = program.opts<CliOptions>();
  const destGiven = program.getOptionValueSource('dest') === 'cli';

  // Only what the user actually typed, schema-driven (including the
  // two-flags-one-key merge for `kind: 'list'` specs) — see
  // flagsGivenFor()'s own doc comment.
  const flagsGiven = flagsGivenFor(program, namespace, flagSpecs);

  // An explicit --dest already names the project directory, so the
  // project name follows it rather than being asked for — otherwise
  // options.projectName and the generator's projectSlug could disagree.
  if (mode.kind === 'newProjectDir' && destGiven) {
    flagsGiven.projectName ??= basename(resolvePath(dest));
  }

  const configDefaults = await loadConfigDefaults(namespace);

  const interactive = isInteractive(yes);
  const newProject =
    !destGiven && mode.kind === 'newProjectDir'
      ? locateNewProject(dest, mode)
      : undefined;

  const promptContext = {
    configDefaults,
    workspace: newProject?.workspace,
  };
  const context: PromptContext = {
    ...promptContext,
    answers: flagsGiven,
    flagsGiven,
  };
  const promptSpecs = await promptSpecsFor(mode, context);

  // An inherited projectName (e.g. a workspace's own gen.config.*) is
  // only ever a prefix for projectNamePrompt's provider, never this
  // project's own name.
  const optionConfigDefaults = omit(configDefaults, 'projectName');

  const { answers, explicitOptionKeys } = await resolveAnswers({
    namespace,
    flagsGiven,
    configDefaults: optionConfigDefaults,
    interactive,
    promptSpecs,
    promptContext,
    destCwd: newProject?.parentDir ?? dest,
  });

  const merged = {
    ...answers,
    skipInstall: !install,
  };

  const { resolved: licensed, warnings: licenseWarnings } =
    applyLicenseImplications(merged);
  const { resolved: gitChecked, warnings: gitInitWarnings } =
    applyGitInitImplications(licensed);
  for (const warning of [...licenseWarnings, ...gitInitWarnings]) {
    console.warn(chalk.yellow(warning));
  }
  // Annotated: object-spread would otherwise drop gitChecked's index signature.
  const options: Record<string, unknown> = {
    ...gitChecked,
    explicitOptionKeys,
  };

  const getProjectName: ProviderFn<string, PromptContext> = getComponent(
    projectNamePrompt.provider,
    'get',
  );
  const destinationRoot = await resolveDestinationRoot({
    destGiven,
    dest,
    mode,
    projectName: explicitOptionKeys.includes('projectName')
      ? String(options.projectName)
      : undefined,
    generateName: () => getProjectName(context),
    options,
  });

  // The directory actually created is the source of truth (a generated
  // name may have been retried past a collision), and it's persisted like
  // a chosen value so a workspace's gen.config.* can prefix its members.
  if (newProject) {
    options.projectName = basename(destinationRoot);
    options.explicitOptionKeys = [
      ...new Set([...explicitOptionKeys, 'projectName']),
    ];
  }

  await runGenerator(namespace, options, {
    destinationRoot,
    force: Boolean(force),
  });
}
