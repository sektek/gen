import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { GeneratorPackageNotFoundError } from '../package-resolver.js';

import type { PackageJson } from './package-json.js';

/**
 * The on-disk directory containing `packageName`'s own `package.json`,
 * walked up from `fromPath` until a `package.json` naming this exact
 * package is found, rather than resolving `<packageName>/package.json`
 * directly — `package.json` isn't a subpath these packages' `exports` maps
 * expose (unlike `manifest` or `generators/<name>`, which
 * `resolveGeneratorPackagePath` handles directly), so a direct resolve
 * attempt throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 *
 * `fromPath` must come from a `resolveGeneratorPackagePath` call already
 * made against the same `packageName` (e.g. its resolved `manifestPath`)
 * rather than a fresh `resolveGeneratorPackagePath(packageName, '', cwd)`
 * call here — the resolver's cwd-first-then-global fallback is decided
 * per subpath, so a second independent call can silently land on a
 * different installation than the one whose manifest was just loaded,
 * reading a `package.json`/`dependencies` inconsistent with it.
 *
 * @param packageName - The npm package to locate (e.g. `@sektek/generator-base`).
 * @param fromPath - A path already resolved against this exact `packageName`.
 * @param cwd - Only used to name the search root in a not-found error.
 * @returns The absolute path to the package's own root directory.
 */
export function packageRootFor(
  packageName: string,
  fromPath: string,
  cwd: string,
): string {
  let dir = dirname(fromPath);
  for (;;) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as PackageJson;
      if (pkg.name === packageName) return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new GeneratorPackageNotFoundError(packageName, cwd);
    }
    dir = parent;
  }
}
