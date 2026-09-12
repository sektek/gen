/* eslint-disable no-console */
import { homedir } from 'node:os';

import { Command } from 'commander';
import chalk from 'chalk';
import { resolveConfigDefaults } from '@sektek/generator';

import { type OptionSpec, PACKAGE_SCOPE_OPTIONS } from './schema.js';
import {
  PROJECT_NAME_KEY,
  loadGenerateProjectName,
  resolveGeneratedDestination,
} from './project-name.js';
import { addSchemaOptions, flagsGivenFor, resolve } from './options.js';
import { REGISTRY } from './registry.js';
import { applyLicenseImplications } from './license-implications.js';
import { explicitOptionKeysFromWizard } from './wizard-steps.js';
import { resolvePackageScopeDefault } from './package-scope.js';
import { runGenerator } from './run.js';
import { runWizard } from './run-wizard.js';

// Package aliases "js"/"base" resolve to — distinct from
// CoreOptions.namespace (the --namespace flag, config-scoping value
// written into generated projects).
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
 * Builds the synthetic, wizard-only spec for picking the destination
 * directory's name: pre-filled with a freshly generated `adjective-noun`
 * name, regeneratable via ctrl+r (see wizard.tsx's GeneratedTextInput).
 * Never registered with commander (schemaFor() doesn't include it) and
 * never seen by the automated `resolve()` path — only `runWizard()` gets it,
 * as a `leadingSpecs` entry.
 *
 * @returns The project-name spec to prepend to the wizard's schema.
 */
async function buildProjectNameSpec(): Promise<OptionSpec> {
  const generateName = await loadGenerateProjectName();
  return {
    key: PROJECT_NAME_KEY,
    flag: '--project-name <value>',
    prompt: 'Project name',
    kind: 'text',
    default: generateName(),
    generateDefault: generateName,
  };
}

/**
 * The automated (`!interactive`) path's equivalent of `packageScope`'s
 * `generateDefaultAsync` (schema.ts's `PACKAGE_SCOPE_OPTIONS`, SEK-94): the
 * wizard resolves that default live, from whatever's been answered so far
 * in the same run, but `resolve()` never reads `generateDefaultAsync` (only
 * a spec's static `default` — see schema.ts's own doc comment on why), and
 * a `--yes`/flags-only run has no wizard to compute it live either way. So
 * this resolves the identical derivation eagerly from `flagsGiven` (the
 * only source of `createRepo`/`repoOwner`/`githubToken` available at all
 * on this path) and folds it in as an `extraSpecs` entry, which
 * `resolve()`'s `defaults` layer picks up the same way a real schema
 * default would — still overridable by an explicit `--package-scope`, a
 * config file, or (for the base family, which has no packageScope option
 * at all) simply never applying.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param flagsGiven - Option values already supplied via CLI flags.
 * @returns A one-entry `extraSpecs` array for `resolve()`, or `[]` when
 *   irrelevant (a non-js namespace, or `--package-scope` already given —
 *   in the latter case resolving this would just be discarded anyway).
 */
async function packageScopeExtraSpecs(
  namespace: string,
  flagsGiven: Record<string, unknown>,
): Promise<OptionSpec[]> {
  if (
    !namespace.startsWith('@sektek/js:') ||
    flagsGiven.packageScope !== undefined
  ) {
    return [];
  }

  const packageScope = await resolvePackageScopeDefault({
    createRepo: flagsGiven.createRepo === true,
    repoOwner:
      typeof flagsGiven.repoOwner === 'string'
        ? flagsGiven.repoOwner
        : undefined,
    githubToken:
      typeof flagsGiven.githubToken === 'string'
        ? flagsGiven.githubToken
        : undefined,
  });

  // Reuses schema.ts's own packageScope spec (flag/prompt/kind) rather than
  // re-typing it here, just overriding `default` — `generateDefaultAsync`
  // along for the ride is harmless: resolve() never reads it (see its own
  // doc comment on `extraSpecs`).
  return [{ ...PACKAGE_SCOPE_OPTIONS[0], default: packageScope }];
}

type ResolveAnswersArgs = {
  namespace: string;
  flagsGiven: Record<string, unknown>;
  configDefaults: Record<string, unknown>;
  interactive: boolean;
  // The project-name step to prepend to the wizard's schema, if one is
  // needed (see `buildProjectNameSpec()`) — only ever set when `interactive`
  // is also true.
  projectNameSpec: OptionSpec | undefined;
  destCwd: string;
};

type ResolvedAnswers = {
  answers: Record<string, unknown>;
  explicitOptionKeys: string[];
  // The wizard's project-name answer, if its step ran; `undefined` on the
  // automated path or when no project-name step was needed. Consumed only
  // by `resolveDestinationRoot()` — never a real generator option.
  chosenProjectName: unknown;
};

/**
 * Resolves this run's answers: the interactive wizard (seeded with
 * `flagsGiven`, prefixed with a project-name step when one is needed) or,
 * automated, `flagsGiven` folded straight through `resolve()`.
 *
 * @param args - Everything either path needs.
 * @param args.namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param args.flagsGiven - Option values already supplied via CLI flags.
 * @param args.configDefaults - Values resolved via `resolveConfigDefaults()`.
 * @param args.interactive - Whether to run the interactive wizard at all.
 * @param args.projectNameSpec - The project-name step to prepend, if the wizard needs one.
 * @param args.destCwd - The directory a project-name answer would be created under.
 * @returns The fully-resolved answers, which option keys were explicit, and the wizard's project-name answer, if any.
 */
async function resolveAnswers({
  namespace,
  flagsGiven,
  configDefaults,
  interactive,
  projectNameSpec,
  destCwd,
}: ResolveAnswersArgs): Promise<ResolvedAnswers> {
  if (!interactive) {
    return {
      answers: resolve(
        namespace,
        flagsGiven,
        configDefaults,
        await packageScopeExtraSpecs(namespace, flagsGiven),
      ),
      explicitOptionKeys: Object.keys(flagsGiven),
      chosenProjectName: undefined,
    };
  }

  const wizardResult = await runWizard(namespace, flagsGiven, configDefaults, {
    leadingSpecs: projectNameSpec ? [projectNameSpec] : [],
    destCwd,
  });

  // The chosen project name only picks the destination directory (see
  // resolveDestinationRoot()) — it's never a real generator option, so
  // it's pulled back out of both the answers and the answered-keys before
  // either feeds resolve()/explicitOptionKeysFromWizard().
  const { [PROJECT_NAME_KEY]: chosenProjectName, ...rest } =
    wizardResult.answers;

  return {
    // The wizard never prompts for a 'list' spec, so its answers alone
    // would leave dependencies/devDependencies undefined; resolve() layers
    // in their schema/config default, same as the non-interactive path.
    answers: resolve(namespace, rest, configDefaults),
    explicitOptionKeys: explicitOptionKeysFromWizard(
      flagsGiven,
      wizardResult.answeredKeys.filter(key => key !== PROJECT_NAME_KEY),
    ),
    chosenProjectName,
  };
}

type DestinationRootArgs = {
  destGiven: boolean;
  dest: string;
  chosenProjectName: unknown;
  options: Record<string, unknown>;
};

/**
 * Resolves the directory to scaffold into: `dest` verbatim when `--dest`
 * was given explicitly, otherwise a generated one. When the wizard already
 * resolved a project name (`chosenProjectName`), that exact name is reused
 * (`maxAttempts: 1`) rather than generating a fresh one here — a name the
 * user explicitly typed or confirmed shouldn't be silently swapped out from
 * under them on a (rare, only-possible-on-a-GitHub-collision-now) retry the
 * way an entirely-automated run's name is.
 *
 * @param args - Whether/where to generate, plus what resolveGeneratedDestination() needs to check GitHub.
 * @param args.destGiven - Whether --dest was given explicitly on the CLI.
 * @param args.dest - The (possibly default) --dest value.
 * @param args.chosenProjectName - The wizard's answer for the project-name step, if it ran.
 * @param args.options - The fully-resolved generator options (for createRepo/repoOwner/githubToken).
 * @returns The destination directory to scaffold into.
 */
async function resolveDestinationRoot({
  destGiven,
  dest,
  chosenProjectName,
  options,
}: DestinationRootArgs): Promise<string> {
  if (destGiven) {
    return dest;
  }

  return resolveGeneratedDestination({
    cwd: dest, // commander's declared default for --dest is already process.cwd()
    // `options` is a Record<string, unknown> — a config file can put
    // anything under these keys (e.g. `"createRepo": "false"`, a truthy
    // *string*), so narrow at runtime rather than `as`-casting, which would
    // just carry a wrongly-typed value straight through.
    createRepo: options.createRepo === true,
    repoOwner:
      typeof options.repoOwner === 'string' ? options.repoOwner : undefined,
    githubToken:
      typeof options.githubToken === 'string' ? options.githubToken : undefined,
    ...(typeof chosenProjectName === 'string'
      ? { generateName: () => chosenProjectName, maxAttempts: 1 }
      : {}),
  });
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

  addSchemaOptions(program, namespace);
  program.parse(argv);

  const { yes, install, force, dest } = program.opts<CliOptions>();

  // Only what the user actually typed, schema-driven (including the
  // two-flags-one-key merge for `kind: 'list'` specs) — see
  // flagsGivenFor()'s own doc comment.
  const flagsGiven = flagsGivenFor(program, namespace);

  const configDefaults = await resolveConfigDefaults(namespace, {
    cwd: process.cwd(),
    homeDir: homedir(),
  });

  const destGiven = program.getOptionValueSource('dest') === 'cli';
  const interactive = isInteractive(yes);

  // A generated project name is only ever needed when --dest is omitted
  // (an explicit --dest already fully specifies the destination directory,
  // same as always) — and only the interactive wizard can show it as a
  // pre-filled, ctrl+r-regeneratable default; the automated path below
  // still leaves picking one entirely to resolveGeneratedDestination(),
  // unchanged.
  const projectNameSpec =
    interactive && !destGiven ? await buildProjectNameSpec() : undefined;

  const { answers, explicitOptionKeys, chosenProjectName } =
    await resolveAnswers({
      namespace,
      flagsGiven,
      configDefaults,
      interactive,
      projectNameSpec,
      destCwd: dest, // commander's declared default for --dest is already process.cwd()
    });

  const merged = {
    ...answers,
    skipInstall: !install,
  };

  const { resolved: licensed, warnings } = applyLicenseImplications(merged);
  for (const warning of warnings) {
    console.warn(chalk.yellow(warning));
  }
  // Annotated: object-spread would otherwise drop licensed's index signature.
  const options: Record<string, unknown> = { ...licensed, explicitOptionKeys };

  const destinationRoot = await resolveDestinationRoot({
    destGiven,
    dest,
    chosenProjectName,
    options,
  });

  await runGenerator(namespace, options, {
    destinationRoot,
    force: Boolean(force),
  });
}
