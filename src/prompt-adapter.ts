import {
  type PredicateFn,
  type ProviderFn,
  anyOf,
  getComponent,
} from '@sektek/utility-belt';
import type { Prompt, PromptContext } from '@sektek/generator';
import { kebabCase } from 'lodash-es';

import { type OptionKind, type OptionSpec } from './schema.js';

const OPTION_KINDS: readonly OptionKind[] = [
  'text',
  'boolean',
  'select',
  'list',
];

function isOptionKind(type: string): type is OptionKind {
  return (OPTION_KINDS as readonly string[]).includes(type);
}

// A boolean prompt's flag takes no <value> placeholder (matching e.g.
// GITHUB_OPTIONS's '--create-repo'); every other kind does. This doesn't
// attempt schema.ts's other convention, a defaults-true boolean spelled as
// '--no-<x>' (e.g. '--no-git-init') - that needs knowing the prompt's
// resolved default is `true`, which isn't yet available at this point for
// every caller, and neither of SEK-106's two proven-case migrations (a
// text prompt, and prompts already gated via includePrompt rather than
// given a fresh flag) actually needs it.
function flagFor(prompt: Prompt): string {
  const kebab = kebabCase(prompt.name);
  return prompt.type === 'boolean' ? `--${kebab}` : `--${kebab} <value>`;
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
    const test: PredicateFn<PromptContext> = getComponent(
      prompt.includePrompt,
      'test',
    );
    if (!(await test(context))) {
      continue;
    }

    if (!isOptionKind(prompt.type)) {
      throw new Error(
        `promptsToOptionSpecs(): prompt '${prompt.name}' has unsupported type '${prompt.type}'`,
      );
    }

    const get: ProviderFn<unknown, PromptContext> = getComponent(
      prompt.provider,
      'get',
    );

    specs.push({
      key: prompt.name,
      flag: flagFor(prompt),
      prompt: prompt.label,
      helpText: prompt.hint,
      kind: prompt.type,
      default: await get(context),
    });
  }

  return specs;
}
