import type { ReactNode } from 'react';

import type { RenderInputArgs } from './types/index.js';

/**
 * Defensive placeholder for `INPUT_RENDERERS`'s `'list'` entry — structurally
 * unreachable, since `pendingSpecs()` filters `'list'` specs out before the
 * wizard ever sees one, but registered anyway so the mapping stays total
 * over every `OptionKind` rather than partial.
 *
 * @param args - The current step.
 * @param args.spec - The option spec that reached this renderer.
 * @throws {Error} Always — reaching this function is a bug, not a real UI state.
 */
export function renderUnsupportedInput({ spec }: RenderInputArgs): ReactNode {
  throw new Error(
    `renderInput(): '${spec.kind}' specs are never prompted for interactively (see pendingSpecs()) — this should be unreachable.`,
  );
}
