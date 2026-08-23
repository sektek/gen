import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import { runGenerator } from './run.js';

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
    expect(existsSync(join(destinationRoot, 'index.spec.js'))).to.be.true;

    const packageJson = JSON.parse(
      readFileSync(join(destinationRoot, 'package.json'), 'utf8'),
    );
    expect(packageJson.name).to.match(/^@acme\//);
    expect(packageJson.license).to.equal('MIT');
    expect(packageJson.private).to.be.true;
    expect(packageJson.author).to.equal('Test Author');
  });
});
