import { expect } from 'chai';

import {
  booleanSpec,
  selectSpec,
  selectSpecNoChoices,
  textSpec,
} from './fixtures.js';
import { choicesFor } from './choices-for.js';

describe('wizard-steps', function () {
  describe('choicesFor', function () {
    it('maps a select spec into label/value pairs', function () {
      expect(choicesFor(selectSpec)).to.deep.equal([
        { label: 'javascript', value: 'javascript' },
        { label: 'typescript', value: 'typescript' },
      ]);
    });

    it('returns a synthetic Yes/No choice list for a boolean spec', function () {
      expect(choicesFor(booleanSpec)).to.deep.equal([
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ]);
    });

    it('throws for a text spec', function () {
      expect(() => choicesFor(textSpec)).to.throw(/only supports/);
    });

    it('throws for a select spec with no choices', function () {
      expect(() => choicesFor(selectSpecNoChoices)).to.throw(/no choices/);
    });
  });
});
