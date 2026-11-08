import { basename, dirname, join } from 'node:path';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  GeneratorPackageNotFoundError,
  resolveGeneratorPackagePath,
} from './package-resolver.js';
import { ROOT_PACKAGES } from './registry/index.js';
import { packageRootFor } from './registry/package-root-for.js';

type PackageVersion = { version?: string };

const SCOPE_DIR = join('node_modules', '@sektek');
const GENERATOR_PACKAGE = /^@sektek\/generator-.+$/;

/** An installed generator package and the version of the copy gen resolves. */
export interface InstalledGeneratorPackage {
  name: string;
  version: string | undefined;
}

function scopeDirsFrom(start: string): string[] {
  const dirs: string[] = [];
  for (let dir = start; ; dir = dirname(dir)) {
    dirs.push(join(dir, SCOPE_DIR));
    if (basename(dir) === '@sektek') dirs.push(dir);
    if (dirname(dir) === dir) return dirs;
  }
}

function candidateNames(cwd: string): Set<string> {
  const names = new Set<string>();
  const dirs = [
    ...scopeDirsFrom(cwd),
    ...scopeDirsFrom(dirname(fileURLToPath(import.meta.url))),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      names.add(`@sektek/${entry}`);
    }
  }
  return names;
}

function versionOf(packageName: string, cwd: string): string | undefined {
  try {
    const manifestPath = resolveGeneratorPackagePath(
      packageName,
      'manifest',
      cwd,
    );
    const root = packageRootFor(packageName, manifestPath, cwd);
    const pkg = JSON.parse(
      readFileSync(join(root, 'package.json'), 'utf8'),
    ) as PackageVersion;
    return pkg.version;
  } catch (error) {
    if (error instanceof GeneratorPackageNotFoundError) return undefined;
    throw error;
  }
}

/**
 * Finds the `@sektek/generator-*` packages gen can run generators from, and
 * the version of each. Candidates are the entries of every
 * `node_modules/@sektek` directory found walking up from `cwd`, plus the one
 * alongside gen's own install. A candidate counts only when it resolves a
 * `manifest` export, which excludes `@sektek/generator` itself and non-generator
 * packages such as `@sektek/generator-test`. The version comes from the copy
 * resolution actually picks, so a local install wins over a global one.
 *
 * Default packages (`ROOT_PACKAGES`) that don't resolve are included with
 * `version: undefined`, so callers can report them as not installed.
 *
 * @param cwd - The directory to search from first.
 * @returns One entry per package, sorted by name.
 */
export function installedGeneratorPackages(
  cwd: string,
): InstalledGeneratorPackage[] {
  const found = new Map<string, string | undefined>();
  for (const name of candidateNames(cwd)) {
    if (!GENERATOR_PACKAGE.test(name)) continue;
    const version = versionOf(name, cwd);
    if (version !== undefined) found.set(name, version);
  }
  for (const name of ROOT_PACKAGES) {
    if (!found.has(name)) found.set(name, undefined);
  }
  return [...found]
    .map(([name, version]) => ({ name, version }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
