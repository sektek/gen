import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

import type { RegistryEntry } from '../types/index.js';
import { resolveGeneratorPackagePath } from '../package-resolver.js';

import type { PackageJson } from './package-json.js';
import { packageRootFor } from './package-root-for.js';

// A generator package's own npm `dependencies` on another generator
// package look like this — e.g. `@sektek/generator-js` depending on
// `@sektek/generator-base` — deliberately excluding the shared
// `@sektek/generator` core library itself, which has no trailing `-<name>`
// and no manifest/generators of its own to resolve.
const GENERATOR_DEPENDENCY_PATTERN = /^@[^/]+\/generator-/;

/**
 * Resolves `packageName`'s own manifest + generators, plus (recursively,
 * deduped by package name) any of its declared `dependencies` matching
 * `@<scope>/generator-<name>` — this is what lets e.g. `@sektek/js:app` keep composing
 * `@sektek/base:*` sub-generators without any caller hardcoding both
 * packages up front: `@sektek/generator-js`'s own `package.json` already
 * lists `@sektek/generator-base` as a real dependency, so reading it here
 * is all that's needed.
 *
 * @param packageName - The npm package to resolve (e.g. `@sektek/generator-base`).
 * @param cwd - The directory to search from first (see `resolveGeneratorPackagePath`).
 * @param seen - Package names already resolved in this call tree — dedupes
 *   repeated/diamond dependencies and guards against a dependency cycle.
 * @returns One entry per generator directory across `packageName` and its
 *   transitive `@<scope>/generator-<name>` dependencies.
 */
export async function registryFor(
  packageName: string,
  cwd: string,
  seen: Set<string> = new Set(),
): Promise<RegistryEntry[]> {
  if (seen.has(packageName)) return [];
  seen.add(packageName);

  const manifestPath = resolveGeneratorPackagePath(
    packageName,
    'manifest',
    cwd,
  );
  const { GENERATORS } = (await import(pathToFileURL(manifestPath).href)) as {
    GENERATORS: readonly string[];
  };

  // Namespace prefix: strip the 'generator-' infix, e.g.
  // '@sektek/generator-base' -> '@sektek/base'.
  const prefix = packageName.replace(/\/generator-/, '/');
  const own = GENERATORS.map(name => ({
    namespace: `${prefix}:${name}`,
    path: resolveGeneratorPackagePath(packageName, `generators/${name}`, cwd),
  }));

  const packageRoot = packageRootFor(packageName, manifestPath, cwd);
  const { dependencies = {} } = JSON.parse(
    readFileSync(join(packageRoot, 'package.json'), 'utf8'),
  ) as PackageJson;
  const depEntries = await Promise.all(
    Object.keys(dependencies)
      .filter(dep => GENERATOR_DEPENDENCY_PATTERN.test(dep))
      // Rooted at packageRoot, not the original cwd: npm can nest a
      // dependency under packageName's own node_modules (e.g. on a version
      // conflict with something at cwd's top level), and resolution from
      // cwd would never see that nested copy — same as a real `require()`
      // from within packageName's own source would resolve it. Walking up
      // from packageRoot still reaches the same shared/hoisted node_modules
      // cwd would have, so the common (hoisted) case is unaffected.
      .map(dep => registryFor(dep, packageRoot, seen)),
  );

  return [...own, ...depEntries.flat()];
}
