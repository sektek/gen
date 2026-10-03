import type { PromptCapability } from '@sektek/generator';

import type { OptionSpec } from '../../types/index.js';

/**
 * The `spec.capabilities` entry of the given `type`, if any — the lookup
 * behind `reloadableCapability()`/`clearableCapability()`.
 *
 * @param spec - The option spec to check.
 * @param type - The capability type to look for.
 * @returns The matching capability, or `undefined` if `spec` doesn't declare one.
 */
export function capabilityOf<T extends PromptCapability['type']>(
  spec: OptionSpec,
  type: T,
): Extract<PromptCapability, { type: T }> | undefined {
  return spec.capabilities?.find(
    (capability): capability is Extract<PromptCapability, { type: T }> =>
      capability.type === type,
  );
}
