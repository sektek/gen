import type { OptionSpec } from '../../types/index.js';

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
