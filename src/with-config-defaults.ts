import type { OptionSpec } from './types/index.js';

/**
 * Overrides each spec's `default` with `configDefaults`'s value for that
 * key, if any — for pre-filling/pre-highlighting a wizard prompt's initial
 * value without skipping it (only an actual CLI flag does that). A key in
 * `configDefaults` with no matching spec is ignored.
 *
 * @param specs - The option specs to layer config defaults onto.
 * @param configDefaults - Values resolved via `resolveConfigDefaults()`.
 * @returns A new spec array; `specs` itself is left unchanged.
 */
export function withConfigDefaults(
  specs: OptionSpec[],
  configDefaults: Record<string, unknown>,
): OptionSpec[] {
  return specs.map(spec =>
    configDefaults[spec.key] === undefined
      ? spec
      : { ...spec, default: configDefaults[spec.key] },
  );
}
