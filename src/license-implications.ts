export type LicenseImplicationsResult = {
  resolved: Record<string, unknown>;
  warnings: string[];
};

/**
 * When `resolved.license` is `'UNLICENSED'`, forces `private`/
 * `repoVisibility` (whichever are present) to their private value,
 * recording a warning for each key whose explicit value was overridden.
 * A no-op — returns `resolved` unchanged — when `license` isn't
 * `'UNLICENSED'`, or for a base-only run where `license` isn't present
 * in `resolved` at all.
 *
 * @param resolved - The fully-merged options object (post CLI/wizard resolution).
 * @returns The (possibly-adjusted) options object, plus any warnings raised.
 */
export function applyLicenseImplications(
  resolved: Record<string, unknown>,
): LicenseImplicationsResult {
  if (resolved.license !== 'UNLICENSED') {
    return { resolved, warnings: [] };
  }

  const warnings: string[] = [];
  const next = { ...resolved };

  if ('private' in next && next.private !== true) {
    warnings.push(
      '--license UNLICENSED requires a private package; overriding --no-private to private.',
    );
    next.private = true;
  }

  if ('repoVisibility' in next && next.repoVisibility !== 'private') {
    warnings.push(
      `--license UNLICENSED requires a private repo; overriding --repo-visibility ${String(next.repoVisibility)} to private.`,
    );
    next.repoVisibility = 'private';
  }

  return { resolved: next, warnings };
}
