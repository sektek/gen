export type GeneratedTextInputProps = {
  value: string;
  isPristine: boolean;
  dynamicDefault: string;
  // Whether ctrl+x clears the field to '' outright.
  allowClear: boolean;
  prefix: string | undefined;
  prefixSuppressed: boolean;
  // Wizard computes this to match its own hintsFor() call for the ^R hint.
  canRegenerate: boolean;
  onChange: (value: string) => void;
  onRegenerate: () => void;
  onClear: () => void;
  onSubmit: (value: string) => void;
};
