import type { OptionSpec } from '../types/index.js';

import { choicesFor } from './steps/index.js';

/**
 * The human-readable form of an answered step's value, for scrollback:
 * `select`/`boolean` resolve back to their choice `label` (e.g. `true` ->
 * `"Yes"`) rather than showing the raw stored value.
 *
 * @param spec - The option spec that was just answered.
 * @param value - The value `advance()` recorded for it.
 * @returns The text to display for this answer in the `<Static>` scrollback.
 */
export function displayValue(spec: OptionSpec, value: unknown): string {
  if (spec.kind === 'select' || spec.kind === 'boolean') {
    const choice = choicesFor(spec).find(c => c.value === value);
    if (choice) {
      return choice.label;
    }
  }
  return value === undefined || value === null ? '' : String(value);
}
