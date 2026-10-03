// Inline rather than a static `import type` specifier, so nothing in this
// package's module graph needs @sektek/generator-base resolvable — it's
// only reached through resolveGeneratorPackagePath() at runtime.
type GithubClient = import('@sektek/generator-base').GithubClient;

export type ResolveGeneratedDestinationOptions = {
  cwd: string;
  createRepo?: boolean;
  repoOwner?: string;
  githubToken?: string;
  generateName?: () => string | PromiseLike<string>;
  maxAttempts?: number;
  // Test-only DI seam, mirroring GithubGeneratorOptions#githubClient.
  githubClient?: GithubClient;
};
