import { Box, Static, Text, useInput } from 'ink';
import { type ProviderFn, getComponent } from '@sektek/utility-belt';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { PromptContext } from '@sektek/generator';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import chalk from 'chalk';

import {
  type EditResult,
  type Hint,
  applyBackspace,
  applyTypedInput,
  choicesFor,
  clearableCapability,
  defaultIndexFor,
  hintsFor,
  initialAnswers,
  isClearable,
  mergeAnswer,
  pendingSpecs,
  projectNameError,
  projectNamePrefix,
  reintroducePrefix,
  reloadableCapability,
} from './wizard-steps.js';
import type { OptionKind, OptionSpec } from './schema.js';
import { PROJECT_NAME_KEY } from './project-name.js';

/**
 * True for a value returned from a reloadable capability's provider (or
 * generateDefaultAsync) that still needs awaiting, vs one already resolved
 * synchronously — lets a synchronous provider (e.g. the project-name
 * step's own generateName) resolve within the same tick, with no
 * "Resolving…" flash, the same as before this capability generalized the
 * old generateDefault mechanism.
 *
 * @param value - The value to check.
 * @returns Whether `value` is thenable.
 */
function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PromiseLike<T>).then === 'function'
  );
}

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
  promptContext?: Pick<PromptContext, 'configDefaults' | 'workspace'>;
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
 *   from `seed` or merely implied by an implied-answers rule, e.g.
 *   `licenseImpliedAnswers`/`gitInitImpliedAnswers`/`createRepoImpliedAnswers`).
 * @param props.destCwd - The directory the project-name step's answer would be created under.
 * @param props.promptContext - The `configDefaults`/`workspace` half of the
 *   `PromptContext` a reloadable capability's provider is called with.
 * @returns The scrolled-back answers plus the current prompt, or just the
 * scrollback once every step is answered.
 */
