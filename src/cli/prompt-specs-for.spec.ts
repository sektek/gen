import type { Prompt } from '@sektek/generator';
import { expect } from 'chai';

import { promptSpecsFor } from './prompt-specs-for.js';

const context = { answers: {}, flagsGiven: {}, configDefaults: {} };

function promptFor(name: string, overrides: Partial<Prompt> = {}): Prompt {
  return {
    name,
    type: 'text',
    label: name,
    provider: () => `${name}-default`,
    includePrompt: () => true,
    capabilities: [],
    ...overrides,
  };
}

describe('promptSpecsFor', function () {
  it('returns nothing for an inPlace generator with no prompts', async function () {
    expect(await promptSpecsFor({ kind: 'inPlace' }, context)).to.deep.equal(
      [],
    );
  });

  it('returns projectName first for a newProjectDir generator', async function () {
    const specs = await promptSpecsFor({ kind: 'newProjectDir' }, context, {
      prompts: [promptFor('author')],
    });

    expect(specs.map(spec => spec.key)).to.deep.equal([
      'projectName',
      'author',
    ]);
  });

  it("returns the namespace's prompts in their declared order, resolved to defaults", async function () {
    const specs = await promptSpecsFor({ kind: 'inPlace' }, context, {
      prompts: [promptFor('b'), promptFor('a')],
    });

    expect(specs.map(spec => [spec.key, spec.default])).to.deep.equal([
      ['b', 'b-default'],
      ['a', 'a-default'],
    ]);
  });

  it('merges a prompt repeated by name into one spec', async function () {
    const specs = await promptSpecsFor({ kind: 'inPlace' }, context, {
      prompts: [promptFor('a'), promptFor('a')],
    });

    expect(specs).to.have.length(1);
  });

  describe('a prompt gated out on the context', function () {
    let gated: Prompt;

    beforeEach(function () {
      gated = promptFor('gated', { includePrompt: () => false });
    });

    it('is dropped by default', async function () {
      const specs = await promptSpecsFor({ kind: 'inPlace' }, context, {
        prompts: [gated],
      });

      expect(specs).to.deep.equal([]);
    });

    it('is kept with keepGated, carrying its source prompt', async function () {
      const specs = await promptSpecsFor({ kind: 'inPlace' }, context, {
        prompts: [gated],
        keepGated: true,
      });

      expect(specs.map(spec => spec.source)).to.deep.equal([gated]);
    });
  });
});
