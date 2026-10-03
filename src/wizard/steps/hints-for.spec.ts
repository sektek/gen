import { expect } from 'chai';

import type { OptionSpec } from '../../types/index.js';
import { PROJECT_NAME_KEY } from '../../project-name.js';

import { booleanSpec, selectSpec, textSpec } from './fixtures.js';
import { hintsFor } from './hints-for.js';

describe('wizard-steps', function () {
  describe('hintsFor', function () {
    const generatedTextSpec: OptionSpec = {
      ...textSpec,
      capabilities: [{ type: 'reloadable', provider: () => 'brave-otter' }],
    };
    const clearableAsyncTextSpec: OptionSpec = {
      ...textSpec,
      capabilities: [{ type: 'clearable' }],
      generateDefaultAsync: async () => 'acme',
    };

    it('returns nothing once every step is answered', function () {
      expect(hintsFor(undefined)).to.deep.equal([]);
    });

    it('shows Enter-to-confirm for a plain text spec', function () {
      expect(hintsFor(textSpec)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
      ]);
    });

    it('adds a ^R hint for a reloadable-capable text spec while pristine', function () {
      expect(hintsFor(generatedTextSpec, true)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
        { key: '^R', label: 'new name' },
      ]);
    });

    it('omits the ^R hint for a reloadable-capable text spec once edited', function () {
      expect(hintsFor(generatedTextSpec, false)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
      ]);
    });

    it('defaults to omitting the ^R hint when isPristine is not given', function () {
      expect(hintsFor(generatedTextSpec)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
      ]);
    });

    it('adds a ^X hint for a clearable-capable spec while pristine', function () {
      expect(hintsFor(clearableAsyncTextSpec, true)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
        { key: '^X', label: 'clear' },
      ]);
    });

    it('omits the ^X hint for a clearable-capable spec once edited', function () {
      expect(hintsFor(clearableAsyncTextSpec, false)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
      ]);
    });

    it('omits the ^X hint for a reloadable-only spec that does not allow clearing', function () {
      expect(hintsFor(generatedTextSpec, true)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
        { key: '^R', label: 'new name' },
      ]);
    });

    it('adds a ^X hint for the project-name step, which has no clearable capability of its own', function () {
      const projectNameSpec: OptionSpec = {
        ...textSpec,
        key: PROJECT_NAME_KEY,
        capabilities: [{ type: 'reloadable', provider: () => 'brave-otter' }],
      };
      expect(hintsFor(projectNameSpec, true)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
        { key: '^R', label: 'new name' },
        { key: '^X', label: 'clear' },
      ]);
    });

    it('shows the ^R hint via a separate canRegenerate argument, independent of isPristine', function () {
      expect(hintsFor(generatedTextSpec, false, true)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
        { key: '^R', label: 'new name' },
      ]);
    });

    it('shows move/select for a select spec', function () {
      expect(hintsFor(selectSpec)).to.deep.equal([
        { key: '↑↓', label: 'move' },
        { key: 'Enter', label: 'select' },
      ]);
    });

    it('shows move/select for a boolean spec', function () {
      expect(hintsFor(booleanSpec)).to.deep.equal([
        { key: '↑↓', label: 'move' },
        { key: 'Enter', label: 'select' },
      ]);
    });
  });
});
