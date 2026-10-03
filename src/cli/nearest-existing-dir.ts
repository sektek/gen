import { dirname } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Walks up from `path` to the nearest ancestor (or `path` itself) that
 * exists on disk.
 *
 * @param path - A path that may not exist yet.
 * @returns The nearest existing directory, or the filesystem root.
 */
export function nearestExistingDir(path: string): string {
  let dir = path;
  while (!existsSync(dir) && dirname(dir) !== dir) {
    dir = dirname(dir);
  }
  return dir;
}
