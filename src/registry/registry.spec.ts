import { existsSync } from 'node:fs';

import type Environment from 'yeoman-environment';
import { expect } from 'chai';
import sinon from 'sinon';

import { BASE_NAMESPACES, JS_NAMESPACES } from './fixtures.js';
import { REGISTRY } from './registry.js';
import { destinationModeFor } from './destination-mode-for.js';
import { promptsFor } from './prompts-for.js';
import { registerAll } from './register-all.js';

// cli/ always passes explicit entries now, but run.ts's runGenerator()
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
