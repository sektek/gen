import { Box, Static, Text, useInput } from 'ink';
import { useEffect, useRef, useState } from 'react';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';

import {
  type EditResult,
  type Hint,
  applyBackspace,
  applyDelete,
  applyTypedInput,
  choicesFor,
  defaultIndexFor,
  hintsFor,
  initialAnswers,
  mergeAnswer,
  pendingSpecs,
  projectNameError,
} from './wizard-steps.js';
import type { OptionSpec } from './schema.js';

type CompletedStep = {
  key: string;
  text: string;
};

export type WizardProps = {
  schema: OptionSpec[];
  seed: Record<string, unknown>;
  onComplete: (
    answers: Record<string, unknown>,
    answeredKeys: string[],
  ) => void;
  // Only needed when `schema` includes a spec with `generateDefault` (the
  // project-name step cli.ts adds ahead of the namespace's own schema) —
  // the directory that name would be created under, for projectNameError()'s
  // local collision check. Unused by every other spec kind.
  destCwd?: string;
};

// Not unit-tested: ink TTY rendering is impractical to exercise outside a
// real terminal. The pure step-sequencing logic is unit-tested in
// wizard-steps.ts instead.

/**
 * Steps through a namespace's option schema one prompt at a time,
 * skipping any key already supplied through `seed`.
 *
 * @param props - Schema to walk, pre-filled answers, and the completion callback.
 * @param props.schema - The full option schema for the namespace being run.
 * @param props.seed - Option values already supplied (e.g. via CLI flags).
 * @param props.onComplete - Called once with the fully-resolved answers,
 *   plus the keys actually prompted for and answered live (excluding any
 *   from `seed` or merely implied by `licenseImpliedAnswers`).
 * @param props.destCwd - The directory a `generateDefault` project-name answer would be created under.
 * @returns The scrolled-back answers plus the current prompt, or just the
 * scrollback once every step is answered.
 */
export function Wizard({ schema, seed, onComplete, destCwd }: WizardProps) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(() =>
    initialAnswers(seed, schema),
  );
  const [textValue, setTextValue] = useState('');
  const [dynamicDefault, setDynamicDefault] = useState<string | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | undefined>(undefined);
  const [completed, setCompleted] = useState<CompletedStep[]>([]);

  // Recomputed from live `answers` (not the static `seed` prop) every
  // render, since `steps` can shrink mid-flow once `license` resolves to
  // 'UNLICENSED' — "the next step" is always "the first not-yet-answered
  // spec", not a counter into a list whose length may no longer match.
  const steps = pendingSpecs(schema, answers);
  const spec = steps[0];
  const done = spec === undefined;
  // Only meaningful for a `generateDefault` spec: `textValue` is `''` and
  // `dynamicDefault` is `undefined` for every other spec, so this is always
  // `false` there too — harmless, since hintsFor()/GeneratedTextInput only
  // ever consult it for a `generateDefault` spec.
  const isPristine = textValue === dynamicDefault;

  // answers/completed/onComplete are in the deps to avoid a stale closure;
  // the `if (done)` guard makes every earlier re-invocation a no-op.
  useEffect(() => {
    if (done) {
      onComplete(
        answers,
        completed.map(step => step.key),
      );
    }
  }, [done, answers, completed, onComplete]);

  // A step with `generateDefault` starts pre-filled with its current
  // (already-generated) default as real, editable text, rather than the
  // ghost placeholder text every other text spec uses — see
  // GeneratedTextInput. Keyed on `spec?.key` alone, not `spec` itself:
  // `steps`/`spec` are a new array/object every render, and re-running this
  // on every render would stomp the field back to its default on each
  // keystroke instead of only when the step actually changes.
  useEffect(() => {
    if (spec?.kind === 'text' && spec.generateDefault) {
      const initial =
        spec.default !== undefined
          ? String(spec.default)
          : spec.generateDefault();
      setDynamicDefault(initial);
      setTextValue(initial);
    } else {
      setDynamicDefault(undefined);
      setTextValue('');
    }
    setError(undefined);
  }, [spec?.key]);

  const advance = (value: unknown) => {
    if (!spec) {
      return;
    }
    setAnswers(prev => mergeAnswer(prev, spec.key, value, schema));
    setCompleted(prev => [
      ...prev,
      { key: spec.key, text: `${spec.prompt}: ${displayValue(spec, value)}` },
    ]);
  };

  // Validated submit for a `generateDefault` step: rejects (with an inline
  // error, leaving the step open to retry) an unsafe or already-taken name
  // instead of advancing — see wizard-steps.ts's projectNameError(). A
  // GitHub repo-name collision is still left to resolveGeneratedDestination
  // after the wizard completes, since `createRepo` isn't known yet here.
  const submitGenerated = (value: string) => {
    const message =
      destCwd !== undefined ? projectNameError(value, destCwd) : undefined;
    if (message) {
      setError(message);
      return;
    }
    advance(value);
  };

  const changeText = (value: string) => {
    setTextValue(value);
    setError(undefined);
  };

  const regenerate = () => {
    if (spec?.kind === 'text' && spec.generateDefault) {
      const next = spec.generateDefault();
      setDynamicDefault(next);
      setTextValue(next);
      setError(undefined);
    }
  };

  // Same root shape (a <Box> wrapping <Static>) whether or not a step is
  // still pending — swapping <Static> itself in and out as the root element
  // would remount it, losing the items it's already printed and reprinting
  // the whole scrollback once the wizard finishes.
  return (
    <Box flexDirection="column">
      <Static items={completed}>
        {item => <Text key={item.key}>{item.text}</Text>}
      </Static>
      {spec &&
        renderInput({
          spec,
          textValue,
          setTextValue: changeText,
          advance,
          dynamicDefault,
          isPristine,
          error,
          onRegenerate: regenerate,
          onGeneratedSubmit: submitGenerated,
        })}
      {spec && <StatusBar hints={hintsFor(spec, isPristine)} />}
    </Box>
  );
}

