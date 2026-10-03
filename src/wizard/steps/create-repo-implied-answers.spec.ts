import { expect } from 'chai';

import { createRepoSpec, githubSchema } from './fixtures.js';
import { createRepoImpliedAnswers } from './create-repo-implied-answers.js';

describe('wizard-steps', function () {
  describe('createRepoImpliedAnswers', function () {
    it('returns nothing when createRepo is not false', function () {
      expect(createRepoImpliedAnswers(true, githubSchema)).to.deep.equal({});
      expect(createRepoImpliedAnswers(undefined, githubSchema)).to.deep.equal(
        {},
      );
    });

    it('implies each github-detail key at its own schema default when createRepo is false', function () {
      expect(createRepoImpliedAnswers(false, githubSchema)).to.deep.equal({
        repoVisibility: 'private',
        repoOwner: undefined,
        githubToken: undefined,
        push: true,
      });
    });

    it('never implies createRepo itself', function () {
      // createRepo is already the key being answered here — it's gitInit's
      // job (see gitInitImpliedAnswers) to imply createRepo's own value.
      expect(
        createRepoImpliedAnswers(false, githubSchema),
      ).to.not.have.property('createRepo');
    });

    it('only implies keys actually present in schema', function () {
      expect(createRepoImpliedAnswers(false, [createRepoSpec])).to.deep.equal(
        {},
      );
    });
  });
});
