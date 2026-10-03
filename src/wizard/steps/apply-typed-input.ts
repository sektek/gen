import type { EditResult } from '../types/index.js';

/**
 * The result of typing a character in `GeneratedTextInput`: on a
 * still-pristine generated default, replaces the whole thing with just
 * what was typed rather than inserting into the middle of text the user
 * never typed; otherwise inserts at the cursor as usual.
 *
 * @param value - The field's current value.
 * @param cursorOffset - The cursor's current position within `value`.
 * @param isPristine - Whether `value` still equals the currently-shown generated default.
 * @param input - The character(s) just typed.
 * @returns The resulting value and cursor position.
 */
export function applyTypedInput(
  value: string,
  cursorOffset: number,
  isPristine: boolean,
  input: string,
): EditResult {
  if (isPristine) {
    return { value: input, cursorOffset: input.length };
  }
  return {
    value: value.slice(0, cursorOffset) + input + value.slice(cursorOffset),
    cursorOffset: cursorOffset + input.length,
  };
}
