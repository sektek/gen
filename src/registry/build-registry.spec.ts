import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { buildRegistry } from './build-registry.js';

use(chaiAsPromised);

const cwd = process.cwd();

describe('buildRegistry', function () {
  it('is best-effort: a root package that is not installed is skipped rather than thrown', async function () {
    const entries = await buildRegistry(
      ['@sektek/generator-base', '@acme/generator-does-not-exist'],
      cwd,
    );

    expect(entries.map(entry => entry.namespace)).to.include(
      '@sektek/base:app',
    );
  });

  it('propagates an error other than GeneratorPackageNotFoundError rather than swallowing it', async function () {
    const fixtureRoot = mkdtempSync(
      join(tmpdir(), 'sektek-gen-registry-broken-'),
    );
    try {
      const pkgDir = join(
        fixtureRoot,
        'node_modules',
        '@acme',
        'generator-broken',
      );
      mkdirSync(join(pkgDir, 'generators', 'app'), { recursive: true });
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({
          name: '@acme/generator-broken',
          version: '0.0.0-fixture',
          exports: { './manifest': './manifest.js' },
        }),
      );
      writeFileSync(
        join(pkgDir, 'manifest.js'),
        "throw new Error('manifest blew up');\n",
      );

      await expect(
        buildRegistry(['@acme/generator-broken'], fixtureRoot),
      ).to.be.rejectedWith(/manifest blew up/);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
