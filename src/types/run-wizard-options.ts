import type { PromptContext } from '@sektek/generator';
import type { render } from 'ink';

export type RunWizardOptions = {
  // Required whenever the specs include the project-name step, for
  // validating a candidate name against the filesystem — see wizard/wizard.tsx's
  // `destCwd` prop.
  destCwd?: string;
  promptContext?: Pick<PromptContext, 'configDefaults' | 'workspace'>;
  // Replaces ink's render(); lets tests drive the wizard without a TTY.
  renderApp?: typeof render;
};
