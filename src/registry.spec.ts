import { existsSync } from 'node:fs';

import { expect, use } from 'chai';
import type Environment from 'yeoman-environment';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

import { REGISTRY, promptsFor, registerAll } from './registry.js';

use(chaiAsPromised);

const EXPECTED_NAMESPACES = [
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
  '@sektek/js:app',
  '@sektek/js:base-package',
  '@sektek/js:dependencies',
  '@sektek/js:gitconfig',
  '@sektek/js:typescript',
  '@sektek/js:eslint',
  '@sektek/js:prettier',
  '@sektek/js:mocha',
  '@sektek/js:vitest',
  '@sektek/js:workspace',
];

describe('registry', function () {
  it('contains exactly the expected namespaces', function () {
    expect(REGISTRY.map(entry => entry.namespace)).to.have.members(
      EXPECTED_NAMESPACES,
    );
    expect(REGISTRY).to.have.lengthOf(EXPECTED_NAMESPACES.length);
  });

  it('resolves every namespace to a path that exists on disk', function () {
    for (const { namespace, path } of REGISTRY) {
      expect(existsSync(path), `${namespace} -> ${path}`).to.be.true;
    }
  });

  describe('promptsFor', function () {
    it('throws for a namespace REGISTRY does not know about', async function () {
      await expect(
        promptsFor('@sektek/base:not-a-real-generator'),
      ).to.be.rejectedWith(/Unknown generator namespace/);
    });

    it('returns [] for a generator with no prompts() override', async function () {
      expect(await promptsFor('@sektek/base:editorconfig')).to.deep.equal([]);
    });

    it('dynamically imports the generator class and calls its own prompts()', async function () {
      const prompts = await promptsFor('@sektek/base:license');

      expect(prompts.map(prompt => prompt.name)).to.include('author');
    });
  });

  describe('registerAll', function () {
    it('registers every entry with the environment, by path and namespace', function () {
      const register = sinon.stub();
      const env = { register } as unknown as Environment;

      registerAll(env);

      expect(register.callCount).to.equal(REGISTRY.length);
      for (const { namespace, path } of REGISTRY) {
        expect(
          register.calledWithExactly(path, { namespace }),
          `expected registerAll to call register(${path}, { namespace: '${namespace}' })`,
        ).to.be.true;
      }
    });
  });
});
