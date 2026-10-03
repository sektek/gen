import type { OptionSpec } from '../../types/index.js';

import { GITHUB_DETAIL_KEYS } from './github-detail-keys.js';
import { impliedDefaultsFor } from './implied-defaults-for.js';

/**
 * The extra answers implied by answering `createRepo` as `false`:
 * `repoVisibility`/`repoOwner`/`githubToken`/`push` (whichever are present
 * in `schema`) forced to their own default — none of them mean anything
 * once no repo is being created, so the wizard shouldn't ask.
 *
 * @param createRepo - The value answered (or pre-seeded) for `createRepo`.
 * @param schema - The full option schema for the namespace being run.
 * @returns The implied answers to merge in immediately, or `{}` if `createRepo`
 *   isn't `false`.
 */
export function createRepoImpliedAnswers(
  createRepo: unknown,
  schema: OptionSpec[],
): Record<string, unknown> {
  return createRepo === false
    ? impliedDefaultsFor(GITHUB_DETAIL_KEYS, schema)
    : {};
}