/**
 * The human-readable form of an answered step's value, for scrollback:
 * `select`/`boolean` resolve back to their choice `label` (e.g. `true` ->
 * `"Yes"`) rather than showing the raw stored value.
 *
 * @param spec - The option spec that was just answered.
 * @param value - The value `advance()` recorded for it.
 * @returns The text to display for this answer in the `<Static>` scrollback.
 */
function displayValue(spec: OptionSpec, value: unknown): string {
  if (spec.kind === 'select' || spec.kind === 'boolean') {
    const choice = choicesFor(spec).find(c => c.value === value);
    if (choice) {
      return choice.label;
    }
  }
  return value === undefined || value === null ? '' : String(value);
}

type RenderInputArgs = {
  spec: OptionSpec;
  textValue: string;
  setTextValue: (value: string) => void;
  advance: (value: unknown) => void;
  dynamicDefault: string | undefined;
  isPristine: boolean;
  error: string | undefined;
  onRegenerate: () => void;
  onGeneratedSubmit: (value: string) => void;
};

/**
 * Renders the prompt label plus input for the current step: a
 * `GeneratedTextInput` row for a `text` spec with `generateDefault`
 * (pre-filled with the live-generated default, ctrl+r to regenerate — see
 * that component), a plain `<TextInput>` row for every other `text` spec
 * (the schema default shown as ghost placeholder text), or the prompt label
 * above `<SelectInput>` (pre-selected at the schema's default) for
 * `select`/`boolean`.
 *
 * @param args - The current step, plus the wizard-level state/callbacks it needs.
 * @param args.spec - The option spec currently being prompted for.
 * @param args.textValue - The text input's current (uncommitted) value.
 * @param args.setTextValue - Updates the text input's current value.
 * @param args.advance - Records the answered value and moves to the next step.
 * @param args.dynamicDefault - The current live-generated default for a `generateDefault` spec.
 * @param args.isPristine - Whether a `generateDefault` spec's field still shows that default unedited.
 * @param args.error - An inline validation error to show below a `generateDefault` spec's input, if any.
 * @param args.onRegenerate - Requests a fresh generated default for a `generateDefault` spec.
 * @param args.onGeneratedSubmit - Validates and (if valid) records a `generateDefault` spec's answer.
 * @returns The prompt + input for this step.
 */
function renderInput({
  spec,
  textValue,
  setTextValue,
  advance,
  dynamicDefault,
  isPristine,
  error,
  onRegenerate,
  onGeneratedSubmit,
}: RenderInputArgs) {
  if (spec.kind === 'text' && spec.generateDefault) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text>{spec.prompt}: </Text>
          <GeneratedTextInput
            value={textValue}
            isPristine={isPristine}
            dynamicDefault={dynamicDefault ?? ''}
            onChange={setTextValue}
            onRegenerate={onRegenerate}
            onSubmit={onGeneratedSubmit}
          />
        </Box>
        {error && <Text color="red">{error}</Text>}
      </Box>
    );
  }

  if (spec.kind === 'text') {
    return (
      <Box>
        <Text>{spec.prompt}: </Text>
        <TextInput
          value={textValue}
          onChange={setTextValue}
          placeholder={
            spec.default !== undefined ? String(spec.default) : undefined
          }
          onSubmit={value => advance(value === '' ? spec.default : value)}
        />
      </Box>
    );
  }

  const choices = choicesFor(spec);
  return (
    <Box flexDirection="column">
      <Text>{spec.prompt}</Text>
      <SelectInput
        items={choices}
        initialIndex={defaultIndexFor(spec, choices)}
        onSelect={item => advance(item.value)}
      />
    </Box>
  );
}

