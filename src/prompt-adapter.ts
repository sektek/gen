import {
  type PredicateFn,
  type ProviderFn,
  anyOf,
  getComponent,
} from '@sektek/utility-belt';
import type { Prompt, PromptContext } from '@sektek/generator';
import { kebabCase } from 'lodash-es';

import { type OptionKind, type OptionSpec } from './schema.js';

// `Prompt` has no `choices` field (yet), so a 'select' kind can't actually
// be represented — the resulting OptionSpec would have no `choices`, and
// wizard-steps.ts's choicesFor() throws the moment such a spec reaches the
// wizard. 'list' specs are never prompted for interactively either way
// (see pendingSpecs()), so neither kind is reachable/supported through
// this adapter today; only 'text'/'boolean' (every real Prompt in this
// workspace uses one of these two) are accepted, rather than silently
// producing an unusable spec for the other two.
const SUPPORTED_KINDS: readonly OptionKind[] = ['text', 'boolean'];

function isSupportedKind(type: string): type is OptionKind {
  return (SUPPORTED_KINDS as readonly string[]).includes(type);
}

// A boolean prompt whose resolved default is true needs the negated
// '--no-<x>' form (matching schema.ts's own convention, e.g. GIT_OPTIONS's
// '--no-git-init') — Commander gives a bare positive flag no way to set
// the value back to false. Every other case (a false-default boolean, or
// any other kind) uses the plain form.
function flagFor(prompt: Prompt, resolvedDefault: unknown): string {
  const kebab = kebabCase(prompt.name);
  if (prompt.type !== 'boolean') {
    return `--${kebab} <value>`;
  }
  return resolvedDefault === true ? `--no-${kebab}` : `--${kebab}`;
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
 * Translates a namespace's fully-assembled `Prompt[]` (see `registry.ts`'s
 * `promptsFor()`) into `schema.ts`'s `OptionSpec[]` shape, per this
 * project's decision to adapt into `OptionSpec` rather than replace it
 * outright. Same-name prompts are merged first (see `mergeByName()`).
 *
 * Both `includePrompt` and `provider` are evaluated eagerly against
 * `context`, the same way `cli.ts`'s own `packageScopeExtraSpecs()` already
 * resolves a dynamic default outside the wizard:
 * - A prompt whose `includePrompt` resolves `false` is left out of the
 *   result entirely, rather than carried forward as some live/deferred
 *   field — `OptionSpec` has no such field, and nothing downstream
 *   re-evaluates one per wizard step yet (that wiring is SEK-106's job).
 * - `provider`'s resolved value becomes the spec's plain `default`, not
 *   `generateDefaultAsync` — `resolve()` (the non-interactive path) never
 *   reads that field, only a spec's static `default` (see
 *   `packageScopeExtraSpecs()`'s own comment on the same tradeoff).
 *
 * @param prompts - The namespace's own assembled prompts (see `registry.ts`'s `promptsFor()`).
 * @param context - The answers/flags-given snapshot to evaluate `provider`/`includePrompt` against.
 * @returns One `OptionSpec` per included prompt, after merging same-name entries.
 */
export async function promptsToOptionSpecs(
  prompts: Prompt[],
  context: PromptContext,
): Promise<OptionSpec[]> {
  const specs: OptionSpec[] = [];

  for (const prompt of mergeByName(prompts)) {
    if (!isSupportedKind(prompt.type)) {
      throw new Error(
        `promptsToOptionSpecs(): prompt '${prompt.name}' has unsupported type '${prompt.type}'`,
      );
    }

    const test: PredicateFn<PromptContext> = getComponent(
      prompt.includePrompt,
      'test',
    );
    if (!(await test(context))) {
      continue;
    }

    const get: ProviderFn<unknown, PromptContext> = getComponent(
      prompt.provider,
      'get',
    );
    const value = await get(context);

    specs.push({
      key: prompt.name,
      flag: flagFor(prompt, value),
      prompt: prompt.label,
      hint: prompt.hint,
      kind: prompt.type,
      default: value,
      capabilities: prompt.capabilities,
    });
  }

  return specs;
}
