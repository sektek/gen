import { expect } from 'chai';

import { applyLicenseImplications } from './license-implications.js';

describe('applyLicenseImplications', function () {
  it('passes through unchanged when license is not UNLICENSED', function () {
    const resolved = { license: 'MIT', private: false };

    const result = applyLicenseImplications(resolved);

    expect(result.resolved).to.equal(resolved);
    expect(result.warnings).to.deep.equal([]);
  });

  it('overrides an explicit --no-private to true, with a warning', function () {
    const result = applyLicenseImplications({
      license: 'UNLICENSED',
      private: false,
    });

    expect(result.resolved.private).to.equal(true);
    expect(result.warnings).to.have.lengthOf(1);
    expect(result.warnings[0]).to.match(/--no-private/);
  });

  it('overrides an explicit public repoVisibility to private, with a warning', function () {
    const result = applyLicenseImplications({
      license: 'UNLICENSED',
      repoVisibility: 'public',
    });

    expect(result.resolved.repoVisibility).to.equal('private');
    expect(result.warnings).to.have.lengthOf(1);
    expect(result.warnings[0]).to.match(/--repo-visibility/);
  });

  it('overrides both conflicting values at once, with two warnings', function () {
    const result = applyLicenseImplications({
      license: 'UNLICENSED',
      private: false,
      repoVisibility: 'public',
    });

    expect(result.resolved.private).to.equal(true);
    expect(result.resolved.repoVisibility).to.equal('private');
    expect(result.warnings).to.have.lengthOf(2);
  });

  it('raises no warnings when already consistent with UNLICENSED', function () {
    const result = applyLicenseImplications({
      license: 'UNLICENSED',
      private: true,
      repoVisibility: 'private',
    });

    expect(result.resolved.private).to.equal(true);
    expect(result.resolved.repoVisibility).to.equal('private');
    expect(result.warnings).to.deep.equal([]);
  });

  it('is a no-op for a base-only run with no license key at all', function () {
    const resolved = { repoVisibility: 'public' };

    const result = applyLicenseImplications(resolved);

    expect(result.resolved).to.equal(resolved);
    expect(result.resolved.repoVisibility).to.equal('public');
    expect(result.warnings).to.deep.equal([]);
  });
});
