import { expect } from 'chai';

import { applyGitInitImplications } from './git-init-implications.js';

describe('applyGitInitImplications', function () {
  it('passes through unchanged when gitInit is not false', function () {
    const resolved = { gitInit: true, createRepo: true };

    const result = applyGitInitImplications(resolved);

    expect(result.resolved).to.equal(resolved);
    expect(result.warnings).to.deep.equal([]);
  });

  // Regression test for the exact combination Copilot flagged on gen#12:
  // an explicit createRepo: true seed (e.g. `--create-repo` alongside
  // `--no-git-init`) survives wizard-steps.ts's own "seed always wins"
  // rule, so this is the layer that has to catch it instead.
  it('overrides an explicit createRepo: true to false, with a warning', function () {
    const result = applyGitInitImplications({
      gitInit: false,
      createRepo: true,
    });

    expect(result.resolved.createRepo).to.equal(false);
    expect(result.warnings).to.have.lengthOf(1);
    expect(result.warnings[0]).to.match(/createRepo \(was true\)/);
  });

  it('raises no warning when already consistent with gitInit: false', function () {
    const result = applyGitInitImplications({
      gitInit: false,
      createRepo: false,
    });

    expect(result.resolved.createRepo).to.equal(false);
    expect(result.warnings).to.deep.equal([]);
  });

  it('is a no-op for a run with no createRepo key at all', function () {
    const resolved = { gitInit: false };

    const result = applyGitInitImplications(resolved);

    expect(result.resolved).to.equal(resolved);
    expect(result.warnings).to.deep.equal([]);
  });
});
