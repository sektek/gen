import { explicitOptionKeysFromWizard } from '../wizard/steps/index.js';
import { resolve } from '../options.js';
import { runWizard } from '../run-wizard.js';

import type { ResolveAnswersArgs, ResolvedAnswers } from './types/index.js';
import { packageScopeExtraSpecs } from './package-scope-extra-specs.js';

/**
 * Resolves this run's answers: the interactive wizard (seeded with
 * `flagsGiven`, asking `promptSpecs` first) or, automated, `flagsGiven`
 * folded straight through `resolve()`.
 *
 * @param args - Everything either path needs.
 * @param args.namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param args.flagsGiven - Option values already supplied via CLI flags.
 * @param args.configDefaults - Values resolved via `resolveConfigDefaults()`.
 * @param args.interactive - Whether to run the interactive wizard at all.
 * @param args.promptSpecs - Prompt-sourced specs schema.ts doesn't cover (see `promptSpecsFor()`).
 * @param args.promptContext - What prompt providers see beyond the running answers.
 * @param args.destCwd - The directory a project-name answer would be created under.
 * @returns The fully-resolved answers, and which option keys were explicit.
 */
export async function resolveAnswers({
  namespace,
  flagsGiven,
  configDefaults,
  interactive,
  promptSpecs,
  promptContext,
  destCwd,
}: ResolveAnswersArgs): Promise<ResolvedAnswers> {
  if (!interactive) {
    return {
      answers: resolve(namespace, flagsGiven, configDefaults, [
        ...(await packageScopeExtraSpecs(
          namespace,
          flagsGiven,
          configDefaults,
        )),
        ...promptSpecs,
      ]),
      explicitOptionKeys: Object.keys(flagsGiven),
    };
  }

  const wizardResult = await runWizard(namespace, flagsGiven, configDefaults, {
    leadingSpecs: promptSpecs,
    destCwd,
    promptContext,
  });

  return {
    // The wizard never prompts for a 'list' spec, so its answers alone
    // would leave dependencies/devDependencies undefined; resolve() layers
    // in their schema/config default, same as the non-interactive path.
    answers: resolve(
      namespace,
      wizardResult.answers,
      configDefaults,
      promptSpecs,
    ),
    explicitOptionKeys: explicitOptionKeysFromWizard(
      flagsGiven,
      wizardResult.answeredKeys,
    ),
  };
}
