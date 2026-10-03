import type { OptionSpec } from '../../types/index.js';

/**
 * Forces `keysToImply` (whichever are actually present in `schema`) to
 * that spec's own declared `default` — the neutral "as if never asked"
 * value, not some fixed sentinel — so a skipped step still resolves to
 * something consistent with what `resolve()` would have produced for a
 * non-interactive run that never touched these flags at all.
 *
 * @param keysToImply - The option keys to force to their schema default.
 * @param schema - The full option schema for the namespace being run.
 * @returns The implied answers, one entry per key actually found in `schema`.
 */
export function impliedDefaultsFor(
  keysToImply: readonly string[],
  schema: OptionSpec[],
): Record<string, unknown> {
  const bySpecKey = new Map(schema.map(spec => [spec.key, spec]));
  const implied: Record<string, unknown> = {};
  for (const key of keysToImply) {
    const spec = bySpecKey.get(key);
    if (spec) {
      implied[key] = spec.default;
    }
  }
  return implied;
}
