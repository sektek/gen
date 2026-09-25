import { pathToFileURL } from 'node:url';

import type { GithubClient } from '@sektek/generator-base';

import { resolveGeneratorPackagePath } from './package-resolver.js';

export type PackageScopeDefaultOptions = {
  createRepo?: boolean;
  repoOwner?: string;
  githubToken?: string;
  // Resolution root for @sektek/generator-base. Defaults to process.cwd()
  // since neither real call site has a more precise cwd on hand; kept as a
  // parameter so tests can inject a fixture directory instead of mocking
  // process.cwd().
  cwd?: string;
  // Test-only DI seam, mirroring project-name.ts's ResolveGeneratedDestinationOptions#githubClient.
  githubClient?: GithubClient;
};

/**
 * Derives the default npm scope: empty when no GitHub repo is being
 * created, the given org when one was named, or the authenticated GitHub
 * user's own login when `createRepo` is set but `repoOwner` was left
 * blank (personal account). Never throws — any failure resolving the
 * authenticated user falls back to an empty scope, so the caller can
 * always let the user type over whatever this returns.
 *
 * @param opts - What's known so far about this run's GitHub answers.
 * @returns The npm scope to default to.
 */
export async function resolvePackageScopeDefault(
  opts: PackageScopeDefaultOptions,
): Promise<string> {
  if (!opts.createRepo) {
    return '';
  }

  if (opts.repoOwner) {
    return opts.repoOwner;
  }

  try {
    const modulePath = resolveGeneratorPackagePath(
      '@sektek/generator-base',
      '',
      opts.cwd ?? process.cwd(),
    );
    const client =
      opts.githubClient ??
      (await import(pathToFileURL(modulePath).href)).defaultGithubClient();
    const token = await client.resolveToken(opts.githubToken);
    const { login } = await client.getAuthenticatedUser({ token });
    return login;
  } catch {
    return '';
  }
}

export default resolvePackageScopeDefault;
