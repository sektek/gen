import type { OptionSpec } from '../../types/index.js';

import { impliedAnswersFor } from './implied-answers-for.js';

/**
 * Folds a just-answered value into the wizard's running answers, plus
 * whatever `key` implies (see `impliedAnswersFor`). Implied values only
 * fill gaps — `prev` and the value just given always win — for the same
 * reason `initialAnswers` favors `seed`: a real conflict must stay visible
 * for `applyLicenseImplications` to report, not get silently absorbed.
 *
 * @param prev - The answers accumulated so far.
 * @param key - The option key just answered.
 * @param value - The value just answered for `key`.
 * @param schema - The full option schema for the namespace being run.
 * @returns The next answers state.
 */
export function mergeAnswer(
  prev: Record<string, unknown>,
  key: string,
  value: unknown,
  schema: OptionSpec[],
): Record<string, unknown> {
  const implied = impliedAnswersFor(key, value, schema);
  return { ...implied, ...prev, [key]: value };
}
