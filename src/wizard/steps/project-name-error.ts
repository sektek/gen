import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { isSafePathSegment } from '../../project-name.js';

/**
 * Validates a candidate project name for the wizard's project-name step
 * (see wizard/generated-text-input.tsx's GeneratedTextInput): rejects anything that isn't a safe
 * single path segment, or that already exists as a directory under `cwd`.
 * Only a cheap, synchronous, local check — a GitHub repo-name collision
 * (only possible once `createRepo` is known, answered by a later step) is
 * still left to `resolveGeneratedDestination`'s own check after the wizard
 * completes.
 *
 * @param name - The candidate name as currently typed.
 * @param cwd - The directory the chosen name will be created under.
 * @returns An error message to display, or `undefined` if `name` is fine.
 */
export function projectNameError(
  name: string,
  cwd: string,
): string | undefined {
  if (!isSafePathSegment(name)) {
    return `'${name}' isn't a valid directory name.`;
  }
  if (existsSync(join(cwd, name))) {
    return `'${name}' already exists in ${cwd}.`;
  }
  return undefined;
}
