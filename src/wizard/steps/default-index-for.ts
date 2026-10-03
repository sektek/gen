import type { OptionSpec } from '../../types/index.js';
import type { WizardChoice } from '../types/index.js';

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
