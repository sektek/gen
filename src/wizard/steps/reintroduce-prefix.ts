import type { EditResult } from '../types/index.js';

/**
 * Reintroduces a suppressed project-name prefix the moment typing resumes
 * on a cleared field (wizard/generated-text-input.tsx's GeneratedTextInput) — mirrors the same
 * `${prefix}-${randomProjectName()}` joiner `@sektek/generator`'s own
 * `projectNamePrompt` uses, so the reintroduced text reads exactly like a
 * freshly-generated prefixed default would.
 *
 * @param prefix - The workspace/config prefix to reintroduce.
 * @param input - The character(s) just typed.
 * @returns The resulting value and cursor position.
 */
export function reintroducePrefix(prefix: string, input: string): EditResult {
  const value = `${prefix}-${input}`;
  return { value, cursorOffset: value.length };
}
