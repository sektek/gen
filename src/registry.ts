import { fileURLToPath, pathToFileURL } from 'node:url';

import type {
  GeneratorClass,
  GeneratorModule,
  Prompt,
} from '@sektek/generator';
import { GENERATORS as BASE_GENERATORS } from '@sektek/generator-base/manifest';
import type Environment from 'yeoman-environment';
import { GENERATORS as JS_GENERATORS } from '@sektek/generator-js/manifest';

export type RegistryEntry = {
  namespace: string;
  path: string;
};

/**
 * Builds registry entries for every generator directory listed in a
 * package's manifest, namespaced under the given compose-with prefix.
 *
 * @param pkg - The npm package name to resolve subpaths against.
 * @param prefix - The compose-with namespace prefix (e.g. `@sektek/base`).
 * @param names - Generator directory names, as listed in the package's manifest.
 * @returns One registry entry per name.
 */
function entriesFor(
  pkg: string,
  prefix: string,
  names: readonly string[],
): RegistryEntry[] {
  return names.map(name => ({
    namespace: `${prefix}:${name}`,
    path: fileURLToPath(import.meta.resolve(`${pkg}/generators/${name}`)),
  }));
}

// Every namespace, not just top-level generators: composeWith chains
// reach every sub-generator regardless of which one is directly invoked.
export const REGISTRY: RegistryEntry[] = [
  ...entriesFor('@sektek/generator-base', '@sektek/base', BASE_GENERATORS),
  ...entriesFor('@sektek/generator-js', '@sektek/js', JS_GENERATORS),
];

/**
 * Registers every generator in the registry with the given environment,
 * by its resolved on-disk path.
 *
 * @param env - The Yeoman environment to register generators with.
 */
export function registerAll(env: Environment): void {
  for (const { namespace, path } of REGISTRY) {
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

/**
 * The namespace's own `prompts()` — per `@sektek/generator`'s
 * `CoreGenerator`/`composites()` convention, a generator that correctly
 * overrides `prompts()` to aggregate its composed sub-generators' own
 * `prompts()` returns the complete set for that namespace, not just its
 * own. That's a convention each generator class has to actually follow,
 * though, not something this function can enforce or verify — a generator
 * that composes others in `taskInitializing()` but never overrides
 * `prompts()`/`composites()` (as of writing, `@sektek/js:app` and
 * `@sektek/js:workspace` in `@sektek/generator-js@0.8.0`) falls through to
 * `CoreGenerator`'s own default (`return [];`), so this silently returns
 * an empty/incomplete list for that namespace instead of throwing — known
 * gap, tracked in SEK-108.
 *
 * @param namespace - A namespace `REGISTRY` knows about (e.g. `@sektek/js:app`).
 * @returns That namespace's own `prompts()` result — complete only if the
 *   target generator class correctly implements the aggregation contract.
 */
export async function promptsFor(namespace: string): Promise<Prompt[]> {
  const entry = REGISTRY.find(e => e.namespace === namespace);
  if (!entry) {
    throw new Error(`Unknown generator namespace: ${namespace}`);
  }
  const generatorClass = await loadGeneratorClass(entry.path);
  return generatorClass.prompts();
}
