import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import TextInput from 'ink-text-input';
import chalk from 'chalk';

import { isClearable, reloadableCapability } from '../wizard-steps.js';

import { GeneratedTextInput } from './generated-text-input.js';
import type { RenderInputArgs } from './types/index.js';

/**
 * A "Resolving…" line, a pre-filled/editable `GeneratedTextInput` row (for
 * a `reloadable`-capable or `generateDefaultAsync` spec), or a plain
 * `<TextInput>` row for any other `text` spec.
 *
 * @param args - The current step, plus the wizard-level state/callbacks it needs.
 * @param args.spec - The option spec currently being prompted for.
 * @param args.textValue - The text input's current (uncommitted) value.
 * @param args.setTextValue - Updates the text input's current value.
 * @param args.advance - Records the answered value and moves to the next step.
 * @param args.dynamicDefault - The current live-resolved default, if any.
 * @param args.isPristine - Whether the field still shows that default unedited.
 * @param args.resolving - Whether an async default is still resolving.
 * @param args.error - An inline validation error to show below the input, if any.
 * @param args.prefix - The project-name step's workspace/config prefix, if any.
 * @param args.prefixSuppressed - The project-name step's ctrl+x clear state.
 * @param args.canRegenerate - Whether ctrl+r currently regenerates.
 * @param args.onRegenerate - Requests a fresh value for a `reloadable`-capable spec.
 * @param args.onClear - Notifies a ctrl+x clear on the project-name step.
 * @param args.onGeneratedSubmit - Validates (project-name) or resolves a clear (`clearable`) before recording the answer.
 * @returns The prompt + input for this step.
 */
export function renderTextInput({
  spec,
  textValue,
  setTextValue,
  advance,
  dynamicDefault,
  isPristine,
  resolving,
  error,
  prefix,
  prefixSuppressed,
  canRegenerate,
  onRegenerate,
  onClear,
  onGeneratedSubmit,
}: RenderInputArgs): ReactNode {
  if (resolving) {
    return (
      <Box>
        <Text dimColor>{spec.prompt}: Resolving…</Text>
      </Box>
    );
  }

  const reload = reloadableCapability(spec);
  if (reload || spec.generateDefaultAsync) {
    return (
      <Box flexDirection="column">
        <Box>
          <Text>{spec.prompt}: </Text>
          <GeneratedTextInput
            value={textValue}
            isPristine={isPristine}
            dynamicDefault={dynamicDefault ?? ''}
            allowClear={isClearable(spec)}
            prefix={prefix}
            prefixSuppressed={prefixSuppressed}
            canRegenerate={canRegenerate}
            onClear={onClear}
            onChange={setTextValue}
            onRegenerate={onRegenerate}
            onSubmit={onGeneratedSubmit}
          />
        </Box>
        {error && <Text color="red">{error}</Text>}
      </Box>
    );
  }

  // Not <TextInput placeholder={defaultText}>: ink-text-input only
  // inverts a placeholder's own first character when it's the one
  // passed placeholder text — an unstyled default here reintroduces the
  // leading-space/misplaced-cursor bug from SEK-93.
  const defaultText =
    spec.default !== undefined ? String(spec.default) : undefined;
  const showGhost = textValue === '' && defaultText !== undefined;
  return (
    <Box>
      <Text>{spec.prompt}: </Text>
      <TextInput
        value={textValue}
        onChange={setTextValue}
        showCursor={!showGhost}
        onSubmit={value => advance(value === '' ? spec.default : value)}
      />
      {showGhost && (
        <Text>
          {defaultText.length > 0
            ? chalk.inverse(defaultText[0]) + chalk.dim(defaultText.slice(1))
            : chalk.inverse(' ')}
        </Text>
      )}
    </Box>
  );
}
