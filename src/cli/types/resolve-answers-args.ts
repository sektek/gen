import type { PromptContext } from '@sektek/generator';

import type { OptionSpec } from '../../types/option-spec.js';

export type ResolveAnswersArgs = {
  namespace: string;
  flagsGiven: Record<string, unknown>;
  configDefaults: Record<string, unknown>;
  interactive: boolean;
  promptSpecs: OptionSpec[];
  promptContext: Pick<PromptContext, 'configDefaults' | 'workspace'>;
  destCwd: string;
};
