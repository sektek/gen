import { expect } from 'chai';

import { explicitOptionKeysFromWizard } from './explicit-option-keys-from-wizard.js';

describe('wizard-steps', function () {
  describe('explicitOptionKeysFromWizard', function () {
    it('unions flagsGiven and answeredKeys, deduped', function () {
      expect(
        explicitOptionKeysFromWizard({ license: 'MIT' }, ['license', 'author']),
      ).to.deep.equal(['license', 'author']);
    });

    it('excludes a key only present because it was implied, not answered', function () {
      expect(explicitOptionKeysFromWizard({}, ['license'])).to.deep.equal([
        'license',
      ]);
    });

    it('returns nothing when neither flags nor live answers were given', function () {
      expect(explicitOptionKeysFromWizard({}, [])).to.deep.equal([]);
    });
  });
});
