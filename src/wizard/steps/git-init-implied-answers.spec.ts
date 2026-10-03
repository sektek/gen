import { expect } from 'chai';

import { gitInitSpec, githubSchema } from './fixtures.js';
import { gitInitImpliedAnswers } from './git-init-implied-answers.js';

describe('wizard-steps', function () {
  describe('gitInitImpliedAnswers', function () {
    it('returns nothing when gitInit is not false', function () {
      expect(gitInitImpliedAnswers(true, githubSchema)).to.deep.equal({});
      expect(gitInitImpliedAnswers(undefined, githubSchema)).to.deep.equal({});
    });

    it('implies createRepo plus every github-detail key when gitInit is false', function () {
      expect(gitInitImpliedAnswers(false, githubSchema)).to.deep.equal({
        createRepo: false,
        repoVisibility: 'private',
        repoOwner: undefined,
        githubToken: undefined,
        push: true,
      });
    });

    it('only implies keys actually present in schema', function () {
      expect(gitInitImpliedAnswers(false, [gitInitSpec])).to.deep.equal({});
    });

    // Regression test: withConfigDefaults() (schema.ts) can override a
    // spec's own `default` from a config file — createRepo's included, so
    // a config setting createRepo's default to true must not survive into
    // the implied answer once gitInit is declined, or the wizard would
    // silently finish with createRepo: true and no local repo to push from.
    it('forces createRepo to false even when its schema default has been overridden to true', function () {
      const schemaWithOverriddenDefault = githubSchema.map(spec =>
        spec.key === 'createRepo' ? { ...spec, default: true } : spec,
      );

      expect(
        gitInitImpliedAnswers(false, schemaWithOverriddenDefault).createRepo,
      ).to.equal(false);
    });
  });
});
