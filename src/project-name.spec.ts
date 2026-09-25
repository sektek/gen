import { isAbsolute, join, relative } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { expect, use } from 'chai';
import type { GithubClient } from '@sektek/generator-base';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

import {
  isSafePathSegment,
  resolveGeneratedDestination,
} from './project-name.js';

use(chaiAsPromised);

describe('project-name', function () {
  describe('isSafePathSegment', function () {
    it('accepts an ordinary adjective-noun name', function () {
      expect(isSafePathSegment('brave-otter')).to.be.true;
    });

    for (const unsafeName of [
      '',
      '.',
      '..',
      '../escaped',
      'nested/dir',
      'a\\b',
    ]) {
      it(`rejects '${unsafeName}'`, function () {
        expect(isSafePathSegment(unsafeName)).to.be.false;
      });
    }
  });

  describe('resolveGeneratedDestination', function () {
    let cwd: string;

    beforeEach(function () {
      cwd = mkdtempSync(join(tmpdir(), 'sektek-gen-project-name-'));
    });

    afterEach(function () {
      rmSync(cwd, { recursive: true, force: true });
    });

    it('retries with a fresh name when the local directory already exists', async function () {
      mkdirSync(join(cwd, 'foo-bar'));
      const generateName = sinon
        .stub()
        .onCall(0)
        .returns('foo-bar')
        .onCall(1)
        .returns('baz-qux');

      const dest = await resolveGeneratedDestination({ cwd, generateName });

      expect(dest).to.equal(join(cwd, 'baz-qux'));
    });

    it('retries with a fresh name when the GitHub repo already exists', async function () {
      const generateName = sinon
        .stub()
        .onCall(0)
        .returns('foo-bar')
        .onCall(1)
        .returns('baz-qux');
      const repoExists = sinon
        .stub()
        .onCall(0)
        .resolves({ exists: true, owner: 'acme' })
        .onCall(1)
        .resolves({ exists: false, owner: 'acme' });
      const githubClient = {
        resolveToken: sinon.stub().resolves('fake-token'),
        repoExists,
      } as unknown as GithubClient;

      const dest = await resolveGeneratedDestination({
        cwd,
        createRepo: true,
        repoOwner: 'acme',
        githubClient,
        generateName,
      });

      expect(dest).to.equal(join(cwd, 'baz-qux'));
      expect(
        repoExists.calledWithMatch(
          { token: 'fake-token' },
          { owner: 'acme', name: 'foo-bar' },
        ),
      ).to.be.true;
      expect(
        repoExists.calledWithMatch(
          { token: 'fake-token' },
          { owner: 'acme', name: 'baz-qux' },
        ),
      ).to.be.true;
    });

    it('never touches the GitHub client when createRepo is not set', async function () {
      const resolveToken = sinon.stub().resolves('fake-token');
      const repoExists = sinon
        .stub()
        .resolves({ exists: false, owner: 'acme' });
      const githubClient = {
        resolveToken,
        repoExists,
      } as unknown as GithubClient;

      await resolveGeneratedDestination({
        cwd,
        githubClient,
        generateName: () => 'foo-bar',
      });

      expect(resolveToken.notCalled).to.be.true;
      expect(repoExists.notCalled).to.be.true;
    });

    it('throws after exhausting maxAttempts on a persistent collision', async function () {
      mkdirSync(join(cwd, 'foo-bar'));

      await expect(
        resolveGeneratedDestination({
          cwd,
          generateName: () => 'foo-bar',
          maxAttempts: 3,
        }),
      ).to.be.rejectedWith(/Could not find an available/);
    });

    it('always returns an absolute path, even when cwd is given as relative', async function () {
      const relativeCwd = relative(process.cwd(), cwd);

      const dest = await resolveGeneratedDestination({
        cwd: relativeCwd,
        generateName: () => 'foo-bar',
      });

      expect(isAbsolute(dest)).to.be.true;
      expect(dest).to.equal(join(cwd, 'foo-bar'));
    });

    for (const unsafeName of [
      '',
      '.',
      '..',
      '../escaped',
      'nested/dir',
      'a\\b',
    ]) {
      it(`rejects a generated name that isn't a safe path segment: '${unsafeName}'`, async function () {
        await expect(
          resolveGeneratedDestination({
            cwd,
            generateName: () => unsafeName,
          }),
        ).to.be.rejectedWith(/isn't a safe single path segment/);
      });
    }

    it('resolves @sektek/generator-base through the shared resolver when githubClient is not injected', async function () {
      // No `githubClient` DI: this exercises the real
      // resolveGeneratorPackagePath()-based dynamic import wired up here,
      // not the old bare `import('@sektek/generator-base')` (which never
      // took a `cwd` at all). If module resolution itself failed (e.g. a
      // regression back to a bare specifier once @sektek/generator-base
      // stops being a declared dependency), this would reject with
      // GeneratorPackageNotFoundError or a raw MODULE_NOT_FOUND instead —
      // so asserting the *token* error specifically confirms resolution
      // and `defaultGithubClient()` construction both already succeeded.
      // This code path (unlike package-scope.ts's) has no try/catch today,
      // so this rejection is existing, unchanged behavior, not new
      // error-swallowing.
      //
      // GITHUB_TOKEN/GH_TOKEN are cleared and GH_CONFIG_DIR is pointed at
      // an empty directory for the duration of this test so token
      // resolution deterministically fails even on a machine with real
      // `gh` auth configured — this must never make a live GitHub API
      // call.
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
        await expect(
          resolveGeneratedDestination({
            cwd,
            createRepo: true,
            generateName: () => 'foo-bar',
          }),
        ).to.be.rejectedWith(/Unable to resolve a GitHub token/);
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

    // As with package-scope.spec.ts, a true "@sektek/generator-base isn't
    // installed anywhere" case isn't separately tested here: it's really
    // resolvable alongside gen's own install in this dev workspace via
    // package-resolver.ts's global-fallback path. package-resolver.spec.ts
    // already covers GeneratorPackageNotFoundError for the resolver's own
    // not-found behavior.
  });
});
