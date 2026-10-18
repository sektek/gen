import { homedir } from 'node:os';
import { resolve as resolvePath } from 'node:path';

import { resolveConfigDefaults } from '@sektek/generator';

import { definedEntries } from './defined-entries.js';
import { nearestExistingDir } from './nearest-existing-dir.js';

/**
 * The config-default layer: whatever `gen.config.*` files are found from cwd
 * upward and in the home directory, overridden in turn by those found from
 * an explicit `--dest` upward.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param explicitDest - The `--dest` value, when given explicitly; may not exist yet.
 * @returns The merged config defaults.
 */
export async function loadConfigDefaults(
  namespace: string,
  explicitDest: string | undefined,
): Promise<Record<string, unknown>> {
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
    ...definedEntries(fromCwd),
    ...definedEntries(fromDest),
  };
}
