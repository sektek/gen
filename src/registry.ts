import { dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import type {
  DestinationMode,
  GeneratorClass,
  GeneratorModule,
  Prompt,
} from '@sektek/generator';
import type Environment from 'yeoman-environment';

import {
  GeneratorPackageNotFoundError,
  resolveGeneratorPackagePath,
} from './package-resolver.js';

export type RegistryEntry = {
  namespace: string;
  path: string;
};

type PackageJson = {
  name?: string;
  dependencies?: Record<string, string>;
};

// A generator package's own npm `dependencies` on another generator
// package look like this — e.g. `@sektek/generator-js` depending on
// `@sektek/generator-base` — deliberately excluding the shared
// `@sektek/generator` core library itself, which has no trailing `-<name>`
// and no manifest/generators of its own to resolve.
const GENERATOR_DEPENDENCY_PATTERN = /^@[^/]+\/generator-/;

/**
 * The on-disk directory containing `packageName`'s own `package.json`.
 *
 * Derived by resolving the package's root entry point and walking up until
 * a `package.json` naming this exact package is found, rather than
 * resolving `<packageName>/package.json` directly — `package.json` isn't a
 * subpath these packages' `exports` maps expose (unlike `manifest` or
 * `generators/<name>`, which `resolveGeneratorPackagePath` handles
 * directly), so a direct resolve attempt throws
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 *
 * @param packageName - The npm package to locate (e.g. `@sektek/generator-base`).
 * @param cwd - The directory to search from first (see `resolveGeneratorPackagePath`).
 * @returns The absolute path to the package's own root directory.
 */
function packageRootFor(packageName: string, cwd: string): string {
  let dir = dirname(resolveGeneratorPackagePath(packageName, '', cwd));
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

  const pkgJsonPath = join(packageRootFor(packageName, cwd), 'package.json');
  const { dependencies = {} } = JSON.parse(
    readFileSync(pkgJsonPath, 'utf8'),
  ) as PackageJson;
  const depEntries = await Promise.all(
    Object.keys(dependencies)
      .filter(dep => GENERATOR_DEPENDENCY_PATTERN.test(dep))
      .map(dep => registryFor(dep, cwd, seen)),
  );

  return [...own, ...depEntries.flat()];
}

// The two generator packages `gen` has always shipped with as entry
// points — everything each of these pulls in transitively (e.g.
// generator-js's own dependency on generator-base) is resolved dynamically
// via registryFor() above, not hardcoded per sub-generator the way the old
// static REGISTRY was.
const ROOT_PACKAGES = ['@sektek/generator-base', '@sektek/generator-js'];

/**
 * Every known generator entry, resolved fresh for this process against its
 * own `cwd` — the per-invocation replacement for the old REGISTRY built
 * once at module load from two static, compile-time manifest imports.
 * `registerAll()`/`promptsFor()`/`destinationModeFor()` below default to
 * this so existing single-argument call sites keep working unchanged, but
 * each also accepts an explicit `RegistryEntry[]` (e.g. from `registryFor()`
 * directly) for a caller that wants to target one package's own resolution
 * rather than this process-wide default.
 */
export const REGISTRY: RegistryEntry[] = await (async () => {
  const seen = new Set<string>();
  const entries: RegistryEntry[] = [];
  for (const pkg of ROOT_PACKAGES) {
    entries.push(...(await registryFor(pkg, process.cwd(), seen)));
  }
  return entries;
})();

/**
 * Registers every given entry with the environment, by its resolved
 * on-disk path — every namespace, not just top-level generators:
 * composeWith chains reach every sub-generator regardless of which one is
 * directly invoked.
 *
 * @param env - The Yeoman environment to register generators with.
 * @param entries - The entries to register; defaults to the process-wide `REGISTRY`.
 */
export function registerAll(
  env: Environment,
  entries: RegistryEntry[] = REGISTRY,
): void {
  for (const { namespace, path } of entries) {
    env.register(path, { namespace });
  }
}

/**
 * Imports the generator module at `path` and returns its default export —
 * separate from `registerAll()`'s own `env.register()`, which resolves a
 * generator lazily, only once Yeoman actually composes it. Reading a
 * generator's `prompts()` ahead of that (see `promptsFor()`) needs the
 * class itself, up front.
 *
 * @param path - A `RegistryEntry`'s resolved on-disk path.
 * @returns The generator module's default-exported class.
 */
async function loadGeneratorClass(path: string): Promise<GeneratorClass> {
  const mod = (await import(pathToFileURL(path).href)) as GeneratorModule;
  return mod.default;
}

async function generatorClassFor(
  namespace: string,
  entries: RegistryEntry[] = REGISTRY,
): Promise<GeneratorClass> {
  const entry = entries.find(e => e.namespace === namespace);
  if (!entry) {
    throw new Error(`Unknown generator namespace: ${namespace}`);
  }
  return loadGeneratorClass(entry.path);
}

/**
 * The namespace's own `prompts()` — per `@sektek/generator`'s
 * `CoreGenerator`/`composites()` convention, a generator that correctly
 * overrides `prompts()` to aggregate its composed sub-generators' own
 * `prompts()` returns the complete set for that namespace, not just its
 * own. That's a convention each generator class has to actually follow,
 * though, not something this function can enforce or verify — one that
 * composes others without declaring `composites()` silently returns an
 * incomplete list here instead of throwing.
 *
 * @param namespace - A namespace present in `entries` (e.g. `@sektek/js:app`).
 * @param entries - The entries to resolve against; defaults to the process-wide `REGISTRY`.
 * @returns That namespace's own `prompts()` result — complete only if the
 *   target generator class correctly implements the aggregation contract.
 */
export async function promptsFor(
  namespace: string,
  entries: RegistryEntry[] = REGISTRY,
): Promise<Prompt[]> {
  return (await generatorClassFor(namespace, entries)).prompts();
}

/**
 * The namespace's own `destinationMode()`.
 *
 * @param namespace - A namespace present in `entries` (e.g. `@sektek/js:app`).
 * @param entries - The entries to resolve against; defaults to the process-wide `REGISTRY`.
 * @returns Whether that generator scaffolds in place or into a new project directory.
 */
export async function destinationModeFor(
  namespace: string,
  entries: RegistryEntry[] = REGISTRY,
): Promise<DestinationMode> {
  return (await generatorClassFor(namespace, entries)).destinationMode();
}
