/* eslint-disable no-console -- asserting on stubbed console output below */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';
import sinon from 'sinon';

import { printPackageList } from './print-package-list.js';

describe('printPackageList', function () {
  beforeEach(function () {
    sinon.stub(console, 'log');
    sinon.stub(console, 'error');
  });

  afterEach(function () {
    sinon.restore();
    process.exitCode = 0;
  });

  it('lists one specific real package, defaulting scope to sektek', async function () {
    await printPackageList('js', process.cwd());

    const logged = (console.log as sinon.SinonStub)
      .getCalls()
      .map(call => call.args[0]);
    expect(logged.join('\n')).to.include('@sektek/js:app');
  });

  it('lists a fully-qualified third-party package', async function () {
    const fixtureCwd = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-list-pkg-'));
    try {
      const pkgDir = join(
        fixtureCwd,
        'node_modules',
        '@acme',
        'generator-widget',
      );
      mkdirSync(join(pkgDir, 'generators', 'app'), { recursive: true });
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({
          name: '@acme/generator-widget',
          version: '0.0.0-fixture',
          exports: {
            './manifest': './manifest.js',
            './generators/*': './generators/*/index.js',
          },
        }),
      );
      writeFileSync(
        join(pkgDir, 'manifest.js'),
        "export const GENERATORS = ['app'];\n",
      );
      writeFileSync(
        join(pkgDir, 'generators', 'app', 'index.js'),
        'export {};\n',
      );

      await printPackageList('@acme/widget', fixtureCwd);

      const logged = (console.log as sinon.SinonStub)
        .getCalls()
        .map(call => call.args[0]);
      expect(logged.join('\n')).to.include('@acme/widget:app');
    } finally {
      rmSync(fixtureCwd, { recursive: true, force: true });
    }
  });

  it('errors clearly and exits non-zero for a package that is not installed', async function () {
    await printPackageList('@acme/does-not-exist', process.cwd());

    expect(
      (console.error as sinon.SinonStub).calledWithMatch(/isn't installed/),
    ).to.be.true;
    expect(process.exitCode).to.equal(1);
  });
});
