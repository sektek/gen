import type { PromptCapability } from '@sektek/generator';

import type { OptionKind } from './option-kind.js';

/** A generator option's shape, independent of any one generator: how to ask for it (wizard/CLI) and how to resolve its value. */
export type OptionSpec = {
  /** The generator answer key this spec resolves. */
  key: string;
  /** The commander flag, e.g. `--language <value>`. */
  flag: string;
  /**
   * 'list' kind only: a repeatable flag contributing to the same `key` as
   * `flag`'s comma-delimited value; both may be given together and their
   * values concatenate. See options.ts's `flagsGivenFor()`.
   */
  repeatFlag?: string;
  /** The wizard's prompt text. */
  prompt: string;
  /** Shown by `--help` instead of `prompt`. Falls back to `prompt`. */
  helpText?: string;
  /**
   * 'list' kind only: --help text for `repeatFlag` specifically. Falls
   * back to `helpText ?? prompt`.
   */
  repeatHelpText?: string;
  /**
   * Shown in the wizard's status bar; distinct from `helpText` (CLI --help
   * only, never reaches the wizard). Mirrors `@sektek/generator`'s `Prompt.hint`.
   */
  hint?: string;
  /** The spec's value shape/UI. */
  kind: OptionKind;
  /** 'select' kind only: the choices to present. */
  choices?: readonly string[];
  /** The pre-resolved default value, if any. */
  default?: unknown;
  /** Whether `resolve()` should throw if this key is still unanswered. */
  required?: boolean;
  /**
   * Opt-in wizard behaviors, 'text' specs only. `reloadable` pre-fills the
   * input with the resolved `provider` value as editable text and lets
   * ctrl+r regenerate it; `clearable` lets ctrl+x blank the field to the
   * capability's own `value` (default undefined). Mirrors
   * `@sektek/generator`'s `Prompt.capabilities`.
   */
  capabilities?: PromptCapability[];
  /**
   * 'text' specs only: an async default depending on the answers collected
   * so far, resolved once (no ctrl+r). `resolve()` (the non-interactive
   * path) has its own equivalent — see `cli/resolve-answers.ts`.
   */
  generateDefaultAsync?: (answers: Record<string, unknown>) => Promise<string>;
};
