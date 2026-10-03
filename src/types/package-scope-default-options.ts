// Inline rather than a static `import type` specifier, so nothing in this
// package's module graph needs @sektek/generator-base resolvable — it's
// only reached through resolveGeneratorPackagePath() at runtime.
type GithubClient = import('@sektek/generator-base').GithubClient;

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
