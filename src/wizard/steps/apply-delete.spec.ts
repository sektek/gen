import { expect } from 'chai';

import { applyDelete } from './apply-delete.js';

describe('wizard-steps', function () {
  describe('applyDelete', function () {
    it('clears a pristine value outright, regardless of cursor position', function () {
      expect(applyDelete('brave-otter', 5, true, 'brave-otter')).to.deep.equal({
        value: '',
        cursorOffset: 0,
      });
    });

    it('removes the character at the cursor when not pristine', function () {
      expect(applyDelete('brave-otter', 5, false, 'brave-otter')).to.deep.equal(
        { value: 'braveotter', cursorOffset: 5 },
      );
    });

    it('removes the first character with the cursor at the start', function () {
      expect(applyDelete('brave-otter', 0, false, 'brave-otter')).to.deep.equal(
        { value: 'rave-otter', cursorOffset: 0 },
      );
    });

    it('is a no-op at the end of the value when not pristine', function () {
      expect(
        applyDelete('brave-otter', 11, false, 'brave-otter'),
      ).to.deep.equal({ value: 'brave-otter', cursorOffset: 11 });
    });

    it("restores the suggested default (cursor at the start) once the user's own text is erased to nothing", function () {
      expect(applyDelete('x', 0, false, 'brave-otter')).to.deep.equal({
        value: 'brave-otter',
        cursorOffset: 0,
      });
    });

    it('restores an empty value when the restore target is empty', function () {
      expect(applyDelete('x', 0, false, '')).to.deep.equal({
        value: '',
        cursorOffset: 0,
      });
    });
  });
});
