import { createElement } from 'react';
import { render } from 'ink';

import type {
  OptionSpec,
  RunWizardOptions,
  WizardResult,
} from './types/index.js';
import { Wizard } from './wizard/index.js';
import { WizardCancelledError } from './wizard-cancelled-error.js';
import { listenForCancelSignals } from './cancel-signals.js';
import { withConfigDefaults } from './with-config-defaults.js';

// Plain .ts, not .tsx: this file has no JSX syntax of its own (createElement
// instead), so it doesn't need the tsx parser — only wizard.tsx does.

/**
 * Bridges ink's component/callback model into async/await: mounts the
 * wizard, resolves once every remaining step is answered, then unmounts.
 *
 * @param specs - The namespace's prompt-derived specs, gated ones included (see `promptSpecsFor()`), asked in order.
 * @param seed - Option values already supplied via CLI flags, pre-filled/skipped by the wizard.
 * @param configDefaults - Values resolved via `resolveConfigDefaults()`; pre-fill the same way `spec.default` does, but never skip a step the way `seed` does.
 * @param options - Whatever the wizard needs beyond the specs (e.g. `destCwd`, `promptContext`).
 * @returns The fully-resolved answers, plus which keys were actually
 *   prompted for and answered live (see `Wizard`'s own `onComplete` doc).
 * @throws {WizardCancelledError} If the user cancels before completing, via
 *   ctrl+c (`SIGINT`), `SIGTERM` or `SIGHUP`.
 */
export function runWizard(
  specs: OptionSpec[],
  seed: Record<string, unknown> = {},
  configDefaults: Record<string, unknown> = {},
  options: RunWizardOptions = {},
): Promise<WizardResult> {
  const { destCwd, promptContext, renderApp = render } = options;
  return new Promise((resolve, reject) => {
    let stopListening = () => {};
    let finished = false;

    const cancel = (signal: NodeJS.Signals) => {
      if (finished) {
        return;
      }
      finished = true;
      stopListening();
      unmount();
      reject(new WizardCancelledError(signal));
    };

    const { unmount } = renderApp(
      createElement(Wizard, {
        schema: withConfigDefaults(specs, configDefaults),
        seed,
        destCwd,
        promptContext,
        onComplete: (answers, answeredKeys) => {
          if (finished) {
            return;
          }
          finished = true;
          stopListening();
          unmount();
          resolve({ answers, answeredKeys });
        },
        onCancel: () => cancel('SIGINT'),
      }),
      { exitOnCtrlC: false },
    );
    stopListening = listenForCancelSignals(cancel);
  });
}
