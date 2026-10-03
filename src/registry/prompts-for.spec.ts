import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { promptsFor } from './prompts-for.js';
import { registryFor } from './registry-for.js';

use(chaiAsPromised);

const cwd = process.cwd();

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
