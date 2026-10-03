import type { OptionSpec } from '../../types/index.js';

import { capabilityOf } from './capability-of.js';

/**
 * A `text` spec's `clearable` capability, if it declares one — see
 * `OptionSpec.capabilities`.
 *
 * @param spec - The option spec to check.
 * @returns The `clearable` capability, or `undefined`.
 */
export function clearableCapability(spec: OptionSpec) {
  return capabilityOf(spec, 'clearable');
}
