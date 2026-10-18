import type { Prompt, PromptContext } from '@sektek/generator';
import BasePackageGenerator from '@sektek/generator-js/generators/base-package';
import GitGenerator from '@sektek/generator-base/generators/git';
import { expect } from 'chai';

import { promptsToOptionSpecs } from '../../prompt-adapter.js';

import { mergeAnswer } from './merge-answer.js';
import { nextStep } from './pending-specs.js';

const BASE = { configDefaults: {} };

// Walks the real generator prompts the way the wizard does: each asked step
// is answered from `replies` (or its live default), skipped steps are folded
// in by nextStep(). Returns the keys actually asked and the final answers.
async function walk(
  prompts: Prompt[],
  seed: Record<string, unknown>,
  replies: Record<string, unknown>,
) {
  const context = {
    ...BASE,
    answers: seed,
    flagsGiven: seed,
  } as PromptContext;
  const schema = await promptsToOptionSpecs(prompts, context, {
    keepGated: true,
  });
  let answers: Record<string, unknown> = { ...seed };
  const asked: string[] = [];
  for (;;) {
    const next = await nextStep(schema, answers, BASE, seed);
    answers = next.answers;
    if (!next.spec) {
      return { asked, answers };
    }
    asked.push(next.spec.key);
    const value = Object.hasOwn(replies, next.spec.key)
      ? replies[next.spec.key]
      : next.spec.default;
    answers = mergeAnswer(answers, next.spec.key, value);
  }
}

describe('wizard-steps', function () {
  describe('wizard flow through the generators prompts', function () {
    let git: Prompt[];

    before(function () {
      git = GitGenerator.prompts();
    });

    it('asks every github step when gitInit and createRepo are answered true', async function () {
      const { asked } = await walk(git, {}, { createRepo: true });

      expect(asked).to.deep.equal([
        'gitInit',
        'createRepo',
        'repoOwner',
        'githubToken',
        'repoVisibility',
        'push',
      ]);
    });

    it('skips the github detail steps once createRepo is answered false', async function () {
      const { asked, answers } = await walk(git, {}, { createRepo: false });

      expect(asked).to.deep.equal(['gitInit', 'createRepo']);
      expect(answers).to.include({
        createRepo: false,
        repoVisibility: 'public',
        push: true,
      });
    });

    it('skips createRepo and its details once gitInit is answered false', async function () {
      const { asked, answers } = await walk(git, {}, { gitInit: false });

      expect(asked).to.deep.equal(['gitInit']);
      expect(answers).to.include({ gitInit: false, createRepo: false });
    });

    it('skips createRepo and its details when gitInit is seeded false', async function () {
      const { asked, answers } = await walk(git, { gitInit: false }, {});

      expect(asked).to.deep.equal([]);
      expect(answers).to.include({ gitInit: false, createRepo: false });
    });

    it('skips private once license is answered UNLICENSED', async function () {
      const { asked, answers } = await walk(
        BasePackageGenerator.prompts(),
        {},
        { license: 'UNLICENSED' },
      );

      expect(asked).to.include('license');
      expect(asked).to.not.include('private');
      expect(answers.private).to.equal(true);
    });

    it('asks private for any other license', async function () {
      const { asked } = await walk(
        BasePackageGenerator.prompts(),
        {},
        { license: 'MIT' },
      );

      expect(asked).to.include('private');
    });

    it('asks repoVisibility, defaulting to private, for UNLICENSED with createRepo', async function () {
      const { asked, answers } = await walk(
        [...BasePackageGenerator.prompts(), ...git],
        {},
        { license: 'UNLICENSED', createRepo: true },
      );

      expect(asked).to.include('repoVisibility');
      expect(asked).to.not.include('private');
      expect(answers.repoVisibility).to.equal('private');
    });
  });
});
