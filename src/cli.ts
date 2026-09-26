/* eslint-disable no-console */
import { basename, dirname, resolve as resolvePath } from 'node:path';
import { existsSync } from 'node:fs';
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

import {
  GeneratorPackageNotFoundError,
  generatorPackageName,
} from './package-resolver.js';
import { type OptionSpec, PACKAGE_SCOPE_OPTIONS } from './schema.js';
import {
  ROOT_PACKAGES,
  type RegistryEntry,
  destinationModeFor,
  registryFor,
} from './registry.js';
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

// Bare-word sugar for the two default packages' :app generator — the only
// remaining hardcoded special case; everything else is generalized parsing.
const BARE_SUGAR: Record<string, string> = {
  base: '@sektek/base:app',
  js: '@sektek/js:app',
};

export type ResolvedGenerator = {
  namespace: string;
  entries: RegistryEntry[];
};

/**
 * Parses a generator argument into its target npm package name and
 * fully-qualified namespace, without resolving/validating anything on
 * disk — see `resolveNamespace()` for the validating counterpart.
 *
 * Every shape reduces to the canonical `@scope/name:subgen` form and is
 * then parsed the same way, so a third-party `@acme/widget:app` is handled
 * identically to `@sektek/base:app` — no package is special-cased beyond
 * the `BARE_SUGAR` shortcuts above:
 *
 * - `@scope/name:subgen` (already-qualified) → package `@${scope}/generator-${name}`.
 * - `name:subgen` (no `@scope/`) → scope defaults to `sektek`.
 * - bare `subgen` (no colon, not `base`/`js`) → defaults to `@sektek/base:<subgen>`.
 * - bare `base`/`js` → `BARE_SUGAR`'s literal shortcut.
 *
 * @param input - The generator argument as typed on the command line.
 * @returns The target package name and the namespace to look for within it.
 */
export function parseGeneratorInput(input: string): {
  packageName: string;
  namespace: string;
} {
  if (Object.hasOwn(BARE_SUGAR, input)) {
    return parseGeneratorInput(BARE_SUGAR[input]);
  }

  if (!input.startsWith('@')) {
    const colonIndex = input.indexOf(':');
    return colonIndex === -1
      ? parseGeneratorInput(`@sektek/base:${input}`)
      : parseGeneratorInput(
          `@sektek/${input.slice(0, colonIndex)}:${input.slice(colonIndex + 1)}`,
        );
  }

  const colonIndex = input.indexOf(':');
  if (colonIndex === -1) {
    throw new Error(
      `Unknown generator '${input}'. Expected '<subgen>', 'base', 'js', '<name>:<subgen>', or a fully-qualified '@scope/name:subgen' namespace. Run 'gen list' to see every available generator.`,
    );
  }
  const prefix = input.slice(0, colonIndex);
  const subgen = input.slice(colonIndex + 1);
  const slashIndex = prefix.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(
      `Unknown generator '${input}'. Expected '@scope/name:subgen'. Run 'gen list' to see every available generator.`,
    );
  }

  return {
    packageName: generatorPackageName(
      prefix.slice(1, slashIndex),
      prefix.slice(slashIndex + 1),
    ),
    namespace: `${prefix}:${subgen}`,
  };
}

/**
 * Whether `subgen` is one of `@sektek/generator-js`'s own namespaces —
 * powers the "did you mean 'js:<name>'?" hint on an unknown bare name.
 * Deliberately specific to the two well-known default packages rather than
 * generalized to arbitrary third parties (per the locked-in design) — a
 * failed lookup here (e.g. generator-js isn't installed either) just omits
 * the hint rather than compounding the original error.
 *
 * @param subgen - The bare sub-generator name that failed to resolve against `@sektek/base`.
 * @param cwd - The directory to resolve `@sektek/generator-js` from.
 * @returns Whether `js:<subgen>` would have resolved instead.
 */
async function existsInJs(subgen: string, cwd: string): Promise<boolean> {
  try {
    const entries = await registryFor('@sektek/generator-js', cwd);
    return entries.some(entry => entry.namespace === `@sektek/js:${subgen}`);
  } catch {
    return false;
  }
}

