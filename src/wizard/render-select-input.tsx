import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import SelectInput from 'ink-select-input';

import { choicesFor, defaultIndexFor } from './steps/index.js';
import type { RenderInputArgs } from './types/index.js';

/**
 * The prompt label above a `<SelectInput>` — shared by `select` and
 * `boolean` (a synthetic Yes/No choice list, see `choicesFor()`).
 *
 * @param args - The current step, plus the wizard-level state/callbacks it needs.
 * @param args.spec - The option spec currently being prompted for.
 * @param args.advance - Records the answered value and moves to the next step.
 * @returns The prompt + select list for this step.
 */
export function renderSelectInput({
  spec,
  advance,
}: RenderInputArgs): ReactNode {
  const choices = choicesFor(spec);
  return (
    <Box flexDirection="column">
      <Text>{spec.prompt}</Text>
      <SelectInput
        items={choices}
        initialIndex={defaultIndexFor(spec, choices)}
        onSelect={item => advance(item.value)}
      />
    </Box>
  );
}
