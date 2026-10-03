import { expect } from 'chai';

import type { OptionSpec } from '../../types/index.js';

import { githubSchema } from './fixtures.js';
import { mergeAnswer } from './merge-answer.js';

describe('wizard-steps', function () {
  describe('mergeAnswer', function () {
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
    ];

    it('records a non-license answer as-is', function () {
      expect(mergeAnswer({}, 'language', 'typescript', jsSchema)).to.deep.equal(
        { language: 'typescript' },
      );
    });

    it('fills in implied answers when license is answered as UNLICENSED', function () {
      expect(mergeAnswer({}, 'license', 'UNLICENSED', jsSchema)).to.deep.equal({
        license: 'UNLICENSED',
        private: true,
      });
    });

    it('lets an already-known answer win over what license implies', function () {
      // Regression: if `private` was already seeded/answered before the
      // wizard reaches `license`, answering license as UNLICENSED must not
      // silently overwrite it — the conflict needs to survive for
      // applyLicenseImplications() to report.
      expect(
        mergeAnswer({ private: false }, 'license', 'UNLICENSED', jsSchema),
      ).to.deep.equal({ license: 'UNLICENSED', private: false });
    });

    it('fills in the remaining github-detail answers when createRepo is answered false', function () {
      expect(mergeAnswer({}, 'createRepo', false, githubSchema)).to.deep.equal({
        createRepo: false,
        repoVisibility: 'private',
        repoOwner: undefined,
        githubToken: undefined,
        push: true,
      });
    });

    it('fills in the whole github block when gitInit is answered false', function () {
      expect(mergeAnswer({}, 'gitInit', false, githubSchema)).to.deep.equal({
        gitInit: false,
        createRepo: false,
        repoVisibility: 'private',
        repoOwner: undefined,
        githubToken: undefined,
        push: true,
      });
    });

    it('records createRepo as true as-is, implying nothing', function () {
      expect(mergeAnswer({}, 'createRepo', true, githubSchema)).to.deep.equal({
        createRepo: true,
      });
    });
  });
});
