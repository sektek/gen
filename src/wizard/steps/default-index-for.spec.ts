import { expect } from 'chai';

import {
  booleanSpec,
  booleanSpecDefaultFalse,
  selectSpec,
  selectSpecDefaultSecond,
  textSpec,
} from './fixtures.js';
import { choicesFor } from './choices-for.js';
import { defaultIndexFor } from './default-index-for.js';

describe('wizard-steps', function () {
  describe('defaultIndexFor', function () {
    it('finds a select default that is not the first choice', function () {
      const choices = choicesFor(selectSpecDefaultSecond);
      expect(defaultIndexFor(selectSpecDefaultSecond, choices)).to.equal(1);
    });

    it('finds a boolean default of false (the second choice)', function () {
      const choices = choicesFor(booleanSpecDefaultFalse);
      expect(defaultIndexFor(booleanSpecDefaultFalse, choices)).to.equal(1);
    });

    it('finds a boolean default of true (the first choice)', function () {
      const choices = choicesFor(booleanSpec);
      expect(defaultIndexFor(booleanSpec, choices)).to.equal(0);
    });

    it('falls back to 0 when the spec has no default', function () {
      expect(defaultIndexFor(textSpec, [])).to.equal(0);
    });

    it("falls back to 0 when the default doesn't match any choice", function () {
      const choices = choicesFor(selectSpec);
      const specWithUnknownDefault = { ...selectSpec, default: 'rust' };
      expect(defaultIndexFor(specWithUnknownDefault, choices)).to.equal(0);
    });
  });
});
