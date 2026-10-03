import type { EditResult } from '../types/index.js';

/**
 * The result of pressing the Delete key in `GeneratedTextInput`: on a
 * still-pristine (`isPristine`) generated default, clears it outright
 * rather than erasing one character from text the user never typed;
 * otherwise removes the character at the cursor, if any, leaving the cursor
 * in place. If that erases the user's own typed text down to nothing, the
 * suggested default comes back with the cursor reset to the start.
 *
 * @param value - The field's current value.
 * @param cursorOffset - The cursor's current position within `value`.
 * @param isPristine - Whether `value` still equals the currently-shown generated default.
 * @param dynamicDefault - The currently-shown generated default, to restore to.
 * @returns The resulting value and cursor position.
 */
export function applyDelete(
  value: string,
  cursorOffset: number,
  isPristine: boolean,
  dynamicDefault: string,
): EditResult {
  if (isPristine) {
    return { value: '', cursorOffset: 0 };
  }
  if (cursorOffset >= value.length) {
    return { value, cursorOffset };
  }
  const nextValue =
    value.slice(0, cursorOffset) + value.slice(cursorOffset + 1);
  if (nextValue === '') {
    return { value: dynamicDefault, cursorOffset: 0 };
  }
  return { value: nextValue, cursorOffset };
}
