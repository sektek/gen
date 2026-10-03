import type { OptionSpec } from '../../types/index.js';

import { createRepoImpliedAnswers } from './create-repo-implied-answers.js';
import { gitInitImpliedAnswers } from './git-init-implied-answers.js';
import { licenseImpliedAnswers } from './license-implied-answers.js';

/**
 * Every implied-answers rule keyed by the option that triggers it — shared
 * by `initialAnswers` and `mergeAnswer` so the two stay in sync. `gitInit`
 * is listed ahead of `createRepo`: `gitInit` already implies `createRepo`'s
 * own value, and schema order asks `gitInit` first, so by the time
 * `createRepo` could otherwise be answered, `gitInitImpliedAnswers` has
 * already made the question moot.
 *
 * @param key - The option key just answered (or seeded).
 * @param value - The value just answered (or seeded) for `key`.
 * @param schema - The full option schema for the namespace being run.
 * @returns The implied answers for `key`, or `{}` if `key` implies nothing.
 */
export function impliedAnswersFor(
  key: string,
  value: unknown,
  schema: OptionSpec[],
): Record<string, unknown> {
  switch (key) {
    case 'license':
      return licenseImpliedAnswers(value, schema);
    case 'gitInit':
      return gitInitImpliedAnswers(value, schema);
    case 'createRepo':
      return createRepoImpliedAnswers(value, schema);
    default:
      return {};
  }
}
