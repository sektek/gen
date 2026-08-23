import { fileURLToPath } from 'node:url';

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
