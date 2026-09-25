import { existsSync } from 'node:fs';

import { expect, use } from 'chai';
import type Environment from 'yeoman-environment';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

import {
  REGISTRY,
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

  // REGISTRY/the single-argument forms are what cli.ts and run.ts actually
  // call today; kept working (defaulting to REGISTRY) so this dynamic
  // rewrite doesn't force those call sites to change in this same PR.
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
});
