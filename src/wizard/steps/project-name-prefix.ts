import type { PromptContext } from '@sektek/generator';

/**
 * The workspace/config prefix a freshly-generated project name would carry
 * — mirrors `@sektek/generator`'s own `projectNamePrompt` prefix logic
 * exactly, duplicated here rather than imported since the wizard only needs
 * it for the ctrl+x/ctrl+r UX below, never to compute the value actually
 * submitted (that's still the provider's job).
 *
 * @param context - The configDefaults/workspace half of the running PromptContext.
 * @returns The prefix a freshly-generated project name would carry, if any.
 */
export function projectNamePrefix(
  context: Pick<PromptContext, 'configDefaults' | 'workspace'>,
): string | undefined {
  const { projectName } = context.configDefaults;
  if (typeof projectName === 'string' && projectName !== '') {
    return projectName;
  }
  return context.workspace?.name;
}
