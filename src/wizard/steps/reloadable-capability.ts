import type { OptionSpec } from '../../types/index.js';

import { capabilityOf } from './capability-of.js';

/**
 * A `text` spec's `reloadable` capability, if it declares one — see
 * `OptionSpec.capabilities`.
 *
 * @param spec - The option spec to check.
 * @returns The `reloadable` capability, or `undefined`.
 */
export function reloadableCapability(spec: OptionSpec) {
  return capabilityOf(spec, 'reloadable');
}
