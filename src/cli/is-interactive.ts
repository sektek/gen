/**
 * True when the wizard should run: --no-interactive was not given and both
 * stdin and stdout are TTYs.
 *
 * @param interactive - The parsed `interactive` option; false when
 * --no-interactive was given.
 * @returns Whether to run the interactive wizard.
 */
export function isInteractive(interactive: boolean | undefined): boolean {
  return (
    interactive !== false &&
    Boolean(process.stdout.isTTY) &&
    Boolean(process.stdin.isTTY)
  );
}
