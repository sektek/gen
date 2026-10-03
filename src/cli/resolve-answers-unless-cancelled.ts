/* eslint-disable no-console */
import { WizardCancelledError } from '../wizard-cancelled-error.js';
import { cancelExitCode } from '../cancel-exit-code.js';

import type { ResolveAnswersArgs, ResolvedAnswers } from './types/index.js';
import { resolveAnswers } from './resolve-answers.js';

/**
 * Runs `resolveAnswers()`, turning a cancelled wizard into a quiet exit:
 * prints a short notice and sets the shell-convention exit code.
 *
 * @param args - Passed through to `resolveAnswers()`.
 * @returns The resolved answers, or `undefined` if the wizard was cancelled.
 */
export async function resolveAnswersUnlessCancelled(
  args: ResolveAnswersArgs,
): Promise<ResolvedAnswers | undefined> {
  try {
    return await resolveAnswers(args);
  } catch (error) {
    if (!(error instanceof WizardCancelledError)) {
      throw error;
    }
    console.log('Cancelled.');
    process.exitCode = cancelExitCode(error.signal);
    return undefined;
  }
}
