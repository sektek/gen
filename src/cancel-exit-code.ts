import { constants } from 'node:os';

/**
 * Maps a cancelling signal to the shell-convention exit code.
 *
 * @param signal - The signal that cancelled the wizard.
 * @returns 128 plus the signal number (130 for SIGINT, 143 for SIGTERM, 129 for SIGHUP).
 */
export function cancelExitCode(signal: NodeJS.Signals): number {
  return 128 + constants.signals[signal];
}
