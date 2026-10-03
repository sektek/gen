import { registryFor } from '../registry/index.js';

import type { ResolvedGenerator } from './types/index.js';
import { existsInJs } from './exists-in-js.js';
import { parseGeneratorInput } from './parse-generator-input.js';

/**
 * Resolves a generator argument (e.g. "js", "js:workspace",
 * "@sektek/base:app", "gitconfig", "@acme/widget:app") into a validated
 * namespace and the registry entries its own package (and transitive
 * `@<scope>/generator-*` dependencies) resolved to — from-scratch rather
 * than yeoman-environment's own `alias()`, which only handles
 * single-segment names.
 *
 * A bare name with no prefix always means `@sektek/base:<name>` (matching
 * how `yo` used to default to `generator-base`) — it never falls back to
 * `@sektek/js` even when only `js` has a matching generator.
 *
 * @param input - The generator argument as typed on the command line.
 * @param cwd - The directory to resolve the target package from.
 * @returns The resolved, validated namespace and its package's entries.
 */
export async function resolveNamespace(
  input: string,
  cwd: string,
): Promise<ResolvedGenerator> {
  const { packageName, namespace } = parseGeneratorInput(input);

  const entries = await registryFor(packageName, cwd);
  if (entries.some(entry => entry.namespace === namespace)) {
    return { namespace, entries };
  }

  const colonIndex = input.indexOf(':');
  const isDefaultedBareName = colonIndex === -1 && !input.startsWith('@');
  const hint =
    isDefaultedBareName && (await existsInJs(input, cwd))
      ? ` Did you mean 'js:${input}'?`
      : '';

  throw new Error(
    `Unknown generator '${namespace}'.${hint} Run 'gen list' to see every available generator.`,
  );
}
