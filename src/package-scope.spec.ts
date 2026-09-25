import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

    it('resolves @sektek/generator-base through the shared resolver, honoring cwd, when githubClient is not injected', async function () {
      // A cwd-local fixture package, distinguishable from the real
      // @sektek/generator-base by its sentinel return values — proving
      // `cwd` actually drove resolution (the old bare `import(...)` could
      // only ever reach the real package, never this fixture, and would
      // fail this assertion).
      const fixtureRoot = mkdtempSync(join(tmpdir(), 'sektek-gen-scope-'));
      const pkgDir = join(
        fixtureRoot,
        'node_modules',
        '@sektek',
        'generator-base',
      );
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({
          name: '@sektek/generator-base',
          version: '0.0.0-fixture',
          exports: { '.': './index.js' },
        }),
      );
      writeFileSync(
        join(pkgDir, 'index.js'),
        'export function defaultGithubClient() {\n' +
          '  return {\n' +
          "    resolveToken: async () => 'fixture-token',\n" +
          "    getAuthenticatedUser: async () => ({ login: 'fixture-user' }),\n" +
          '  };\n' +
          '}\n',
      );

      try {
        const scope = await resolvePackageScopeDefault({
          createRepo: true,
          cwd: fixtureRoot,
        });

        expect(scope).to.equal('fixture-user');
      } finally {
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    });

    // A genuine "package not found anywhere" case isn't tested here:
    // @sektek/generator-base is always resolvable via the global fallback
    // in this workspace. See package-resolver.spec.ts for
    // GeneratorPackageNotFoundError coverage.
  });
});
