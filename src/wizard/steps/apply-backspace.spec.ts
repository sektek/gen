import { expect } from 'chai';

import { applyBackspace } from './apply-backspace.js';

describe('wizard-steps', function () {
  describe('applyBackspace', function () {
    it('clears a pristine value outright, regardless of cursor position', function () {
      expect(
        applyBackspace('brave-otter', 5, true, 'brave-otter'),
      ).to.deep.equal({
        value: '',
        cursorOffset: 0,
      });
    });

    it('removes the character before the cursor when not pristine', function () {
      expect(
        applyBackspace('brave-otter', 5, false, 'brave-otter'),
      ).to.deep.equal({ value: 'brav-otter', cursorOffset: 4 });
    });

    it('is a no-op at the start of the field when not pristine', function () {
      expect(
        applyBackspace('brave-otter', 0, false, 'brave-otter'),
      ).to.deep.equal({ value: 'brave-otter', cursorOffset: 0 });
    });

    it("restores the suggested default (cursor at the start) once the user's own text is erased to nothing", function () {
      expect(applyBackspace('x', 1, false, 'brave-otter')).to.deep.equal({
        value: 'brave-otter',
        cursorOffset: 0,
      });
    });
  });
});
