import { GeneratorPackageNotFoundError } from '../package-resolver.js';
import type { RegistryEntry } from '../types/index.js';

import { registryFor } from './registry-for.js';

/**
 * Builds `REGISTRY`-shaped entries for a list of root packages,
 * best-effort: a package that isn't installed (`GeneratorPackageNotFoundError`)
 * is silently skipped rather than thrown, so one missing package doesn't
 * prevent resolving the others. Any other error still propagates.
 *
 * Exists as its own function (rather than inlined into `REGISTRY`'s
 * top-level `await`) so this behavior is directly testable — `REGISTRY`
 * itself only runs once, at module load, which a test can't easily
 * re-trigger under different conditions.
 *
 * @param rootPackages - The packages to resolve.
 * @param cwd - The directory to resolve each from.
 * @returns Every entry from every package that resolved successfully.
 */
export async function buildRegistry(
  rootPackages: readonly string[],
  cwd: string,
): Promise<RegistryEntry[]> {
  const seen = new Set<string>();
  const entries: RegistryEntry[] = [];
  for (const pkg of rootPackages) {
    try {
      entries.push(...(await registryFor(pkg, cwd, seen)));
    } catch (error) {
      if (!(error instanceof GeneratorPackageNotFoundError)) {
        throw error;
      }
    }
  }
  return entries;
}
