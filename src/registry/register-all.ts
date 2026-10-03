import type Environment from 'yeoman-environment';

import type { RegistryEntry } from '../types/index.js';

import { REGISTRY } from './registry.js';

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
