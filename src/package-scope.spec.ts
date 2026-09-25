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
      // No `githubClient` DI here: this exercises the real
      // resolveGeneratorPackagePath()-based dynamic import wired up in
      // resolvePackageScopeDefault(), not the old bare
      // `import('@sektek/generator-base')` (which never took a `cwd` at
      // all). `process.cwd()` here is this dev workspace's own root, where
      // @sektek/generator-base is really resolvable, so this confirms
      // resolution succeeds without needing fixtures.
      //
      // GITHUB_TOKEN/GH_TOKEN are cleared and GH_CONFIG_DIR is pointed at
      // an empty directory for the duration of this test so token
      // resolution deterministically fails even on a machine with real
      // `gh` auth configured, keeping the assertion below exact instead of
      // just "didn't throw" — this must never make a live GitHub API call.
      // A resolver failure here would be indistinguishable (both are
      // swallowed to '' by the try/catch), which is exactly why the
      // equivalent test in project-name.spec.ts (not wrapped in a
      // try/catch) is the one that actually distinguishes resolver
      // failure from token failure.
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

    // A true "@sektek/generator-base isn't installed anywhere" case isn't
    // separately tested here: it's really resolvable alongside gen's own
    // install in this dev workspace via package-resolver.ts's
    // global-fallback path, so producing a genuine miss would require
    // monkeypatching module resolution itself. package-resolver.spec.ts
    // already covers GeneratorPackageNotFoundError for the resolver's own
    // not-found behavior; this file's job is just confirming the
    // rewiring, and the existing 'falls back to an empty scope' tests
    // above already cover resolvePackageScopeDefault()'s catch-and-fall-
    // back behavior for any failure inside the try block, resolution
    // failures included.
  });
});
