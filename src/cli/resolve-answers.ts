import { explicitOptionKeysFromWizard } from '../wizard/steps/index.js';
import { resolve } from '../options.js';
import { runWizard } from '../run-wizard.js';

import type { ResolveAnswersArgs, ResolvedAnswers } from './types/index.js';

/**
 * Resolves this run's answers: the interactive wizard (seeded with
 * `flagsGiven`, asking `promptSpecs` first) or, automated, `flagsGiven`
 * folded straight through `resolve()`.
 *
 * @param args - Everything either path needs.
 * @param args.flagsGiven - Option values already supplied via CLI flags.
 * @param args.configDefaults - Values resolved via `resolveConfigDefaults()`.
 * @param args.interactive - Whether to run the interactive wizard at all.
 * @param args.promptSpecs - Prompt-derived specs, gated ones included (see `promptSpecsFor()`).
 * @param args.promptContext - What prompt providers see beyond the running answers.
 * @param args.destCwd - The directory a project-name answer would be created under.
 * @returns The fully-resolved answers, and which option keys were explicit.
 */
export async function resolveAnswers({
  flagsGiven,
  configDefaults,
  interactive,
  promptSpecs,
  promptContext,
  destCwd,
}: ResolveAnswersArgs): Promise<ResolvedAnswers> {
  if (!interactive) {
    return {
      answers: resolve(promptSpecs, flagsGiven, configDefaults),
      explicitOptionKeys: Object.keys(flagsGiven),
    };
  }

  const wizardResult = await runWizard(
    promptSpecs,
    flagsGiven,
    configDefaults,
    {
      destCwd,
      promptContext,
    },
  );

  return {
    // The wizard never prompts for a 'list' spec, so its answers alone
    // would leave dependencies/devDependencies undefined; resolve() layers
    // in their spec/config default, same as the non-interactive path.
    answers: resolve(promptSpecs, wizardResult.answers, configDefaults),
    explicitOptionKeys: explicitOptionKeysFromWizard(
      flagsGiven,
      wizardResult.answeredKeys,
    ),
  };
}
