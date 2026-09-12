import { Command } from 'commander';
import { expect } from 'chai';

import { addSchemaOptions, flagsGivenFor, resolve } from './options.js';

// Nothing in the real @sektek/base:*/@sektek/js:* schema is both required
// and default-less today (language is the closest candidate, and it
// resolves via a default instead of ever throwing), so the required-field
// tests below pass a synthetic extraSpecs entry to exercise that path.
// The namespace used throughout (@sektek/base:app) is a real one — it's
// incidental to these tests, since resolve()'s validation only cares
// about the resolved schema, not which namespace produced it.

describe('options', function () {
  describe('resolve', function () {
    it('fills in defaults when no flags are given', function () {
      const resolved = resolve('@sektek/base:app', {});

      expect(resolved).to.deep.equal({
        namespace: 'sektek',
        profile: 'default',
        description: undefined,
        gitInit: true,
        createRepo: false,
        repoVisibility: 'private',
        repoOwner: undefined,
        githubToken: undefined,
        push: true,
        configFile: undefined,
      });
    });

    it('lets a given flag override its default', function () {
      const resolved = resolve('@sektek/base:app', { namespace: 'acme' });

      expect(resolved.namespace).to.equal('acme');
      expect(resolved.profile).to.equal('default');
    });

    it('throws one aggregated error listing every missing required option', function () {
      expect(() =>
        resolve('@sektek/base:app', {}, {}, [
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
        ]),
      ).to.throw('Missing required option(s): apiKey, apiSecret');
    });

    it('throws when a select option is given a value outside its choices', function () {
      expect(() => resolve('@sektek/js:app', { language: 'foo' })).to.throw(
        'Invalid value for language: "foo" (expected one of: javascript, typescript)',
      );
    });

    it('accepts a select option value that is one of its choices', function () {
      const resolved = resolve('@sektek/js:app', { language: 'typescript' });

      expect(resolved.language).to.equal('typescript');
    });

    it('lets a config default override the schema default', function () {
      const resolved = resolve(
        '@sektek/base:app',
        {},
        { profile: 'from config' },
      );

      expect(resolved.profile).to.equal('from config');
    });

    it('lets a given flag override a config default', function () {
      const resolved = resolve(
        '@sektek/base:app',
        { profile: 'from flag' },
        { profile: 'from config' },
      );

      expect(resolved.profile).to.equal('from flag');
    });

    it('ignores a config default with no matching schema key', function () {
      const resolved = resolve(
        '@sektek/base:app',
        {},
        { notInSchema: 'whatever' },
      );

      expect(resolved).to.not.have.property('notInSchema');
    });

    it('does not let an explicitly undefined config value override the schema default', function () {
      const resolved = resolve('@sektek/base:app', {}, { profile: undefined });

      expect(resolved.profile).to.equal('default');
    });

    it('defaults dependencies/devDependencies to an empty array when nothing is given', function () {
      const resolved = resolve('@sektek/js:app', {});

      expect(resolved.dependencies).to.deep.equal([]);
      expect(resolved.devDependencies).to.deep.equal([]);
    });

    it('does not trip required/select validation for a kind: "list" spec', function () {
      // Nothing in DEPENDENCY_OPTIONS sets required/choices, but this
      // guards against ever adding them and quietly reintroducing spurious
      // validation for a kind resolve() isn't meant to check at all.
      expect(() =>
        resolve('@sektek/js:app', { dependencies: ['lodash@4.17.21'] }),
      ).to.not.throw();
    });

    it('lets a given dependencies array flow straight through', function () {
      const resolved = resolve('@sektek/js:app', {
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
      addSchemaOptions(command, '@sektek/js:app');
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
      addSchemaOptions(command, '@sektek/js:app');
      command.parse(['node', 'gen', ...argv]);
      return command;
    };

    it('is absent when neither --dependencies nor --dependency is given', function () {
      const command = buildCommand([]);

      expect(flagsGivenFor(command, '@sektek/js:app')).to.not.have.property(
        'dependencies',
      );
    });

    it('comma-splits --dependencies into an array', function () {
      const command = buildCommand(['--dependencies', 'lodash,chalk@5.3.0']);

      expect(
        flagsGivenFor(command, '@sektek/js:app').dependencies,
      ).to.deep.equal(['lodash', 'chalk@5.3.0']);
    });

    it('collects repeated --dependency flags into an array', function () {
      const command = buildCommand([
        '--dependency',
        'lodash',
        '--dependency',
        'chalk@5.3.0',
      ]);

      expect(
        flagsGivenFor(command, '@sektek/js:app').dependencies,
      ).to.deep.equal(['lodash', 'chalk@5.3.0']);
    });

    it('concatenates both forms when given together, without dropping either', function () {
      const command = buildCommand([
        '--dependencies',
        'lodash,chalk',
        '--dependency',
        'sinon',
      ]);

      expect(
        flagsGivenFor(command, '@sektek/js:app').dependencies,
      ).to.deep.equal(['lodash', 'chalk', 'sinon']);
    });

    it('keeps dependencies and devDependencies independent of each other', function () {
      const command = buildCommand([
        '--dependencies',
        'lodash',
        '--dev-dependency',
        'mocha',
      ]);

      const given = flagsGivenFor(command, '@sektek/js:app');
      expect(given.dependencies).to.deep.equal(['lodash']);
      expect(given.devDependencies).to.deep.equal(['mocha']);
    });

    it('still reports non-list flags actually given, unaffected by the list handling', function () {
      const command = buildCommand(['--language', 'typescript']);

      expect(flagsGivenFor(command, '@sektek/js:app').language).to.equal(
        'typescript',
      );
    });

    it('omits a non-list flag that was not given', function () {
      const command = buildCommand([]);

      expect(flagsGivenFor(command, '@sektek/js:app')).to.not.have.property(
        'language',
      );
    });
  });
});
