import {
  type DestinationMode,
  type Prompt,
  type PromptContext,
  projectNamePrompt,
} from '@sektek/generator';

import type { OptionSpec } from '../types/index.js';
import { promptsToOptionSpecs } from '../prompt-adapter.js';

/**
 * The prompt-sourced specs a namespace gets: `projectNamePrompt` for a
 * `newProjectDir` generator, then the namespace's own `prompts()` in
 * their declared order, merged by name.
 *
 * @param mode - The target generator's `destinationMode()`.
 * @param context - What each prompt's `includePrompt`/`provider` resolves against.
 * @param options - Behavior flags.
 * @param options.prompts - The namespace's own `prompts()` (see `promptsFor()`).
 * @param options.keepGated - Keep initially-excluded prompts, for the wizard to re-test.
 * @returns The specs to register flags from, prompt for and resolve.
 */
export function promptSpecsFor(
  mode: DestinationMode,
  context: PromptContext,
  options: { prompts?: Prompt[]; keepGated?: boolean } = {},
): Promise<OptionSpec[]> {
  const { prompts = [], keepGated } = options;
  return promptsToOptionSpecs(
    [...(mode.kind === 'newProjectDir' ? [projectNamePrompt] : []), ...prompts],
    context,
    { keepGated },
  );
}
