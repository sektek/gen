import { expect } from 'chai';

import type { OptionSpec } from '../../types/index.js';

import { licenseImpliedAnswers } from './license-implied-answers.js';

describe('wizard-steps', function () {
  describe('licenseImpliedAnswers', function () {
    const licenseSpec: OptionSpec = {
      key: 'license',
      flag: '--license <value>',
      prompt: 'License',
      kind: 'text',
      default: 'UNLICENSED',
    };

    const privateSpec: OptionSpec = {
      key: 'private',
      flag: '--no-private',
      prompt: 'Private package?',
      kind: 'boolean',
      default: true,
    };

    const repoVisibilitySpec: OptionSpec = {
      key: 'repoVisibility',
      flag: '--repo-visibility <value>',
      prompt: 'Repo visibility',
      kind: 'select',
      choices: ['public', 'private'],
      default: 'private',
    };

    it('returns nothing when license is not UNLICENSED', function () {
      expect(
        licenseImpliedAnswers('MIT', [
          licenseSpec,
          privateSpec,
          repoVisibilitySpec,
        ]),
      ).to.deep.equal({});
    });

    it('implies private and repoVisibility when both keys are in schema', function () {
      expect(
        licenseImpliedAnswers('UNLICENSED', [
          licenseSpec,
          privateSpec,
          repoVisibilitySpec,
        ]),
      ).to.deep.equal({ private: true, repoVisibility: 'private' });
    });

    it('implies only repoVisibility for a base-only schema with no private key', function () {
      expect(
        licenseImpliedAnswers('UNLICENSED', [repoVisibilitySpec]),
      ).to.deep.equal({ repoVisibility: 'private' });
    });

    it('implies nothing when the schema has neither key', function () {
      expect(licenseImpliedAnswers('UNLICENSED', [licenseSpec])).to.deep.equal(
        {},
      );
    });
  });
});