/**
 * Resolves a generator argument (e.g. "js", "js:workspace",
 * "@sektek/base:app", "gitconfig", "@acme/widget:app") into a validated
 * namespace and the registry entries its own package (and transitive
 * `@<scope>/generator-*` dependencies) resolved to — from-scratch rather
 * than yeoman-environment's own `alias()`, which only handles
 * single-segment names.
 *
 * A bare name with no prefix always means `@sektek/base:<name>` (matching
 * how `yo` used to default to `generator-base`) — it never falls back to
 * `@sektek/js` even when only `js` has a matching generator.
 *
 * @param input - The generator argument as typed on the command line.
 * @param cwd - The directory to resolve the target package from.
 * @returns The resolved, validated namespace and its package's entries.
 */
export async function resolveNamespace(
  input: string,
  cwd: string,
): Promise<ResolvedGenerator> {
  const { packageName, namespace } = parseGeneratorInput(input);

  const entries = await registryFor(packageName, cwd);
  if (entries.some(entry => entry.namespace === namespace)) {
    return { namespace, entries };
  }

  const colonIndex = input.indexOf(':');
  const isDefaultedBareName = colonIndex === -1 && !input.startsWith('@');
  const hint =
    isDefaultedBareName && (await existsInJs(input, cwd))
      ? ` Did you mean 'js:${input}'?`
      : '';

  throw new Error(
    `Unknown generator '${namespace}'.${hint} Run 'gen list' to see every available generator.`,
  );
}

/**
 * Parses a `gen list` package argument (e.g. "@acme/widget" or "js") into
 * the npm package it names — the same scope-defaulting convention as
 * running a generator, but with no `:subgen` to also parse.
 *
 * @param arg - The package argument as typed on the command line.
 * @returns The target package name.
 */
function parsePackageArg(arg: string): string {
  if (!arg.startsWith('@')) {
    return generatorPackageName('sektek', arg);
  }

  const slashIndex = arg.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(`Invalid package '${arg}'. Expected '@scope/name'.`);
  }
  return generatorPackageName(
    arg.slice(1, slashIndex),
    arg.slice(slashIndex + 1),
  );
}

/**
 * Prints a resolved package's namespaces, grouped by their own namespace
 * prefix (a package's transitively-resolved dependencies print under their
 * own prefix too, e.g. `@sektek/generator-js`'s entries include
 * `@sektek/base:*` alongside `@sektek/js:*`).
 *
 * @param entries - The entries to print.
 */
function printEntries(entries: RegistryEntry[]): void {
  const groups = new Map<string, string[]>();
  for (const { namespace } of entries) {
    const [prefix, name] = namespace.split(':');
    const names = groups.get(prefix) ?? [];
    names.push(name);
    groups.set(prefix, names);
  }

  for (const [prefix, names] of groups) {
    console.log(chalk.bold(prefix));
    for (const name of names) {
      const namespace = `${prefix}:${name}`;
      console.log(`  ${chalk.cyan(namespace)}`);
    }
  }
}

/**
 * `gen list` with no argument: every sub-generator of `@sektek/generator-base`
 * and `@sektek/generator-js`, resolved dynamically. A package that isn't
 * installed is noted rather than failing the whole command — only when
 * neither resolves does this exit non-zero.
 *
 * @param cwd - The directory to resolve each package from.
 * @param rootPackages - The default packages to list; overridable for tests.
 */
export async function printDefaultList(
  cwd: string,
  rootPackages: readonly string[] = ROOT_PACKAGES,
): Promise<void> {
  const seen = new Set<string>();
  let anyResolved = false;

  for (const pkg of rootPackages) {
    try {
      printEntries(await registryFor(pkg, cwd, seen));
      anyResolved = true;
    } catch (error) {
      if (!(error instanceof GeneratorPackageNotFoundError)) {
        throw error;
      }
      console.log(chalk.dim(`${pkg}: not installed`));
    }
  }

  if (!anyResolved) {
    process.exitCode = 1;
  }
}

/**
 * `gen list <scope>/<name>`: one specific package's sub-generators.
 *
 * @param packageArg - The package argument as typed on the command line.
 * @param cwd - The directory to resolve the package from.
 */
export async function printPackageList(
  packageArg: string,
  cwd: string,
): Promise<void> {
  let entries: RegistryEntry[];
  try {
    entries = await registryFor(parsePackageArg(packageArg), cwd);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }
  printEntries(entries);
}

