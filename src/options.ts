import { type Command, Option } from 'commander';

import { type OptionSpec, schemaFor } from './schema.js';

/**
 * Adds one commander `.option(...)` per entry in a namespace's schema. A
 * `kind: 'list'` spec adds two: `flag` itself (a plain comma-delimited
 * value, e.g. `--dependencies <list>`) plus `repeatFlag` as commander's
 * collect-into-array pattern (e.g. `--dependency <pkg>`, repeatable,
 * defaulting to `[]`) — both contribute to the same final key, merged by
 * `flagsGivenFor()` below.
 *
 * Doesn't pass `spec.default` as commander's own default (the `repeatFlag`
 * accumulator's own `[]` starting value is a commander mechanism, not a
 * schema default, and is unwound by `flagsGivenFor()` the same way):
 * `resolve()` below is the one place schema defaults get applied, so
 * `command.opts()` only reports what a user actually typed — `cli.ts`
 * depends on that to seed the interactive wizard with just the
 * explicitly-given flags.
 *
 * @param command - The commander command to add options to.
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @returns The same command, for chaining.
 */
export function addSchemaOptions(command: Command, namespace: string): Command {
  for (const spec of schemaFor(namespace)) {
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
 * Builds the "given" flags layer for `resolve()`/`runWizard()`: each schema
 * key mapped to what was actually typed on the CLI, verified via
 * `getOptionValueSource()` so an option's implicit/default value never
 * looks "given" (the same nuance a negated boolean flag like `--no-private`
 * already needed, now handled here instead of ad hoc in `cli.ts`).
 *
 * A `kind: 'list'` spec's two flags collapse into one `spec.key` entry:
 * `flag`'s value (comma-split, trimmed, empties dropped) concatenated with
 * `repeatFlag`'s already-array value, in that order — present only when at
 * least one of the two was actually given on the CLI, so an unused list
 * option still falls through to its schema default (`resolve()`'s job, not
 * this function's) rather than resolving to `[]` here unconditionally.
 *
 * @param command - The parsed commander command (after `.parse()`).
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @returns Flag values actually given on the CLI, keyed by schema key.
 */
export function flagsGivenFor(
  command: Command,
  namespace: string,
): Record<string, unknown> {
  const opts = command.opts() as Record<string, unknown>;
  const given: Record<string, unknown> = {};

  for (const spec of schemaFor(namespace)) {
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
 * Resolves a namespace's options by folding schema defaults, then
 * config-file defaults, then whatever flags were actually given (each
 * layer overriding the last), then validates required keys and `select`
 * choices, throwing one aggregated error for every problem found.
 *
 * `configDefaults` keys with no matching schema entry are ignored — a
 * shared config file may carry sections irrelevant to this run's namespace.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param flagsGiven - Option values already supplied (CLI flags or wizard answers).
 * @param configDefaults - Values resolved via `resolveConfigDefaults()`.
 * @param extraSpecs - Specs layered on top of `schemaFor(namespace)` — used
 *   by tests, and by cli.ts's automated-path `packageScopeExtraSpecs()`
 *   (SEK-94) to fold in an eagerly-resolved dynamic default the same way a
 *   real schema default would apply.
 * @returns The fully-resolved options object.
 */
export function resolve(
  namespace: string,
  flagsGiven: Record<string, unknown>,
  configDefaults: Record<string, unknown> = {},
  extraSpecs: OptionSpec[] = [],
): Record<string, unknown> {
  const schema = [...schemaFor(namespace), ...extraSpecs];
  const defaults = Object.fromEntries(
    schema.map(spec => [spec.key, spec.default]),
  );
  const schemaKeys = new Set(schema.map(spec => spec.key));
  const configLayer = Object.fromEntries(
    Object.entries(configDefaults).filter(
      // A JS config file can define a key as undefined (e.g. derived from
      // an unset env var) — excluding those keeps this consistent with
      // withConfigDefaults() (schema.ts), which already treats an
      // undefined config value as "no override".
      ([key, value]) => schemaKeys.has(key) && value !== undefined,
    ),
  );
  const resolved = { ...defaults, ...configLayer, ...flagsGiven };

  const errors: string[] = [];

  const missing = schema
    .filter(spec => spec.required && resolved[spec.key] === undefined)
    .map(spec => spec.key);
  if (missing.length > 0) {
    errors.push(`Missing required option(s): ${missing.join(', ')}`);
  }

  for (const spec of schema) {
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
