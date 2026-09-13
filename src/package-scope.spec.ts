import type { GithubClient } from '@sektek/generator-base';
import { expect } from 'chai';
import sinon from 'sinon';

import { resolvePackageScopeDefault } from './package-scope.js';

describe('package-scope', function () {
  describe('resolvePackageScopeDefault', function () {
    it('defaults to an empty scope when createRepo is not set', async function () {
      const githubClient = {
        resolveToken: sinon.stub(),
        getAuthenticatedUser: sinon.stub(),
      } as unknown as GithubClient;

      const scope = await resolvePackageScopeDefault({ githubClient });

      expect(scope).to.equal('');
      expect((githubClient.resolveToken as sinon.SinonStub).notCalled).to.be
        .true;
    });

    it('uses the given repoOwner without touching the GitHub client', async function () {
      const githubClient = {
        resolveToken: sinon.stub(),
        getAuthenticatedUser: sinon.stub(),
      } as unknown as GithubClient;

      const scope = await resolvePackageScopeDefault({
        createRepo: true,
        repoOwner: 'acme',
        githubClient,
      });

      expect(scope).to.equal('acme');
      expect((githubClient.resolveToken as sinon.SinonStub).notCalled).to.be
        .true;
    });

    it("falls back to the authenticated user's login when repoOwner is blank", async function () {
      const resolveToken = sinon.stub().resolves('fake-token');
      const getAuthenticatedUser = sinon.stub().resolves({ login: 'octocat' });
      const githubClient = {
        resolveToken,
        getAuthenticatedUser,
      } as unknown as GithubClient;

      const scope = await resolvePackageScopeDefault({
        createRepo: true,
        githubToken: 'explicit-token',
        githubClient,
      });

      expect(scope).to.equal('octocat');
      expect(resolveToken.calledWith('explicit-token')).to.be.true;
      expect(getAuthenticatedUser.calledWith({ token: 'fake-token' })).to.be
        .true;
    });

    it('falls back to an empty scope when no token can be resolved', async function () {
      const githubClient = {
        resolveToken: sinon.stub().rejects(new Error('no token')),
        getAuthenticatedUser: sinon.stub(),
      } as unknown as GithubClient;

      const scope = await resolvePackageScopeDefault({
        createRepo: true,
        githubClient,
      });

      expect(scope).to.equal('');
    });

    it('falls back to an empty scope when the GitHub API call fails', async function () {
      const githubClient = {
        resolveToken: sinon.stub().resolves('fake-token'),
        getAuthenticatedUser: sinon.stub().rejects(new Error('network error')),
      } as unknown as GithubClient;

      const scope = await resolvePackageScopeDefault({
        createRepo: true,
        githubClient,
      });

      expect(scope).to.equal('');
    });
  });
});
