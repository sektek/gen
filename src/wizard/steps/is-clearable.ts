import type { OptionSpec } from '../../types/index.js';
import { PROJECT_NAME_KEY } from '../../project-name.js';

import { clearableCapability } from './clearable-capability.js';

/**
 * Whether ctrl+x should be wired up for `spec`'s field. The project-name
 * step has no `clearable` capability of its own — an empty project name is
 * never a valid stored value, so there's nothing for `clearable`'s `value`
 * fallback to mean for it — but still supports ctrl+x, via the prefix-aware
 * handling in wizard/generated-text-input.tsx's GeneratedTextInput rather than the generic
 * `clearable` capability.
 *
 * @param spec - The option spec to check.
 * @returns Whether the field should treat ctrl+x as "clear".
 */
export function isClearable(spec: OptionSpec): boolean {
  return Boolean(clearableCapability(spec)) || spec.key === PROJECT_NAME_KEY;
}