export function Wizard({
  schema,
  seed,
  onComplete,
  destCwd,
  promptContext = { configDefaults: {} },
}: WizardProps) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(() =>
    initialAnswers(seed, schema),
  );
  const [textValue, setTextValue] = useState('');
  const [dynamicDefault, setDynamicDefault] = useState<string | undefined>(
    undefined,
  );
  // The key of the step still awaiting a *genuinely async* resolution (a
  // reloadable capability's provider, or generateDefaultAsync, that
  // returned a real promise). Left `undefined` (rather than set then
  // cleared) for a *synchronously*-resolving provider, so a sync reload
  // never shows "Resolving…" at all.
  const [pendingAsyncKey, setPendingAsyncKey] = useState<string | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | undefined>(undefined);
  // Set by a ctrl+x clear on the project-name step; stays true for the rest
  // of the step so a regenerate keeps drawing from a prefix-stripped
  // context — the clear "sticks" rather than resetting on ctrl+r.
  const [prefixSuppressed, setPrefixSuppressed] = useState(false);
  const [completed, setCompleted] = useState<CompletedStep[]>([]);
  // The step key textValue/dynamicDefault/pendingAsyncKey/error above are
  // currently valid for — see the reset below.
  const [resolvedForKey, setResolvedForKey] = useState<string | undefined>(
    undefined,
  );
  // Invalidates a regenerate() call (see below) that's no longer relevant
  // — either a newer regenerate superseded it (two quick ctrl+r presses),
  // or the step changed before it resolved. Bumped both by the reset below
  // (once per step transition) and inside regenerate() itself (once per
  // press); a completion checks its captured token against this ref and
  // drops itself if it no longer matches, instead of overwriting a newer
  // value with a stale one.
  const generationRef = useRef(0);

  // Recomputed from live `answers` (not the static `seed` prop) every
  // render, since `steps` can shrink mid-flow once `license` resolves to
  // 'UNLICENSED' — "the next step" is always "the first not-yet-answered
  // spec", not a counter into a list whose length may no longer match.
  const steps = pendingSpecs(schema, answers);
  const spec = steps[0];
  const done = spec === undefined;

  // Resets textValue/dynamicDefault/pendingAsyncKey/error synchronously, in
  // render, the moment spec.key no longer matches what they were resolved
  // for. An effect alone can't do this: it only runs after this render has
  // already committed, which would paint the *previous* step's value for
  // one frame before catching up. Calling setState here bails React out of
  // this render and retries immediately with the reset values (see React's
  // docs on adjusting state during rendering), so nothing stale is ever
  // actually rendered.
  if (spec?.key !== resolvedForKey) {
    setResolvedForKey(spec?.key);
    setTextValue('');
    setDynamicDefault(undefined);
    setPendingAsyncKey(undefined);
    setError(undefined);
    setPrefixSuppressed(false);
    generationRef.current++;
  }

  // Only ever set for the project-name step — every other reloadable spec
  // has no prefix concept, so the prefix-aware ctrl+x/ctrl+r/typing behavior
  // below never engages for them.
  const prefix =
    spec?.key === PROJECT_NAME_KEY
      ? projectNamePrefix(promptContext)
      : undefined;

  const reloadWith = (
    reload: NonNullable<ReturnType<typeof reloadableCapability>>,
    contextOverride?: Pick<PromptContext, 'configDefaults' | 'workspace'>,
  ): unknown => {
    const get: ProviderFn<unknown, PromptContext> = getComponent(
      reload.provider,
      'get',
    );
    return get({
      ...(contextOverride ?? promptContext),
      answers,
      flagsGiven: seed,
    } as PromptContext);
  };

  const resolving =
    pendingAsyncKey !== undefined && pendingAsyncKey === spec?.key;
  const isPristine = textValue === dynamicDefault;
  // Also true on an empty, prefix-suppressed field — ctrl+r must keep
  // working right after a clear, not just while pristine (requirement 3).
  const canRegenerate =
    isPristine ||
    (prefix !== undefined && prefixSuppressed && textValue === '');

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

  // A step with a `reloadable` capability or `generateDefaultAsync` starts
  // pre-filled with its resolved default as real, editable text, rather
  // than the ghost placeholder text every other text spec uses — see
  // GeneratedTextInput. Keyed on `spec?.key` alone, not `spec` itself:
  // `steps`/`spec` are a new array/object every render, and re-running this
  // on every render would stomp the field back to its default on each
  // keystroke instead of only when the step actually changes. The reset
  // above already blanked textValue/dynamicDefault/pendingAsyncKey/error
  // for this key, so this effect only needs to act when there's actually
  // something to resolve.
  useEffect(() => {
    const reload = spec ? reloadableCapability(spec) : undefined;
    if (spec?.kind === 'text' && (reload || spec.generateDefaultAsync)) {
      if (spec.default !== undefined) {
        setDynamicDefault(String(spec.default));
        setTextValue(String(spec.default));
        return;
      }

      const key = spec.key;
      const result = reload
        ? reloadWith(reload)
        : spec.generateDefaultAsync!(answers);

      // A synchronous provider (e.g. the project-name step's own
      // generateName) resolves within this same tick, matching the old
      // generateDefault mechanism's behavior exactly — no "Resolving…"
      // flash. Only a value that's actually still pending goes through
      // pendingAsyncKey/the async branch below.
      if (!isPromiseLike<unknown>(result)) {
        const initial = String(result);
        setDynamicDefault(initial);
        setTextValue(initial);
        return;
      }

      let cancelled = false;
      setPendingAsyncKey(key);

      void (async () => {
        const initial = String(await result);
        if (cancelled) {
          return;
        }
        setPendingAsyncKey(undefined);
        setDynamicDefault(initial);
        setTextValue(initial);
      })();

      return () => {
        cancelled = true;
      };
    }
    // `answers` is read here but deliberately not a dependency — only this
    // step's snapshot is wanted; adding it would re-trigger the network
    // call on every subsequent answer.
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

  // Validated submit for the project-name step specifically: rejects (with
  // an inline error, leaving the step open to retry) an unsafe or
  // already-taken name instead of advancing — see wizard-steps.ts's
  // projectNameError(). A GitHub repo-name collision is still left to
  // resolveGeneratedDestination after the wizard completes, since
  // `createRepo` isn't known yet here.
  const submitGenerated = (value: string) => {
    const message =
      destCwd !== undefined ? projectNameError(value, destCwd) : undefined;
    if (message) {
      setError(message);
      return;
    }
    advance(value);
  };

  // Submit for any other reloadable/generateDefaultAsync text step: an
  // empty value (from ctrl+x, or backspacing a pristine field to nothing)
  // resolves through the spec's own `clearable` capability, if it has one
  // — the capability's `value` (default `undefined`) is what actually gets
  // stored, not the literal `''` shown in the field. See schema.ts's
  // `OptionSpec.capabilities` doc for why display and stored value are
  // allowed to differ this way.
  const submitCleared = (value: string) => {
    if (!spec) {
      return;
    }
    const clearable = clearableCapability(spec);
    advance(value === '' && clearable ? clearable.value : value);
  };

  const changeText = (value: string) => {
    setTextValue(value);
    setError(undefined);
  };

  const regenerate = () => {
    if (spec?.kind !== 'text') {
      return;
    }
    const reload = reloadableCapability(spec);
    if (!reload) {
      return;
    }
    // Claims this regenerate as the latest one before awaiting; a second
    // ctrl+r before this resolves (or advancing past this step entirely,
    // which bumps generationRef via the reset above) invalidates the token,
    // so an out-of-order or abandoned completion drops itself instead of
    // overwriting a newer value.
    const token = ++generationRef.current;
    // A prefix-stripped context makes the same provider naturally produce
    // a plain name once cleared (see prefixFor() in project-name-prompt.ts).
    const context =
      prefix !== undefined && prefixSuppressed
        ? { configDefaults: {} }
        : undefined;
    void (async () => {
      const next = String(await reloadWith(reload, context));
      if (token !== generationRef.current) {
        return;
      }
      setDynamicDefault(next);
      setTextValue(next);
      setError(undefined);
    })();
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
          resolving,
          error,
          prefix,
          prefixSuppressed,
          canRegenerate,
          onRegenerate: regenerate,
          onClear: () => setPrefixSuppressed(true),
          onGeneratedSubmit:
            spec.key === PROJECT_NAME_KEY ? submitGenerated : submitCleared,
        })}
      {spec && !resolving && (
        <StatusBar
          hint={spec.hint}
          hints={hintsFor(spec, isPristine, canRegenerate)}
        />
      )}
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
  resolving: boolean;
  error: string | undefined;
  prefix: string | undefined;
  prefixSuppressed: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
  onClear: () => void;
  onGeneratedSubmit: (value: string) => void;
};

