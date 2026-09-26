import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import { runGenerator } from './run.js';

const FIXTURE_GENERATOR_PATH = fileURLToPath(
  new URL('./run-fixture-generator.mjs', import.meta.url),
);

describe('runGenerator', function () {
  let destinationRoot: string;

  beforeEach(function () {
    destinationRoot = mkdtempSync(join(tmpdir(), 'sektek-gen-run-'));
  });

  afterEach(function () {
    rmSync(destinationRoot, { recursive: true, force: true });
  });

  it('runs a real generator against a real destination directory', async function () {
    await runGenerator(
      '@sektek/js:base-package',
      {
        language: 'javascript',
        packageScope: 'acme',
        author: 'Test Author',
        license: 'MIT',
        private: true,
        skipInstall: true,
      },
      { destinationRoot, force: true },
    );

    expect(existsSync(join(destinationRoot, 'package.json'))).to.be.true;
    expect(existsSync(join(destinationRoot, 'index.js'))).to.be.true;

    const packageJson = JSON.parse(
      readFileSync(join(destinationRoot, 'package.json'), 'utf8'),
    );
    expect(packageJson.name).to.match(/^@acme\//);
    expect(packageJson.license).to.equal('MIT');
    expect(packageJson.private).to.be.true;
    expect(packageJson.author).to.equal('Test Author');
  });

  it('registers and runs a caller-supplied entries[] rather than only the default REGISTRY', async function () {
    // Proves the entries threaded through by cli.ts's resolveNamespace()
    // actually reach Environment#register()/run() — a namespace outside
    // the two default packages (like this fixture's) would otherwise never
    // get registered and environment.run() would fail to find it.
    await runGenerator(
      '@acme/widget:app',
      {},
      { destinationRoot, force: true },
      [{ namespace: '@acme/widget:app', path: FIXTURE_GENERATOR_PATH }],
    );

    expect(readFileSync(join(destinationRoot, 'marker.txt'), 'utf8')).to.equal(
      'fixture generator ran',
    );
  });
});
