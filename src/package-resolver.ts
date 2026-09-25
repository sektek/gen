import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export class GeneratorPackageNotFoundError extends Error {
  constructor(
    public readonly packageName: string,
    public readonly cwd: string,
  ) {
    super(
      `Generator package '${packageName}' isn't installed.\n` +
        `Searched locally from ${cwd} and alongside gen's own install.\n` +
        `Install it with 'npm install ${packageName}' (local) or 'npm install -g ${packageName}' (global).`,
    );
  }
}

// A package that exists but doesn't export the requested subpath (e.g. an
// older local install predating a manifest export) also has to be treated
// as a miss, not an error — otherwise a stale local copy blocks the global
// fallback instead of yielding to it.
const NOT_FOUND_CODES = new Set([
  'MODULE_NOT_FOUND',
  'ERR_MODULE_NOT_FOUND',
  'ERR_PACKAGE_PATH_NOT_EXPORTED',
]);

function tryResolveFromCwd(specifier: string, cwd: string): string | undefined {
  try {
    return createRequire(pathToFileURL(join(cwd, 'noop.cjs')).href).resolve(
      specifier,
    );
  } catch (error) {
    if (NOT_FOUND_CODES.has((error as NodeJS.ErrnoException).code ?? '')) {
      return undefined;
    }
    throw error;
  }
}

function tryResolveGlobalFallback(specifier: string): string | undefined {
  try {
    return fileURLToPath(import.meta.resolve(specifier));
  } catch (error) {
    if (NOT_FOUND_CODES.has((error as NodeJS.ErrnoException).code ?? '')) {
      return undefined;
    }
    throw error;
  }
}

/**
 * Resolves `subpath` off `packageName` (e.g. `'manifest'`, or `''` for the
 * package root) to an on-disk path, trying a local install relative to
 * `cwd` first and falling back to one resolvable alongside gen's own
 * install — so a workspace-local install takes priority over a global one
 * on a version conflict, while a package installed only alongside gen
 * (e.g. in a devcontainer image) is still found.
 *
 * @param packageName - The npm package to resolve (e.g. `@sektek/generator-base`).
 * @param subpath - A subpath within the package, or `''` for the package root.
 * @param cwd - The directory to search from first.
 * @returns The resolved on-disk path.
 * @throws {GeneratorPackageNotFoundError} If the package resolves from neither location.
 */
export function resolveGeneratorPackagePath(
  packageName: string,
  subpath: string,
  cwd: string,
): string {
  const specifier = subpath ? `${packageName}/${subpath}` : packageName;
  const resolved =
    tryResolveFromCwd(specifier, cwd) ?? tryResolveGlobalFallback(specifier);
  if (!resolved) {
    throw new GeneratorPackageNotFoundError(packageName, cwd);
  }
  return resolved;
}

/**
 * The npm package name convention for a scope/name pair (e.g. `('sektek',
 * 'base')` -> `'@sektek/generator-base'`), used everywhere a generator
 * namespace's package needs to be derived from its scope and short name.
 *
 * @param scope - The npm scope, without the leading `@` (e.g. `sektek`).
 * @param name - The generator's short name (e.g. `base`).
 * @returns The full npm package name.
 */
export function generatorPackageName(scope: string, name: string): string {
  return `@${scope}/generator-${name}`;
}
