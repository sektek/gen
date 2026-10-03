import { expect } from 'chai';

import { destinationModeFor } from './destination-mode-for.js';
import { registryFor } from './registry-for.js';

const cwd = process.cwd();

describe('destinationModeFor', function () {
  it('reports inPlace for a generator with no destinationMode() override', async function () {
    const entries = await registryFor('@sektek/generator-base', cwd);

    expect(
      await destinationModeFor('@sektek/base:readme', entries),
    ).to.deep.equal({ kind: 'inPlace' });
  });

  it('reports newProjectDir for an app generator', async function () {
    const entries = await registryFor('@sektek/generator-js', cwd);

    expect(await destinationModeFor('@sektek/js:app', entries)).to.deep.equal({
      kind: 'newProjectDir',
    });
  });
});
