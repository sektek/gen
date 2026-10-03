import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { resolveNamespace } from './resolve-namespace.js';

use(chaiAsPromised);

const cwd = process.cwd();

describe('resolveNamespace', function () {
  it('resolves a bare package alias to its :app generator', async function () {
    expect((await resolveNamespace('js', cwd)).namespace).to.equal(
      '@sektek/js:app',
    );
  });

  it('resolves a name:subgen pair, defaulting scope to sektek', async function () {
    expect((await resolveNamespace('js:workspace', cwd)).namespace).to.equal(
      '@sektek/js:workspace',
    );
  });

  it('passes a fully-qualified namespace through unchanged', async function () {
    expect(
      (await resolveNamespace('@sektek/base:editorconfig', cwd)).namespace,
    ).to.equal('@sektek/base:editorconfig');
  });

  it('resolves a bare name unique to base', async function () {
    expect((await resolveNamespace('editorconfig', cwd)).namespace).to.equal(
      '@sektek/base:editorconfig',
    );
  });

  it('resolves a bare name that exists in both base and js to base silently', async function () {
    expect((await resolveNamespace('gitconfig', cwd)).namespace).to.equal(
      '@sektek/base:gitconfig',
    );
  });

  it("also returns the target package's resolved entries, for downstream registration", async function () {
    const { entries } = await resolveNamespace('js:workspace', cwd);
    expect(entries.map(entry => entry.namespace)).to.include(
      '@sektek/js:workspace',
    );
    // generator-js's own dependency on generator-base pulls these in
    // transitively — the same entries composeWith needs to compose
    // @sektek/base:* sub-generators from within @sektek/js:app.
    expect(entries.map(entry => entry.namespace)).to.include(
      '@sektek/base:editorconfig',
    );
  });

  it('rejects a bare name that exists only in js, hinting at the js: prefix', async function () {
    await expect(resolveNamespace('eslint', cwd)).to.be.rejectedWith(
      /Did you mean 'js:eslint'/,
    );
  });

  it('rejects a bare name that exists in neither package with a generic message', async function () {
    await expect(
      resolveNamespace('totallyNonexistentGenerator', cwd),
    ).to.be.rejectedWith(
      /^Unknown generator '@sektek\/base:totallyNonexistentGenerator'\. Run 'gen list'/,
    );
  });

  it('resolves a bare name colliding with an inherited Object.prototype property as a normal miss', async function () {
    // parseGeneratorInput() always defaults a bare, non-sugar name to
    // '@sektek/base:<name>' structurally rather than via a dictionary
    // lookup keyed by the input string, so 'toString' can't accidentally
    // match through the prototype chain the way an `input in
    // PREFIX_ALIASES`-style check once could.
    await expect(resolveNamespace('toString', cwd)).to.be.rejectedWith(
      /^Unknown generator '@sektek\/base:toString'\. Run 'gen list'/,
    );
  });

  it('rejects a name:subgen pair whose package resolves but the subgen does not', async function () {
    await expect(resolveNamespace('js:nonexistent', cwd)).to.be.rejectedWith(
      /Unknown generator '@sektek\/js:nonexistent'/,
    );
  });

  it('rejects a name:subgen pair whose defaulted-scope package is not installed', async function () {
    // 'bogus' is no longer a hardcoded allowlist lookup — it's parsed as
    // @sektek/generator-bogus like any other name, and fails to resolve
    // as a real package rather than hitting a special "unknown prefix"
    // case.
    await expect(
      resolveNamespace('bogus:editorconfig', cwd),
    ).to.be.rejectedWith(
      /Generator package '@sektek\/generator-bogus' isn't installed/,
    );
  });

  it('rejects an unknown fully-qualified namespace', async function () {
    await expect(
      resolveNamespace('@sektek/js:nonexistent', cwd),
    ).to.be.rejectedWith(/Unknown generator/);
  });

  describe('a fully-qualified third-party package', function () {
    let fixtureCwd: string;

    beforeEach(function () {
      fixtureCwd = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-fixture-'));
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
    });

    afterEach(function () {
      rmSync(fixtureCwd, { recursive: true, force: true });
    });

    it('resolves, proving scope/name are not hardcoded to sektek', async function () {
      expect(
        (await resolveNamespace('@acme/widget:app', fixtureCwd)).namespace,
      ).to.equal('@acme/widget:app');
    });

    it('does not let scope-defaulting accidentally reach a differently-scoped fixture', async function () {
      // 'widget:app' (no @) defaults to scope 'sektek', i.e.
      // @sektek/generator-widget — a different package than the fixture's
      // @acme/generator-widget, so this must still fail to resolve.
      await expect(
        resolveNamespace('widget:app', fixtureCwd),
      ).to.be.rejectedWith(/@sektek\/generator-widget/);
    });
  });
});
