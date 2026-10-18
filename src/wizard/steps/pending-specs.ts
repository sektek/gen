import {
  type PredicateFn,
  type ProviderFn,
  getComponent,
} from '@sektek/utility-belt';
import type { PromptContext } from '@sektek/generator';

import type { OptionSpec } from '../../types/index.js';

import { mergeAnswer } from './merge-answer.js';

/**
 * The schema entries the wizard still needs to prompt for: any key
 * already present in `seed` is skipped, even if its value is `undefined`
 * — an optional text spec with no default records `undefined` when
 * deliberately left blank (see wizard/wizard.tsx's `advance()`), and this is
 * also called against the wizard's own live in-progress answers, so
 * treating "present but undefined" as still-pending would make that step
 * reopen itself forever instead of actually completing.
 *
 * `kind === 'list'` specs (e.g. `dependencies`/`devDependencies`, SEK-87)
 * are never pending, regardless of whether they're already in `seed` —
 * the wizard never prompts for these interactively, per the ticket ("the
 * wizard should not provide the option to add when being run
 * interactively"); an unset one silently falls through to its schema
 * default (`resolve()`'s job) instead.
 *
 * @param schema - The full option schema for a namespace.
 * @param seed - Option values already supplied.
 * @returns The subset of `schema` not already covered by `seed`.
 */
export function pendingSpecs(
  schema: OptionSpec[],
  seed: Record<string, unknown>,
): OptionSpec[] {
  return schema.filter(
    spec => spec.kind !== 'list' && !Object.hasOwn(seed, spec.key),
  );
}

/** The next step to ask, and the answers once any skipped steps are folded in. */
export type NextStep = {
  spec: OptionSpec | undefined;
  answers: Record<string, unknown>;
};

/**
 * The first pending step, evaluating a prompt-derived spec's `includePrompt`
 * and `provider` against the live answers. A spec whose `includePrompt`
 * fails is skipped: its live default is recorded in the answers so the
 * final answers stay complete. A spec without a `source` is returned as-is.
 *
 * @param schema - The full option schema for a namespace.
 * @param answers - The wizard's answers so far.
 * @param base - The `configDefaults`/`workspace` half of the `PromptContext`.
 * @param seed - Option values supplied up front, passed as `flagsGiven`.
 * @returns The next spec (its `default` the live provider value), or
 *   `undefined` when none remain, plus the answers including skipped defaults.
 */
export async function nextStep(
  schema: OptionSpec[],
  answers: Record<string, unknown>,
  base: Pick<PromptContext, 'configDefaults' | 'workspace'>,
  seed: Record<string, unknown>,
): Promise<NextStep> {
  let current = answers;
  for (;;) {
    const spec = pendingSpecs(schema, current)[0];
    if (spec?.source === undefined) {
      return { spec, answers: current };
    }

    const context = {
      ...base,
      answers: current,
      flagsGiven: seed,
    } as PromptContext;
    const test: PredicateFn<PromptContext> = getComponent(
      spec.source.includePrompt,
      'test',
    );
    const get: ProviderFn<unknown, PromptContext> = getComponent(
      spec.source.provider,
      'get',
    );
    const value = await get(context);
    if (await test(context)) {
      return { spec: { ...spec, default: value }, answers: current };
    }
    current = mergeAnswer(current, spec.key, value);
  }
}
