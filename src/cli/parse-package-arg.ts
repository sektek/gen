import { generatorPackageName } from '../package-resolver.js';

/**
 * Parses a `gen list` package argument (e.g. "@acme/widget" or "js") into
 * the npm package it names — the same scope-defaulting convention as
 * running a generator, but with no `:subgen` to also parse.
 *
 * @param arg - The package argument as typed on the command line.
 * @returns The target package name.
 */
export function parsePackageArg(arg: string): string {
  if (!arg.startsWith('@')) {
    return generatorPackageName('sektek', arg);
  }

  const slashIndex = arg.indexOf('/');
  if (slashIndex === -1) {
    throw new Error(`Invalid package '${arg}'. Expected '@scope/name'.`);
  }
  return generatorPackageName(
    arg.slice(1, slashIndex),
    arg.slice(slashIndex + 1),
  );
}
