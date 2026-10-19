import { Command } from 'commander';
import { expect } from 'chai';

import { addSchemaOptions, flagsGivenFor, resolve } from './options.js';
import type { OptionSpec } from './types/index.js';

const profile: OptionSpec = {
  key: 'profile',
  flag: '--profile <value>',
  prompt: 'Profile',
  kind: 'text',
  default: 'default',
};

const gitInit: OptionSpec = {
  key: 'gitInit',
  flag: '--no-git-init',
  prompt: 'Initialize a local git repo?',
  kind: 'boolean',
  default: true,
};

const language: OptionSpec = {
  key: 'language',
  flag: '--language <value>',
  prompt: 'Language',
  kind: 'select',
  choices: ['javascript', 'typescript'],
  default: 'javascript',
};

const dependencies: OptionSpec = {
  key: 'dependencies',
  flag: '--dependencies <list>',
  repeatFlag: '--dependency <pkg>',
  prompt: 'Dependencies to add',
  repeatHelpText: 'Add a dependency; repeatable',
  kind: 'list',
  default: [],
};

const devDependencies: OptionSpec = {
  key: 'devDependencies',
  flag: '--dev-dependencies <list>',
  repeatFlag: '--dev-dependency <pkg>',
  prompt: 'Dev dependencies to add',
  repeatHelpText: 'Add a dev dependency; repeatable',
  kind: 'list',
  default: [],
};

const BASE_SPECS = [profile, gitInit];
const JS_SPECS = [profile, language, dependencies, devDependencies];

describe('options', function () {
  describe('resolve', function () {
    it('fills in defaults when no flags are given', function () {
      const resolved = resolve(BASE_SPECS, {});

      expect(resolved).to.deep.equal({ profile: 'default', gitInit: true });
    });

    it('lets a given flag override its default', function () {
      const resolved = resolve(BASE_SPECS, { profile: 'ci' });

      expect(resolved.profile).to.equal('ci');
      expect(resolved.gitInit).to.equal(true);
    });

    it('throws one aggregated error listing every missing required option', function () {
      expect(() =>
        resolve(
          [
            {
              key: 'apiKey',
              flag: '--api-key <value>',
              prompt: 'API key',
              kind: 'text',
              required: true,
            },
            {
              key: 'apiSecret',
              flag: '--api-secret <value>',
              prompt: 'API secret',
              kind: 'text',
              required: true,
            },
          ],
          {},
        ),
      ).to.throw('Missing required option(s): apiKey, apiSecret');
    });

    it('throws when a select option is given a value outside its choices', function () {
      expect(() => resolve(JS_SPECS, { language: 'foo' })).to.throw(
        'Invalid value for language: "foo" (expected one of: javascript, typescript)',
      );
    });

    it('accepts a select option value that is one of its choices', function () {
      const resolved = resolve(JS_SPECS, { language: 'typescript' });

      expect(resolved.language).to.equal('typescript');
    });

    it('lets a config default override the spec default', function () {
      const resolved = resolve(BASE_SPECS, {}, { profile: 'from config' });

      expect(resolved.profile).to.equal('from config');
    });

    it('lets a given flag override a config default', function () {
      const resolved = resolve(
        BASE_SPECS,
        { profile: 'from flag' },
        { profile: 'from config' },
      );

      expect(resolved.profile).to.equal('from flag');
    });

    it('ignores a config default with no matching spec key', function () {
      const resolved = resolve(BASE_SPECS, {}, { notInSpecs: 'whatever' });

      expect(resolved).to.not.have.property('notInSpecs');
    });

    it('does not let an explicitly undefined config value override the spec default', function () {
      const resolved = resolve(BASE_SPECS, {}, { profile: undefined });

      expect(resolved.profile).to.equal('default');
    });

    it('defaults dependencies/devDependencies to an empty array when nothing is given', function () {
      const resolved = resolve(JS_SPECS, {});

      expect(resolved.dependencies).to.deep.equal([]);
      expect(resolved.devDependencies).to.deep.equal([]);
    });

    it('does not trip required/select validation for a kind: "list" spec', function () {
      // Guards against ever adding required/choices to a list spec and
      // quietly reintroducing validation for a kind resolve() doesn't check.
      expect(() =>
        resolve(JS_SPECS, { dependencies: ['lodash@4.17.21'] }),
      ).to.not.throw();
    });

    it('lets a given dependencies array flow straight through', function () {
      const resolved = resolve(JS_SPECS, {
        dependencies: ['lodash@4.17.21'],
        devDependencies: ['mocha'],
      });

      expect(resolved.dependencies).to.deep.equal(['lodash@4.17.21']);
      expect(resolved.devDependencies).to.deep.equal(['mocha']);
    });
  });

  describe('addSchemaOptions', function () {
    const helpFor = (flag: string) => {
      const command = new Command();
      addSchemaOptions(command, JS_SPECS);
      return command.options.find(option => option.flags.includes(flag))
        ?.description;
    };

    it("gives --dependency its own --help text, distinct from --dependencies'", function () {
      expect(helpFor('--dependency <pkg>')).to.not.equal(
        helpFor('--dependencies <list>'),
      );
    });

    it("gives --dev-dependency its own --help text, distinct from --dev-dependencies'", function () {
      expect(helpFor('--dev-dependency <pkg>')).to.not.equal(
        helpFor('--dev-dependencies <list>'),
      );
    });
  });

  describe('flagsGivenFor', function () {
    const buildCommand = (argv: string[]) => {
      const command = new Command();
      addSchemaOptions(command, JS_SPECS);
      command.parse(['node', 'gen', ...argv]);
      return command;
    };

    it('is absent when neither --dependencies nor --dependency is given', function () {
      const command = buildCommand([]);

      expect(flagsGivenFor(command, JS_SPECS)).to.not.have.property(
        'dependencies',
      );
    });

    it('comma-splits --dependencies into an array', function () {
      const command = buildCommand(['--dependencies', 'lodash,chalk@5.3.0']);

      expect(flagsGivenFor(command, JS_SPECS).dependencies).to.deep.equal([
        'lodash',
        'chalk@5.3.0',
      ]);
    });

    it('collects repeated --dependency flags into an array', function () {
      const command = buildCommand([
        '--dependency',
        'lodash',
        '--dependency',
        'chalk@5.3.0',
      ]);

      expect(flagsGivenFor(command, JS_SPECS).dependencies).to.deep.equal([
        'lodash',
        'chalk@5.3.0',
      ]);
    });

    it('concatenates both forms when given together, without dropping either', function () {
      const command = buildCommand([
        '--dependencies',
        'lodash,chalk',
        '--dependency',
        'sinon',
      ]);

      expect(flagsGivenFor(command, JS_SPECS).dependencies).to.deep.equal([
        'lodash',
        'chalk',
        'sinon',
      ]);
    });

    it('keeps dependencies and devDependencies independent of each other', function () {
      const command = buildCommand([
        '--dependencies',
        'lodash',
        '--dev-dependency',
        'mocha',
      ]);

      const given = flagsGivenFor(command, JS_SPECS);
      expect(given.dependencies).to.deep.equal(['lodash']);
      expect(given.devDependencies).to.deep.equal(['mocha']);
    });

    it('still reports non-list flags actually given, unaffected by the list handling', function () {
      const command = buildCommand(['--language', 'typescript']);

      expect(flagsGivenFor(command, JS_SPECS).language).to.equal('typescript');
    });

    it('omits a non-list flag that was not given', function () {
      const command = buildCommand([]);

      expect(flagsGivenFor(command, JS_SPECS)).to.not.have.property('language');
    });
  });
});
