import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import {
  applyBackspace,
  applyTypedInput,
  choicesFor,
  createRepoImpliedAnswers,
  defaultIndexFor,
  explicitOptionKeysFromWizard,
  gitInitImpliedAnswers,
  hintsFor,
  initialAnswers,
  licenseImpliedAnswers,
  mergeAnswer,
  pendingSpecs,
  projectNameError,
} from './wizard-steps.js';
import type { OptionSpec } from './schema.js';

const textSpec: OptionSpec = {
  key: 'description',
  flag: '--description <value>',
  prompt: 'Project description',
  kind: 'text',
};

const selectSpec: OptionSpec = {
  key: 'language',
  flag: '--language <value>',
  prompt: 'Language',
  kind: 'select',
  choices: ['javascript', 'typescript'],
  default: 'javascript',
};

const booleanSpec: OptionSpec = {
  key: 'private',
  flag: '--no-private',
  prompt: 'Private package?',
  kind: 'boolean',
  default: true,
};

// Default is deliberately not the first choice, to exercise
// defaultIndexFor() actually finding it rather than always landing on 0.
const selectSpecDefaultSecond: OptionSpec = {
  key: 'runtime',
  flag: '--runtime <value>',
  prompt: 'Runtime',
  kind: 'select',
  choices: ['node', 'deno'],
  default: 'deno',
};

const booleanSpecDefaultFalse: OptionSpec = {
  key: 'verbose',
  flag: '--verbose',
  prompt: 'Verbose output?',
  kind: 'boolean',
  default: false,
};

const selectSpecNoChoices: OptionSpec = {
  key: 'target',
  flag: '--target <value>',
  prompt: 'Target',
  kind: 'select',
};

const listSpec: OptionSpec = {
  key: 'dependencies',
  flag: '--dependencies <list>',
  repeatFlag: '--dependency <pkg>',
  prompt: 'Dependencies to add',
  kind: 'list',
  default: [],
};

// Mirrors GIT_OPTIONS + GITHUB_OPTIONS from schema.ts, for exercising
// createRepoImpliedAnswers/gitInitImpliedAnswers against the real shape of
// that block.
const gitInitSpec: OptionSpec = {
  key: 'gitInit',
  flag: '--no-git-init',
  prompt: 'Initialize a local git repo with an initial commit?',
  kind: 'boolean',
  default: true,
};

const createRepoSpec: OptionSpec = {
  key: 'createRepo',
  flag: '--create-repo',
  prompt: 'Create a GitHub repo and push?',
  kind: 'boolean',
  default: false,
};

const repoVisibilitySpec: OptionSpec = {
  key: 'repoVisibility',
  flag: '--repo-visibility <value>',
  prompt: 'Repo visibility',
  kind: 'select',
  choices: ['public', 'private'],
  default: 'private',
};

const repoOwnerSpec: OptionSpec = {
  key: 'repoOwner',
  flag: '--repo-owner <value>',
  prompt: 'GitHub org (blank = your account)',
  kind: 'text',
};

const githubTokenSpec: OptionSpec = {
  key: 'githubToken',
  flag: '--github-token <value>',
  prompt: 'GitHub token (blank = env/gh CLI)',
  kind: 'text',
};

const pushSpec: OptionSpec = {
  key: 'push',
  flag: '--no-push',
  prompt: 'Push after committing?',
  kind: 'boolean',
  default: true,
};

const githubSchema: OptionSpec[] = [
  gitInitSpec,
  createRepoSpec,
  repoVisibilitySpec,
  repoOwnerSpec,
  githubTokenSpec,
  pushSpec,
];

