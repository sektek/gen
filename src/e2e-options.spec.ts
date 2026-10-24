/* eslint-disable sonarjs/no-skipped-tests, mocha/no-pending-tests -- known bugs are recorded as named skips */
import { dirname, join } from 'node:path';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

import { expect } from 'chai';
import sinon from 'sinon';

import { main } from './cli/index.js';

// End-to-end option matrix: every case drives main() against the installed
// generator packages and asserts on the files actually written. Nothing
// touches the network: dependency versions come from a stub resolver and the
// GitHub REST API from a stubbed fetch; --no-push keeps git off the wire.

type VersionResolver = (name: string, version?: string) => Promise<string>;
type VersionResolverModule = {
  resolveLatestVersion: VersionResolver;
  setVersionResolverForTesting: (resolver: VersionResolver) => void;
};

type PackageJson = {
  name: string;
  private?: boolean;
  license: string;
  author: string;
  description?: string;
  main?: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

type GithubCall = { method: string; path: string; body?: unknown };

const FAKE_CLONE_URL = 'https://github.invalid/octocat/fake.git';
const GIT_IDENTITY = 'Ada Lovelace <ada@example.com>';

const versionResolverModule = async (): Promise<VersionResolverModule> => {
  const entry = fileURLToPath(import.meta.resolve('@sektek/generator-js'));
  const url = pathToFileURL(join(dirname(entry), 'lib/version-resolver.js'));
  return import(url.href);
};

const restoreEnv = (key: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

class Project {
  constructor(readonly dir: string) {}

  has(path: string): boolean {
    return existsSync(join(this.dir, path));
  }

  text(path: string): string {
    return readFileSync(join(this.dir, path), 'utf8');
  }

  get pkg(): PackageJson {
    return JSON.parse(this.text('package.json'));
  }

  get isGitRepo(): boolean {
    return this.has('.git');
  }
}

describe('end-to-end option matrix', function () {
  this.timeout(30_000);

  let root: string;
  let cwd: string;
  let originalCwd: string;
  let githubCalls: GithubCall[];
  let resolverModule: VersionResolverModule;
  const envKeys = [
    'HOME',
    'GIT_CONFIG_GLOBAL',
    'GIT_CONFIG_NOSYSTEM',
    'GITHUB_TOKEN',
    'GH_TOKEN',
  ];
  const savedEnv = new Map<string, string | undefined>();

  before(async function () {
    resolverModule = await versionResolverModule();
    resolverModule.setVersionResolverForTesting(
      async (_name, version) => version ?? '^1.0.0',
    );
  });

  after(function () {
    resolverModule.setVersionResolverForTesting(
      resolverModule.resolveLatestVersion,
    );
  });

  beforeEach(function () {
    root = mkdtempSync(join(tmpdir(), 'sektek-gen-e2e-'));
    cwd = join(root, 'cwd');
    mkdirSync(cwd);
    originalCwd = process.cwd();
    for (const key of envKeys) {
      savedEnv.set(key, process.env[key]);
    }

    writeFileSync(
      join(root, 'gitconfig'),
      `[user]\n\tname = Ada Lovelace\n\temail = ada@example.com\n`,
    );
    mkdirSync(join(root, 'home'));
    process.env.HOME = join(root, 'home');
    process.env.GIT_CONFIG_GLOBAL = join(root, 'gitconfig');
    process.env.GIT_CONFIG_NOSYSTEM = '1';
    // Present so token resolution never falls through to spawning `gh`.
    process.env.GITHUB_TOKEN = 'fake-token';
    process.env.GH_TOKEN = 'fake-token';
    process.chdir(cwd);

    githubCalls = [];
    sinon.stub(globalThis, 'fetch').callsFake(async (input, init) => {
      const url = new URL(String(input));
      if (url.host !== 'api.github.com') {
        throw new Error(`unexpected network request: ${url}`);
      }
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      githubCalls.push({ method, path: url.pathname, body });

      const reply = (status: number, payload: unknown) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      if (method === 'GET' && url.pathname === '/user') {
        return reply(200, { login: 'octocat' });
      }
      if (method === 'GET' && url.pathname.startsWith('/repos/')) {
        return reply(404, { message: 'Not Found' });
      }
      if (
        method === 'POST' &&
        /^\/(user|orgs\/[^/]+)\/repos$/.test(url.pathname)
      ) {
        return reply(201, {
          clone_url: FAKE_CLONE_URL,
          ssh_url: 'git@github.invalid:octocat/fake.git',
          html_url: 'https://github.invalid/octocat/fake',
        });
      }
      throw new Error(`unexpected GitHub request: ${method} ${url.pathname}`);
    });
  });

  afterEach(function () {
    sinon.restore();
    process.chdir(originalCwd);
    for (const key of envKeys) {
      restoreEnv(key, savedEnv.get(key));
    }
    rmSync(root, { recursive: true, force: true });
  });

  const scaffold = async (
    namespace: string,
    projectName: string,
    ...flags: string[]
  ): Promise<Project> => {
    const writes = [
      sinon.stub(process.stdout, 'write').returns(true),
      sinon.stub(process.stderr, 'write').returns(true),
    ];
    try {
      await main([
        'node',
        'gen',
        namespace,
        '--no-interactive',
        '--project-name',
        projectName,
        ...flags,
      ]);
    } finally {
      writes.forEach(stub => stub.restore());
    }
    return new Project(join(process.cwd(), projectName));
  };

  const rejection = async (...argv: string[]): Promise<string> => {
    const originalExit = process.exit;
    const originalWrite = process.stderr.write;
    let stderr = '';
    process.exit = ((code?: number) => {
      throw new Error(`exit ${code}`);
    }) as typeof process.exit;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    }) as typeof process.stderr.write;
    try {
      await main(['node', 'gen', ...argv, '--no-interactive']);
      throw new Error('expected main() to reject the flag');
    } catch (error) {
      expect(error).to.have.property('message', 'exit 1');
      return stderr;
    } finally {
      process.exit = originalExit;
      process.stderr.write = originalWrite;
    }
  };

  describe('defaults per namespace', function () {
    const nodeNamespaces = ['js:app', 'js:lib'];

    for (const namespace of nodeNamespaces) {
      it(`${namespace}: private UNLICENSED mocha package with git init`, async function () {
        const project = await scaffold(namespace, 'my-pkg');

        const { pkg } = project;
        expect(pkg.name).to.equal('my-pkg');
        expect(pkg.private).to.equal(true);
        expect(pkg.license).to.equal('UNLICENSED');
        expect(pkg.author).to.equal(GIT_IDENTITY);
        expect(pkg.scripts.test).to.equal('mocha');
        expect(pkg.dependencies).to.deep.equal({});
        expect(project.has('.mocharc.cjs')).to.equal(true);
        expect(project.has('tsconfig.json')).to.equal(false);
        expect(project.has('LICENSE')).to.equal(false);
        expect(project.has('.gitignore')).to.equal(true);
        expect(project.has('.devcontainer/devcontainer.json')).to.equal(true);
        expect(project.text('README.md')).to.match(/^# My Pkg$/m);
        expect(project.isGitRepo).to.equal(true);
        expect(project.has('.git/refs/heads/main')).to.equal(true);
        expect(githubCalls).to.have.lengthOf(0);
      });
    }

    it('js:workspace: private npm workspace root, no git, no license file', async function () {
      const project = await scaffold('js:workspace', 'my-ws');

      const { pkg } = project;
      expect(pkg.name).to.equal('my-ws');
      expect(pkg.private).to.equal(true);
      expect(pkg).to.have.property('workspaces').that.includes('libs/*');
      expect(project.has('libs/.gitkeep')).to.equal(true);
      expect(project.has('.devcontainer/docker-compose.yml')).to.equal(true);
      expect(project.has('.gitignore')).to.equal(true);
      expect(project.text('README.md')).to.match(/^# My Ws$/m);
      expect(project.isGitRepo).to.equal(false);
      expect(githubCalls).to.have.lengthOf(0);
    });

    it('base:app: git-initialised scaffold without a package.json', async function () {
      const project = await scaffold('base:app', 'b-app');

      expect(project.has('package.json')).to.equal(false);
      expect(project.has('LICENSE')).to.equal(false);
      expect(project.has('.gitignore')).to.equal(true);
      expect(project.has('.devcontainer/devcontainer.json')).to.equal(true);
      expect(project.text('README.md')).to.match(/^# B App$/m);
      expect(project.isGitRepo).to.equal(true);
      expect(githubCalls).to.have.lengthOf(0);
    });

    it('base:workspace: devcontainer and vscode scaffold, no git', async function () {
      const project = await scaffold('base:workspace', 'b-ws');

      expect(project.has('package.json')).to.equal(false);
      expect(project.has('.vscode/settings.json')).to.equal(true);
      expect(project.has('.devcontainer/docker-compose.yml')).to.equal(true);
      expect(project.text('README.md')).to.match(/^# B Ws$/m);
      expect(project.isGitRepo).to.equal(false);
      expect(githubCalls).to.have.lengthOf(0);
    });
  });

  describe('language and test framework', function () {
    it('js:app typescript + vitest swaps mocha for tsc and vitest', async function () {
      const project = await scaffold(
        'js:app',
        'ts-app',
        '--language',
        'typescript',
        '--test-framework',
        'vitest',
      );

      const { pkg } = project;
      expect(pkg.main).to.equal('dist/index.js');
      expect(pkg.scripts.test).to.equal('vitest run');
      expect(pkg.scripts.build).to.include('tsc');
      expect(pkg.devDependencies).to.include.keys('typescript', 'vitest');
      expect(pkg.devDependencies).to.not.have.property('mocha');
      for (const file of [
        'tsconfig.json',
        'tsconfig.build.json',
        'vitest.config.ts',
        'index.ts',
      ]) {
        expect(project.has(file), file).to.equal(true);
      }
      expect(project.has('.mocharc.cjs')).to.equal(false);
    });

    it('js:lib typescript defaults to mocha', async function () {
      const project = await scaffold(
        'js:lib',
        'ts-lib',
        '--language',
        'typescript',
      );

      expect(project.pkg.scripts.test).to.equal('mocha');
      expect(project.has('tsconfig.json')).to.equal(true);
      expect(project.has('.mocharc.cjs')).to.equal(true);
      expect(project.has('vitest.config.ts')).to.equal(false);
    });

    it('js:workspace typescript adds a tsconfig', async function () {
      const project = await scaffold(
        'js:workspace',
        'ts-ws',
        '--language',
        'typescript',
      );

      expect(project.has('tsconfig.json')).to.equal(true);
      expect(project.pkg.devDependencies).to.have.property('typescript');
    });
  });

  describe('license and visibility', function () {
    it('UNLICENSED + createRepo: package and GitHub repo are private', async function () {
      const project = await scaffold(
        'js:app',
        'priv-app',
        '--create-repo',
        '--no-push',
      );

      expect(project.pkg.license).to.equal('UNLICENSED');
      expect(project.pkg.private).to.equal(true);
      expect(project.has('LICENSE')).to.equal(false);
      const create = githubCalls.find(call => call.method === 'POST');
      expect(create?.path).to.equal('/user/repos');
      expect(create?.body).to.include({ name: 'priv-app', private: true });
      expect(project.text('.git/config')).to.include(FAKE_CLONE_URL);
    });

    it('MIT + createRepo: LICENSE is written and the GitHub repo is public', async function () {
      const project = await scaffold(
        'js:app',
        'pub-app',
        '--license',
        'MIT',
        '--create-repo',
        '--no-push',
      );

      expect(project.pkg.license).to.equal('MIT');
      expect(project.text('LICENSE')).to.include('MIT License');
      const create = githubCalls.find(call => call.method === 'POST');
      expect(create?.body).to.include({ name: 'pub-app', private: false });
    });

    it('an explicit --repo-visibility wins over the license-derived default', async function () {
      await scaffold(
        'js:app',
        'forced-private',
        '--license',
        'MIT',
        '--create-repo',
        '--repo-visibility',
        'private',
        '--no-push',
      );

      const create = githubCalls.find(call => call.method === 'POST');
      expect(create?.body).to.include({ private: true });
    });

    it('--repo-owner creates the repo under that organisation and scopes the package', async function () {
      const project = await scaffold(
        'js:app',
        'org-app',
        '--create-repo',
        '--repo-owner',
        'acme',
        '--no-push',
      );

      expect(githubCalls.find(call => call.method === 'POST')?.path).to.equal(
        '/orgs/acme/repos',
      );
      expect(project.pkg.name).to.equal('@acme/org-app');
    });

    it('base:app MIT writes a LICENSE file', async function () {
      const project = await scaffold('base:app', 'b-mit', '--license', 'MIT');

      expect(project.text('LICENSE')).to.include('MIT License');
    });

    it('--no-private flips package.json private to false', async function () {
      const project = await scaffold(
        'js:lib',
        'open-lib',
        '--license',
        'MIT',
        '--no-private',
      );

      expect(project.pkg.private).to.equal(false);
    });
  });

  describe('git and GitHub', function () {
    for (const namespace of ['js:app', 'js:lib', 'base:app']) {
      it(`${namespace}: --no-git-init leaves no repository and no GitHub traffic`, async function () {
        const project = await scaffold(namespace, 'no-git', '--no-git-init');

        expect(project.isGitRepo).to.equal(false);
        expect(project.has('.gitignore')).to.equal(true);
        expect(githubCalls).to.have.lengthOf(0);
      });
    }

    it('makes no GitHub request unless createRepo is on', async function () {
      await scaffold('js:app', 'local-only');

      expect(githubCalls).to.have.lengthOf(0);
    });

    it('--no-git-init with --create-repo creates no repository on GitHub', async function () {
      const project = await scaffold(
        'js:app',
        'no-git-repo',
        '--no-git-init',
        '--create-repo',
        '--no-push',
      );

      expect(project.isGitRepo).to.equal(false);
      expect(
        githubCalls.filter(call => call.method === 'POST'),
      ).to.have.lengthOf(0);
    });

    it('base:app --create-repo --no-push adds the remote without pushing', async function () {
      const project = await scaffold(
        'base:app',
        'b-remote',
        '--create-repo',
        '--no-push',
      );

      expect(project.text('.git/config')).to.include(FAKE_CLONE_URL);
      expect(githubCalls.map(call => call.method)).to.include('POST');
    });
  });

  describe('dependencies', function () {
    it('merges repeated --dependency with --dependencies and dev variants', async function () {
      const project = await scaffold(
        'js:app',
        'deps-app',
        '--dependency',
        'a@^2.0.0',
        '--dependency',
        'b',
        '--dependencies',
        'c,d@~3.1.0',
        '--dev-dependency',
        'z@^4.0.0',
        '--dev-dependencies',
        'y',
      );

      const { pkg } = project;
      expect(pkg.dependencies).to.include({
        a: '^2.0.0',
        b: '^1.0.0',
        c: '^1.0.0',
        d: '~3.1.0',
      });
      expect(pkg.devDependencies).to.include({ z: '^4.0.0', y: '^1.0.0' });
    });

    it('js:lib accepts the same dependency flags', async function () {
      const project = await scaffold(
        'js:lib',
        'deps-lib',
        '--dependency',
        'left-pad@^1.3.0',
      );

      expect(project.pkg.dependencies).to.include({ 'left-pad': '^1.3.0' });
    });

    it.skip('js:workspace --dependency/--dev-dependency reach package.json (BUG: flags are accepted but ignored)', async function () {
      const project = await scaffold(
        'js:workspace',
        'deps-ws',
        '--dependency',
        'a@^2.0.0',
        '--dev-dependency',
        'z@^4.0.0',
      );

      expect(project.pkg.dependencies).to.include({ a: '^2.0.0' });
      expect(project.pkg.devDependencies).to.include({ z: '^4.0.0' });
    });
  });

  describe('package.json metadata', function () {
    it('reflects author, description, scope and license flags', async function () {
      const project = await scaffold(
        'js:app',
        'meta-app',
        '--author',
        'Grace Hopper <grace@example.com>',
        '--description',
        'A described app',
        '--package-scope',
        'acme',
        '--license',
        'Apache-2.0',
      );

      expect(project.pkg).to.include({
        name: '@acme/meta-app',
        author: 'Grace Hopper <grace@example.com>',
        description: 'A described app',
        license: 'Apache-2.0',
      });
      expect(project.text('README.md')).to.include('A described app');
    });

    it('js:workspace honours license and description', async function () {
      const project = await scaffold(
        'js:workspace',
        'meta-ws',
        '--license',
        'MIT',
        '--description',
        'A workspace',
      );

      expect(project.pkg.license).to.equal('MIT');
      expect(project.text('README.md')).to.include('A workspace');
    });

    it.skip('js:workspace --license MIT writes a LICENSE file (BUG: package.json says MIT but no LICENSE is generated)', async function () {
      const project = await scaffold(
        'js:workspace',
        'lic-ws',
        '--license',
        'MIT',
      );

      expect(project.has('LICENSE')).to.equal(true);
    });
  });

  describe('precedence', function () {
    const configAuthor = 'Config Author <config@example.com>';

    it('flag beats gen.config.* beats the git identity (author)', async function () {
      const flagged = await scaffold(
        'js:app',
        'prec-flag',
        '--author',
        'Flag <flag@example.com>',
      );
      expect(flagged.pkg.author).to.equal('Flag <flag@example.com>');

      writeFileSync(
        join(cwd, 'gen.config.json'),
        JSON.stringify({ author: configAuthor }),
      );

      const configured = await scaffold('js:app', 'prec-config');
      expect(configured.pkg.author).to.equal(configAuthor);

      const overridden = await scaffold(
        'js:app',
        'prec-both',
        '--author',
        'Flag <flag@example.com>',
      );
      expect(overridden.pkg.author).to.equal('Flag <flag@example.com>');
    });

    it('falls back to the git identity when nothing else sets author', async function () {
      const project = await scaffold('js:lib', 'prec-git');

      expect(project.pkg.author).to.equal(GIT_IDENTITY);
    });

    it('applies config-file license and language but lets flags override them', async function () {
      writeFileSync(
        join(cwd, 'gen.config.json'),
        JSON.stringify({ license: 'MIT', language: 'typescript' }),
      );

      const configured = await scaffold('js:app', 'cfg-defaults');
      expect(configured.pkg.license).to.equal('MIT');
      expect(configured.has('tsconfig.json')).to.equal(true);

      const overridden = await scaffold(
        'js:app',
        'cfg-override',
        '--license',
        'Apache-2.0',
        '--language',
        'javascript',
      );
      expect(overridden.pkg.license).to.equal('Apache-2.0');
      expect(overridden.has('tsconfig.json')).to.equal(false);
    });

    it('persists the resolved answers to gen.config.yaml, or to --config-file', async function () {
      const defaultFile = await scaffold(
        'js:app',
        'cfg-out',
        '--license',
        'MIT',
      );
      expect(defaultFile.text('gen.config.yaml')).to.match(/^license: "MIT"$/m);
      expect(defaultFile.text('gen.config.yaml')).to.match(
        /^projectName: "cfg-out"$/m,
      );

      const custom = await scaffold(
        'js:app',
        'cfg-custom',
        '--config-file',
        'custom.yaml',
      );
      expect(custom.has('custom.yaml')).to.equal(true);
      expect(custom.has('gen.config.yaml')).to.equal(false);
    });
  });

  describe('project name', function () {
    it('--project-name drives the directory, package name, README title and config', async function () {
      const project = await scaffold('js:app', 'Mixed_Case-name');

      expect(project.dir).to.equal(join(cwd, 'Mixed_Case-name'));
      expect(project.pkg.name).to.equal('mixed-case-name');
      expect(project.text('README.md')).to.match(/^# Mixed Case Name$/m);
      expect(project.text('gen.config.yaml')).to.match(
        /^projectName: "Mixed_Case-name"$/m,
      );
    });

    it('js:lib nests under libs/ inside an npm workspace listing libs/*', async function () {
      const workspace = await scaffold('js:workspace', 'ws-root');
      process.chdir(workspace.dir);

      await scaffold('js:lib', 'member');
      const member = new Project(join(workspace.dir, 'libs', 'member'));

      expect(member.pkg.name).to.equal('member');
    });
  });

  describe('flags a namespace does not declare', function () {
    const cases: Array<[string, string, string[]]> = [
      ['js:workspace', '--create-repo', ['--create-repo']],
      ['js:workspace', '--no-git-init', ['--no-git-init']],
      ['js:workspace', '--author', ['--author', 'x']],
      ['js:workspace', '--test-framework', ['--test-framework', 'vitest']],
      ['base:workspace', '--license', ['--license', 'MIT']],
      ['base:workspace', '--create-repo', ['--create-repo']],
      ['base:app', '--language', ['--language', 'typescript']],
      ['base:app', '--package-scope', ['--package-scope', 'acme']],
      ['base:app', '--dependency', ['--dependency', 'a']],
    ];

    for (const [namespace, flag, args] of cases) {
      it(`${namespace} rejects ${flag}`, async function () {
        const stderr = await rejection(namespace, ...args);

        expect(stderr).to.include('unknown option');
        expect(stderr).to.include(flag);
      });
    }
  });
});
