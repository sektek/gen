import { type Command, Option } from 'commander';

import type { OptionSpec } from './types/index.js';

/**
 * Adds one commander `.option(...)` per spec. A
 * `kind: 'list'` spec adds two: `flag` itself (a plain comma-delimited
 * value, e.g. `--dependencies <list>`) plus `repeatFlag` as commander's
 * collect-into-array pattern (e.g. `--dependency <pkg>`, repeatable,
 * defaulting to `[]`) — both contribute to the same final key, merged by
 * `flagsGivenFor()` below.
 *
 * Doesn't pass `spec.default` as commander's own default (the `repeatFlag`
 * accumulator's own `[]` starting value is a commander mechanism, not a
 * spec default, and is unwound by `flagsGivenFor()` the same way):
 * `resolve()` below is the one place spec defaults get applied, so
 * `command.opts()` only reports what a user actually typed — `cli/main.ts`
 * depends on that to seed the interactive wizard with just the
 * explicitly-given flags.
 *
 * @param command - The commander command to add options to.
 * @param specs - The namespace's prompt-derived specs, gated ones included (see `promptSpecsFor()`).
 * @returns The same command, for chaining.
 */
export function addSchemaOptions(
  command: Command,
  specs: OptionSpec[],
): Command {
  for (const spec of specs) {
    if (spec.kind === 'list') {
      command.option(spec.flag, spec.helpText ?? spec.prompt);
      if (spec.repeatFlag) {
        command.option(
          spec.repeatFlag,
          spec.repeatHelpText ?? spec.helpText ?? spec.prompt,
          (value: string, previous: string[]) => [...previous, value],
          [],
        );
      }
      continue;
    }
    command.option(spec.flag, spec.helpText ?? spec.prompt);
  }
  return command;
}

/**
 * The comma-delimited value actually given for a `kind: 'list'` spec's
 * primary `flag`, split/trimmed/empties-dropped — or `undefined` when that
 * flag wasn't given on the CLI at all (as opposed to given but empty).
 *
 * @param command - The parsed commander command (after `.parse()`).
 * @param opts - `command.opts()`, passed in rather than re-read per spec.
 * @param spec - The `kind: 'list'` spec being resolved.
 * @returns The parsed values, or `undefined` when the flag wasn't given.
 */
function listFlagValues(
  command: Command,
  opts: Record<string, unknown>,
  spec: OptionSpec,
): string[] | undefined {
  if (command.getOptionValueSource(spec.key) !== 'cli') {
    return undefined;
  }
  const raw = opts[spec.key];
  return typeof raw === 'string'
    ? raw
        .split(',')
        .map(part => part.trim())
        .filter(part => part.length > 0)
    : [];
}

/**
 * The already-array value actually given for a `kind: 'list'` spec's
 * `repeatFlag`, or `undefined` when it wasn't given on the CLI at all (or
 * the spec has no `repeatFlag`).
 *
 * @param command - The parsed commander command (after `.parse()`).
 * @param opts - `command.opts()`, passed in rather than re-read per spec.
 * @param spec - The `kind: 'list'` spec being resolved.
 * @returns The collected values, or `undefined` when the flag wasn't given.
 */
function repeatFlagValues(
  command: Command,
  opts: Record<string, unknown>,
  spec: OptionSpec,
): string[] | undefined {
  if (!spec.repeatFlag) {
    return undefined;
  }
  const repeatKey = new Option(spec.repeatFlag).attributeName();
  if (command.getOptionValueSource(repeatKey) !== 'cli') {
    return undefined;
  }
  const raw = opts[repeatKey];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

/**
 * Builds the "given" flags layer for `resolve()`/`runWizard()`: each spec
 * key mapped to what was actually typed on the CLI, verified via
 * `getOptionValueSource()` so an option's implicit/default value never
 * looks "given" (the same nuance a negated boolean flag like `--no-private`
 * needs).
 *
 * A `kind: 'list'` spec's two flags collapse into one `spec.key` entry:
 * `flag`'s value (comma-split, trimmed, empties dropped) concatenated with
 * `repeatFlag`'s already-array value, in that order — present only when at
 * least one of the two was actually given on the CLI, so an unused list
 * option still falls through to its spec default (`resolve()`'s job, not
 * this function's) rather than resolving to `[]` here unconditionally.
 *
 * @param command - The parsed commander command (after `.parse()`).
 * @param specs - The same specs the flags were registered from.
 * @returns Flag values actually given on the CLI, keyed by spec key.
 */
export function flagsGivenFor(
  command: Command,
  specs: OptionSpec[],
): Record<string, unknown> {
  const opts = command.opts() as Record<string, unknown>;
  const given: Record<string, unknown> = {};

  for (const spec of specs) {
    if (spec.kind === 'list') {
      const fromFlag = listFlagValues(command, opts, spec);
      const fromRepeatFlag = repeatFlagValues(command, opts, spec);
      if (fromFlag !== undefined || fromRepeatFlag !== undefined) {
        given[spec.key] = [...(fromFlag ?? []), ...(fromRepeatFlag ?? [])];
      }
      continue;
    }

    if (command.getOptionValueSource(spec.key) === 'cli') {
      given[spec.key] = opts[spec.key];
    }
  }

  return given;
}

/**
 * Resolves a namespace's options by folding spec defaults, then
 * config-file defaults, then whatever flags were actually given (each
 * layer overriding the last), then validates required keys and `select`
 * choices, throwing one aggregated error for every problem found.
 *
 * `configDefaults` keys with no matching spec are ignored — a shared
 * config file may carry sections irrelevant to this run's namespace.
 *
 * @param specs - The namespace's prompt-derived specs, gated ones included (see `promptSpecsFor()`).
 * @param flagsGiven - Option values already supplied (CLI flags or wizard answers).
 * @param configDefaults - Values resolved via `resolveConfigDefaults()`.
 * @returns The fully-resolved options object.
 */
export function resolve(
  specs: OptionSpec[],
  flagsGiven: Record<string, unknown>,
  configDefaults: Record<string, unknown> = {},
): Record<string, unknown> {
  const defaults = Object.fromEntries(
    specs.map(spec => [spec.key, spec.default]),
  );
  const specKeys = new Set(specs.map(spec => spec.key));
  const configLayer = Object.fromEntries(
    Object.entries(configDefaults).filter(
      // A JS config file can define a key as undefined (e.g. derived from
      // an unset env var) — excluding those keeps this consistent with
      // withConfigDefaults(), which already treats an undefined config
      // value as "no override".
      ([key, value]) => specKeys.has(key) && value !== undefined,
    ),
  );
  const resolved = { ...defaults, ...configLayer, ...flagsGiven };

  const errors: string[] = [];

  const missing = specs
    .filter(spec => spec.required && resolved[spec.key] === undefined)
    .map(spec => spec.key);
  if (missing.length > 0) {
    errors.push(`Missing required option(s): ${missing.join(', ')}`);
  }

  for (const spec of specs) {
    if (
      spec.kind === 'select' &&
      spec.choices &&
      resolved[spec.key] !== undefined &&
      !spec.choices.includes(resolved[spec.key] as string)
    ) {
      errors.push(
        `Invalid value for ${spec.key}: ${JSON.stringify(resolved[spec.key])} (expected one of: ${spec.choices.join(', ')})`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  return resolved;
}
