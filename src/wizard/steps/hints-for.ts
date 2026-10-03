import type { Hint } from '../types/index.js';
import type { OptionSpec } from '../../types/index.js';

import { isClearable } from './is-clearable.js';
import { reloadableCapability } from './reloadable-capability.js';

/**
 * The keybinding hints for the wizard's persistent status bar (see
 * wizard/status-bar.tsx's `StatusBar`): which keys do what for the current step, kept
 * separate from any inline validation error (which is about the specific
 * value just typed, not the step in general). `undefined` (no step left,
 * i.e. the wizard is about to finish) shows nothing.
 *
 * @param spec - The option spec currently being prompted for, if any.
 * @param isPristine - For a `reloadable`/`clearable`-capable spec (or one
 *   with `generateDefaultAsync`), whether its field still shows the
 *   resolved default unedited — `^X` (ctrl+x, see `isClearable`) only
 *   applies while true; ignored for every other spec kind.
 * @param canRegenerate - Whether ctrl+r currently regenerates — normally
 *   just `isPristine`, but the project-name step's prefix-aware clear also
 *   allows it on an empty, cleared field (see wizard/wizard.tsx's
 *   GeneratedTextInput). Defaults to `isPristine`.
 * @returns The hints to show in the status bar, in display order.
 */
export function hintsFor(
  spec: OptionSpec | undefined,
  isPristine = false,
  canRegenerate = isPristine,
): Hint[] {
  if (!spec) {
    return [];
  }

  if (spec.kind === 'select' || spec.kind === 'boolean') {
    return [
      { key: '↑↓', label: 'move' },
      { key: 'Enter', label: 'select' },
    ];
  }

  return [
    { key: 'Enter', label: 'confirm' },
    ...(reloadableCapability(spec) && canRegenerate
      ? [{ key: '^R', label: 'new name' }]
      : []),
    ...(isClearable(spec) && isPristine ? [{ key: '^X', label: 'clear' }] : []),
  ];
}
