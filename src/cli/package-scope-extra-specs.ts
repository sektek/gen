import type { OptionSpec } from '../types/index.js';
import { PACKAGE_SCOPE_OPTIONS } from '../schema.js';
import { resolvePackageScopeDefault } from '../package-scope.js';

/**
 * The automated (`!interactive`) path's equivalent of `packageScope`'s
 * `generateDefaultAsync` — `resolve()` never reads that (only a spec's
 * static `default`), and there's no wizard on this path to compute it live
 * either way, so this resolves the same derivation eagerly from
 * `flagsGiven` and folds it in as an `extraSpecs` entry for `resolve()`.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param flagsGiven - Option values already supplied via CLI flags.
 * @param configDefaults - Values resolved via `resolveConfigDefaults()`.
 * @returns A one-entry `extraSpecs` array for `resolve()`, or `[]` when
 *   irrelevant (a non-js namespace, or `--package-scope` already given).
 */
export async function packageScopeExtraSpecs(
  namespace: string,
  flagsGiven: Record<string, unknown>,
  configDefaults: Record<string, unknown>,
): Promise<OptionSpec[]> {
  const merged = { ...configDefaults, ...flagsGiven };
  if (
    !namespace.startsWith('@sektek/js:') ||
    merged.packageScope !== undefined
  ) {
    return [];
  }

  const packageScope = await resolvePackageScopeDefault({
    createRepo: merged.createRepo === true,
    repoOwner:
      typeof merged.repoOwner === 'string' ? merged.repoOwner : undefined,
    githubToken:
      typeof merged.githubToken === 'string' ? merged.githubToken : undefined,
  });

  // generateDefaultAsync comes along for the ride; harmless, since
  // resolve() never reads it.
  return [{ ...PACKAGE_SCOPE_OPTIONS[0], default: packageScope }];
}
