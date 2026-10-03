import type { ReactNode } from 'react';

import { INPUT_RENDERERS } from './input-renderers.js';
import type { RenderInputArgs } from './types/index.js';

/**
 * Renders the prompt label plus input for the current step, dispatching on
 * `spec.kind` via `INPUT_RENDERERS`.
 *
 * @param args - The current step, plus the wizard-level state/callbacks it needs.
 * @param args.spec - The option spec currently being prompted for.
 * @param args.textValue - The text input's current (uncommitted) value.
 * @param args.setTextValue - Updates the text input's current value.
 * @param args.advance - Records the answered value and moves to the next step.
 * @param args.dynamicDefault - The current live-resolved default, if any.
 * @param args.isPristine - Whether such a spec's field still shows that default unedited.
 * @param args.resolving - Whether an async default is still resolving.
 * @param args.error - An inline validation error to show below the project-name step's input, if any.
 * @param args.prefix - The project-name step's workspace/config prefix, if any.
 * @param args.prefixSuppressed - The project-name step's ctrl+x clear state.
 * @param args.canRegenerate - Whether ctrl+r currently regenerates.
 * @param args.onRegenerate - Requests a fresh value for a `reloadable`-capable spec.
 * @param args.onClear - Notifies a ctrl+x clear on the project-name step.
 * @param args.onGeneratedSubmit - Validates (project-name) or resolves a clear (`clearable`) before recording a `reloadable`/`generateDefaultAsync` spec's answer.
 * @returns The prompt + input for this step.
 */
export function renderInput(args: RenderInputArgs): ReactNode {
  return INPUT_RENDERERS[args.spec.kind](args);
}
