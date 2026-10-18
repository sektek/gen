import { expect } from 'chai';

import { mergeAnswer } from './merge-answer.js';

describe('wizard-steps', function () {
  describe('mergeAnswer', function () {
    it('records an answer alongside the earlier ones', function () {
      expect(
        mergeAnswer({ language: 'typescript' }, 'license', 'MIT'),
      ).to.deep.equal({ language: 'typescript', license: 'MIT' });
    });

    it('lets the value just given replace an earlier answer for the key', function () {
      expect(mergeAnswer({ private: true }, 'private', false)).to.deep.equal({
        private: false,
      });
    });
  });
});
