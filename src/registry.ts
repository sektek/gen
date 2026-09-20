import { fileURLToPath, pathToFileURL } from 'node:url';

import { GENERATORS as BASE_GENERATORS } from '@sektek/generator-base/manifest';
import type Environment from 'yeoman-environment';
import { GENERATORS as JS_GENERATORS } from '@sektek/generator-js/manifest';
import type { Prompt } from '@sektek/generator';

export type RegistryEntry = {
  namespace: string;
  path: string;
};

// What every generator class exposes statically, per @sektek/generator's
// CoreGenerator — this is the only part of the class this module actually
// touches (never instantiated), so it's typed narrowly rather than pulling
// in CoreGenerator's full generic shape.
type GeneratorClass = {
  prompts(): Prompt[];
};

type GeneratorModule = {
  default: GeneratorClass;
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
 * The fully-assembled `Prompt[]` for a namespace — its own `prompts()`,
 * which (per `@sektek/generator`'s `CoreGenerator`/`composites()`
 * convention) already recursively includes whatever it composes with, so
 * this is the complete prompt set for that namespace, not just its own.
 *
 * @param namespace - A namespace `REGISTRY` knows about (e.g. `@sektek/js:app`).
 * @returns That namespace's assembled prompts.
 */
export async function promptsFor(namespace: string): Promise<Prompt[]> {
  const entry = REGISTRY.find(e => e.namespace === namespace);
  if (!entry) {
    throw new Error(`Unknown generator namespace: ${namespace}`);
  }
  const generatorClass = await loadGeneratorClass(entry.path);
  return generatorClass.prompts();
}
