import { expect } from 'chai';

import { choicesFor, defaultIndexFor, pendingSpecs } from './wizard-steps.js';
import type { OptionSpec } from './schema.js';

const textSpec: OptionSpec = {
  key: 'description',
  flag: '--description <value>',
  prompt: 'Project description',
  kind: 'text',
};

const selectSpec: OptionSpec = {
  key: 'language',
  flag: '--language <value>',
  prompt: 'Language',
  kind: 'select',
  choices: ['javascript', 'typescript'],
  default: 'javascript',
};

const booleanSpec: OptionSpec = {
  key: 'private',
  flag: '--no-private',
  prompt: 'Private package?',
  kind: 'boolean',
  default: true,
};

// Default is deliberately not the first choice, to exercise
// defaultIndexFor() actually finding it rather than always landing on 0.
const selectSpecDefaultSecond: OptionSpec = {
  key: 'runtime',
  flag: '--runtime <value>',
  prompt: 'Runtime',
  kind: 'select',
  choices: ['node', 'deno'],
  default: 'deno',
};

const booleanSpecDefaultFalse: OptionSpec = {
  key: 'verbose',
  flag: '--verbose',
  prompt: 'Verbose output?',
  kind: 'boolean',
  default: false,
};

const selectSpecNoChoices: OptionSpec = {
  key: 'target',
  flag: '--target <value>',
  prompt: 'Target',
  kind: 'select',
};

describe('wizard-steps', function () {
  describe('pendingSpecs', function () {
    it('returns every spec when seed is empty', function () {
      expect(pendingSpecs([textSpec, selectSpec], {})).to.deep.equal([
        textSpec,
        selectSpec,
      ]);
    });

    it('skips a spec whose key is already in seed', function () {
      expect(
        pendingSpecs([textSpec, selectSpec], { description: 'already set' }),
      ).to.deep.equal([selectSpec]);
    });

    it('does not skip a spec seeded with undefined', function () {
      expect(
        pendingSpecs([textSpec], { description: undefined }),
      ).to.deep.equal([textSpec]);
    });
  });

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
