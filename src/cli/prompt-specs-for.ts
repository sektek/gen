import {
  type DestinationMode,
  type PromptContext,
  projectNamePrompt,
} from '@sektek/generator';

import type { OptionSpec } from '../types/index.js';
import { promptsToOptionSpecs } from '../prompt-adapter.js';

/**
 * The prompt-sourced specs a namespace gets on top of its schema.ts ones:
 * `projectNamePrompt` for a `newProjectDir` generator, nothing otherwise.
 *
 * @param mode - The target generator's `destinationMode()`.
 * @param context - What `projectNamePrompt`'s provider resolves its default against.
 * @returns The specs to register, prompt for and resolve alongside the schema.
 */
export function promptSpecsFor(
  mode: DestinationMode,
  context: PromptContext,
): Promise<OptionSpec[]> {
  return promptsToOptionSpecs(
    mode.kind === 'newProjectDir' ? [projectNamePrompt] : [],
    context,
  );
}
