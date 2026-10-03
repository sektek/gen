import { pathToFileURL } from 'node:url';

import type { GeneratorClass, GeneratorModule } from '@sektek/generator';

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
export async function loadGeneratorClass(
  path: string,
): Promise<GeneratorClass> {
  const mod = (await import(pathToFileURL(path).href)) as GeneratorModule;
  return mod.default;
}
