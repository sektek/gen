// Custom bump logic: while pre-1.0, `feat` bumps minor and a breaking-change
// commit is *capped* at minor too (not promoted to major) — SEKTEK's stated
// 0.x policy is "features and breaking changes both land as minor bumps."
// The built-in `preMajor: true` option on the `conventionalcommits` preset
// does NOT do this: it uniformly demotes every bump level by one while
// major is 0 (breaking: major->minor, but also feat: minor->patch), which
// silently swallowed a `feat:` commit into a patch bump (0.0.0 -> 0.0.1
// instead of 0.1.0) the first time this was tried. Supplying `whatBump`
// directly bypasses that preset behavior entirely.
const HIDDEN_TYPES = new Set([
  'docs',
  'style',
  'chore',
  'refactor',
  'test',
  'build',
  'ci',
]);

/**
 * Recommends a release-it bump level from parsed conventional commits.
 *
 * @param commits - Parsed commits since the last release.
 * @returns The recommended bump (level: 0 major, 1 minor, 2 patch), or null if nothing bump-worthy.
 */
function whatBump(commits) {
  let level = 2; // patch
  let breakings = 0;
  let features = 0;
  let fixes = 0;

  for (const commit of commits) {
    if (commit.notes.length > 0) {
      breakings += commit.notes.length;
      level = Math.min(level, 1); // capped at minor, not major, pre-1.0
    } else if (commit.type === 'feat' || commit.type === 'feature') {
      features += 1;
      level = Math.min(level, 1);
    } else if (commit.type && !HIDDEN_TYPES.has(commit.type)) {
      fixes += 1; // fix/perf/revert -> patch
    }
  }

  // Nothing bump-worthy since the last release (e.g. chore-only) — skip,
  // same protection `bumpStrict` gives the stock preset.
  if (!breakings && !features && !fixes) {
    return null;
  }

  return {
    level,
    reason: `There are ${breakings} BREAKING CHANGES and ${features} features`,
  };
}

export default {
  plugins: {
    '@release-it/conventional-changelog': {
      preset: { name: 'conventionalcommits' },
      infile: 'CHANGELOG.md',
      whatBump,
    },
  },
  git: {
    commitMessage: 'chore: release v${version} [skip ci]',
    tagName: 'v${version}',
    push: true,
    pushArgs: ['--follow-tags'],
  },
  github: {
    release: true,
    releaseName: 'v${version}',
  },
  npm: {
    publish: false,
  },
};
