import { expect } from 'chai';

import type { OptionSpec } from '../../types/index.js';
import { PROJECT_NAME_KEY } from '../../project-name.js';

import { isClearable } from './is-clearable.js';
import { textSpec } from './fixtures.js';

describe('wizard-steps', function () {
  describe('isClearable', function () {
    it('is true for a spec with a clearable capability', function () {
      const spec: OptionSpec = {
        ...textSpec,
        capabilities: [{ type: 'clearable' }],
      };
      expect(isClearable(spec)).to.be.true;
    });

    it('is true for the project-name step even with no clearable capability', function () {
      const spec: OptionSpec = {
        ...textSpec,
        key: PROJECT_NAME_KEY,
        capabilities: [{ type: 'reloadable', provider: () => 'brave-otter' }],
      };
      expect(isClearable(spec)).to.be.true;
    });

    it('is false for a plain spec with neither', function () {
      expect(isClearable(textSpec)).to.be.false;
    });
  });
});