type InputRenderer = (args: RenderInputArgs) => ReactNode;

/**
 * A "Resolving…" line, a pre-filled/editable `GeneratedTextInput` row (for
 * a `reloadable`-capable or `generateDefaultAsync` spec), or a plain
 * `<TextInput>` row for any other `text` spec.
 *
 * @param args - The current step, plus the wizard-level state/callbacks it needs.
 * @param args.spec - The option spec currently being prompted for.
 * @param args.textValue - The text input's current (uncommitted) value.
 * @param args.setTextValue - Updates the text input's current value.
 * @param args.advance - Records the answered value and moves to the next step.
 * @param args.dynamicDefault - The current live-resolved default, if any.
 * @param args.isPristine - Whether the field still shows that default unedited.
 * @param args.resolving - Whether an async default is still resolving.
 * @param args.error - An inline validation error to show below the input, if any.
 * @param args.prefix - The project-name step's workspace/config prefix, if any.
 * @param args.prefixSuppressed - The project-name step's ctrl+x clear state.
 * @param args.canRegenerate - Whether ctrl+r currently regenerates.
 * @param args.onRegenerate - Requests a fresh value for a `reloadable`-capable spec.
 * @param args.onClear - Notifies a ctrl+x clear on the project-name step.
 * @param args.onGeneratedSubmit - Validates (project-name) or resolves a clear (`clearable`) before recording the answer.
 * @returns The prompt + input for this step.
 */
