/**
 * True when the wizard should run: an interactive terminal and no --yes.
 *
 * @param yes - Whether --yes/-y was given.
 * @returns Whether to run the interactive wizard.
 */
export function isInteractive(yes: boolean | undefined): boolean {
  return !yes && Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY);
}
