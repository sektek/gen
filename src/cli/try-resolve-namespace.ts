/* eslint-disable no-console */

import type { ResolvedGenerator } from './types/index.js';
import { resolveNamespace } from './resolve-namespace.js';

/**
 * `resolveNamespace()`, printing and flagging (rather than throwing) on
 * failure — the shape `main()`'s top-level control flow wants.
 *
 * @param generatorArg - The generator argument as typed on the command line.
 * @returns The resolved generator, or `undefined` once an error's been
 *   printed and `process.exitCode` set.
 */
export async function tryResolveNamespace(
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
