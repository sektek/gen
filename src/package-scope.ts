import type { GithubClient } from '@sektek/generator-base';

export type PackageScopeDefaultOptions = {
  createRepo?: boolean;
  repoOwner?: string;
  githubToken?: string;
  // Test-only DI seam, mirroring project-name.ts's ResolveGeneratedDestinationOptions#githubClient.
  githubClient?: GithubClient;
};

/**
 * Derives the default npm scope (SEK-94): empty when no GitHub repo is
 * being created, the given org when one was named, or the authenticated
 * GitHub user's own login when `createRepo` is set but `repoOwner` was
 * left blank (personal account).
 *
 * This is a *default*, not a requirement — any failure resolving the
 * authenticated user (no token resolvable, an invalid one, a network
 * error, ...) falls back to an empty scope rather than throwing, so a
 * flaky/absent GitHub connection never blocks picking an npm scope. The
 * caller (the wizard's `packageScope` step, or `cli.ts`'s automated-path
 * equivalent) still lets the user type over whatever this returns.
 *
 * @param opts - What's known so far about this run's GitHub answers.
 * @returns The npm scope to default to (never throws).
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
    const client =
      opts.githubClient ??
      (await import('@sektek/generator-base')).defaultGithubClient();
    const token = await client.resolveToken(opts.githubToken);
    const { login } = await client.getAuthenticatedUser({ token });
    return login;
  } catch {
    // No resolvable/valid token, network error, etc. — a default that
    // can't be computed just falls through to "no scope" rather than
    // blocking the step (see this function's own doc comment).
    return '';
  }
}

export default resolvePackageScopeDefault;