function renderTextInput({
  spec,
  textValue,
  setTextValue,
  advance,
  dynamicDefault,
  isPristine,
  resolving,
  error,
  prefix,
  prefixSuppressed,
  canRegenerate,
  onRegenerate,
  onClear,
  onGeneratedSubmit,
}: RenderInputArgs): ReactNode {
  if (resolving) {
    return (
      <Box>
        <Text dimColor>{spec.prompt}: Resolving…</Text>
      </Box>
    );
  }

  const reload = reloadableCapability(spec);
  if (reload || spec.generateDefaultAsync) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text>{spec.prompt}: </Text>
          <GeneratedTextInput
            value={textValue}
            isPristine={isPristine}
            dynamicDefault={dynamicDefault ?? ''}
            allowClear={isClearable(spec)}
            prefix={prefix}
            prefixSuppressed={prefixSuppressed}
            canRegenerate={canRegenerate}
            onClear={onClear}
            onChange={setTextValue}
            onRegenerate={onRegenerate}
            onSubmit={onGeneratedSubmit}
          />
        </Box>
        {error && <Text color="red">{error}</Text>}
      </Box>
    );
  }

  // Not <TextInput placeholder={defaultText}>: ink-text-input only
  // inverts a placeholder's own first character when it's the one
  // passed placeholder text — an unstyled default here reintroduces the
  // leading-space/misplaced-cursor bug from SEK-93.
  const defaultText =
    spec.default !== undefined ? String(spec.default) : undefined;
  const showGhost = textValue === '' && defaultText !== undefined;
  return (
    <Box>
      <Text>{spec.prompt}: </Text>
      <TextInput
        value={textValue}
        onChange={setTextValue}
        showCursor={!showGhost}
        onSubmit={value => advance(value === '' ? spec.default : value)}
      />
      {showGhost && (
        <Text>
          {defaultText.length > 0
            ? chalk.inverse(defaultText[0]) + chalk.dim(defaultText.slice(1))
            : chalk.inverse(' ')}
        </Text>
      )}
    </Box>
  );
}

/**
 * The prompt label above a `<SelectInput>` — shared by `select` and
 * `boolean` (a synthetic Yes/No choice list, see `choicesFor()`).
 *
 * @param args - The current step, plus the wizard-level state/callbacks it needs.
 * @param args.spec - The option spec currently being prompted for.
 * @param args.advance - Records the answered value and moves to the next step.
 * @returns The prompt + select list for this step.
 */
