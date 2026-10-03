import type { OptionKind } from '../types/index.js';

import type { InputRenderer } from './types/index.js';
import { renderSelectInput } from './render-select-input.js';
import { renderTextInput } from './render-text-input.js';
import { renderUnsupportedInput } from './render-unsupported-input.js';

// gen's own closed, fixed mapping from an OptionSpec's kind to the Ink
// component that renders it — every prompt type the wizard can show, in
// one place, rather than a growing if/else chain (see the project's
// "component-type ownership" decision: gen owns this, libs/generator's
// prompt definitions stay free of any Ink/React dependency). 'list' specs
// are never actually reached here (pendingSpecs() filters them out before
// the wizard ever sees one) but are still registered, for a total mapping
// over every OptionKind rather than a partial one.
export const INPUT_RENDERERS: Record<OptionKind, InputRenderer> = {
  text: renderTextInput,
  boolean: renderSelectInput,
  select: renderSelectInput,
  list: renderUnsupportedInput,
};
