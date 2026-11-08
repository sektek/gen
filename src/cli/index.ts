import { runVersion } from './run-version.js';

/**
 * CLI entry point. Answers `--version`/`-V` itself, then hands every other
 * invocation to the full CLI.
 *
 * @param argv - Full `process.argv` (including the node/script entries).
 */
export async function main(argv: string[]): Promise<void> {
  if (argv[2] === '--version' || argv[2] === '-V') {
    runVersion(process.cwd());
    return;
  }

  // Loaded lazily: its imports initialize the generator registry, which must
  // not be able to prevent `--version` from reporting.
  const { main: runCli } = await import('./main.js');
  await runCli(argv);
}
