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

    it("throws for a 'select' prompt without choices", async function () {
      const prompts = [makePrompt({ name: 'license', type: 'select' })];

      await expect(promptsToOptionSpecs(prompts, CONTEXT)).to.be.rejectedWith(
        /select prompt 'license' has no choices/,
      );
    });

    it("copies a 'select' prompt's fixed choices and builds a --<kebab> <value> flag", async function () {
      const choices = ['ts', 'js'];
      const prompts = [
        makePrompt({
          name: 'testFramework',
          type: 'select',
          choices,
          provider: () => 'ts',
        }),
      ];

      const [spec] = await promptsToOptionSpecs(prompts, CONTEXT);

      expect(spec.kind).to.equal('select');
      expect(spec.flag).to.equal('--test-framework <value>');
      expect(spec.choices).to.deep.equal(['ts', 'js']);
      expect(spec.choices).to.not.equal(choices);
    });

    it("resolves a 'select' prompt's choices provider against the context", async function () {
      const prompts = [
        makePrompt({
          name: 'language',
          type: 'select',
          choices: (ctx: PromptContext) =>
            ctx.answers.typed === true ? ['ts'] : ['js'],
        }),
      ];

      const [spec] = await promptsToOptionSpecs(prompts, {
        answers: { typed: true },
        flagsGiven: {},
        configDefaults: {},
      });

      expect(spec.choices).to.deep.equal(['ts']);
    });

    it('copies required onto the spec', async function () {
      const [required, optional] = await promptsToOptionSpecs(
        [makePrompt({ name: 'a', required: true }), makePrompt({ name: 'b' })],
        CONTEXT,
      );

      expect(required.required).to.equal(true);
      expect(optional.required).to.be.undefined;
    });

    it("builds list and repeat flags for a 'list' prompt", async function () {
      const prompts = [
        makePrompt({
          name: 'dependencies',
          type: 'list',
          label: 'Dependencies to add',
          provider: () => [],
        }),
        makePrompt({
          name: 'devDependencies',
          type: 'list',
          provider: () => [],
        }),
      ];

      const [deps, devDeps] = await promptsToOptionSpecs(prompts, CONTEXT);

      expect(deps.flag).to.equal('--dependencies <list>');
      expect(deps.repeatFlag).to.equal('--dependency <pkg>');
      expect(deps.repeatHelpText).to.equal('Dependencies to add (repeatable)');
      expect(devDeps.flag).to.equal('--dev-dependencies <list>');
      expect(devDeps.repeatFlag).to.equal('--dev-dependency <pkg>');
    });

    it("strips one trailing 's' for a non-'ies' list name", async function () {
      const [spec] = await promptsToOptionSpecs(
        [makePrompt({ name: 'tags', type: 'list', provider: () => [] })],
        CONTEXT,
      );

      expect(spec.repeatFlag).to.equal('--tag <pkg>');
    });

    it("keeps a list name without a trailing 's' from colliding with its comma flag", async function () {
      const [spec] = await promptsToOptionSpecs(
        [makePrompt({ name: 'staff', type: 'list', provider: () => [] })],
        CONTEXT,
      );

      expect(spec.flag).to.equal('--staff <list>');
      expect(spec.repeatFlag).to.equal('--staff-item <pkg>');
    });

    it('attaches the source prompt to every spec', async function () {
      const prompt = makePrompt({ name: 'author' });

      const [spec] = await promptsToOptionSpecs([prompt], CONTEXT);

      expect(spec.source).to.equal(prompt);
    });

    it('keeps a prompt whose includePrompt is false when keepGated is set', async function () {
      const prompts = [
        makePrompt({ name: 'createRepo' }),
        makePrompt({ name: 'repoOwner', includePrompt: () => false }),
      ];

      const specs = await promptsToOptionSpecs(prompts, CONTEXT, {
        keepGated: true,
      });

      expect(specs.map(spec => spec.key)).to.deep.equal([
        'createRepo',
        'repoOwner',
      ]);
    });

    it('leaves choices and repeatFlag unset for text/boolean prompts', async function () {
      const [text, bool] = await promptsToOptionSpecs(
        [
          makePrompt({ name: 'author' }),
          makePrompt({
            name: 'gitInit',
            type: 'boolean',
            provider: () => true,
          }),
        ],
        CONTEXT,
      );

      expect(text.choices).to.be.undefined;
      expect(text.repeatFlag).to.be.undefined;
      expect(bool.choices).to.be.undefined;
    });

    describe('ordered defaults', function () {
      const license: Prompt = {
        name: 'license',
        type: 'text',
        label: 'License',
        provider: () => 'UNLICENSED',
        includePrompt: () => true,
        capabilities: [],
      };
      const visibility: Prompt = {
        name: 'repoVisibility',
        type: 'text',
        label: 'Visibility',
        provider: (ctx: PromptContext) =>
          ctx.answers.license === 'UNLICENSED' ? 'private' : 'public',
        includePrompt: () => true,
        capabilities: [],
      };
      const defaultOf = (specs: { key: string; default?: unknown }[]) =>
        specs.find(spec => spec.key === 'repoVisibility')?.default;
      const run = (prompts: Prompt[], answers: Record<string, unknown> = {}) =>
        promptsToOptionSpecs(prompts, { ...CONTEXT, answers });

      it('feeds an earlier default to a later provider', async function () {
        expect(defaultOf(await run([license, visibility]))).to.equal('private');
      });

      it('lets a flag or config value beat the earlier default', async function () {
        expect(
          defaultOf(await run([license, visibility], { license: 'MIT' })),
        ).to.equal('public');
      });

      it('does not show a provider a later prompt', async function () {
        expect(defaultOf(await run([visibility, license]))).to.equal('public');
      });

      it('feeds nothing forward from a skipped prompt', async function () {
        const skipped = makePrompt({
          name: 'license',
          provider: () => 'UNLICENSED',
          includePrompt: () => false,
        });

        expect(defaultOf(await run([skipped, visibility]))).to.equal('public');
      });

      it('feeds nothing forward from a gated prompt kept by keepGated', async function () {
        const gated = makePrompt({
          name: 'license',
          provider: () => 'UNLICENSED',
          includePrompt: () => false,
        });

        const specs = await promptsToOptionSpecs([gated, visibility], CONTEXT, {
          keepGated: true,
        });

        expect(specs.map(spec => spec.key)).to.deep.equal([
          'license',
          'repoVisibility',
        ]);
        expect(defaultOf(specs)).to.equal('public');
      });

      it('leaves unrelated prompts unchanged and in order', async function () {
        const specs = await run([
          makePrompt({ name: 'a' }),
          makePrompt({ name: 'b' }),
        ]);

        expect(specs.map(spec => [spec.key, spec.default])).to.deep.equal([
          ['a', 'a-value'],
          ['b', 'b-value'],
        ]);
      });

      it('does not mutate the caller context answers', async function () {
        const answers = {};
        await run([license, visibility], answers);

        expect(answers).to.deep.equal({});
      });
    });
  });
});
