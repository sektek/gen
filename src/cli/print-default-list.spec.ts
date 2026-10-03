/* eslint-disable no-console -- asserting on stubbed console output below */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';
import sinon from 'sinon';

import { printDefaultList } from './print-default-list.js';

describe('printDefaultList', function () {
  let fixtureCwd: string;

  beforeEach(function () {
    fixtureCwd = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-list-'));
    sinon.stub(console, 'log');
  });

  afterEach(function () {
    sinon.restore();
    rmSync(fixtureCwd, { recursive: true, force: true });
    process.exitCode = 0;
  });

  function writeFixturePackage(
    pkgDir: string,
    name: string,
    generators: string[],
  ): void {
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({
        name,
        version: '0.0.0-fixture',
        exports: {
          './manifest': './manifest.js',
          './generators/*': './generators/*/index.js',
        },
      }),
    );
    writeFileSync(
      join(pkgDir, 'manifest.js'),
      `export const GENERATORS = ${JSON.stringify(generators)};\n`,
    );
    for (const name_ of generators) {
      mkdirSync(join(pkgDir, 'generators', name_), { recursive: true });
      writeFileSync(
        join(pkgDir, 'generators', name_, 'index.js'),
        'export {};\n',
      );
    }
  }

  it('lists every real @sektek/base and @sektek/js namespace by default', async function () {
    await printDefaultList(process.cwd());

    const logged = (console.log as sinon.SinonStub)
      .getCalls()
      .map(call => call.args[0]);
    expect(logged.join('\n')).to.include('@sektek/base:app');
    expect(logged.join('\n')).to.include('@sektek/js:app');
    expect(process.exitCode).to.not.equal(1);
  });

  it('shows what resolves and notes what does not, rather than failing entirely', async function () {
    writeFixturePackage(
      join(fixtureCwd, 'node_modules', '@acme', 'generator-widget'),
      '@acme/generator-widget',
      ['app'],
    );

    await printDefaultList(fixtureCwd, [
      '@acme/generator-widget',
      '@acme/generator-missing',
    ]);

    const logged = (console.log as sinon.SinonStub)
      .getCalls()
      .map(call => call.args[0])
      .join('\n');
    expect(logged).to.include('@acme/widget:app');
    expect(logged).to.include('@acme/generator-missing: not installed');
    expect(process.exitCode).to.not.equal(1);
  });

  it('exits non-zero only when none of the default packages resolve', async function () {
    await printDefaultList(fixtureCwd, [
      '@acme/generator-missing-a',
      '@acme/generator-missing-b',
    ]);

    expect(process.exitCode).to.equal(1);
  });
});
