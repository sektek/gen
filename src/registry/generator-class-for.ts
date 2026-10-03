import type { GeneratorClass } from '@sektek/generator';

import type { RegistryEntry } from '../types/index.js';

import { REGISTRY } from './registry.js';
import { loadGeneratorClass } from './load-generator-class.js';

/**
 * The generator class registered under `namespace`.
 *
 * @param namespace - A namespace present in `entries`.
 * @param entries - The entries to resolve against; defaults to the process-wide `REGISTRY`.
 * @returns The namespace's default-exported generator class.
 */
export async function generatorClassFor(
  namespace: string,
  entries: RegistryEntry[] = REGISTRY,
): Promise<GeneratorClass> {
  const entry = entries.find(e => e.namespace === namespace);
  if (!entry) {
    throw new Error(`Unknown generator namespace: ${namespace}`);
  }
  return loadGeneratorClass(entry.path);
}
