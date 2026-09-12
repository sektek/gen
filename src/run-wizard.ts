import { createElement } from 'react';
import { render } from 'ink';

import { type OptionSpec, schemaFor, withConfigDefaults } from './schema.js';
import { Wizard } from './wizard.js';

// Plain .ts, not .tsx: this file has no JSX syntax of its own (createElement
// instead), so it doesn't need the tsx parser — only wizard.tsx does.

export type WizardResult = {
  answers: Record<string, unknown>;
  answeredKeys: string[];
};

export type RunWizardOptions = {
  // Prepended ahead of the namespace's own schema — used by cli.ts for the
  // project-name step, which isn't part of any namespace's schema (it picks
  // the destination directory's name, not a generator option).
  leadingSpecs?: OptionSpec[];
  // Required whenever `leadingSpecs` includes a `generateDefault` spec, for
  // validating a candidate name against the filesystem — see wizard.tsx's
  // `destCwd` prop.
  destCwd?: string;
};

/**
 * Bridges ink's component/callback model into async/await: mounts the
 * wizard, resolves once every remaining step is answered, then unmounts.
 *
 * @param namespace - The generator namespace being run (e.g. `@sektek/js:app`).
 * @param seed - Option values already supplied via CLI flags, pre-filled/skipped by the wizard.
 * @param configDefaults - Values resolved via `resolveConfigDefaults()`; pre-fill the same way `spec.default` does, but never skip a step the way `seed` does.
 * @param options - Extra specs to run ahead of the namespace's schema, plus whatever they need (e.g. `destCwd`).
 * @returns The fully-resolved answers, plus which keys were actually
 *   prompted for and answered live (see `Wizard`'s own `onComplete` doc).
 */
export function runWizard(
  namespace: string,
  seed: Record<string, unknown> = {},
  configDefaults: Record<string, unknown> = {},
  options: RunWizardOptions = {},
): Promise<WizardResult> {
  const { leadingSpecs = [], destCwd } = options;
  return new Promise(resolve => {
    const { unmount } = render(
      createElement(Wizard, {
        schema: [
          ...leadingSpecs,
          ...withConfigDefaults(schemaFor(namespace), configDefaults),
        ],
        seed,
        destCwd,
        onComplete: (answers, answeredKeys) => {
          unmount();
          resolve({ answers, answeredKeys });
        },
      }),
    );
  });
}
