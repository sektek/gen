import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { GithubClient } from '@sektek/generator-base';

export type ResolveGeneratedDestinationOptions = {
  cwd: string;
  createRepo?: boolean;
  repoOwner?: string;
  githubToken?: string;
  // Test-only DI seams, mirroring GithubGeneratorOptions#githubClient.
  githubClient?: GithubClient;
  generateName?: () => string;
  maxAttempts?: number;
};

/**
 * Picks an available `adjective-noun` destination directory under `cwd`:
 * not already present on disk, and (when `createRepo` is set) not an
 * existing GitHub repo for the resolved owner. Retries with a fresh name
 * on collision, up to `maxAttempts` (default 20).
 *
 * Both `@sektek/generator`'s word lists and `@sektek/generator-base`'s
 * (octokit-backed) GithubClient are imported dynamically, only once
 * actually needed (a supplied `generateName`/`githubClient` skips the
 * corresponding import entirely) — this function already only runs when
 * `--dest` was omitted, and the GitHub check only when `--create-repo`
 * was given, so a plain `--dest ./foo` run touches neither.
 *
 * @param opts - Where to generate under, and how to check GitHub collisions.
 * @returns The chosen absolute destination path (not yet created on disk).
 */
export async function resolveGeneratedDestination(
  opts: ResolveGeneratedDestinationOptions,
): Promise<string> {
  const maxAttempts = opts.maxAttempts ?? 20;
  const generateName =
    opts.generateName ??
    (await import('@sektek/generator/project-name')).randomProjectName;
  const client = opts.createRepo
    ? (opts.githubClient ??
      (await import('@sektek/generator-base')).defaultGithubClient())
    : undefined;
  const auth = client
    ? { token: await client.resolveToken(opts.githubToken) }
    : undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const name = generateName();
    const dest = join(opts.cwd, name);

    if (existsSync(dest)) {
      continue;
    }

    if (client && auth) {
      const { exists } = await client.repoExists(auth, {
        owner: opts.repoOwner,
        name,
      });
      if (exists) {
        continue;
      }
    }

    return dest;
  }

  throw new Error(
    `Could not find an available generated project name after ${maxAttempts} attempts ` +
      '(every candidate directory or GitHub repo name was already taken). ' +
      'Pass --dest explicitly to choose your own destination.',
  );
}
