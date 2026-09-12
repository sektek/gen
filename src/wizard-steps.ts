import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { OptionSpec } from './schema.js';
import { isSafePathSegment } from './project-name.js';

export type WizardChoice = {
  label: string;
  value: unknown;
};

/**
 * The schema entries the wizard still needs to prompt for: any key
 * already present in `seed` is skipped, even if its value is `undefined`
 * — an optional text spec with no default records `undefined` when
 * deliberately left blank (see wizard.tsx's `advance()`), and this is
 * also called against the wizard's own live in-progress answers, so
 * treating "present but undefined" as still-pending would make that step
 * reopen itself forever instead of actually completing.
 *
 * `kind === 'list'` specs (e.g. `dependencies`/`devDependencies`, SEK-87)
 * are never pending, regardless of whether they're already in `seed` —
 * the wizard never prompts for these interactively, per the ticket ("the
 * wizard should not provide the option to add when being run
 * interactively"); an unset one silently falls through to its schema
 * default (`resolve()`'s job) instead.
 *
 * @param schema - The full option schema for a namespace.
 * @param seed - Option values already supplied.
 * @returns The subset of `schema` not already covered by `seed`.
 */
export function pendingSpecs(
  schema: OptionSpec[],
  seed: Record<string, unknown>,
): OptionSpec[] {
  return schema.filter(
    spec => spec.kind !== 'list' && !Object.hasOwn(seed, spec.key),
  );
}

/**
 * The choice list to render for a `select` or `boolean` spec.
 * `ink-select-input` has no native checkbox, so a `boolean` spec gets a
 * synthetic Yes/No choice list mapped back to `true`/`false`.
 *
 * @param spec - A `select` or `boolean` option spec.
 * @returns The choices to pass to `ink-select-input`'s `<SelectInput>`.
 */
export function choicesFor(spec: OptionSpec): WizardChoice[] {
  if (spec.kind === 'boolean') {
    return [
      { label: 'Yes', value: true },
      { label: 'No', value: false },
    ];
  }

  if (spec.kind === 'select') {
    if (!spec.choices || spec.choices.length === 0) {
      throw new Error(`choicesFor(): select spec '${spec.key}' has no choices`);
    }
    return spec.choices.map(choice => ({ label: choice, value: choice }));
  }

  throw new Error(
    `choicesFor() only supports 'select'/'boolean' specs, got '${spec.kind}' for '${spec.key}'`,
  );
}

/**
 * The extra answers implied by answering `license` as `'UNLICENSED'`:
 * `private`/`repoVisibility` forced to their private value, for whichever
 * of those two keys actually exist in `schema` (a base-only schema has
 * neither `license` nor `private`, but does have `repoVisibility`).
 *
 * @param license - The value answered (or pre-seeded) for `license`.
 * @param schema - The full option schema for the namespace being run.
 * @returns The implied answers to merge in immediately, or `{}` if `license`
 *   isn't `'UNLICENSED'`.
 */
export function licenseImpliedAnswers(
  license: unknown,
  schema: OptionSpec[],
): Record<string, unknown> {
  if (license !== 'UNLICENSED') {
    return {};
  }

  const keys = new Set(schema.map(spec => spec.key));
  const implied: Record<string, unknown> = {};
  if (keys.has('private')) {
    implied.private = true;
  }
  if (keys.has('repoVisibility')) {
    implied.repoVisibility = 'private';
  }
  return implied;
}

/**
 * The wizard's starting answers: `seed` plus whatever `licenseImpliedAnswers`
 * derives from `seed.license`. `seed` always wins over an implied value —
 * an explicit conflicting seed (e.g. `--no-private` alongside
 * `--license UNLICENSED`) must survive here, or `applyLicenseImplications`
 * downstream never sees the conflict to warn about.
 *
 * @param seed - Option values already supplied (e.g. via CLI flags).
 * @param schema - The full option schema for the namespace being run.
 * @returns The wizard's starting answers.
 */
export function initialAnswers(
  seed: Record<string, unknown>,
  schema: OptionSpec[],
): Record<string, unknown> {
  return { ...licenseImpliedAnswers(seed.license, schema), ...seed };
}

