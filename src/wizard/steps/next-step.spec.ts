import type { Prompt, PromptContext } from '@sektek/generator';
import { expect } from 'chai';

import type { OptionSpec } from '../../types/index.js';

import { nextStep } from './pending-specs.js';

const BASE = { configDefaults: {} };

function specFor(
  key: string,
  overrides: Partial<Prompt>,
  kind: OptionSpec['kind'] = 'text',
): OptionSpec {
  const source: Prompt = {
    name: key,
    type: kind,
    label: key,
    provider: () => `${key}-default`,
    includePrompt: () => true,
    capabilities: [],
    ...overrides,
  };
  return { key, flag: `--${key}`, prompt: key, kind, source };
}

const a = specFor('a', { type: 'boolean', provider: () => false }, 'boolean');
const b = specFor('b', {
  includePrompt: (ctx: PromptContext) => ctx.answers.a === true,
  provider: (ctx: PromptContext) => `b-for-${String(ctx.answers.a)}`,
});

describe('wizard-steps', function () {
  describe('nextStep', function () {
    it('returns a spec without a source untouched', async function () {
      const plain: OptionSpec = {
        key: 'x',
        flag: '--x',
        prompt: 'x',
        kind: 'text',
      };

      const result = await nextStep([plain], {}, BASE, {});

      expect(result.spec).to.equal(plain);
    });

    it('asks a gated step once the earlier answer makes it pass', async function () {
      const first = await nextStep([a, b], {}, BASE, {});
      expect(first.spec?.key).to.equal('a');

      const second = await nextStep([a, b], { a: true }, BASE, {});
      expect(second.spec?.key).to.equal('b');
    });

    it('skips a gated step when the earlier answer fails it, recording its default', async function () {
      const result = await nextStep([a, b], { a: false }, BASE, {});

      expect(result.spec).to.equal(undefined);
      expect(result.answers).to.deep.equal({ a: false, b: 'b-for-false' });
    });

    it('recomputes an answer-dependent default from the live answers', async function () {
      const c = specFor('c', {
        provider: (ctx: PromptContext) => `scope-${String(ctx.answers.owner)}`,
      });

      const first = await nextStep([c], { owner: 'x' }, BASE, {});
      const second = await nextStep([c], { owner: 'y' }, BASE, {});

      expect(first.spec?.default).to.equal('scope-x');
      expect(second.spec?.default).to.equal('scope-y');
    });

    it('supports async predicates and providers', async function () {
      const d = specFor('d', {
        includePrompt: async () => true,
        provider: async () => 'later',
      });

      const result = await nextStep([d], {}, BASE, {});

      expect(result.spec?.default).to.equal('later');
    });
  });
});
