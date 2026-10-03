import type { OptionSpec } from '../../types/index.js';

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