describe('wizard-steps', function () {
  describe('pendingSpecs', function () {
    it('returns every spec when seed is empty', function () {
      expect(pendingSpecs([textSpec, selectSpec], {})).to.deep.equal([
        textSpec,
        selectSpec,
      ]);
    });

    it('skips a spec whose key is already in seed', function () {
      expect(
        pendingSpecs([textSpec, selectSpec], { description: 'already set' }),
      ).to.deep.equal([selectSpec]);
    });

    it('skips a spec seeded with an explicit undefined value', function () {
      // Not "still pending" — a value of undefined means this key was
      // deliberately answered (e.g. an optional text field left blank),
      // not that it's absent. See pendingSpecs()'s own doc comment.
      expect(
        pendingSpecs([textSpec], { description: undefined }),
      ).to.deep.equal([]);
    });

    it('does not skip a spec whose key is entirely absent from seed', function () {
      expect(pendingSpecs([textSpec], {})).to.deep.equal([textSpec]);
    });

    it('never includes a kind: "list" spec, even when its key is absent from seed', function () {
      // SEK-87: "the wizard should not provide the option to add when
      // being run interactively" - dependencies/devDependencies must never
      // be walked as a wizard step, regardless of seed state.
      expect(pendingSpecs([textSpec, listSpec], {})).to.deep.equal([textSpec]);
    });

    it('never includes a kind: "list" spec even when it is already in seed', function () {
      expect(
        pendingSpecs([textSpec, listSpec], { dependencies: ['lodash'] }),
      ).to.deep.equal([textSpec]);
    });
  });

  describe('choicesFor', function () {
    it('maps a select spec into label/value pairs', function () {
      expect(choicesFor(selectSpec)).to.deep.equal([
        { label: 'javascript', value: 'javascript' },
        { label: 'typescript', value: 'typescript' },
      ]);
    });

    it('returns a synthetic Yes/No choice list for a boolean spec', function () {
      expect(choicesFor(booleanSpec)).to.deep.equal([
        { label: 'Yes', value: true },
        { label: 'No', value: false },
      ]);
    });

    it('throws for a text spec', function () {
      expect(() => choicesFor(textSpec)).to.throw(/only supports/);
    });

    it('throws for a select spec with no choices', function () {
      expect(() => choicesFor(selectSpecNoChoices)).to.throw(/no choices/);
    });
  });

  describe('defaultIndexFor', function () {
    it('finds a select default that is not the first choice', function () {
      const choices = choicesFor(selectSpecDefaultSecond);
      expect(defaultIndexFor(selectSpecDefaultSecond, choices)).to.equal(1);
    });

    it('finds a boolean default of false (the second choice)', function () {
      const choices = choicesFor(booleanSpecDefaultFalse);
      expect(defaultIndexFor(booleanSpecDefaultFalse, choices)).to.equal(1);
    });

    it('finds a boolean default of true (the first choice)', function () {
      const choices = choicesFor(booleanSpec);
      expect(defaultIndexFor(booleanSpec, choices)).to.equal(0);
    });

    it('falls back to 0 when the spec has no default', function () {
      expect(defaultIndexFor(textSpec, [])).to.equal(0);
    });

    it("falls back to 0 when the default doesn't match any choice", function () {
      const choices = choicesFor(selectSpec);
      const specWithUnknownDefault = { ...selectSpec, default: 'rust' };
      expect(defaultIndexFor(specWithUnknownDefault, choices)).to.equal(0);
    });
  });

  describe('licenseImpliedAnswers', function () {
    const licenseSpec: OptionSpec = {
      key: 'license',
      flag: '--license <value>',
      prompt: 'License',
      kind: 'text',
      default: 'UNLICENSED',
    };

    const privateSpec: OptionSpec = {
      key: 'private',
      flag: '--no-private',
      prompt: 'Private package?',
      kind: 'boolean',
      default: true,
    };

    const repoVisibilitySpec: OptionSpec = {
      key: 'repoVisibility',
      flag: '--repo-visibility <value>',
      prompt: 'Repo visibility',
      kind: 'select',
      choices: ['public', 'private'],
      default: 'private',
    };

    it('returns nothing when license is not UNLICENSED', function () {
      expect(
        licenseImpliedAnswers('MIT', [
          licenseSpec,
          privateSpec,
          repoVisibilitySpec,
        ]),
      ).to.deep.equal({});
    });

    it('implies private and repoVisibility when both keys are in schema', function () {
      expect(
        licenseImpliedAnswers('UNLICENSED', [
          licenseSpec,
          privateSpec,
          repoVisibilitySpec,
        ]),
      ).to.deep.equal({ private: true, repoVisibility: 'private' });
    });

    it('implies only repoVisibility for a base-only schema with no private key', function () {
      expect(
        licenseImpliedAnswers('UNLICENSED', [repoVisibilitySpec]),
      ).to.deep.equal({ repoVisibility: 'private' });
    });

    it('implies nothing when the schema has neither key', function () {
      expect(licenseImpliedAnswers('UNLICENSED', [licenseSpec])).to.deep.equal(
        {},
      );
    });
  });

  describe('createRepoImpliedAnswers', function () {
    it('returns nothing when createRepo is not false', function () {
      expect(createRepoImpliedAnswers(true, githubSchema)).to.deep.equal({});
      expect(createRepoImpliedAnswers(undefined, githubSchema)).to.deep.equal(
        {},
      );
    });

    it('implies each github-detail key at its own schema default when createRepo is false', function () {
      expect(createRepoImpliedAnswers(false, githubSchema)).to.deep.equal({
        repoVisibility: 'private',
        repoOwner: undefined,
        githubToken: undefined,
        push: true,
      });
    });

    it('never implies createRepo itself', function () {
      // createRepo is already the key being answered here — it's gitInit's
      // job (see gitInitImpliedAnswers) to imply createRepo's own value.
      expect(
        createRepoImpliedAnswers(false, githubSchema),
      ).to.not.have.property('createRepo');
    });

    it('only implies keys actually present in schema', function () {
      expect(createRepoImpliedAnswers(false, [createRepoSpec])).to.deep.equal(
        {},
      );
    });
  });

  describe('gitInitImpliedAnswers', function () {
    it('returns nothing when gitInit is not false', function () {
      expect(gitInitImpliedAnswers(true, githubSchema)).to.deep.equal({});
      expect(gitInitImpliedAnswers(undefined, githubSchema)).to.deep.equal({});
    });

    it('implies createRepo plus every github-detail key when gitInit is false', function () {
      expect(gitInitImpliedAnswers(false, githubSchema)).to.deep.equal({
        createRepo: false,
        repoVisibility: 'private',
        repoOwner: undefined,
        githubToken: undefined,
        push: true,
      });
    });

    it('only implies keys actually present in schema', function () {
      expect(gitInitImpliedAnswers(false, [gitInitSpec])).to.deep.equal({});
    });

    // Regression test: withConfigDefaults() (schema.ts) can override a
    // spec's own `default` from a config file — createRepo's included, so
    // a config setting createRepo's default to true must not survive into
    // the implied answer once gitInit is declined, or the wizard would
    // silently finish with createRepo: true and no local repo to push from.
    it('forces createRepo to false even when its schema default has been overridden to true', function () {
      const schemaWithOverriddenDefault = githubSchema.map(spec =>
        spec.key === 'createRepo' ? { ...spec, default: true } : spec,
      );

      expect(
        gitInitImpliedAnswers(false, schemaWithOverriddenDefault).createRepo,
      ).to.equal(false);
    });
  });

  describe('initialAnswers', function () {
    const jsSchema: OptionSpec[] = [
      {
        key: 'license',
        flag: '--license <value>',
        prompt: 'License',
        kind: 'text',
        default: 'UNLICENSED',
      },
      {
        key: 'private',
        flag: '--no-private',
        prompt: 'Private package?',
        kind: 'boolean',
        default: true,
      },
      {
        key: 'repoVisibility',
        flag: '--repo-visibility <value>',
        prompt: 'Repo visibility',
        kind: 'select',
        choices: ['public', 'private'],
        default: 'private',
      },
    ];

    it('fills in nothing extra when license is not seeded as UNLICENSED', function () {
      expect(initialAnswers({}, jsSchema)).to.deep.equal({});
    });

    it('fills in the implied answers when license is seeded as UNLICENSED', function () {
      expect(initialAnswers({ license: 'UNLICENSED' }, jsSchema)).to.deep.equal(
        {
          license: 'UNLICENSED',
          private: true,
          repoVisibility: 'private',
        },
      );
    });

    it('lets an explicit conflicting seed value win over the implied one', function () {
      // Regression: seed must survive so applyLicenseImplications() can
      // still see (and warn about) the conflict downstream, instead of it
      // looking like `private` was already true all along.
      expect(
        initialAnswers({ license: 'UNLICENSED', private: false }, jsSchema),
      ).to.deep.equal({
        license: 'UNLICENSED',
        private: false,
        repoVisibility: 'private',
      });
    });

    it('fills in the implied answers when createRepo is seeded as false', function () {
      expect(initialAnswers({ createRepo: false }, githubSchema)).to.deep.equal(
        {
          createRepo: false,
          repoVisibility: 'private',
          repoOwner: undefined,
          githubToken: undefined,
          push: true,
        },
      );
    });

    it('fills in the whole github block when gitInit is seeded as false', function () {
      // SEK-89: declining gitInit skips createRepo's own question too, not
      // just the details behind it.
      expect(initialAnswers({ gitInit: false }, githubSchema)).to.deep.equal({
        gitInit: false,
        createRepo: false,
        repoVisibility: 'private',
        repoOwner: undefined,
        githubToken: undefined,
        push: true,
      });
    });

    it('leaves the github block untouched when neither gitInit nor createRepo is seeded false', function () {
      expect(initialAnswers({}, githubSchema)).to.deep.equal({});
    });
  });

  describe('mergeAnswer', function () {
    const jsSchema: OptionSpec[] = [
      {
        key: 'license',
        flag: '--license <value>',
        prompt: 'License',
        kind: 'text',
        default: 'UNLICENSED',
      },
      {
        key: 'private',
        flag: '--no-private',
        prompt: 'Private package?',
        kind: 'boolean',
        default: true,
      },
    ];

    it('records a non-license answer as-is', function () {
      expect(mergeAnswer({}, 'language', 'typescript', jsSchema)).to.deep.equal(
        { language: 'typescript' },
      );
    });

    it('fills in implied answers when license is answered as UNLICENSED', function () {
      expect(mergeAnswer({}, 'license', 'UNLICENSED', jsSchema)).to.deep.equal({
        license: 'UNLICENSED',
        private: true,
      });
    });

    it('lets an already-known answer win over what license implies', function () {
      // Regression: if `private` was already seeded/answered before the
      // wizard reaches `license`, answering license as UNLICENSED must not
      // silently overwrite it — the conflict needs to survive for
      // applyLicenseImplications() to report.
      expect(
        mergeAnswer({ private: false }, 'license', 'UNLICENSED', jsSchema),
      ).to.deep.equal({ license: 'UNLICENSED', private: false });
    });

    it('fills in the remaining github-detail answers when createRepo is answered false', function () {
      expect(mergeAnswer({}, 'createRepo', false, githubSchema)).to.deep.equal({
        createRepo: false,
        repoVisibility: 'private',
        repoOwner: undefined,
        githubToken: undefined,
        push: true,
      });
    });

    it('fills in the whole github block when gitInit is answered false', function () {
      expect(mergeAnswer({}, 'gitInit', false, githubSchema)).to.deep.equal({
        gitInit: false,
        createRepo: false,
        repoVisibility: 'private',
        repoOwner: undefined,
        githubToken: undefined,
        push: true,
      });
    });

    it('records createRepo as true as-is, implying nothing', function () {
      expect(mergeAnswer({}, 'createRepo', true, githubSchema)).to.deep.equal({
        createRepo: true,
      });
    });
  });

  describe('pendingSpecs + initialAnswers/mergeAnswer integration', function () {
    // SEK-89: the actual bug report — the wizard kept asking
    // repoVisibility/repoOwner/githubToken/push after "No" to createRepo,
    // and the whole github block (including createRepo itself) after "No"
    // to gitInit.
    it('skips straight past the github detail steps once createRepo is answered false', function () {
      // gitInit answered true first, matching real wizard step order —
      // otherwise gitInit itself would still be pending below.
      let answers = mergeAnswer({}, 'gitInit', true, githubSchema);
      answers = mergeAnswer(answers, 'createRepo', false, githubSchema);
      expect(pendingSpecs(githubSchema, answers)).to.deep.equal([]);
    });

    it('skips straight past the entire github block once gitInit is answered false', function () {
      const answers = mergeAnswer({}, 'gitInit', false, githubSchema);
      expect(pendingSpecs(githubSchema, answers)).to.deep.equal([]);
    });

    it('still asks every github step when gitInit/createRepo are answered true', function () {
      let answers = mergeAnswer({}, 'gitInit', true, githubSchema);
      answers = mergeAnswer(answers, 'createRepo', true, githubSchema);
      expect(pendingSpecs(githubSchema, answers)).to.deep.equal([
        repoVisibilitySpec,
        repoOwnerSpec,
        githubTokenSpec,
        pushSpec,
      ]);
    });
  });

  describe('explicitOptionKeysFromWizard', function () {
    it('unions flagsGiven and answeredKeys, deduped', function () {
      expect(
        explicitOptionKeysFromWizard({ license: 'MIT' }, ['license', 'author']),
      ).to.deep.equal(['license', 'author']);
    });

    it('excludes a key only present because it was implied, not answered', function () {
      expect(explicitOptionKeysFromWizard({}, ['license'])).to.deep.equal([
        'license',
      ]);
    });

    it('returns nothing when neither flags nor live answers were given', function () {
      expect(explicitOptionKeysFromWizard({}, [])).to.deep.equal([]);
    });
  });

  describe('projectNameError', function () {
    let cwd: string;

    beforeEach(function () {
      cwd = mkdtempSync(join(tmpdir(), 'sektek-gen-wizard-steps-'));
    });

    afterEach(function () {
      rmSync(cwd, { recursive: true, force: true });
    });

    it('returns undefined for a name that is safe and not already taken', function () {
      expect(projectNameError('brave-otter', cwd)).to.be.undefined;
    });

    it("rejects a name that isn't a safe path segment", function () {
      expect(projectNameError('../escaped', cwd)).to.match(
        /isn't a valid directory name/,
      );
    });

    it('rejects a name that already exists under cwd', function () {
      mkdirSync(join(cwd, 'taken-name'));
      expect(projectNameError('taken-name', cwd)).to.match(/already exists/);
    });
  });

  describe('hintsFor', function () {
    const generatedTextSpec: OptionSpec = {
      ...textSpec,
      generateDefault: () => 'brave-otter',
    };
    const clearableAsyncTextSpec: OptionSpec = {
      ...textSpec,
      allowClear: true,
      generateDefaultAsync: async () => 'acme',
    };

    it('returns nothing once every step is answered', function () {
      expect(hintsFor(undefined)).to.deep.equal([]);
    });

    it('shows Enter-to-confirm for a plain text spec', function () {
      expect(hintsFor(textSpec)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
      ]);
    });

    it('adds a ^R hint for a generateDefault text spec while pristine', function () {
      expect(hintsFor(generatedTextSpec, true)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
        { key: '^R', label: 'new name' },
      ]);
    });

    it('omits the ^R hint for a generateDefault text spec once edited', function () {
      expect(hintsFor(generatedTextSpec, false)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
      ]);
    });

    it('defaults to omitting the ^R hint when isPristine is not given', function () {
      expect(hintsFor(generatedTextSpec)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
      ]);
    });

    it('adds a ^X hint for an allowClear spec while pristine', function () {
      expect(hintsFor(clearableAsyncTextSpec, true)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
        { key: '^X', label: 'clear' },
      ]);
    });

    it('omits the ^X hint for an allowClear spec once edited', function () {
      expect(hintsFor(clearableAsyncTextSpec, false)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
      ]);
    });

    it('omits the ^X hint for a generateDefault spec that does not allow clearing', function () {
      expect(hintsFor(generatedTextSpec, true)).to.deep.equal([
        { key: 'Enter', label: 'confirm' },
        { key: '^R', label: 'new name' },
      ]);
    });

    it('shows move/select for a select spec', function () {
      expect(hintsFor(selectSpec)).to.deep.equal([
        { key: '↑↓', label: 'move' },
        { key: 'Enter', label: 'select' },
      ]);
    });

    it('shows move/select for a boolean spec', function () {
      expect(hintsFor(booleanSpec)).to.deep.equal([
        { key: '↑↓', label: 'move' },
        { key: 'Enter', label: 'select' },
      ]);
    });
  });

  describe('applyBackspace', function () {
    it('clears a pristine value outright, regardless of cursor position', function () {
      expect(
        applyBackspace('brave-otter', 5, true, 'brave-otter'),
      ).to.deep.equal({
        value: '',
        cursorOffset: 0,
      });
    });

    it('removes the character before the cursor when not pristine', function () {
      expect(
        applyBackspace('brave-otter', 5, false, 'brave-otter'),
      ).to.deep.equal({ value: 'brav-otter', cursorOffset: 4 });
    });

    it('is a no-op at the start of the field when not pristine', function () {
      expect(
        applyBackspace('brave-otter', 0, false, 'brave-otter'),
      ).to.deep.equal({ value: 'brave-otter', cursorOffset: 0 });
    });

    it("restores the suggested default (cursor at the start) once the user's own text is erased to nothing", function () {
      expect(applyBackspace('x', 1, false, 'brave-otter')).to.deep.equal({
        value: 'brave-otter',
        cursorOffset: 0,
      });
    });
  });

  describe('applyTypedInput', function () {
    it('replaces a pristine value outright with just what was typed', function () {
      expect(applyTypedInput('brave-otter', 5, true, 'x')).to.deep.equal({
        value: 'x',
        cursorOffset: 1,
      });
    });

    it('inserts at the cursor when not pristine', function () {
      expect(applyTypedInput('brave-otter', 5, false, 'x')).to.deep.equal({
        value: 'bravex-otter',
        cursorOffset: 6,
      });
    });
  });
});
