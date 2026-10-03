import type Environment from 'yeoman-environment';
import { expect } from 'chai';
import sinon from 'sinon';

import { registerAll } from './register-all.js';
import { registryFor } from './registry-for.js';

const cwd = process.cwd();

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
