/* eslint-disable no-console */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

import chalk from 'chalk';

import { installedGeneratorPackages } from '../installed-generator-packages.js';
import { packageRootFor } from '../registry/package-root-for.js';

function genVersion(cwd: string): string {
  const root = packageRootFor(
    '@sektek/gen',
    fileURLToPath(import.meta.url),
    cwd,
  );
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    version: string;
  };
  return pkg.version;
}

/**
 * `gen --version`: prints gen's own version, then the version of each
 * installed `@sektek` generator package. A default package that isn't
 * installed is noted rather than omitted.
 *
 * @param cwd - The directory to look for installed generator packages from.
 */
export function runVersion(cwd: string): void {
  console.log(`gen ${genVersion(cwd)}`);
  for (const { name, version } of installedGeneratorPackages(cwd)) {
    console.log(
      version === undefined
        ? chalk.dim(`${name}: not installed`)
        : `${name} ${version}`,
    );
  }
}
