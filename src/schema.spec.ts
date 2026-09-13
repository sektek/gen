import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import { type OptionSpec, schemaFor, withConfigDefaults } from './schema.js';

use(chaiAsPromised);

describe('schema', function () {
  describe('withConfigDefaults', function () {
    const schema: OptionSpec[] = [
      {
        key: 'author',
        flag: '--author <value>',
        prompt: 'Author',
        kind: 'text',
      },
      {
        key: 'license',
        flag: '--license <value>',
        prompt: 'License',
        kind: 'text',
        default: 'UNLICENSED',
      },
    ];

    it('overrides a spec default with the matching config default', function () {
      const result = withConfigDefaults(schema, { license: 'MIT' });

      expect(result.find(spec => spec.key === 'license')?.default).to.equal(
        'MIT',
      );
    });

    it('leaves a spec unchanged when config has no value for its key', function () {
      const result = withConfigDefaults(schema, { license: 'MIT' });

      expect(result.find(spec => spec.key === 'author')).to.deep.equal(
        schema[0],
      );
    });

    it('ignores config keys with no matching spec', function () {
      const result = withConfigDefaults(schema, { notInSchema: 'whatever' });

      expect(result).to.deep.equal(schema);
    });

    it('does not mutate the original schema array', function () {
      withConfigDefaults(schema, { license: 'MIT' });

      expect(schema.find(spec => spec.key === 'license')?.default).to.equal(
        'UNLICENSED',
      );
    });
  });

  describe('schemaFor', function () {
    it('includes a testFramework select option for @sektek/js:* namespaces', function () {
      const result = schemaFor('@sektek/js:app');

      expect(result).to.deep.include({
        key: 'testFramework',
        flag: '--test-framework <value>',
        prompt: 'Test framework',
        kind: 'select',
        choices: ['mocha', 'vitest', 'none'],
        default: 'mocha',
      });
    });

    it('does not include testFramework for non-@sektek/js:* namespaces', function () {
      const result = schemaFor('@sektek/base:app');

      expect(result.find(spec => spec.key === 'testFramework')).to.be.undefined;
    });

    it('includes list-kind dependencies/devDependencies options for @sektek/js:* namespaces', function () {
      const result = schemaFor('@sektek/js:app');

      expect(result).to.deep.include({
        key: 'dependencies',
        flag: '--dependencies <list>',
        repeatFlag: '--dependency <pkg>',
        prompt:
          'Dependencies to add (package or package@version, comma-delimited)',
        repeatHelpText:
          'Add a dependency (package or package@version); repeatable',
        kind: 'list',
        default: [],
      });
      expect(result).to.deep.include({
        key: 'devDependencies',
        flag: '--dev-dependencies <list>',
        repeatFlag: '--dev-dependency <pkg>',
        prompt:
          'Dev dependencies to add (package or package@version, comma-delimited)',
        repeatHelpText:
          'Add a dev dependency (package or package@version); repeatable',
        kind: 'list',
        default: [],
      });
    });

    it('does not include dependencies/devDependencies for non-@sektek/js:* namespaces', function () {
      const result = schemaFor('@sektek/base:app');

      expect(result.find(spec => spec.key === 'dependencies')).to.be.undefined;
      expect(result.find(spec => spec.key === 'devDependencies')).to.be
        .undefined;
    });

    it('positions packageScope after every GITHUB_OPTIONS key for @sektek/js:* namespaces', function () {
      const result = schemaFor('@sektek/js:app');
      const keys = result.map(spec => spec.key);

      const githubKeys = [
        'createRepo',
        'repoVisibility',
        'repoOwner',
        'githubToken',
        'push',
      ];
      const lastGithubIndex = Math.max(
        ...githubKeys.map(key => keys.indexOf(key)),
      );

      expect(lastGithubIndex).to.be.greaterThan(-1);
      expect(keys.indexOf('packageScope')).to.be.greaterThan(lastGithubIndex);
    });

    it('gives packageScope no static default, only an async one', function () {
      const spec = schemaFor('@sektek/js:app').find(
        s => s.key === 'packageScope',
      );

      expect(spec?.default).to.be.undefined;
      expect(spec?.generateDefaultAsync).to.be.a('function');
      expect(spec?.allowClear).to.be.true;
    });

    it('does not include packageScope for non-@sektek/js:* namespaces', function () {
      const result = schemaFor('@sektek/base:app');

      expect(result.find(spec => spec.key === 'packageScope')).to.be.undefined;
    });

    describe("packageScope's generateDefaultAsync", function () {
      // Only the two branches resolvePackageScopeDefault() answers without
      // touching a GitHub client at all — its own spec (package-scope.spec.ts)
      // covers every branch, including the network ones, via DI; this just
      // confirms the wizard's live `answers` are actually threaded through.
      const spec = () =>
        schemaFor('@sektek/js:app').find(s => s.key === 'packageScope')!;

      it('resolves to an empty scope when createRepo is not answered true', async function () {
        await expect(spec().generateDefaultAsync!({})).to.eventually.equal('');
      });

      it('passes a given repoOwner through as-is', async function () {
        await expect(
          spec().generateDefaultAsync!({ createRepo: true, repoOwner: 'acme' }),
        ).to.eventually.equal('acme');
      });
    });
  });
});
