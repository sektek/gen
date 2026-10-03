import type { OptionSpec } from '../../types/index.js';

export type RenderInputArgs = {
  spec: OptionSpec;
  textValue: string;
  setTextValue: (value: string) => void;
  advance: (value: unknown) => void;
  dynamicDefault: string | undefined;
  isPristine: boolean;
  resolving: boolean;
  error: string | undefined;
  prefix: string | undefined;
  prefixSuppressed: boolean;
  canRegenerate: boolean;
  onRegenerate: () => void;
  onClear: () => void;
  onGeneratedSubmit: (value: string) => void;
};
