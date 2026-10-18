import type { GitInitImplicationsResult } from './types/index.js';
/**
 * When `resolved.gitInit` is `false`, forces `createRepo` (if present) to
 * `false`, recording a warning if its explicit value was overridden.
 * Creating *and pushing to* a GitHub remote is impossible without a local
 * git repo — declining `gitInit` makes that invariant, not just the
 * default.
 *
 * This is the safety net for what the `createRepo` prompt's `includePrompt`
 * can't close on its own: an explicit conflicting seed (e.g. `--create-repo`
 * alongside `--no-git-init`) wins over the wizard's own skip, and a
 * non-interactive run never evaluates the prompt gating. The conflict is
 * caught here, once, on the final resolved answers, the same way
 * `applyLicenseImplications` catches the analogous `license`/`private`
 * conflict. A no-op — returns `resolved` unchanged — when `gitInit` isn't
 * `false`, or for a run where `createRepo` isn't present in `resolved` at all.
 *
 * @param resolved - The fully-merged options object (post CLI/wizard resolution).
 * @returns The (possibly-adjusted) options object, plus any warning raised.
 */
export function applyGitInitImplications(
  resolved: Record<string, unknown>,
): GitInitImplicationsResult {
  if (
    resolved.gitInit !== false ||
    !('createRepo' in resolved) ||
    resolved.createRepo === false
  ) {
    return { resolved, warnings: [] };
  }

  const warning = `--no-git-init skips creating a local repo; overriding createRepo (was ${String(resolved.createRepo)}) to false — a GitHub repo can't be created and pushed to without one.`;

  return {
    resolved: { ...resolved, createRepo: false },
    warnings: [warning],
  };
}
