import { Command } from 'commander';

import type { OptionSpec } from '../types/index.js';
import { addSchemaOptions } from '../options.js';

/**
 * Builds the commander program for a resolved generator: the flags every
 * generator takes, plus one per prompt-derived spec.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param flagSpecs - The namespace's prompt-derived specs, gated ones included (see `promptSpecsFor()`).
 * @returns The configured, not-yet-parsed program.
 */
export function buildProgram(
  namespace: string,
  flagSpecs: OptionSpec[],
): Command {
  const program = new Command();
  program
    .name('gen')
    .description(`Run the ${namespace} generator`)
    .argument('<generator>', 'Generator to run, e.g. "js:app" or "base:readme"')
    .option(
      '--no-interactive',
      'Force automated mode even in an interactive terminal',
    )
    .option(
      '--install',
      'Run the package manager install step (skipped by default)',
    )
    .option('--force', 'Overwrite files that already exist without prompting')
    .option('--dest <path>', 'Destination directory', process.cwd())
    .addHelpText(
      'after',
      `\nExample:\n  $ gen ${namespace} --no-interactive --dest ./my-project\n`,
    );

  addSchemaOptions(program, flagSpecs);
  return program;
}
