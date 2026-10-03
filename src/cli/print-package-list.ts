/* eslint-disable no-console */

import type { RegistryEntry } from '../types/index.js';
import { registryFor } from '../registry/index.js';

import { parsePackageArg } from './parse-package-arg.js';
import { printEntries } from './print-entries.js';

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
