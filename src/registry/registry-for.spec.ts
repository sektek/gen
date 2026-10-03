import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import { BASE_NAMESPACES, JS_NAMESPACES } from './fixtures.js';
import { registryFor } from './registry-for.js';

const cwd = process.cwd();

describe('registryFor', function () {
  it("resolves exactly @sektek/generator-base's own namespaces", async function () {
    const entries = await registryFor('@sektek/generator-base', cwd);

    expect(entries.map(entry => entry.namespace)).to.have.members(
      BASE_NAMESPACES,
    );
    expect(entries).to.have.lengthOf(BASE_NAMESPACES.length);
  });

  it("resolves @sektek/generator-js's own namespaces plus generator-base's, transitively, deduped", async function () {
    const entries = await registryFor('@sektek/generator-js', cwd);
    const namespaces = entries.map(entry => entry.namespace);

    expect(namespaces).to.have.members([...JS_NAMESPACES, ...BASE_NAMESPACES]);
    expect(namespaces).to.have.lengthOf(
      JS_NAMESPACES.length + BASE_NAMESPACES.length,
    );
    expect(new Set(namespaces).size, 'no duplicate namespaces').to.equal(
      namespaces.length,
    );
  });

  it('resolves every entry to a path that exists on disk', async function () {
    const entries = [
      ...(await registryFor('@sektek/generator-base', cwd)),
      ...(await registryFor('@sektek/generator-js', cwd)),
    ];

    for (const { namespace, path } of entries) {
      expect(existsSync(path), `${namespace} -> ${path}`).to.be.true;
    }
  });

  it('is cycle/dedup-safe against an already-seen package', async function () {
    const seen = new Set(['@sektek/generator-js']);

    expect(await registryFor('@sektek/generator-js', cwd, seen)).to.deep.equal(
      [],
    );
  });

  it('reads dependencies from the same installation the manifest was resolved from', async function () {
    // A cwd-local fixture that exports '.' but not './manifest': the
    // manifest (and every generator path) falls back to the real global
    // generator-js install, but a naive root lookup via
    // resolveGeneratorPackagePath(packageName, '', cwd) would still find
    // this fixture's root and read its (deliberately dependency-less)
    // package.json instead — silently dropping the transitive
    // @sektek/base:* entries that generator-js's real package.json
    // declares.
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'sektek-gen-registry-'));
    try {
      const pkgDir = join(
        fixtureRoot,
        'node_modules',
        '@sektek',
        'generator-js',
      );
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({
          name: '@sektek/generator-js',
          version: '0.0.0-fixture',
          exports: { '.': './index.js' },
          dependencies: {},
        }),
      );
      writeFileSync(join(pkgDir, 'index.js'), 'export {};\n');

      const namespaces = (
        await registryFor('@sektek/generator-js', fixtureRoot)
      ).map(entry => entry.namespace);

      expect(namespaces).to.include.members(BASE_NAMESPACES);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("resolves a dependency npm nested under the parent package's own node_modules", async function () {
    // Not present at fixtureRoot's own top-level node_modules, nor
    // resolvable via the global fallback (it's not a real package
    // anywhere) — only reachable by rooting the dependency's own
    // resolution at the parent's directory, as a real `require()` made
    // from within the parent's own source would.
    const fixtureRoot = mkdtempSync(
      join(tmpdir(), 'sektek-gen-registry-nested-'),
    );
    try {
      const parentDir = join(
        fixtureRoot,
        'node_modules',
        '@acme',
        'generator-parent',
      );
      mkdirSync(join(parentDir, 'generators', 'app'), { recursive: true });
      writeFileSync(
        join(parentDir, 'package.json'),
        JSON.stringify({
          name: '@acme/generator-parent',
          version: '0.0.0-fixture',
          exports: {
            './manifest': './manifest.js',
            './generators/*': './generators/*/index.js',
          },
          dependencies: { '@acme/generator-child': '*' },
        }),
      );
      writeFileSync(
        join(parentDir, 'manifest.js'),
        "export const GENERATORS = ['app'];\n",
      );
      writeFileSync(
        join(parentDir, 'generators', 'app', 'index.js'),
        'export {};\n',
      );

      const childDir = join(
        parentDir,
        'node_modules',
        '@acme',
        'generator-child',
      );
      mkdirSync(join(childDir, 'generators', 'thing'), {
        recursive: true,
      });
      writeFileSync(
        join(childDir, 'package.json'),
        JSON.stringify({
          name: '@acme/generator-child',
          version: '0.0.0-fixture',
          exports: {
            './manifest': './manifest.js',
            './generators/*': './generators/*/index.js',
          },
        }),
      );
      writeFileSync(
        join(childDir, 'manifest.js'),
        "export const GENERATORS = ['thing'];\n",
      );
      writeFileSync(
        join(childDir, 'generators', 'thing', 'index.js'),
        'export {};\n',
      );

      const namespaces = (
        await registryFor('@acme/generator-parent', fixtureRoot)
      ).map(entry => entry.namespace);

      expect(namespaces).to.have.members([
        '@acme/parent:app',
        '@acme/child:thing',
      ]);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
