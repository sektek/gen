import { isAbsolute, join, relative } from 'node:path';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { expect, use } from 'chai';
import type { GithubClient } from '@sektek/generator-base';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

import { resolveGeneratedDestination } from './project-name.js';

use(chaiAsPromised);

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
    const repoExists = sinon.stub().resolves({ exists: false, owner: 'acme' });
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
});
