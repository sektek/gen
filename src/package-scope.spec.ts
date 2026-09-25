import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

    it('resolves @sektek/generator-base through the shared resolver when githubClient is not injected', async function () {
      // GITHUB_TOKEN/GH_TOKEN/GH_CONFIG_DIR are overridden so token
      // resolution deterministically fails even on a machine with real `gh`
      // auth configured — this must never make a live GitHub API call. A
      // resolver failure would be indistinguishable here (both are
      // swallowed to '' by the try/catch); project-name.spec.ts's
      // equivalent test has no try/catch, so that one asserts resolution
      // itself succeeded.
      const emptyGhConfigDir = mkdtempSync(
        join(tmpdir(), 'sektek-gen-empty-gh-config-'),
      );
      const savedEnv = {
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        GH_TOKEN: process.env.GH_TOKEN,
        GH_CONFIG_DIR: process.env.GH_CONFIG_DIR,
      };
      delete process.env.GITHUB_TOKEN;
      delete process.env.GH_TOKEN;
      process.env.GH_CONFIG_DIR = emptyGhConfigDir;

      try {
        const scope = await resolvePackageScopeDefault({
          createRepo: true,
          cwd: process.cwd(),
        });

        expect(scope).to.equal('');
      } finally {
        for (const [key, value] of Object.entries(savedEnv)) {
          if (value === undefined) {
            delete process.env[key];
          } else {
            process.env[key] = value;
          }
        }
        rmSync(emptyGhConfigDir, { recursive: true, force: true });
      }
    });

    // A genuine "package not found anywhere" case isn't tested here:
    // @sektek/generator-base is always resolvable via the global fallback
    // in this workspace. See package-resolver.spec.ts for
    // GeneratorPackageNotFoundError coverage.
  });
});
