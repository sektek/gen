/* eslint-disable no-console */
import { basename, resolve as resolvePath } from 'node:path';

import { type PromptContext, projectNamePrompt } from '@sektek/generator';
import { type ProviderFn, getComponent } from '@sektek/utility-belt';
import chalk from 'chalk';
import { omit } from 'lodash-es';

import {
  locateNewProject,
  resolveDestinationRoot,
} from '../destination-root.js';
import { applyGitInitImplications } from '../git-init-implications.js';
import { applyLicenseImplications } from '../license-implications.js';
import { destinationModeFor } from '../registry.js';
import { flagsGivenFor } from '../options.js';
import { runGenerator } from '../run.js';

import type { CliOptions } from './types/index.js';
import { buildProgram } from './build-program.js';
import { isInteractive } from './is-interactive.js';
import { loadConfigDefaults } from './load-config-defaults.js';
import { printUsage } from './print-usage.js';
import { promptSpecsFor } from './prompt-specs-for.js';
import { resolveAnswers } from './resolve-answers.js';
import { runList } from './run-list.js';
import { tryResolveNamespace } from './try-resolve-namespace.js';

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

  const mode = await destinationModeFor(namespace, entries);
  // Only the flag shape matters before parsing; defaults are re-resolved
  // below once configDefaults and the workspace are known.
  const flagSpecs = await promptSpecsFor(mode, {
    answers: {},
    flagsGiven: {},
    configDefaults: {},
  });

  const program = buildProgram(namespace, flagSpecs);
  program.parse(argv);

  const {
    interactive: interactiveOption,
    install,
    force,
    dest,
  } = program.opts<CliOptions>();
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

  const interactive = isInteractive(interactiveOption);
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
