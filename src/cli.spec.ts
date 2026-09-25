/* eslint-disable no-console -- asserting on stubbed console output below */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';

import {
  main,
  printDefaultList,
  printPackageList,
  resolveNamespace,
} from './cli.js';
import {
  resetGitConfigReaderForTesting,
  setGitConfigReaderForTesting,
} from './git-identity.js';

use(chaiAsPromised);

const cwd = process.cwd();

describe('cli', function () {
  describe('resolveNamespace', function () {
    it('resolves a bare package alias to its :app generator', async function () {
      expect((await resolveNamespace('js', cwd)).namespace).to.equal(
        '@sektek/js:app',
      );
    });

    it('resolves a name:subgen pair, defaulting scope to sektek', async function () {
      expect((await resolveNamespace('js:workspace', cwd)).namespace).to.equal(
        '@sektek/js:workspace',
      );
    });

    it('passes a fully-qualified namespace through unchanged', async function () {
      expect(
        (await resolveNamespace('@sektek/base:editorconfig', cwd)).namespace,
      ).to.equal('@sektek/base:editorconfig');
    });

    it('resolves a bare name unique to base', async function () {
      expect((await resolveNamespace('editorconfig', cwd)).namespace).to.equal(
        '@sektek/base:editorconfig',
      );
    });

    it('resolves a bare name that exists in both base and js to base silently', async function () {
      expect((await resolveNamespace('gitconfig', cwd)).namespace).to.equal(
        '@sektek/base:gitconfig',
      );
    });

    it("also returns the target package's resolved entries, for downstream registration", async function () {
      const { entries } = await resolveNamespace('js:workspace', cwd);
      expect(entries.map(entry => entry.namespace)).to.include(
        '@sektek/js:workspace',
      );
      // generator-js's own dependency on generator-base pulls these in
      // transitively — the same entries composeWith needs to compose
      // @sektek/base:* sub-generators from within @sektek/js:app.
      expect(entries.map(entry => entry.namespace)).to.include(
        '@sektek/base:editorconfig',
      );
    });

    it('rejects a bare name that exists only in js, hinting at the js: prefix', async function () {
      await expect(resolveNamespace('eslint', cwd)).to.be.rejectedWith(
        /Did you mean 'js:eslint'/,
      );
    });

    it('rejects a bare name that exists in neither package with a generic message', async function () {
      await expect(
        resolveNamespace('totallyNonexistentGenerator', cwd),
      ).to.be.rejectedWith(
        /^Unknown generator '@sektek\/base:totallyNonexistentGenerator'\. Run 'gen list'/,
      );
    });

    it('resolves a bare name colliding with an inherited Object.prototype property as a normal miss', async function () {
      // parseGeneratorInput() always defaults a bare, non-sugar name to
      // '@sektek/base:<name>' structurally rather than via a dictionary
      // lookup keyed by the input string, so 'toString' can't accidentally
      // match through the prototype chain the way an `input in
      // PREFIX_ALIASES`-style check once could.
      await expect(resolveNamespace('toString', cwd)).to.be.rejectedWith(
        /^Unknown generator '@sektek\/base:toString'\. Run 'gen list'/,
      );
    });

    it('rejects a name:subgen pair whose package resolves but the subgen does not', async function () {
      await expect(resolveNamespace('js:nonexistent', cwd)).to.be.rejectedWith(
        /Unknown generator '@sektek\/js:nonexistent'/,
      );
    });

    it('rejects a name:subgen pair whose defaulted-scope package is not installed', async function () {
      // 'bogus' is no longer a hardcoded allowlist lookup — it's parsed as
      // @sektek/generator-bogus like any other name, and fails to resolve
      // as a real package rather than hitting a special "unknown prefix"
      // case.
      await expect(
        resolveNamespace('bogus:editorconfig', cwd),
      ).to.be.rejectedWith(
        /Generator package '@sektek\/generator-bogus' isn't installed/,
      );
    });

    it('rejects an unknown fully-qualified namespace', async function () {
      await expect(
        resolveNamespace('@sektek/js:nonexistent', cwd),
      ).to.be.rejectedWith(/Unknown generator/);
    });

    describe('a fully-qualified third-party package', function () {
      let fixtureCwd: string;

      beforeEach(function () {
        fixtureCwd = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-fixture-'));
        const pkgDir = join(
          fixtureCwd,
          'node_modules',
          '@acme',
          'generator-widget',
        );
        mkdirSync(join(pkgDir, 'generators', 'app'), { recursive: true });
        writeFileSync(
          join(pkgDir, 'package.json'),
          JSON.stringify({
            name: '@acme/generator-widget',
            version: '0.0.0-fixture',
            exports: {
              './manifest': './manifest.js',
              './generators/*': './generators/*/index.js',
            },
          }),
        );
        writeFileSync(
          join(pkgDir, 'manifest.js'),
          "export const GENERATORS = ['app'];\n",
        );
        writeFileSync(
          join(pkgDir, 'generators', 'app', 'index.js'),
          'export {};\n',
        );
      });

      afterEach(function () {
        rmSync(fixtureCwd, { recursive: true, force: true });
      });

      it('resolves, proving scope/name are not hardcoded to sektek', async function () {
        expect(
          (await resolveNamespace('@acme/widget:app', fixtureCwd)).namespace,
        ).to.equal('@acme/widget:app');
      });

      it('does not let scope-defaulting accidentally reach a differently-scoped fixture', async function () {
        // 'widget:app' (no @) defaults to scope 'sektek', i.e.
        // @sektek/generator-widget — a different package than the fixture's
        // @acme/generator-widget, so this must still fail to resolve.
        await expect(
          resolveNamespace('widget:app', fixtureCwd),
        ).to.be.rejectedWith(/@sektek\/generator-widget/);
      });
    });
  });

  describe('printDefaultList', function () {
    let fixtureCwd: string;

    beforeEach(function () {
      fixtureCwd = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-list-'));
      sinon.stub(console, 'log');
    });

    afterEach(function () {
      sinon.restore();
      rmSync(fixtureCwd, { recursive: true, force: true });
      process.exitCode = 0;
    });

    function writeFixturePackage(
      pkgDir: string,
      name: string,
      generators: string[],
    ): void {
      mkdirSync(pkgDir, { recursive: true });
      writeFileSync(
        join(pkgDir, 'package.json'),
        JSON.stringify({
          name,
          version: '0.0.0-fixture',
          exports: {
            './manifest': './manifest.js',
            './generators/*': './generators/*/index.js',
          },
        }),
      );
      writeFileSync(
        join(pkgDir, 'manifest.js'),
        `export const GENERATORS = ${JSON.stringify(generators)};\n`,
      );
      for (const name_ of generators) {
        mkdirSync(join(pkgDir, 'generators', name_), { recursive: true });
        writeFileSync(
          join(pkgDir, 'generators', name_, 'index.js'),
          'export {};\n',
        );
      }
    }

    it('lists every real @sektek/base and @sektek/js namespace by default', async function () {
      await printDefaultList(process.cwd());

      const logged = (console.log as sinon.SinonStub)
        .getCalls()
        .map(call => call.args[0]);
      expect(logged.join('\n')).to.include('@sektek/base:app');
      expect(logged.join('\n')).to.include('@sektek/js:app');
      expect(process.exitCode).to.not.equal(1);
    });

    it('shows what resolves and notes what does not, rather than failing entirely', async function () {
      writeFixturePackage(
        join(fixtureCwd, 'node_modules', '@acme', 'generator-widget'),
        '@acme/generator-widget',
        ['app'],
      );

      await printDefaultList(fixtureCwd, [
        '@acme/generator-widget',
        '@acme/generator-missing',
      ]);

      const logged = (console.log as sinon.SinonStub)
        .getCalls()
        .map(call => call.args[0])
        .join('\n');
      expect(logged).to.include('@acme/widget:app');
      expect(logged).to.include('@acme/generator-missing: not installed');
      expect(process.exitCode).to.not.equal(1);
    });

    it('exits non-zero only when none of the default packages resolve', async function () {
      await printDefaultList(fixtureCwd, [
        '@acme/generator-missing-a',
        '@acme/generator-missing-b',
      ]);

      expect(process.exitCode).to.equal(1);
    });
  });

  describe('printPackageList', function () {
    beforeEach(function () {
      sinon.stub(console, 'log');
      sinon.stub(console, 'error');
    });

    afterEach(function () {
      sinon.restore();
      process.exitCode = 0;
    });

    it('lists one specific real package, defaulting scope to sektek', async function () {
      await printPackageList('js', process.cwd());

      const logged = (console.log as sinon.SinonStub)
        .getCalls()
        .map(call => call.args[0]);
      expect(logged.join('\n')).to.include('@sektek/js:app');
    });

    it('lists a fully-qualified third-party package', async function () {
      const fixtureCwd = mkdtempSync(
        join(tmpdir(), 'sektek-gen-cli-list-pkg-'),
      );
      try {
        const pkgDir = join(
          fixtureCwd,
          'node_modules',
          '@acme',
          'generator-widget',
        );
        mkdirSync(join(pkgDir, 'generators', 'app'), { recursive: true });
        writeFileSync(
          join(pkgDir, 'package.json'),
          JSON.stringify({
            name: '@acme/generator-widget',
            version: '0.0.0-fixture',
            exports: {
              './manifest': './manifest.js',
              './generators/*': './generators/*/index.js',
            },
          }),
        );
        writeFileSync(
          join(pkgDir, 'manifest.js'),
          "export const GENERATORS = ['app'];\n",
        );
        writeFileSync(
          join(pkgDir, 'generators', 'app', 'index.js'),
          'export {};\n',
        );

        await printPackageList('@acme/widget', fixtureCwd);

        const logged = (console.log as sinon.SinonStub)
          .getCalls()
          .map(call => call.args[0]);
        expect(logged.join('\n')).to.include('@acme/widget:app');
      } finally {
        rmSync(fixtureCwd, { recursive: true, force: true });
      }
    });

    it('errors clearly and exits non-zero for a package that is not installed', async function () {
      await printPackageList('@acme/does-not-exist', process.cwd());

      expect(
        (console.error as sinon.SinonStub).calledWithMatch(/isn't installed/),
      ).to.be.true;
      expect(process.exitCode).to.equal(1);
    });
  });

  // Regression coverage for the config-defaults wiring itself (SEK-42):
  // resolveNamespace()'s own tests above never touch resolveConfigDefaults(),
  // so nothing else exercises main() actually reading gen.config.* files in
  // automated mode. process.cwd()/HOME are real global process state, so
  // each test restores both in afterEach even if main() throws.
  describe('main (config defaults wired through automated mode)', function () {
    let projectDir: string;
    let homeDir: string;
    let destinationRoot: string;
    let originalCwd: string;
    let originalHome: string | undefined;

    beforeEach(function () {
      projectDir = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-project-'));
      homeDir = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-home-'));
      destinationRoot = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-dest-'));
      originalCwd = process.cwd();
      originalHome = process.env.HOME;

      writeFileSync(
        join(projectDir, 'gen.config.json'),
        JSON.stringify({ license: 'MIT' }),
      );
      writeFileSync(
        join(homeDir, 'gen.config.json'),
        JSON.stringify({ author: 'Home Author <home@example.com>' }),
      );

      process.chdir(projectDir);
      process.env.HOME = homeDir;
    });

    afterEach(function () {
      process.chdir(originalCwd);
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
      rmSync(destinationRoot, { recursive: true, force: true });
    });

    const run = (...extraArgs: string[]) =>
      main([
        'node',
        'gen',
        'js:base-package',
        '--yes',
        '--dest',
        destinationRoot,
        '--package-scope',
        'acme',
        ...extraArgs,
      ]);

    it('applies config-file defaults cascaded from cwd and home', async function () {
      await run();

      const packageJson = JSON.parse(
        readFileSync(join(destinationRoot, 'package.json'), 'utf8'),
      );
      expect(packageJson.author).to.equal('Home Author <home@example.com>');
      expect(packageJson.license).to.equal('MIT');
    });

    it('lets a CLI flag override a config-file default', async function () {
      await run('--license', 'Apache-2.0');

      const packageJson = JSON.parse(
        readFileSync(join(destinationRoot, 'package.json'), 'utf8'),
      );
      expect(packageJson.license).to.equal('Apache-2.0');
    });
  });

  describe('main (config defaults searched from an explicit --dest)', function () {
    let otherCwd: string;
    let homeDir: string;
    let destParent: string;
    let originalCwd: string;
    let originalHome: string | undefined;

    beforeEach(function () {
      otherCwd = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-other-'));
      homeDir = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-home-'));
      destParent = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-destcfg-'));
      originalCwd = process.cwd();
      originalHome = process.env.HOME;

      writeFileSync(
        join(destParent, 'gen.config.json'),
        JSON.stringify({ license: 'Apache-2.0' }),
      );
      writeFileSync(
        join(otherCwd, 'gen.config.json'),
        JSON.stringify({
          license: 'MIT',
          author: 'Cwd Author <cwd@example.com>',
        }),
      );

      process.chdir(otherCwd);
      process.env.HOME = homeDir;
    });

    afterEach(function () {
      process.chdir(originalCwd);
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
      rmSync(otherCwd, { recursive: true, force: true });
      rmSync(homeDir, { recursive: true, force: true });
      rmSync(destParent, { recursive: true, force: true });
    });

    const packageJsonAt = async (dest: string) => {
      await main([
        'node',
        'gen',
        'js:base-package',
        '--yes',
        '--dest',
        dest,
        '--package-scope',
        'acme',
      ]);
      return JSON.parse(readFileSync(join(dest, 'package.json'), 'utf8'));
    };

    it('lets a gen.config.* in the --dest directory override cwd', async function () {
      expect((await packageJsonAt(destParent)).license).to.equal('Apache-2.0');
    });

    it('picks up a gen.config.* above a --dest that does not exist yet', async function () {
      const pkg = await packageJsonAt(join(destParent, 'new-project'));
      expect(pkg.license).to.equal('Apache-2.0');
    });

    it('still applies cwd config keys the --dest config does not set', async function () {
      expect((await packageJsonAt(destParent)).author).to.equal(
        'Cwd Author <cwd@example.com>',
      );
    });
  });

  describe('main (git-derived author, automated mode)', function () {
    let destinationRoot: string;

    beforeEach(function () {
      destinationRoot = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-author-'));
      const gitConfig: Record<string, string> = {
        'user.name': 'Ada Lovelace',
        'user.email': 'ada@example.com',
      };
      setGitConfigReaderForTesting(async key => gitConfig[key]);
    });

    afterEach(function () {
      resetGitConfigReaderForTesting();
      rmSync(destinationRoot, { recursive: true, force: true });
    });

    const run = (...extraArgs: string[]) =>
      main([
        'node',
        'gen',
        'js:base-package',
        '--yes',
        '--dest',
        destinationRoot,
        '--package-scope',
        'acme',
        ...extraArgs,
      ]);

    it('reaches the generated package.json when nothing else sets author', async function () {
      await run();

      const packageJson = JSON.parse(
        readFileSync(join(destinationRoot, 'package.json'), 'utf8'),
      );
      expect(packageJson.author).to.equal('Ada Lovelace <ada@example.com>');
    });

    it('still lets an explicit --author flag win over the git-derived default', async function () {
      await run('--author', 'Explicit Author <explicit@example.com>');

      const packageJson = JSON.parse(
        readFileSync(join(destinationRoot, 'package.json'), 'utf8'),
      );
      expect(packageJson.author).to.equal(
        'Explicit Author <explicit@example.com>',
      );
    });
  });

  // Regression coverage for auto-generating a destination when --dest is
  // omitted (SEK-generated-destination): createRepo isn't set here, so this
  // makes no network calls.
  describe('main (auto-generated destination when --dest is omitted)', function () {
    let generatedCwd: string;
    let originalCwd: string;

    beforeEach(function () {
      generatedCwd = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-generated-'));
      originalCwd = process.cwd();
      process.chdir(generatedCwd);
    });

    afterEach(function () {
      process.chdir(originalCwd);
      rmSync(generatedCwd, { recursive: true, force: true });
    });

    it('scaffolds a newProjectDir generator into an auto-generated adjective-noun directory under cwd', async function () {
      await main(['node', 'gen', 'base:app', '--yes', '--no-git-init']);

      const entries = readdirSync(generatedCwd);
      expect(entries).to.have.lengthOf(1);
      expect(entries[0]).to.match(/^[a-z]+-[a-z]+$/);
    });

    it('persists the generated directory name as projectName', async function () {
      await main(['node', 'gen', 'base:app', '--yes', '--no-git-init']);

      const [generated] = readdirSync(generatedCwd);
      expect(
        readFileSync(join(generatedCwd, generated, 'gen.config.yaml'), 'utf8'),
      ).to.match(new RegExp(`^projectName: "${generated}"$`, 'm'));
    });

    it('names the directory after an explicit --project-name', async function () {
      await main([
        'node',
        'gen',
        'base:app',
        '--yes',
        '--no-git-init',
        '--project-name',
        'my-thing',
      ]);

      expect(readdirSync(generatedCwd)).to.deep.equal(['my-thing']);
    });

    it('prefixes the generated name with an inherited config projectName', async function () {
      writeFileSync(
        join(generatedCwd, 'gen.config.json'),
        JSON.stringify({ projectName: 'sektek-messaging' }),
      );

      await main(['node', 'gen', 'base:app', '--yes', '--no-git-init']);

      const generated = readdirSync(generatedCwd).filter(
        name => name !== 'gen.config.json',
      );
      expect(generated).to.have.lengthOf(1);
      expect(generated[0]).to.match(/^sektek-messaging-[a-z]+-[a-z]+$/);
    });

    it('derives projectName from an explicit --dest instead of generating one', async function () {
      await main([
        'node',
        'gen',
        'base:app',
        '--yes',
        '--no-git-init',
        '--dest',
        join(generatedCwd, 'explicit-dir'),
      ]);

      expect(
        readFileSync(
          join(generatedCwd, 'explicit-dir', 'gen.config.yaml'),
          'utf8',
        ),
      ).to.match(/^projectName: "explicit-dir"$/m);
    });

    it('scaffolds an inPlace generator straight into cwd', async function () {
      await main(['node', 'gen', 'base:editorconfig', '--yes']);

      expect(readdirSync(generatedCwd)).to.deep.equal(['.editorconfig']);
    });

    it('treats a non-boolean createRepo config value as false rather than truthy', async function () {
      // Regression: options is a Record<string, unknown> by the time it
      // reaches destination resolution — a config file's `"createRepo":
      // "false"` is a non-empty *string*, which is truthy in JS. An `as
      // boolean` cast would carry that straight through and incorrectly
      // try to reach GitHub; this must resolve to a real `false` instead
      // and complete without ever needing a token.
      writeFileSync(
        join(generatedCwd, 'gen.config.json'),
        JSON.stringify({ createRepo: 'false', repoOwner: 42 }),
      );

      await main(['node', 'gen', 'base:app', '--yes', '--no-git-init']);

      const generated = readdirSync(generatedCwd).find(name =>
        /^[a-z]+-[a-z]+$/.test(name),
      );
      expect(generated).to.exist;
    });
  });

  // No createRepo set in either test here, so resolvePackageScopeDefault()
  // short-circuits to '' without any network call — see
  // package-scope.spec.ts for the GitHub-derived branches.
  describe('main (packageScope default, automated mode)', function () {
    let destinationRoot: string;

    beforeEach(function () {
      destinationRoot = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-scope-'));
    });

    afterEach(function () {
      rmSync(destinationRoot, { recursive: true, force: true });
    });

    it('defaults to an unscoped package name when no GitHub repo is being created', async function () {
      await main([
        'node',
        'gen',
        'js:base-package',
        '--yes',
        '--dest',
        destinationRoot,
      ]);

      const packageJson = JSON.parse(
        readFileSync(join(destinationRoot, 'package.json'), 'utf8'),
      );
      expect(packageJson.name).to.not.include('@');
    });

    it('still lets an explicit --package-scope win', async function () {
      await main([
        'node',
        'gen',
        'js:base-package',
        '--yes',
        '--dest',
        destinationRoot,
        '--package-scope',
        'acme',
      ]);

      const packageJson = JSON.parse(
        readFileSync(join(destinationRoot, 'package.json'), 'utf8'),
      );
      expect(packageJson.name).to.match(/^@acme\//);
    });
  });

  // Regression: packageScopeExtraSpecs() only saw flagsGiven, never
  // configDefaults, so a repoOwner set via gen.config.* (rather than a CLI
  // flag) never reached the packageScope derivation. repoOwner given means
  // no network call either way (resolvePackageScopeDefault returns it
  // directly).
  describe('main (packageScope default derived from a config-file repoOwner)', function () {
    let projectDir: string;
    let destinationRoot: string;
    let originalCwd: string;

    beforeEach(function () {
      projectDir = mkdtempSync(join(tmpdir(), 'sektek-gen-cli-scope-cfg-'));
      destinationRoot = mkdtempSync(
        join(tmpdir(), 'sektek-gen-cli-scope-dest-'),
      );
      originalCwd = process.cwd();

      writeFileSync(
        join(projectDir, 'gen.config.json'),
        JSON.stringify({ createRepo: true, repoOwner: 'acme' }),
      );

      process.chdir(projectDir);
    });

    afterEach(function () {
      process.chdir(originalCwd);
      rmSync(projectDir, { recursive: true, force: true });
      rmSync(destinationRoot, { recursive: true, force: true });
    });

    it('picks up repoOwner from gen.config.* when no --package-scope flag is given', async function () {
      await main([
        'node',
        'gen',
        'js:base-package',
        '--yes',
        '--dest',
        destinationRoot,
      ]);

      const packageJson = JSON.parse(
        readFileSync(join(destinationRoot, 'package.json'), 'utf8'),
      );
      expect(packageJson.name).to.match(/^@acme\//);
    });
  });
});