/**
 * Prints top-level usage: how to list generators and how to run one.
 */
function printUsage(): void {
  console.log(
    [
      'Usage: gen <generator> [options]',
      '       gen list [<scope>/<name>]',
      '',
      "A bare '<name>' with no prefix defaults to '@sektek/base:<name>';",
      "use 'js:<name>' to reach a @sektek/js generator instead. Any other",
      "installed package works the same way: '<name>:<subgen>' defaults to",
      "scope 'sektek', or use a fully-qualified '@scope/name:subgen'.",
      '',
      'Examples:',
      '  $ gen list',
      '  $ gen list @acme/widget',
      '  $ gen js:app --yes --language typescript --dest ./my-project',
      '  $ gen readme',
      '  $ gen base:readme',
      '  $ gen @acme/widget:app',
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

// A JS config file can define a key as undefined (e.g. derived from an
// unset env var) — dropped for the same reason resolve() does it
// (options.ts): an own `undefined` key would otherwise win a spread over a
// real value from an earlier layer, unlike a key that's simply absent.
function definedEntries(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  );
}

function nearestExistingDir(path: string): string {
  let dir = path;
  while (!existsSync(dir) && dirname(dir) !== dir) {
    dir = dirname(dir);
  }
  return dir;
}

/**
 * The config-default layer: the git-derived author, overridden by whatever
 * `gen.config.*` files are found from cwd upward and in the home directory,
 * overridden in turn by those found from an explicit `--dest` upward.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param explicitDest - The `--dest` value, when given explicitly; may not exist yet.
 * @returns The merged config defaults.
 */
async function loadConfigDefaults(
  namespace: string,
  explicitDest: string | undefined,
): Promise<Record<string, unknown>> {
  const gitIdentityDefaults = { author: await deriveAuthorFromGitConfig() };
  const fromCwd = await resolveConfigDefaults(namespace, {
    cwd: process.cwd(),
    homeDir: homedir(),
  });
  const destDir = explicitDest && nearestExistingDir(resolvePath(explicitDest));
  // The home directory is already covered by the cwd search; passing
  // destDir as homeDir keeps it from being re-applied over cwd's configs.
  const fromDest = destDir
    ? await resolveConfigDefaults(namespace, { cwd: destDir, homeDir: destDir })
    : {};
  return {
    ...gitIdentityDefaults,
    ...definedEntries(fromCwd),
    ...definedEntries(fromDest),
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
 * Runs the `gen list [<scope>/<name>]` command.
 *
 * @param packageArg - `rawArgs[1]`: the optional package argument.
 */
async function runList(packageArg: string | undefined): Promise<void> {
  if (packageArg) {
    await printPackageList(packageArg, process.cwd());
  } else {
    await printDefaultList(process.cwd());
  }
}

/**
 * `resolveNamespace()`, printing and flagging (rather than throwing) on
 * failure — the shape `main()`'s top-level control flow wants.
 *
 * @param generatorArg - The generator argument as typed on the command line.
 * @returns The resolved generator, or `undefined` once an error's been
 *   printed and `process.exitCode` set.
 */
async function tryResolveNamespace(
  generatorArg: string,
): Promise<ResolvedGenerator | undefined> {
  try {
    return await resolveNamespace(generatorArg, process.cwd());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return undefined;
  }
}

/**
 * Parses argv and either lists every generator or runs the one resolved
 * from the `<generator>` argument, in automated or interactive mode.
 *
 * @param argv - Full `process.argv` (including the node/script entries).
 */
export async function main(argv: string[]): Promise<void> {
  const rawArgs = argv.slice(2);

  if (rawArgs[0] === 'list') {
    await runList(rawArgs[1]);
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

  const resolved = await tryResolveNamespace(generatorArg);
  if (!resolved) {
    return;
  }
  const { namespace, entries } = resolved;

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

  const mode = await destinationModeFor(namespace, entries);
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

  const configDefaults = await loadConfigDefaults(
    namespace,
    destGiven ? dest : undefined,
  );

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

  await runGenerator(
    namespace,
    options,
    { destinationRoot, force: Boolean(force) },
    entries,
  );
}
