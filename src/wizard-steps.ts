import type { OptionSpec } from './schema.js';

export type WizardChoice = {
  label: string;
  value: unknown;
};

/**
 * The schema entries the wizard still needs to prompt for: any key
 * already supplied via `seed` is skipped.
 *
 * @param schema - The full option schema for a namespace.
 * @param seed - Option values already supplied.
 * @returns The subset of `schema` not already covered by `seed`.
 */
export function pendingSpecs(
  schema: OptionSpec[],
  seed: Record<string, unknown>,
): OptionSpec[] {
  return schema.filter(spec => seed[spec.key] === undefined);
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
