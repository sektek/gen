import Environment from 'yeoman-environment';

import { type RegistryEntry, registerAll } from './registry.js';

export type RunEnv = {
  destinationRoot: string;
  force: boolean;
};

/**
 * Registers every given generator entry, then runs exactly one with a
 * fully-resolved options object.
 *
 * `env.force` travels as a generator option, not an `Environment`
 * constructor option: `yeoman-environment`@4's `Environment` has no
 * `force`/`conflicterOptions` field — `runGenerator()`
 * (`environment-base.js`) starts the conflicter from `generator.options`.
 *
 * @param generatorNamespace - The generator namespace to run (e.g. `@sektek/js:app`).
 * @param options - The fully-resolved options object to pass to the generator.
 * @param env - Where to write output, and whether to force-overwrite conflicts.
 * @param entries - The entries to register; defaults to `registerAll()`'s
 *   own process-wide `REGISTRY` default. A caller that already resolved
 *   `generatorNamespace` via `registryFor()` (e.g. `cli.ts`, for a
 *   namespace outside the two default packages) should pass that result
 *   here — otherwise a namespace `REGISTRY` doesn't know about would never
 *   get registered, and `environment.run()` would fail to find it.
 */
export async function runGenerator(
  generatorNamespace: string,
  options: Record<string, unknown>,
  env: RunEnv,
  entries?: RegistryEntry[],
): Promise<void> {
  const environment = new Environment({ cwd: env.destinationRoot });
  registerAll(environment, entries);
  await environment.run([generatorNamespace], {
    ...options,
    force: env.force,
    destinationRoot: env.destinationRoot,
  });
}
