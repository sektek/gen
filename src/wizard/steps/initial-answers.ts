import type { OptionSpec } from '../../types/index.js';

import { impliedAnswersFor } from './implied-answers-for.js';

/**
 * The wizard's starting answers: `seed` plus whatever each of `seed`'s own
 * keys implies (see `impliedAnswersFor`). `seed` always wins over an
 * implied value — an explicit conflicting seed (e.g. `--no-private`
 * alongside `--license UNLICENSED`) must survive here, or
 * `applyLicenseImplications` downstream never sees the conflict to warn
 * about.
 *
 * @param seed - Option values already supplied (e.g. via CLI flags).
 * @param schema - The full option schema for the namespace being run.
 * @returns The wizard's starting answers.
 */
export function initialAnswers(
  seed: Record<string, unknown>,
  schema: OptionSpec[],
): Record<string, unknown> {
  return {
    ...impliedAnswersFor('license', seed.license, schema),
    ...impliedAnswersFor('gitInit', seed.gitInit, schema),
    ...impliedAnswersFor('createRepo', seed.createRepo, schema),
    ...seed,
  };
}
