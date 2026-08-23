import Environment from 'yeoman-environment';

import { registerAll } from './registry.js';

export type RunEnv = {
  destinationRoot: string;
  force: boolean;
};

/**
 * Registers every known generator, then runs exactly one with a
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
 */
export async function runGenerator(
  generatorNamespace: string,
  options: Record<string, unknown>,
  env: RunEnv,
): Promise<void> {
  const environment = new Environment({ cwd: env.destinationRoot });
  registerAll(environment);
  await environment.run([generatorNamespace], {
    ...options,
    force: env.force,
    destinationRoot: env.destinationRoot,
  });
}
