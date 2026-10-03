import { expect } from 'chai';

import { applyTypedInput } from './apply-typed-input.js';

describe('wizard-steps', function () {
  describe('applyTypedInput', function () {
    it('replaces a pristine value outright with just what was typed', function () {
      expect(applyTypedInput('brave-otter', 5, true, 'x')).to.deep.equal({
        value: 'x',
        cursorOffset: 1,
      });
    });

    it('inserts at the cursor when not pristine', function () {
      expect(applyTypedInput('brave-otter', 5, false, 'x')).to.deep.equal({
        value: 'bravex-otter',
        cursorOffset: 6,
      });
    });
  });
});
