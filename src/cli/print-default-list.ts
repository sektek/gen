/* eslint-disable no-console */

import chalk from 'chalk';

import { ROOT_PACKAGES, registryFor } from '../registry/index.js';
import { GeneratorPackageNotFoundError } from '../package-resolver.js';

import { printEntries } from './print-entries.js';

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
