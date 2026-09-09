import { createElement } from 'react';
import { render } from 'ink';

import { schemaFor, withConfigDefaults } from './schema.js';
import { Wizard } from './wizard.js';

// Plain .ts, not .tsx: this file has no JSX syntax of its own (createElement
// instead), so it doesn't need the tsx parser — only wizard.tsx does.

export type WizardResult = {
  answers: Record<string, unknown>;
  answeredKeys: string[];
};

/**
 * Bridges ink's component/callback model into async/await: mounts the
 * wizard, resolves once every remaining step is answered, then unmounts.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param seed - Option values already supplied via CLI flags, pre-filled/skipped by the wizard.
 * @param configDefaults - Values resolved via `resolveConfigDefaults()`; pre-fill the same way `spec.default` does, but never skip a step the way `seed` does.
 * @returns The fully-resolved answers, plus which keys were actually
 *   prompted for and answered live (see `Wizard`'s own `onComplete` doc).
 */
export function runWizard(
  namespace: string,
  seed: Record<string, unknown> = {},
  configDefaults: Record<string, unknown> = {},
): Promise<WizardResult> {
  return new Promise(resolve => {
    const { unmount } = render(
      createElement(Wizard, {
        schema: withConfigDefaults(schemaFor(namespace), configDefaults),
        seed,
        onComplete: (answers, answeredKeys) => {
          unmount();
          resolve({ answers, answeredKeys });
        },
      }),
    );
  });
}
