import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect, use } from 'chai';
import type Environment from 'yeoman-environment';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

import {
  REGISTRY,
  buildRegistry,
  destinationModeFor,
  promptsFor,
  registerAll,
  registryFor,
} from './registry.js';

use(chaiAsPromised);

const cwd = process.cwd();

const BASE_NAMESPACES = [
  '@sektek/base:app',
  '@sektek/base:config',
  '@sektek/base:editorconfig',
  '@sektek/base:git',
  '@sektek/base:github',
  '@sektek/base:gitconfig',
  '@sektek/base:license',
  '@sektek/base:readme',
  '@sektek/base:devcontainer',
  '@sektek/base:workspace',
];

const JS_NAMESPACES = [
  '@sektek/js:app',
  '@sektek/js:base-package',
  '@sektek/js:dependencies',
  '@sektek/js:gitconfig',
  '@sektek/js:lib',
  '@sektek/js:typescript',
  '@sektek/js:eslint',
  '@sektek/js:prettier',
  '@sektek/js:mocha',
  '@sektek/js:vitest',
  '@sektek/js:workspace',
];

describe('registry', function () {
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

      expect(namespaces).to.have.members([
        ...JS_NAMESPACES,
        ...BASE_NAMESPACES,
      ]);
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

      expect(
        await registryFor('@sektek/generator-js', cwd, seen),
      ).to.deep.equal([]);
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

  describe('promptsFor', function () {
    it('throws for a namespace not present in the resolved entries', async function () {
      const entries = await registryFor('@sektek/generator-base', cwd);

      await expect(
        promptsFor('@sektek/base:not-a-real-generator', entries),
      ).to.be.rejectedWith(/Unknown generator namespace/);
    });

    it('returns [] for a generator with no prompts() override', async function () {
      const entries = await registryFor('@sektek/generator-base', cwd);

      expect(
        await promptsFor('@sektek/base:editorconfig', entries),
      ).to.deep.equal([]);
    });

    it('dynamically imports the generator class and calls its own prompts()', async function () {
      const entries = await registryFor('@sektek/generator-base', cwd);
      const prompts = await promptsFor('@sektek/base:license', entries);

      expect(prompts.map(prompt => prompt.name)).to.include('author');
    });
  });

  describe('destinationModeFor', function () {
    it('reports inPlace for a generator with no destinationMode() override', async function () {
      const entries = await registryFor('@sektek/generator-base', cwd);

      expect(
        await destinationModeFor('@sektek/base:readme', entries),
      ).to.deep.equal({ kind: 'inPlace' });
    });

    it('reports newProjectDir for an app generator', async function () {
      const entries = await registryFor('@sektek/generator-js', cwd);

      expect(await destinationModeFor('@sektek/js:app', entries)).to.deep.equal(
        { kind: 'newProjectDir' },
      );
    });
  });

  describe('registerAll', function () {
    it('registers every given entry with the environment, by path and namespace', async function () {
      const entries = await registryFor('@sektek/generator-base', cwd);
      const register = sinon.stub();
      const env = { register } as unknown as Environment;

      registerAll(env, entries);

      expect(register.callCount).to.equal(entries.length);
      for (const { namespace, path } of entries) {
        expect(
          register.calledWithExactly(path, { namespace }),
          `expected registerAll to call register(${path}, { namespace: '${namespace}' })`,
        ).to.be.true;
      }
    });
  });

  // cli.ts always passes explicit entries now, but run.ts's runGenerator()
  // still defaults to REGISTRY for a caller with no specific package in
  // mind (e.g. run.spec.ts's own default-registry test) — kept working.
  describe('single-argument defaults (REGISTRY)', function () {
    it('REGISTRY contains exactly both packages’ namespaces, deduped', async function () {
      const expected = new Set([...JS_NAMESPACES, ...BASE_NAMESPACES]);

      expect(new Set(REGISTRY.map(entry => entry.namespace))).to.deep.equal(
        expected,
      );
      expect(REGISTRY).to.have.lengthOf(expected.size);
    });

    it('resolves every REGISTRY entry to a path that exists on disk', function () {
      for (const { namespace, path } of REGISTRY) {
        expect(existsSync(path), `${namespace} -> ${path}`).to.be.true;
      }
    });

    it('registerAll() with no entries defaults to REGISTRY', function () {
      const register = sinon.stub();
      const env = { register } as unknown as Environment;

      registerAll(env);

      expect(register.callCount).to.equal(REGISTRY.length);
    });

    it('destinationModeFor() with no entries defaults to REGISTRY', async function () {
      expect(await destinationModeFor('@sektek/js:app')).to.deep.equal({
        kind: 'newProjectDir',
      });
    });

    it('promptsFor() with no entries defaults to REGISTRY', async function () {
      expect(await promptsFor('@sektek/base:editorconfig')).to.deep.equal([]);
    });
  });

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
});
