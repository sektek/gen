import type { PromptContext } from '@sektek/generator';
import type { render } from 'ink';

import type { OptionSpec } from './option-spec.js';

export type RunWizardOptions = {
  // Prompt-sourced specs (see prompt-adapter.ts) that schema.ts doesn't
  // cover, asked ahead of the namespace's own schema.
  leadingSpecs?: OptionSpec[];
  // Required whenever `leadingSpecs` includes the project-name step, for
  // validating a candidate name against the filesystem — see wizard/wizard.tsx's
  // `destCwd` prop.
  destCwd?: string;
  promptContext?: Pick<PromptContext, 'configDefaults' | 'workspace'>;
  // Replaces ink's render(); lets tests drive the wizard without a TTY.
  renderApp?: typeof render;
};
