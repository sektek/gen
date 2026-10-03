import { registryFor } from '../registry/index.js';

/**
 * Whether `subgen` is one of `@sektek/generator-js`'s own namespaces —
 * powers the "did you mean 'js:<name>'?" hint on an unknown bare name.
 * Deliberately specific to the two well-known default packages rather than
 * generalized to arbitrary third parties (per the locked-in design) — a
 * failed lookup here (e.g. generator-js isn't installed either) just omits
 * the hint rather than compounding the original error.
 *
 * @param subgen - The bare sub-generator name that failed to resolve against `@sektek/base`.
 * @param cwd - The directory to resolve `@sektek/generator-js` from.
 * @returns Whether `js:<subgen>` would have resolved instead.
 */
export async function existsInJs(
  subgen: string,
  cwd: string,
): Promise<boolean> {
  try {
    const entries = await registryFor('@sektek/generator-js', cwd);
    return entries.some(entry => entry.namespace === `@sektek/js:${subgen}`);
  } catch {
    return false;
  }
}
