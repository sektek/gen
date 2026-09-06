import type { OptionSpec } from './schema.js';

export type WizardChoice = {
  label: string;
  value: unknown;
};

/**
 * The schema entries the wizard still needs to prompt for: any key
 * already present in `seed` is skipped, even if its value is `undefined`
 * — an optional text spec with no default records `undefined` when
 * deliberately left blank (see wizard.tsx's `advance()`), and this is
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

/**
 * The choice list to render for a `select` or `boolean` spec.
 * `ink-select-input` has no native checkbox, so a `boolean` spec gets a
 * synthetic Yes/No choice list mapped back to `true`/`false`.
 *
 * @param spec - A `select` or `boolean` option spec.
 * @returns The choices to pass to `ink-select-input`'s `<SelectInput>`.
 */
export function choicesFor(spec: OptionSpec): WizardChoice[] {
  if (spec.kind === 'boolean') {
    return [
      { label: 'Yes', value: true },
      { label: 'No', value: false },
    ];
  }

  if (spec.kind === 'select') {
    if (!spec.choices || spec.choices.length === 0) {
      throw new Error(`choicesFor(): select spec '${spec.key}' has no choices`);
    }
    return spec.choices.map(choice => ({ label: choice, value: choice }));
  }

  throw new Error(
    `choicesFor() only supports 'select'/'boolean' specs, got '${spec.kind}' for '${spec.key}'`,
  );
}

/**
 * The extra answers implied by answering `license` as `'UNLICENSED'`:
 * `private`/`repoVisibility` forced to their private value, for whichever
 * of those two keys actually exist in `schema` (a base-only schema has
 * neither `license` nor `private`, but does have `repoVisibility`).
 *
 * @param license - The value answered (or pre-seeded) for `license`.
 * @param schema - The full option schema for the namespace being run.
 * @returns The implied answers to merge in immediately, or `{}` if `license`
 *   isn't `'UNLICENSED'`.
 */
export function licenseImpliedAnswers(
  license: unknown,
  schema: OptionSpec[],
): Record<string, unknown> {
  if (license !== 'UNLICENSED') {
    return {};
  }

  const keys = new Set(schema.map(spec => spec.key));
  const implied: Record<string, unknown> = {};
  if (keys.has('private')) {
    implied.private = true;
  }
  if (keys.has('repoVisibility')) {
    implied.repoVisibility = 'private';
  }
  return implied;
}

/**
 * The wizard's starting answers: `seed` plus whatever `licenseImpliedAnswers`
 * derives from `seed.license`. `seed` always wins over an implied value —
 * an explicit conflicting seed (e.g. `--no-private` alongside
 * `--license UNLICENSED`) must survive here, or `applyLicenseImplications`
 * downstream never sees the conflict to warn about.
 *
 * @param seed - Option values already supplied (e.g. via CLI flags).
 * @param schema - The full option schema for the namespace being run.
 * @returns The wizard's starting answers.
 */
export function initialAnswers(
  seed: Record<string, unknown>,
  schema: OptionSpec[],
): Record<string, unknown> {
  return { ...licenseImpliedAnswers(seed.license, schema), ...seed };
}

/**
 * Folds a just-answered value into the wizard's running answers, plus (for
 * `key === 'license'`) whatever it implies. Implied values only fill gaps
 * — `prev` and the value just given always win — for the same reason
 * `initialAnswers` favors `seed`: a real conflict must stay visible for
 * `applyLicenseImplications` to report, not get silently absorbed.
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
  const implied = key === 'license' ? licenseImpliedAnswers(value, schema) : {};
  return { ...implied, ...prev, [key]: value };
}

/**
 * Which option keys count as "explicit" for a completed interactive run:
 * a real CLI flag given up front, or a spec actually prompted for and
 * answered live — never a key only present because `licenseImpliedAnswers`
 * injected it alongside a real answer.
 *
 * @param flagsGiven - Option values already supplied via CLI flags.
 * @param answeredKeys - Keys `Wizard` actually prompted for and answered.
 * @returns The deduped union of both.
 */
export function explicitOptionKeysFromWizard(
  flagsGiven: Record<string, unknown>,
  answeredKeys: string[],
): string[] {
  return [...new Set([...Object.keys(flagsGiven), ...answeredKeys])];
}

/**
 * The index within `choices` matching `spec`'s declared default, for
 * pre-selecting `<SelectInput>`'s initial highlight. Falls back to `0`
 * when there's no default, or it doesn't match any choice.
 *
 * @param spec - The `select` or `boolean` option spec being rendered.
 * @param choices - That spec's choice list, as returned by `choicesFor(spec)`.
 * @returns The index to pass as `<SelectInput>`'s `initialIndex`.
 */
export function defaultIndexFor(
  spec: OptionSpec,
  choices: WizardChoice[],
): number {
  if (spec.default === undefined) {
    return 0;
  }
  const index = choices.findIndex(choice => choice.value === spec.default);
  return index === -1 ? 0 : index;
}
