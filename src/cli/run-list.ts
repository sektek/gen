import { printDefaultList } from './print-default-list.js';
import { printPackageList } from './print-package-list.js';

/**
 * Runs the `gen list [<scope>/<name>]` command.
 *
 * @param packageArg - `rawArgs[1]`: the optional package argument.
 */
export async function runList(packageArg: string | undefined): Promise<void> {
  if (packageArg) {
    await printPackageList(packageArg, process.cwd());
  } else {
    await printDefaultList(process.cwd());
  }
}
