/* eslint-disable no-console */

import chalk from 'chalk';

import type { RegistryEntry } from '../types/index.js';

/**
 * Prints a resolved package's namespaces, grouped by their own namespace
 * prefix (a package's transitively-resolved dependencies print under their
 * own prefix too, e.g. `@sektek/generator-js`'s entries include
 * `@sektek/base:*` alongside `@sektek/js:*`).
 *
 * @param entries - The entries to print.
 */
export function printEntries(entries: RegistryEntry[]): void {
  const groups = new Map<string, string[]>();
  for (const { namespace } of entries) {
    const [prefix, name] = namespace.split(':');
    const names = groups.get(prefix) ?? [];
    names.push(name);
    groups.set(prefix, names);
  }

  for (const [prefix, names] of groups) {
    console.log(chalk.bold(prefix));
    for (const name of names) {
      const namespace = `${prefix}:${name}`;
      console.log(`  ${chalk.cyan(namespace)}`);
    }
  }
}
