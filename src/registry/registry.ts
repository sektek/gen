import type { RegistryEntry } from '../types/index.js';

import { buildRegistry } from './build-registry.js';

// gen's two entry-point generator packages; everything each pulls in
// transitively (e.g. generator-js's own dependency on generator-base) is
// resolved dynamically via registryFor(), not listed here by hand.
export const ROOT_PACKAGES = ['@sektek/generator-base', '@sektek/generator-js'];

/**
 * Every known generator entry, resolved fresh for this process. Exists so
 * `registerAll()`/`promptsFor()`/`destinationModeFor()` can default to it
 * for a caller with no specific package in mind; a caller that wants one
 * package's own resolution passes `registryFor()`'s result explicitly
 * instead.
 *
 * Built via `buildRegistry()`'s best-effort behavior deliberately: this is
 * a top-level `await`, so an uncaught rejection here would fail *importing
 * this module* (and therefore anything that imports it, e.g. `cli/`)
 * before any caller's own try/catch (e.g. `printDefaultList()`'s
 * per-package handling) ever gets a chance to run.
 */
export const REGISTRY: RegistryEntry[] = await buildRegistry(
  ROOT_PACKAGES,
  process.cwd(),
);