type GeneratedTextInputProps = {
  value: string;
  isPristine: boolean;
  dynamicDefault: string;
  onChange: (value: string) => void;
  onRegenerate: () => void;
  onSubmit: (value: string) => void;
};

/**
 * A `<TextInput>`-alike for a `generateDefault` spec: pre-filled with real,
 * editable text (the currently-generated default) instead of ghost
 * placeholder text, dimmed while unedited (`isPristine`), plus a ctrl+r
 * hotkey that swaps in a freshly generated value while it's still showing
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
 * source), so a bare ctrl+r would fall through to its "insert this
 * character" branch and type a literal 'r' into the field. This component
 * filters out every ctrl/meta combo before it ever reaches the buffer.
 *
 * @param props - The current value/pristine flag, and the change/regenerate/submit callbacks.
 * @param props.value - The input's current (uncommitted) value.
 * @param props.isPristine - Whether `value` still equals the currently-shown generated default.
 * @param props.dynamicDefault - The currently-shown generated default, restored when the user's own text is erased down to nothing.
 * @param props.onChange - Updates the input's current value.
 * @param props.onRegenerate - Requests a fresh generated default; only actually called while `isPristine`.
 * @param props.onSubmit - Called with the current value on Enter.
 * @returns The rendered input row.
 */
function GeneratedTextInput({
  value,
  isPristine,
  dynamicDefault,
  onChange,
  onRegenerate,
  onSubmit,
}: GeneratedTextInputProps) {
  const [cursorOffset, setCursorOffset] = useState(value.length);

  // `value` changes for two different reasons that want two different
  // cursor placements: our own edit below (typing/backspace/delete), which
  // already computes the exact cursor position it wants via
  // applyEdit()/setCursorOffset, and an externally-driven replacement — the
  // initial generated default arriving (this component mounts before
  // Wizard's own effect has populated `value`, so it starts out `''`) or a
  // ctrl+r regenerate — for which the cursor belongs at the end, as if the
  // user had just typed it. This ref is how the effect below tells the two
  // apart: set right before we call onChange ourselves, and consumed (reset
  // to false) the moment the effect sees it, so it's only ever true for a
  // change this component caused.
  const ownChangeRef = useRef(false);

  useEffect(() => {
    if (ownChangeRef.current) {
      ownChangeRef.current = false;
      return;
    }
    setCursorOffset(value.length);
  }, [value]);

  const applyEdit = (next: EditResult) => {
    ownChangeRef.current = true;
    onChange(next.value);
    setCursorOffset(next.cursorOffset);
  };

  useInput((input, key) => {
    if (key.ctrl && input === 'r') {
      if (isPristine) {
        onRegenerate();
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
    if (key.backspace) {
      applyEdit(
        applyBackspace(value, cursorOffset, isPristine, dynamicDefault),
      );
      return;
    }
    if (key.delete) {
      applyEdit(applyDelete(value, cursorOffset, isPristine, dynamicDefault));
      return;
    }
    if (input) {
      applyEdit(applyTypedInput(value, cursorOffset, isPristine, input));
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

/**
 * The persistent hint bar rendered below the current step's input: a
 * full-width rule (via a top-only border, so it reads as a separator
 * rather than boxing the hints in) followed by each hint as `key label`,
 * dim so it doesn't compete with the prompt above it. Renders nothing once
 * `hints` is empty (see `hintsFor()` — only when there's no step left).
 *
 * @param props - The hints to show.
 * @param props.hints - The keybinding hints for the current step, in display order.
 * @returns The rendered status bar, or `null` when there are no hints to show.
 */
function StatusBar({ hints }: { hints: Hint[] }) {
  if (hints.length === 0) {
    return null;
  }

  return (
    <Box
      width="100%"
      borderStyle="single"
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderDimColor>
      <Text dimColor>
        {hints.map((hint, index) => (
          <Text key={hint.key}>
            {index > 0 && '   '}
            <Text bold>{hint.key}</Text> {hint.label}
          </Text>
        ))}
      </Text>
    </Box>
  );
}
