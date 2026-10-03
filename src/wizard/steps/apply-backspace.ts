import type { EditResult } from '../types/index.js';

/**
 * The result of pressing backspace *or* forward-delete in
 * `GeneratedTextInput`: on a still-pristine (`isPristine`) generated
 * default, clears it outright rather than erasing one character from
 * wherever the cursor happens to sit in text the user never typed;
 * otherwise removes the character just before the cursor, if any — and if
 * that erases the user's own typed text down to nothing, brings the
 * suggested default back (so it's never left showing a bare empty field)
 * rather than leaving `value` empty, with the cursor reset to the start
 * (matching the fresh-clear cursor position above), not wherever it landed
 * while typing.
 *
 * Deliberately backspace semantics for *both* keys, not "before the
 * cursor" for one and "at the cursor" for the other: ink (this project's
 * version, 6.8.0 at least) parses the raw DEL byte (`\x7f`) — what an
 * ordinary terminal's Backspace key actually sends — as `key.delete`, not
 * `key.backspace` (`key.backspace` only ever fires for the literal `\x08`/
 * ctrl+h byte, which real Backspace keys essentially never send by
 * default). `useInput`'s `key` object exposes no raw sequence to tell that
 * apart from an actual forward-delete keypress (`key.delete` also fires for
 * the hardware Delete key's `\x1b[3~` sequence), and ink's own source
 * comments that this split is temporary ("I had to split them up to avoid
 * breaking changes in Ink. Merge them back together in the next major
 * version."). Treating `key.delete` as forward-delete here (as filed by an
 * earlier review) silently broke ordinary Backspace for every real
 * terminal instead — verified by tracing ink's `parseKeypress('\x7f')`
 * directly, which returns `{name: 'delete', ...}`, and by an end-to-end
 * repro (a fake stdin/stdout wired through `render()`) showing backspace
 * become a no-op once the cursor reached the end of a real typed value.
 *
 * @param value - The field's current value.
 * @param cursorOffset - The cursor's current position within `value`.
 * @param isPristine - Whether `value` still equals the currently-shown generated default.
 * @param dynamicDefault - The currently-shown generated default, to restore to.
 * @returns The resulting value and cursor position.
 */
export function applyBackspace(
  value: string,
  cursorOffset: number,
  isPristine: boolean,
  dynamicDefault: string,
): EditResult {
  if (isPristine) {
    return { value: '', cursorOffset: 0 };
  }
  if (cursorOffset === 0) {
    return { value, cursorOffset };
  }
  const nextValue =
    value.slice(0, cursorOffset - 1) + value.slice(cursorOffset);
  if (nextValue === '') {
    return { value: dynamicDefault, cursorOffset: 0 };
  }
  return { value: nextValue, cursorOffset: cursorOffset - 1 };
}