function renderSelectInput({ spec, advance }: RenderInputArgs): ReactNode {
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

/**
 * Defensive placeholder for `INPUT_RENDERERS`'s `'list'` entry — structurally
 * unreachable, since `pendingSpecs()` filters `'list'` specs out before the
 * wizard ever sees one, but registered anyway so the mapping stays total
 * over every `OptionKind` rather than partial.
 *
 * @param args - The current step.
 * @param args.spec - The option spec that reached this renderer.
 * @throws {Error} Always — reaching this function is a bug, not a real UI state.
 */
function renderUnsupportedInput({ spec }: RenderInputArgs): ReactNode {
  throw new Error(
    `renderInput(): '${spec.kind}' specs are never prompted for interactively (see pendingSpecs()) — this should be unreachable.`,
  );
}

// gen's own closed, fixed mapping from an OptionSpec's kind to the Ink
// component that renders it — every prompt type the wizard can show, in
// one place, rather than a growing if/else chain (see the project's
// "component-type ownership" decision: gen owns this, libs/generator's
// prompt definitions stay free of any Ink/React dependency). 'list' specs
// are never actually reached here (pendingSpecs() filters them out before
// the wizard ever sees one) but are still registered, for a total mapping
// over every OptionKind rather than a partial one.
const INPUT_RENDERERS: Record<OptionKind, InputRenderer> = {
  text: renderTextInput,
  boolean: renderSelectInput,
  select: renderSelectInput,
  list: renderUnsupportedInput,
};

/**
 * Renders the prompt label plus input for the current step, dispatching on
 * `spec.kind` via `INPUT_RENDERERS`.
 *
 * @param args - The current step, plus the wizard-level state/callbacks it needs.
 * @param args.spec - The option spec currently being prompted for.
 * @param args.textValue - The text input's current (uncommitted) value.
 * @param args.setTextValue - Updates the text input's current value.
 * @param args.advance - Records the answered value and moves to the next step.
 * @param args.dynamicDefault - The current live-resolved default, if any.
 * @param args.isPristine - Whether such a spec's field still shows that default unedited.
 * @param args.resolving - Whether an async default is still resolving.
 * @param args.error - An inline validation error to show below the project-name step's input, if any.
 * @param args.prefix - The project-name step's workspace/config prefix, if any.
 * @param args.prefixSuppressed - The project-name step's ctrl+x clear state.
 * @param args.canRegenerate - Whether ctrl+r currently regenerates.
 * @param args.onRegenerate - Requests a fresh value for a `reloadable`-capable spec.
 * @param args.onClear - Notifies a ctrl+x clear on the project-name step.
 * @param args.onGeneratedSubmit - Validates (project-name) or resolves a clear (`clearable`) before recording a `reloadable`/`generateDefaultAsync` spec's answer.
 * @returns The prompt + input for this step.
 */
function renderInput(args: RenderInputArgs): ReactNode {
  return INPUT_RENDERERS[args.spec.kind](args);
}

type GeneratedTextInputProps = {
  value: string;
  isPristine: boolean;
  dynamicDefault: string;
  // Whether ctrl+x clears the field to '' outright.
  allowClear: boolean;
  prefix: string | undefined;
  prefixSuppressed: boolean;
  // Wizard computes this to match its own hintsFor() call for the ^R hint.
  canRegenerate: boolean;
  onChange: (value: string) => void;
  onRegenerate: () => void;
  onClear: () => void;
  onSubmit: (value: string) => void;
};

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
function GeneratedTextInput({
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
      // Both keys, deliberately: see applyBackspace()'s doc comment for why
      // key.delete has to be treated as backspace here, not forward-delete.
      applyEdit(
        applyBackspace(value, cursorOffset, isPristine, backspaceRestoreTarget),
      );
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

/**
 * The persistent hint bar rendered below the current step's input: a
 * full-width rule (via a top-only border, so it reads as a separator
 * rather than boxing the hints in), an optional one-line description of
 * what the step is asking (`spec.hint` — see `schema.ts`'s `OptionSpec`
 * doc), then each keybinding hint as `key label`, dim so it doesn't
 * compete with the prompt above it. Renders nothing once there's neither a
 * description nor any hints (see `hintsFor()` — only when there's no step
 * left).
 *
 * @param props - The description/hints to show.
 * @param props.hint - The current step's own short description, if it has one.
 * @param props.hints - The keybinding hints for the current step, in display order.
 * @returns The rendered status bar, or `null` when there's nothing to show.
 */
function StatusBar({ hint, hints }: { hint?: string; hints: Hint[] }) {
  if (!hint && hints.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="single"
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderDimColor>
      {hint && <Text dimColor>{hint}</Text>}
      {hints.length > 0 && (
        <Text dimColor>
          {hints.map((item, index) => (
            <Text key={item.key}>
              {index > 0 && '   '}
              <Text bold>{item.key}</Text> {item.label}
            </Text>
          ))}
        </Text>
      )}
    </Box>
  );
}
