import {
  type PredicateFn,
  type ProviderFn,
  anyOf,
  getComponent,
} from '@sektek/utility-belt';
import type { Prompt, PromptContext } from '@sektek/generator';
import { kebabCase } from 'lodash-es';

import type { OptionKind, OptionSpec } from './types/index.js';

// Every OptionKind is supported: 'select' needs `prompt.choices` (a fixed
// list or a provider, resolved eagerly in promptsToOptionSpecs()), and
// 'list' maps to a comma-delimited flag plus a singular repeatable one.
const SUPPORTED_KINDS: readonly OptionKind[] = [
  'text',
  'boolean',
  'select',
  'list',
];

function isSupportedKind(type: string): type is OptionKind {
  return (SUPPORTED_KINDS as readonly string[]).includes(type);
}

// '...ies' -> '...y', otherwise strip one trailing 's' ('dev-dependencies'
// -> 'dev-dependency'), giving '--dependency <pkg>' flags. A
// name with no trailing 's' gets '-item' so the repeat flag can't collide
// with the comma-delimited one.
function singular(kebab: string): string {
  if (kebab.endsWith('ies')) {
    return `${kebab.slice(0, -3)}y`;
  }
  return kebab.endsWith('s') ? kebab.slice(0, -1) : `${kebab}-item`;
}

// A boolean prompt whose resolved default is true needs the negated
// '--no-<x>' form (matching the usual convention, e.g.
// '--no-git-init') — Commander gives a bare positive flag no way to set
// the value back to false. Every other case (a false-default boolean, or
// any other kind) uses the plain form.
function flagFor(prompt: Prompt, resolvedDefault: unknown): string {
  const kebab = kebabCase(prompt.name);
  if (prompt.type === 'list') {
    return `--${kebab} <list>`;
  }
  if (prompt.type !== 'boolean') {
    return `--${kebab} <value>`;
  }
  return resolvedDefault === true ? `--no-${kebab}` : `--${kebab}`;
}

async function choicesFor(
  prompt: Prompt,
  context: PromptContext,
): Promise<readonly string[]> {
  const { choices } = prompt;
  if (choices === undefined) {
    throw new Error(
      `promptsToOptionSpecs(): select prompt '${prompt.name}' has no choices`,
    );
  }
  if (Array.isArray(choices)) {
    return [...choices];
  }
  const get: ProviderFn<readonly string[], PromptContext> = getComponent(
    choices,
    'get',
  );
  return [...(await get(context))];
}

/**
 * Merges `Prompt[]` entries sharing the same `name` (e.g. the shared
 * `authorPrompt`, pulled in independently by two different composed
 * generators reachable from the same namespace) into one, per this
 * project's decided dedup rule: identity is `name`, and a collision's
 * `includePrompt`s combine via `anyOf` (ask if *either* consumer needs it) —
 * `allOf` would wrongly suppress the prompt exactly when it matters.
 *
 * Every other field (`type`/`label`/`provider`/`hint`/`capabilities`) is
 * taken from whichever entry was seen first for that `name`. A shared
 * prompt is expected to carry identical values for these across every
 * consumer (the same underlying prompt definition, e.g. the literal
 * `authorPrompt` export, reused as-is or only re-gated via
 * `promptBuilder.from(authorPrompt).create({ includePrompt })`), so
 * first-wins is a safe tie-break rather than a meaningful choice.
 *
 * @param prompts - Prompts to merge, e.g. a namespace's own assembled `prompts()`.
 * @returns One entry per distinct `name`, in first-seen order.
 */
export function mergeByName(prompts: Prompt[]): Prompt[] {
  const groups = new Map<string, Prompt[]>();
  for (const prompt of prompts) {
    const group = groups.get(prompt.name);
    if (group) {
      group.push(prompt);
    } else {
      groups.set(prompt.name, [prompt]);
    }
  }

  return [...groups.values()].map(group =>
    group.length === 1
      ? group[0]
      : {
          ...group[0],
          includePrompt: anyOf(...group.map(p => p.includePrompt)),
        },
  );
}

/**
 * Translates a namespace's fully-assembled `Prompt[]` (see `registry/`'s
 * `promptsFor()`) into the `OptionSpec[]` shape, per this
 * project's decision to adapt into `OptionSpec` rather than replace it
 * outright. Same-name prompts are merged first (see `mergeByName()`).
 *
 * A `select` prompt's `choices` (a fixed list or a provider) is likewise
 * resolved eagerly against `context` and copied to the spec.
 *
 * Every spec carries its source `Prompt` (`source`), which the wizard
 * re-evaluates against the live answers at each step. `includePrompt` and
 * `provider` are also evaluated eagerly against `context`, for the
 * non-interactive path:
 * - A prompt whose `includePrompt` resolves `false` is left out of the
 *   result, unless `options.keepGated` is set: the wizard needs it to
 *   re-test the predicate once earlier answers change.
 * - `provider`'s resolved value becomes the spec's plain `default`, not
 *   `generateDefaultAsync` — `resolve()` (the non-interactive path) never
 *   reads that field, only a spec's static `default`.
 *
 * Prompts are evaluated in the order given, and order matters: each one's
 * `includePrompt`/`provider`/`choices` see `context.answers` layered with
 * the defaults resolved for the earlier *included* prompts, so a provider
 * can read an earlier prompt's default but never a later one's. A value
 * already in `context.answers` (a flag or config value) always wins over
 * the default. A prompt skipped by `includePrompt` contributes nothing, and
 * neither does a gated one kept by `keepGated`.
 *
 * @param prompts - The namespace's own assembled prompts (see `registry/`'s `promptsFor()`).
 * @param context - The answers/flags-given snapshot to evaluate `provider`/`includePrompt` against.
 * @param options - Behavior flags.
 * @param options.keepGated - Keep specs whose `includePrompt` is false on `context`, for the wizard to re-test.
 * @returns One `OptionSpec` per included prompt, after merging same-name entries.
 */
export async function promptsToOptionSpecs(
  prompts: Prompt[],
  context: PromptContext,
  options: { keepGated?: boolean } = {},
): Promise<OptionSpec[]> {
  const specs: OptionSpec[] = [];
  const answers = { ...context.answers };

  for (const prompt of mergeByName(prompts)) {
    if (!isSupportedKind(prompt.type)) {
      throw new Error(
        `promptsToOptionSpecs(): prompt '${prompt.name}' has unsupported type '${prompt.type}'`,
      );
    }

    const live: PromptContext = { ...context, answers: { ...answers } };
    const test: PredicateFn<PromptContext> = getComponent(
      prompt.includePrompt,
      'test',
    );
    const included = await test(live);
    if (!included && !options.keepGated) {
      continue;
    }

    const get: ProviderFn<unknown, PromptContext> = getComponent(
      prompt.provider,
      'get',
    );
    const value = await get(live);
    if (
      included &&
      value !== undefined &&
      !Object.hasOwn(answers, prompt.name)
    ) {
      answers[prompt.name] = value;
    }

    const spec: OptionSpec = {
      key: prompt.name,
      flag: flagFor(prompt, value),
      prompt: prompt.label,
      hint: prompt.hint,
      kind: prompt.type,
      source: prompt,
      default: value,
      required: prompt.required,
      capabilities: prompt.capabilities,
    };
    if (prompt.type === 'select') {
      spec.choices = await choicesFor(prompt, live);
    }
    if (prompt.type === 'list') {
      spec.repeatFlag = `--${singular(kebabCase(prompt.name))} <pkg>`;
      spec.repeatHelpText = `${prompt.label} (repeatable)`;
    }
    specs.push(spec);
  }

  return specs;
}
