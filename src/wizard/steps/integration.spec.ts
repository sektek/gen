import { expect } from 'chai';

import {
  githubSchema,
  githubTokenSpec,
  pushSpec,
  repoOwnerSpec,
  repoVisibilitySpec,
} from './fixtures.js';
import { mergeAnswer } from './merge-answer.js';
import { pendingSpecs } from './pending-specs.js';

describe('wizard-steps', function () {
  describe('pendingSpecs + initialAnswers/mergeAnswer integration', function () {
    // SEK-89: the actual bug report — the wizard kept asking
    // repoVisibility/repoOwner/githubToken/push after "No" to createRepo,
    // and the whole github block (including createRepo itself) after "No"
    // to gitInit.
    it('skips straight past the github detail steps once createRepo is answered false', function () {
      // gitInit answered true first, matching real wizard step order —
      // otherwise gitInit itself would still be pending below.
      let answers = mergeAnswer({}, 'gitInit', true, githubSchema);
      answers = mergeAnswer(answers, 'createRepo', false, githubSchema);
      expect(pendingSpecs(githubSchema, answers)).to.deep.equal([]);
    });

    it('skips straight past the entire github block once gitInit is answered false', function () {
      const answers = mergeAnswer({}, 'gitInit', false, githubSchema);
      expect(pendingSpecs(githubSchema, answers)).to.deep.equal([]);
    });

    it('still asks every github step when gitInit/createRepo are answered true', function () {
      let answers = mergeAnswer({}, 'gitInit', true, githubSchema);
      answers = mergeAnswer(answers, 'createRepo', true, githubSchema);
      expect(pendingSpecs(githubSchema, answers)).to.deep.equal([
        repoVisibilitySpec,
        repoOwnerSpec,
        githubTokenSpec,
        pushSpec,
      ]);
    });
  });
});
