import type { DestinationMode } from '@sektek/generator';

import type { RegistryEntry } from '../types/index.js';

import { REGISTRY } from './registry.js';
import { generatorClassFor } from './generator-class-for.js';

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
