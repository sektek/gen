import { resolve } from 'node:path';

import type { DestinationMode } from '@sektek/generator';

import { type WorkspaceRoot, findWorkspaceRoot } from './workspace-root.js';
import { resolveGeneratedDestination } from './project-name.js';

export type NewProjectLocation = {
  parentDir: string;
  workspace?: WorkspaceRoot;
};

/**
 * Where a `newProjectDir` generator's project directory goes when `--dest`
 * wasn't given: under `<workspace>/<subdir>` when `mode.subdir` is set and
 * `cwd` sits inside a workspace listing `<subdir>/*`, otherwise directly
 * under `cwd`.
 *
 * @param cwd - The directory the CLI was run from.
 * @param mode - The target generator's `newProjectDir` destination mode.
 * @returns The directory to create the project under, plus the enclosing workspace, if any.
 */
export function locateNewProject(
  cwd: string,
  mode: Extract<DestinationMode, { kind: 'newProjectDir' }>,
): NewProjectLocation {
  const workspace = mode.subdir
    ? findWorkspaceRoot(cwd, mode.subdir)
    : undefined;
  return workspace && mode.subdir
    ? { parentDir: resolve(workspace.root, mode.subdir), workspace }
    : { parentDir: cwd };
}

export type DestinationRootArgs = {
  destGiven: boolean;
  dest: string;
  mode: DestinationMode;
  chosenProjectName: unknown;
  options: Record<string, unknown>;
};

/**
 * Resolves the directory to scaffold into: `dest` verbatim when `--dest`
 * was given explicitly or the generator scaffolds in place, otherwise a
 * generated project directory (see `locateNewProject()`). When the wizard
 * already resolved a project name (`chosenProjectName`), that exact name is
 * reused (`maxAttempts: 1`) rather than generating a fresh one here — a
 * name the user explicitly typed or confirmed shouldn't be silently swapped
 * out from under them on a GitHub-collision retry.
 *
 * @param args - Whether/where to generate, plus what resolveGeneratedDestination() needs to check GitHub.
 * @param args.destGiven - Whether --dest was given explicitly on the CLI.
 * @param args.dest - The (possibly default) --dest value.
 * @param args.mode - The target generator's `destinationMode()`.
 * @param args.chosenProjectName - The wizard's answer for the project-name step, if it ran.
 * @param args.options - The fully-resolved generator options (for createRepo/repoOwner/githubToken).
 * @returns The destination directory to scaffold into.
 */
export async function resolveDestinationRoot({
  destGiven,
  dest,
  mode,
  chosenProjectName,
  options,
}: DestinationRootArgs): Promise<string> {
  if (destGiven || mode.kind === 'inPlace') {
    return dest;
  }

  return resolveGeneratedDestination({
    // commander's declared default for --dest is already process.cwd()
    cwd: locateNewProject(dest, mode).parentDir,
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