/**
 * Folds a just-answered value into the wizard's running answers, plus (for
 * `key === 'license'`) whatever it implies. Implied values only fill gaps
 * — `prev` and the value just given always win — for the same reason
 * `initialAnswers` favors `seed`: a real conflict must stay visible for
 * `applyLicenseImplications` to report, not get silently absorbed.
 *
 * @param prev - The answers accumulated so far.
 * @param key - The option key just answered.
 * @param value - The value just answered for `key`.
 * @param schema - The full option schema for the namespace being run.
 * @returns The next answers state.
 */
export function mergeAnswer(
  prev: Record<string, unknown>,
  key: string,
  value: unknown,
  schema: OptionSpec[],
): Record<string, unknown> {
  const implied = key === 'license' ? licenseImpliedAnswers(value, schema) : {};
  return { ...implied, ...prev, [key]: value };
}

/**
 * Which option keys count as "explicit" for a completed interactive run:
 * a real CLI flag given up front, or a spec actually prompted for and
 * answered live — never a key only present because `licenseImpliedAnswers`
 * injected it alongside a real answer.
 *
 * @param flagsGiven - Option values already supplied via CLI flags.
 * @param answeredKeys - Keys `Wizard` actually prompted for and answered.
 * @returns The deduped union of both.
 */
export function explicitOptionKeysFromWizard(
  flagsGiven: Record<string, unknown>,
  answeredKeys: string[],
): string[] {
  return [...new Set([...Object.keys(flagsGiven), ...answeredKeys])];
}

/**
 * The index within `choices` matching `spec`'s declared default, for
 * pre-selecting `<SelectInput>`'s initial highlight. Falls back to `0`
 * when there's no default, or it doesn't match any choice.
 *
 * @param spec - The `select` or `boolean` option spec being rendered.
 * @param choices - That spec's choice list, as returned by `choicesFor(spec)`.
 * @returns The index to pass as `<SelectInput>`'s `initialIndex`.
 */
export function defaultIndexFor(
  spec: OptionSpec,
  choices: WizardChoice[],
): number {
  if (spec.default === undefined) {
    return 0;
  }
  const index = choices.findIndex(choice => choice.value === spec.default);
  return index === -1 ? 0 : index;
}

/**
 * Validates a candidate project name for the wizard's project-name step
 * (see wizard.tsx's GeneratedTextInput): rejects anything that isn't a safe
 * single path segment, or that already exists as a directory under `cwd`.
 * Only a cheap, synchronous, local check — a GitHub repo-name collision
 * (only possible once `createRepo` is known, answered by a later step) is
 * still left to `resolveGeneratedDestination`'s own check after the wizard
 * completes.
 *
 * @param name - The candidate name as currently typed.
 * @param cwd - The directory the chosen name will be created under.
 * @returns An error message to display, or `undefined` if `name` is fine.
 */
export function projectNameError(
  name: string,
  cwd: string,
): string | undefined {
  if (!isSafePathSegment(name)) {
    return `'${name}' isn't a valid directory name.`;
  }
  if (existsSync(join(cwd, name))) {
    return `'${name}' already exists in ${cwd}.`;
  }
  return undefined;
}

export type EditResult = {
  value: string;
  cursorOffset: number;
};

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

export type Hint = {
  key: string;
  label: string;
};

/**
 * The keybinding hints for the wizard's persistent status bar (see
 * wizard.tsx's `StatusBar`): which keys do what for the current step, kept
 * separate from any inline validation error (which is about the specific
 * value just typed, not the step in general). `undefined` (no step left,
 * i.e. the wizard is about to finish) shows nothing.
 *
 * @param spec - The option spec currently being prompted for, if any.
 * @param isPristine - For a `generateDefault` spec, whether its field still
 *   shows the generated default unedited — the `^R` hint only applies (and
 *   ctrl+r only actually regenerates, see `GeneratedTextInput`) while true;
 *   ignored for every other spec kind.
 * @returns The hints to show in the status bar, in display order.
 */
export function hintsFor(
  spec: OptionSpec | undefined,
  isPristine = false,
): Hint[] {
  if (!spec) {
    return [];
  }

  if (spec.kind === 'select' || spec.kind === 'boolean') {
    return [
      { key: '↑↓', label: 'move' },
      { key: 'Enter', label: 'select' },
    ];
  }

  return [
    { key: 'Enter', label: 'confirm' },
    ...(spec.generateDefault && isPristine
      ? [{ key: '^R', label: 'new name' }]
      : []),
  ];
}
