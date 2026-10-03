import { expect } from 'chai';

import type { OptionSpec } from '../../types/index.js';

import { clearableCapability } from './clearable-capability.js';
import { reloadableCapability } from './reloadable-capability.js';
import { textSpec } from './fixtures.js';

describe('wizard-steps', function () {
  describe('reloadableCapability/clearableCapability', function () {
    it('finds a reloadable capability among others', function () {
      const spec: OptionSpec = {
        ...textSpec,
        capabilities: [
          { type: 'clearable' },
          { type: 'reloadable', provider: () => 'x' },
        ],
      };

      expect(reloadableCapability(spec)?.type).to.equal('reloadable');
    });

    it('finds a clearable capability among others', function () {
      const spec: OptionSpec = {
        ...textSpec,
        capabilities: [
          { type: 'reloadable', provider: () => 'x' },
          { type: 'clearable', value: 'fallback' },
        ],
      };

      expect(clearableCapability(spec)).to.deep.equal({
        type: 'clearable',
        value: 'fallback',
      });
    });

    it('returns undefined when the spec has no capabilities at all', function () {
      expect(reloadableCapability(textSpec)).to.be.undefined;
      expect(clearableCapability(textSpec)).to.be.undefined;
    });

    it("returns undefined when the spec's capabilities don't include the requested type", function () {
      const spec: OptionSpec = {
        ...textSpec,
        capabilities: [{ type: 'clearable' }],
      };

      expect(reloadableCapability(spec)).to.be.undefined;
    });
  });
});
