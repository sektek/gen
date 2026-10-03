import { generatorPackageName } from '../package-resolver.js';

// Bare-word sugar for the two default packages' :app generator — the only
// remaining hardcoded special case; everything else is generalized parsing.
const BARE_SUGAR: Record<string, string> = {
  base: '@sektek/base:app',
  js: '@sektek/js:app',
};

/**
 * Parses a generator argument into its target npm package name and
 * fully-qualified namespace, without resolving/validating anything on
 * disk — see `resolveNamespace()` for the validating counterpart.
 *
 * Every shape reduces to the canonical `@scope/name:subgen` form and is
 * then parsed the same way, so a third-party `@acme/widget:app` is handled
 * identically to `@sektek/base:app` — no package is special-cased beyond
 * the `BARE_SUGAR` shortcuts above:
 *
 * - `@scope/name:subgen` (already-qualified) → package `@${scope}/generator-${name}`.
 * - `name:subgen` (no `@scope/`) → scope defaults to `sektek`.
 * - bare `subgen` (no colon, not `base`/`js`) → defaults to `@sektek/base:<subgen>`.
 * - bare `base`/`js` → `BARE_SUGAR`'s literal shortcut.
 *
 * @param input - The generator argument as typed on the command line.
 * @returns The target package name and the namespace to look for within it.
 */
export function parseGeneratorInput(input: string): {
  packageName: string;
  namespace: string;
} {
  if (Object.hasOwn(BARE_SUGAR, input)) {
    return parseGeneratorInput(BARE_SUGAR[input]);
  }

  if (!input.startsWith('@')) {
    const colonIndex = input.indexOf(':');
    return colonIndex === -1
      ? parseGeneratorInput(`@sektek/base:${input}`)
      : parseGeneratorInput(
          `@sektek/${input.slice(0, colonIndex)}:${input.slice(colonIndex + 1)}`,
        );
  }

  const colonIndex = input.indexOf(':');
  if (colonIndex === -1) {
    throw new Error(
      `Unknown generator '${input}'. Expected '<subgen>', 'base', 'js', '<name>:<subgen>', or a fully-qualified '@scope/name:subgen' namespace. Run 'gen list' to see every available generator.`,
    );
  }
  const prefix = input.slice(0, colonIndex);
  const subgen = input.slice(colonIndex + 1);
  const slashIndex = prefix.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(
      `Unknown generator '${input}'. Expected '@scope/name:subgen'. Run 'gen list' to see every available generator.`,
    );
  }

  return {
    packageName: generatorPackageName(
      prefix.slice(1, slashIndex),
      prefix.slice(slashIndex + 1),
    ),
    namespace: `${prefix}:${subgen}`,
  };
}
