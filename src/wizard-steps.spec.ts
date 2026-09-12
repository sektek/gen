import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import {
  choicesFor,
  defaultIndexFor,
  explicitOptionKeysFromWizard,
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
});
