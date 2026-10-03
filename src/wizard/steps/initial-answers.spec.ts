import { expect } from 'chai';

import type { OptionSpec } from '../../types/index.js';

import { githubSchema } from './fixtures.js';
import { initialAnswers } from './initial-answers.js';

describe('wizard-steps', function () {
  describe('initialAnswers', function () {
    const jsSchema: OptionSpec[] = [
      {
        key: 'license',
        flag: '--license <value>',
        prompt: 'License',
        kind: 'text',
        default: 'UNLICENSED',
      },
      {
        key: 'private',
        flag: '--no-private',
        prompt: 'Private package?',
        kind: 'boolean',
        default: true,
      },
      {
        key: 'repoVisibility',
        flag: '--repo-visibility <value>',
        prompt: 'Repo visibility',
        kind: 'select',
        choices: ['public', 'private'],
        default: 'private',
      },
    ];

    it('fills in nothing extra when license is not seeded as UNLICENSED', function () {
      expect(initialAnswers({}, jsSchema)).to.deep.equal({});
    });

    it('fills in the implied answers when license is seeded as UNLICENSED', function () {
      expect(initialAnswers({ license: 'UNLICENSED' }, jsSchema)).to.deep.equal(
        {
          license: 'UNLICENSED',
          private: true,
          repoVisibility: 'private',
        },
      );
    });

    it('lets an explicit conflicting seed value win over the implied one', function () {
      // Regression: seed must survive so applyLicenseImplications() can
      // still see (and warn about) the conflict downstream, instead of it
      // looking like `private` was already true all along.
      expect(
        initialAnswers({ license: 'UNLICENSED', private: false }, jsSchema),
      ).to.deep.equal({
        license: 'UNLICENSED',
        private: false,
        repoVisibility: 'private',
      });
    });

    it('fills in the implied answers when createRepo is seeded as false', function () {
      expect(initialAnswers({ createRepo: false }, githubSchema)).to.deep.equal(
        {
          createRepo: false,
          repoVisibility: 'private',
          repoOwner: undefined,
          githubToken: undefined,
          push: true,
        },
      );
    });

    it('fills in the whole github block when gitInit is seeded as false', function () {
      // SEK-89: declining gitInit skips createRepo's own question too, not
      // just the details behind it.
      expect(initialAnswers({ gitInit: false }, githubSchema)).to.deep.equal({
        gitInit: false,
        createRepo: false,
        repoVisibility: 'private',
        repoOwner: undefined,
        githubToken: undefined,
        push: true,
      });
    });

    it('leaves the github block untouched when neither gitInit nor createRepo is seeded false', function () {
      expect(initialAnswers({}, githubSchema)).to.deep.equal({});
    });
  });
});
