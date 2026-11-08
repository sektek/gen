import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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

  it('prints a line per installed generator package', function () {
    runVersion(cwd);

    expect(output().slice(1).join('\n')).to.match(
      /@sektek\/generator-\w+ \d+\.\d+\.\d+|not installed/,
    );
  });

  for (const flag of ['--version', '-V']) {
    it(`is run by main for ${flag}, ignoring further arguments`, async function () {
      await main(['node', 'gen', flag, 'js:app']);

      expect(output()[0]).to.equal(`gen ${genVersion}`);
      expect(process.exitCode ?? 0).to.equal(0);
    });
  }
});
