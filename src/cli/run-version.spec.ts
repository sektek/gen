import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import chalk from 'chalk';
import { expect } from 'chai';
import sinon from 'sinon';

import { main } from './index.js';
import { runVersion } from './run-version.js';

const genVersion = (
  JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
).version;

describe('runVersion', function () {
  let cwd: string;
  let log: sinon.SinonStub;

  beforeEach(function () {
    cwd = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-version-'));
    log = sinon.stub(console, 'log');
  });

  afterEach(function () {
    sinon.restore();
    rmSync(cwd, { recursive: true, force: true });
    process.exitCode = 0;
  });

  const output = () => log.getCalls().map(call => String(call.args[0]));

  it("prints gen's own version first", function () {
    runVersion(cwd);

    expect(output()[0]).to.equal(`gen ${genVersion}`);
  });

  it('prints a line per installed package and notes a missing one', function () {
    runVersion(cwd, () => [
      { name: '@sektek/generator-base', version: '1.2.3' },
      { name: '@sektek/generator-js', version: undefined },
      { name: '@sektek/generator-zzz', version: '4.5.6' },
    ]);

    expect(output()).to.deep.equal([
      `gen ${genVersion}`,
      '@sektek/generator-base 1.2.3',
      chalk.dim('@sektek/generator-js: not installed'),
      '@sektek/generator-zzz 4.5.6',
    ]);
  });

  it('finds the packages installed under cwd by default', function () {
    const dir = join(cwd, 'node_modules', '@sektek', 'generator-fixture');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: '@sektek/generator-fixture',
        version: '7.8.9',
        exports: { './manifest': './manifest.js' },
      }),
    );
    writeFileSync(join(dir, 'manifest.js'), 'export {};\n');

    runVersion(cwd);

    expect(output()).to.include('@sektek/generator-fixture 7.8.9');
  });

  for (const flag of ['--version', '-V']) {
    it(`is run by main for ${flag}, ignoring further arguments`, async function () {
      await main(['node', 'gen', flag, 'js:app']);

      expect(output()[0]).to.equal(`gen ${genVersion}`);
      expect(process.exitCode ?? 0).to.equal(0);
    });
  }
});
