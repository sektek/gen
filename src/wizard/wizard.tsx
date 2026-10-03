import { Box, Static, Text } from 'ink';
import { type ProviderFn, getComponent } from '@sektek/utility-belt';
import { useEffect, useRef, useState } from 'react';
import type { PromptContext } from '@sektek/generator';

import {
  clearableCapability,
  hintsFor,
  initialAnswers,
  mergeAnswer,
  pendingSpecs,
  projectNameError,
  projectNamePrefix,
  reloadableCapability,
} from '../wizard-steps.js';
import { PROJECT_NAME_KEY } from '../project-name.js';

import type { CompletedStep, WizardProps } from './types/index.js';
import { StatusBar } from './status-bar.js';
import { displayValue } from './display-value.js';
import { isPromiseLike } from './is-promise-like.js';
import { renderInput } from './render-input.js';

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
