import { Text, useInput } from 'ink';
import { useEffect, useRef, useState } from 'react';

import type { EditResult, GeneratedTextInputProps } from './types/index.js';
import {
  applyBackspace,
  applyDelete,
  applyTypedInput,
  reintroducePrefix,
} from './steps/index.js';

/**
 * A `<TextInput>`-alike for a `generateDefault`/`generateDefaultAsync`
 * spec: pre-filled with real, editable text (the currently-generated
 * default) instead of ghost placeholder text, dimmed while unedited
 * (`isPristine`), plus a ctrl+r hotkey that swaps in a freshly generated
 * value while it's still showing
 * one (only while `isPristine` — see `hintsFor()`'s matching rule for the
 * status bar's `^R` hint). The very first edit (a typed character, or
 * backspace/delete) while `isPristine` replaces the whole default outright
 * — typing starts a fresh value from just what was typed, and backspace
 * clears it to empty — rather than editing into the middle of text the
 * user never typed; erasing the user's own typed text back down to
 * nothing brings the suggested default back (see `applyBackspace()`).
 *
 * Deliberately not `<TextInput>` itself: that component only excludes
 * ctrl+c from the keys it inserts as characters (see ink-text-input's own
 * source), so a bare ctrl+r/ctrl+x would fall through to its "insert this
 * character" branch and type a literal 'r'/'x' into the field. This
 * component filters out every ctrl/meta combo before it ever reaches the
 * buffer.
 *
 * @param props - The current value/pristine flag, and the change/regenerate/submit callbacks.
 * @param props.value - The input's current (uncommitted) value.
 * @param props.isPristine - Whether `value` still equals the currently-shown generated default.
 * @param props.dynamicDefault - The currently-shown generated default, restored when the user's own text is erased down to nothing.
 * @param props.allowClear - Whether ctrl+x clears the field; ignored otherwise.
 * @param props.prefix - The project-name step's workspace/config prefix, if any (SEK-118).
 * @param props.prefixSuppressed - Whether ctrl+x has already cleared this step's prefix.
 * @param props.canRegenerate - Whether ctrl+r currently regenerates.
 * @param props.onChange - Updates the input's current value.
 * @param props.onRegenerate - Requests a fresh generated default; only actually called while `canRegenerate`.
 * @param props.onClear - Notifies the parent that ctrl+x just cleared the field.
 * @param props.onSubmit - Called with the current value on Enter.
 * @returns The rendered input row.
 */
export function GeneratedTextInput({
  value,
  isPristine,
  dynamicDefault,
  allowClear,
  prefix,
  prefixSuppressed,
  canRegenerate,
  onChange,
  onRegenerate,
  onClear,
  onSubmit,
}: GeneratedTextInputProps) {
  const [cursorOffset, setCursorOffset] = useState(value.length);

  // `value` changes for two different reasons that want two different
  // cursor placements: our own edit below (typing/backspace), which already
  // computes the exact cursor position it wants via
  // applyEdit()/setCursorOffset, and an externally-driven replacement — the
  // initial generated default arriving (this component mounts before
  // Wizard's own effect has populated `value`, so it starts out `''`) or a
  // ctrl+r regenerate — for which the cursor belongs at the start, right
  // after the prompt, same as when the default is restored after a full
  // erase. This ref is how the effect below tells the two apart: set right
  // before we call onChange ourselves, and consumed (reset to false) the
  // moment the effect sees it, so it's only ever true for a change this
  // component caused.
  const ownChangeRef = useRef(false);

  useEffect(() => {
    if (ownChangeRef.current) {
      ownChangeRef.current = false;
      return;
    }
    setCursorOffset(0);
  }, [value]);

  const applyEdit = (next: EditResult) => {
    ownChangeRef.current = true;
    onChange(next.value);
    setCursorOffset(next.cursorOffset);
  };

  // Gated on `prefix !== undefined`, same as typeInput below: prefixSuppressed
  // is wizard-wide state, but only the project-name step has a prefix to
  // suppress. Without this gate, clearing any other clearable field (e.g.
  // packageScope) would wrongly restore '' instead of its dynamicDefault.
  const backspaceRestoreTarget =
    prefix !== undefined && prefixSuppressed ? '' : dynamicDefault;

  // Extracted to keep useInput's callback under the complexity limit;
  // reintroduces the prefix when typing resumes on a cleared field
  // (requirement 4) instead of the usual pristine-replace/insert behavior.
  const typeInput = (input: string): EditResult =>
    prefix !== undefined && prefixSuppressed && value === ''
      ? reintroducePrefix(prefix, input)
      : applyTypedInput(value, cursorOffset, isPristine, input);

  const eraseInput = (forward: boolean): EditResult =>
    (forward ? applyDelete : applyBackspace)(
      value,
      cursorOffset,
      isPristine,
      backspaceRestoreTarget,
    );

  useInput((input, key) => {
    if (key.ctrl && input === 'r') {
      if (canRegenerate) {
        onRegenerate();
      }
      return;
    }
    if (key.ctrl && input === 'x') {
      if (allowClear && isPristine) {
        ownChangeRef.current = true;
        onChange('');
        setCursorOffset(0);
        onClear();
      }
      return;
    }
    if (key.ctrl || key.meta || key.tab) {
      return;
    }
    if (key.return) {
      onSubmit(value);
      return;
    }
    if (key.leftArrow) {
      setCursorOffset(offset => Math.max(0, offset - 1));
      return;
    }
    if (key.rightArrow) {
      setCursorOffset(offset => Math.min(value.length, offset + 1));
      return;
    }
    if (key.backspace || key.delete) {
      applyEdit(eraseInput(key.delete));
      return;
    }
    if (input) {
      applyEdit(typeInput(input));
    }
  });

  // Dimmed while `isPristine`, matching every other text spec's
  // ghost-placeholder look, so a still-unedited generated value reads as a
  // default rather than something the user actually typed; the moment it's
  // edited it switches to normal (primary) text color like any real answer.
  return (
    <Text dimColor={isPristine}>
      {value.slice(0, cursorOffset)}
      <Text inverse>
        {cursorOffset < value.length ? value[cursorOffset] : ' '}
      </Text>
      {value.slice(cursorOffset + 1)}
    </Text>
  );
}
