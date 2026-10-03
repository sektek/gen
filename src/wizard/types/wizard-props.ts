import type { PromptContext } from '@sektek/generator';

import type { OptionSpec } from '../../types/index.js';

export type WizardProps = {
  schema: OptionSpec[];
  seed: Record<string, unknown>;
  onComplete: (
    answers: Record<string, unknown>,
    answeredKeys: string[],
  ) => void;
  // Only needed when `schema` includes a spec with `generateDefault` (the
  // project-name step the cli directory adds ahead of the namespace's own schema) —
  // the directory that name would be created under, for projectNameError()'s
  // local collision check. Unused by every other spec kind.
  destCwd?: string;
  promptContext?: Pick<PromptContext, 'configDefaults' | 'workspace'>;
};
