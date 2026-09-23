import { basename, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { configSearchPaths } from '@sektek/generator';

export type WorkspaceRoot = {
  root: string;
  name: string;
};

function readPackageJson(dir: string): Record<string, unknown> | undefined {
  const path = join(dir, 'package.json');
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

/**
 * Finds the nearest npm workspace at or above `cwd` whose `package.json`
 * `workspaces` array lists `<subdir>/*` — i.e. a workspace a new project
 * of that kind (e.g. `libs`) belongs inside.
 *
 * @param cwd - The directory to start searching from.
 * @param subdir - The workspace member directory to look for (e.g. `libs`).
 * @returns The workspace's root directory and its package `name`, or
 *   `undefined` when no enclosing workspace lists `<subdir>/*`.
 */
export function findWorkspaceRoot(
  cwd: string,
  subdir: string,
): WorkspaceRoot | undefined {
  if (!existsSync(cwd)) {
    return undefined;
  }

  const glob = `${subdir}/*`;
  // Passing cwd as the home dir keeps configSearchPaths from appending the
  // real home directory — a workspace has to be an actual ancestor.
  for (const dir of configSearchPaths(cwd, cwd)) {
    const pkg = readPackageJson(dir);
    if (Array.isArray(pkg?.workspaces) && pkg.workspaces.includes(glob)) {
      return {
        root: dir,
        name: typeof pkg.name === 'string' ? pkg.name : basename(dir),
      };
    }
  }

  return undefined;
}
