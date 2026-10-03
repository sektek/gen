import type { OptionSpec } from '../../types/index.js';

import { GITHUB_DETAIL_KEYS } from './github-detail-keys.js';
import { impliedDefaultsFor } from './implied-defaults-for.js';

/**
 * The extra answers implied by answering `gitInit` as `false`: the entire
 * GitHub block — `createRepo` itself, plus every key
 * {@link createRepoImpliedAnswers} would already imply once `createRepo` is
 * `false` — skipped. Declining a local git repo makes creating *and pushing
 * to* a GitHub remote impossible, not just unconfigured, so this skips past
 * `createRepo`'s own question too rather than just the details behind it.
 *
 * `createRepo` is force-set to a literal `false` here, deliberately *not*
 * via {@link impliedDefaultsFor}'s usual "fall back to the spec's own
 * default" — a config file can override `createRepo`'s schema default to
 * `true` (see `schema.ts`'s `withConfigDefaults`), and honoring that here
 * would silently imply `createRepo: true` right alongside `gitInit: false`,
 * which is exactly the broken combination this function exists to prevent.
 * The `GITHUB_DETAIL_KEYS` still fall back to their own (possibly
 * config-overridden) defaults, same as {@link createRepoImpliedAnswers} —
 * they're inert once `createRepo` is `false`, so what they resolve to
 * doesn't matter.
 *
 * This only closes the gap for values the wizard itself computes
 * (`initialAnswers`/`mergeAnswer`); an explicit conflicting seed (e.g.
 * `--create-repo` alongside `--no-git-init`) still wins here by the same
 * "seed always wins" rule documented on `initialAnswers` — that conflict is
 * instead caught downstream by `applyGitInitImplications` (`cli/main.ts`), which
 * runs once on the final resolved answers regardless of path, mirroring how
 * `applyLicenseImplications` already catches the analogous `license`/
 * `private` conflict.
 *
 * @param gitInit - The value answered (or pre-seeded) for `gitInit`.
 * @param schema - The full option schema for the namespace being run.
 * @returns The implied answers to merge in immediately, or `{}` if `gitInit`
 *   isn't `false`.
 */
export function gitInitImpliedAnswers(
  gitInit: unknown,
  schema: OptionSpec[],
): Record<string, unknown> {
  if (gitInit !== false) {
    return {};
  }
  const implied = impliedDefaultsFor(GITHUB_DETAIL_KEYS, schema);
  if (schema.some(spec => spec.key === 'createRepo')) {
    implied.createRepo = false;
  }
  return implied;
}
