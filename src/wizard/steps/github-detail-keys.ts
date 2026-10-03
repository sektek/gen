// The github-repo-detail keys that only ever matter once `createRepo` is
// true — gated behind `options.createRepo` in generator-base's own
// `github`/index.ts, so a skipped/declined `createRepo` makes every one of
// these irrelevant.
export const GITHUB_DETAIL_KEYS = [
  'repoVisibility',
  'repoOwner',
  'githubToken',
  'push',
];
