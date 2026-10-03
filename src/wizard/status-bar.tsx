import { Box, Text } from 'ink';

import type { Hint } from '../types/index.js';

/**
 * The persistent hint bar rendered below the current step's input: a
 * full-width rule (via a top-only border, so it reads as a separator
 * rather than boxing the hints in), an optional one-line description of
 * what the step is asking (`spec.hint` — see `schema.ts`'s `OptionSpec`
 * doc), then each keybinding hint as `key label`, dim so it doesn't
 * compete with the prompt above it. Renders nothing once there's neither a
 * description nor any hints (see `hintsFor()` — only when there's no step
 * left).
 *
 * @param props - The description/hints to show.
 * @param props.hint - The current step's own short description, if it has one.
 * @param props.hints - The keybinding hints for the current step, in display order.
 * @returns The rendered status bar, or `null` when there's nothing to show.
 */
export function StatusBar({ hint, hints }: { hint?: string; hints: Hint[] }) {
  if (!hint && hints.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      width="100%"
      borderStyle="single"
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
      borderDimColor>
      {hint && <Text dimColor>{hint}</Text>}
      {hints.length > 0 && (
        <Text dimColor>
          {hints.map((item, index) => (
            <Text key={item.key}>
              {index > 0 && '   '}
              <Text bold>{item.key}</Text> {item.label}
            </Text>
          ))}
        </Text>
      )}
    </Box>
  );
}
