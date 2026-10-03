import type { Prompt } from '@sektek/generator';

import type { RegistryEntry } from '../types/index.js';

import { REGISTRY } from './registry.js';
import { generatorClassFor } from './generator-class-for.js';

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
