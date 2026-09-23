import { type PredicateFn, getComponent } from '@sektek/utility-belt';
import type { Prompt, PromptContext } from '@sektek/generator';
import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { mergeByName, promptsToOptionSpecs } from './prompt-adapter.js';

use(chaiAsPromised);

const CONTEXT: PromptContext = {
  answers: {},
  flagsGiven: {},
  configDefaults: {},
};

// Mirrors git/index.spec.ts's own `provide` helper: a Prompt's
// includePrompt/provider fields are Components (either a bare function or
// an object with the named method, e.g. anyOf()'s AnyPredicate), so tests
// resolve them the same way promptsToOptionSpecs itself does rather than
// assuming either shape.
function testOf(prompt: Prompt): PredicateFn<PromptContext> {
  return getComponent(prompt.includePrompt, 'test');
}

function makePrompt(overrides: Partial<Prompt> & Pick<Prompt, 'name'>): Prompt {
  return {
    type: 'text',
    label: overrides.name,
    provider: () => `${overrides.name}-value`,
    includePrompt: () => true,
    capabilities: [],
    ...overrides,
  };
}

describe('prompt-adapter', function () {
  describe('mergeByName', function () {
    it('leaves distinctly-named prompts untouched', function () {
      const prompts = [
        makePrompt({ name: 'author' }),
        makePrompt({ name: 'license' }),
      ];

      expect(mergeByName(prompts)).to.deep.equal(prompts);
    });

    it('collapses same-name prompts into one, in first-seen order', function () {
      const first = makePrompt({ name: 'author', label: 'Author (first)' });
      const second = makePrompt({ name: 'author', label: 'Author (second)' });

      const merged = mergeByName([first, second]);

      expect(merged).to.have.lengthOf(1);
      expect(merged[0].label).to.equal('Author (first)');
    });

    it("combines a collision's includePrompt via anyOf, not allOf", async function () {
      const wantsLicense = makePrompt({
        name: 'author',
        includePrompt: (ctx: PromptContext) =>
          ctx.answers.wantsLicense === true,
      });
      const wantsPackage = makePrompt({
        name: 'author',
        includePrompt: (ctx: PromptContext) =>
          ctx.answers.wantsPackage === true,
      });

      const [merged] = mergeByName([wantsLicense, wantsPackage]);
      const test = testOf(merged);

      // Neither side alone would include it...
      expect(
        await test({
          answers: { wantsLicense: false, wantsPackage: false },
          flagsGiven: {},
          configDefaults: {},
        }),
      ).to.equal(false);
      // ...but anyOf includes it once either does.
      expect(
        await test({
          answers: { wantsLicense: true, wantsPackage: false },
          flagsGiven: {},
          configDefaults: {},
        }),
      ).to.equal(true);
      expect(
        await test({
          answers: { wantsLicense: false, wantsPackage: true },
          flagsGiven: {},
          configDefaults: {},
        }),
      ).to.equal(true);
    });
  });

  describe('promptsToOptionSpecs', function () {
    it('maps name/label/type/hint straight across', async function () {
      const prompts = [
        makePrompt({
          name: 'author',
          label: 'Author',
          hint: 'Who wrote this?',
          provider: () => 'Edward Kelly',
        }),
      ];

      const [spec] = await promptsToOptionSpecs(prompts, CONTEXT);

      expect(spec.key).to.equal('author');
      expect(spec.prompt).to.equal('Author');
      // hint is the wizard's status-bar text (schema.ts's OptionSpec.hint),
      // distinct from helpText (CLI --help only) — a Prompt has no
      // CLI-help-specific field, so helpText is deliberately left unset
      // here and falls back to `prompt`.
      expect(spec.hint).to.equal('Who wrote this?');
      expect(spec.helpText).to.be.undefined;
      expect(spec.kind).to.equal('text');
    });

    it("carries a prompt's capabilities through to the spec", async function () {
      const capabilities = [{ type: 'clearable' as const, value: undefined }];
      const prompts = [makePrompt({ name: 'packageScope', capabilities })];

      const [spec] = await promptsToOptionSpecs(prompts, CONTEXT);

      expect(spec.capabilities).to.equal(capabilities);
    });

    it("resolves provider() eagerly into the spec's default", async function () {
      const prompts = [
        makePrompt({ name: 'author', provider: () => 'Edward Kelly' }),
      ];

      const [spec] = await promptsToOptionSpecs(prompts, CONTEXT);

      expect(spec.default).to.equal('Edward Kelly');
    });

    it('passes the given PromptContext through to provider()', async function () {
      const prompts = [
        makePrompt({
          name: 'author',
          provider: (ctx: PromptContext) => ctx.answers.name,
        }),
      ];

      const [spec] = await promptsToOptionSpecs(prompts, {
        answers: { name: 'Ada Lovelace' },
        flagsGiven: {},
        configDefaults: {},
      });

      expect(spec.default).to.equal('Ada Lovelace');
    });

    it('builds a --<kebab-case> <value> flag for a non-boolean prompt', async function () {
      const prompts = [makePrompt({ name: 'repoOwner' })];

      const [spec] = await promptsToOptionSpecs(prompts, CONTEXT);

      expect(spec.flag).to.equal('--repo-owner <value>');
    });

    it('builds a --no-<kebab-case> flag for a boolean prompt whose resolved default is true', async function () {
      const prompts = [
        makePrompt({ name: 'gitInit', type: 'boolean', provider: () => true }),
      ];

      const [spec] = await promptsToOptionSpecs(prompts, CONTEXT);

      expect(spec.flag).to.equal('--no-git-init');
    });

    it('builds a bare --<kebab-case> flag for a boolean prompt whose resolved default is false', async function () {
      const prompts = [
        makePrompt({
          name: 'createRepo',
          type: 'boolean',
          provider: () => false,
        }),
      ];

      const [spec] = await promptsToOptionSpecs(prompts, CONTEXT);

      expect(spec.flag).to.equal('--create-repo');
    });

    it('excludes a prompt whose includePrompt resolves false', async function () {
      const prompts = [
        makePrompt({ name: 'createRepo' }),
        makePrompt({ name: 'repoVisibility', includePrompt: () => false }),
      ];

      const specs = await promptsToOptionSpecs(prompts, CONTEXT);

      expect(specs.map(spec => spec.key)).to.deep.equal(['createRepo']);
    });

    it('evaluates includePrompt against the given context', async function () {
      const prompts = [
        makePrompt({
          name: 'repoVisibility',
          includePrompt: (ctx: PromptContext) =>
            ctx.answers.createRepo === true,
        }),
      ];

      expect(await promptsToOptionSpecs(prompts, CONTEXT)).to.have.lengthOf(0);
      expect(
        await promptsToOptionSpecs(prompts, {
          answers: { createRepo: true },
          flagsGiven: {},
          configDefaults: {},
        }),
      ).to.have.lengthOf(1);
    });

    it('merges a same-name collision into one spec, included if either consumer needs it', async function () {
      const fromLicense = makePrompt({
        name: 'author',
        includePrompt: (ctx: PromptContext) => ctx.answers.license === 'MIT',
      });
      const fromBasePackage = makePrompt({
        name: 'author',
        includePrompt: () => true,
      });

      const specs = await promptsToOptionSpecs(
        [fromLicense, fromBasePackage],
        CONTEXT,
      );

      expect(specs).to.have.lengthOf(1);
      expect(specs[0].key).to.equal('author');
    });

    it('throws for a prompt type outside the known OptionKinds', async function () {
      const prompts = [makePrompt({ name: 'weird', type: 'not-a-real-kind' })];

      await expect(promptsToOptionSpecs(prompts, CONTEXT)).to.be.rejectedWith(
        /unsupported type 'not-a-real-kind'/,
      );
    });

    it("throws for a 'select' prompt, since Prompt has no choices field to map", async function () {
      const prompts = [makePrompt({ name: 'license', type: 'select' })];

      await expect(promptsToOptionSpecs(prompts, CONTEXT)).to.be.rejectedWith(
        /unsupported type 'select'/,
      );
    });
  });
});
