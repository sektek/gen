import {
  chmodSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import type { OptionSpec } from './types/index.js';
import { buildProgram } from './cli/build-program.js';
import { promptSpecsFor } from './cli/prompt-specs-for.js';
import { promptsFor } from './registry/index.js';
import { resolveAnswers } from './cli/resolve-answers.js';

// Every call into the option source goes through the helpers below, so
// retargeting this spec at another one touches only them.

const NAMESPACES = [
  { namespace: '@sektek/js:app' },
  { namespace: '@sektek/js:lib' },
  { namespace: '@sektek/js:workspace' },
  { namespace: '@sektek/base:app' },
  { namespace: '@sektek/base:workspace' },
];

async function specsFor(namespace: string): Promise<OptionSpec[]> {
  return promptSpecsFor(
    { kind: 'newProjectDir' },
    { answers: {}, flagsGiven: {}, configDefaults: {} },
    { prompts: await promptsFor(namespace), keepGated: true },
  );
}

async function flagsFor(namespace: string): Promise<string[]> {
  return buildProgram(namespace, await specsFor(namespace))
    .options.map(option => option.flags)
    .filter(flags => !CLI_FLAGS.includes(flags));
}

async function defaultsFor(
  namespace: string,
): Promise<Record<string, unknown>> {
  const { answers } = await resolveAnswers({
    flagsGiven: {},
    configDefaults: {},
    interactive: false,
    promptSpecs: await specsFor(namespace),
    promptContext: { configDefaults: {} },
    destCwd: process.cwd(),
  });
  return answers;
}

async function choicesFor(
  namespace: string,
): Promise<Record<string, readonly string[]>> {
  return Object.fromEntries(
    (await specsFor(namespace))
      .filter(spec => spec.kind === 'select')
      .map(spec => [spec.key, spec.choices ?? []]),
  );
}

// Registered by buildProgram() itself, not by a prompt.
const CLI_FLAGS = ['--no-interactive', '--install', '--force', '--dest <path>'];

const PROJECT_FLAGS = [
  '--project-name <value>',
  '--profile <value>',
  '--description <value>',
  '--config-file <value>',
];

const GIT_FLAGS = [
  '--no-git-init',
  '--create-repo',
  '--repo-visibility <value>',
  '--repo-owner <value>',
  '--github-token <value>',
  '--no-push',
];

const BASE_APP_FLAGS = [
  ...PROJECT_FLAGS,
  ...GIT_FLAGS,
  '--author <value>',
  '--license <value>',
];

const JS_DEPENDENCY_FLAGS = [
  '--dependencies <list>',
  '--dependency <pkg>',
  '--dev-dependencies <list>',
  '--dev-dependency <pkg>',
];

const JS_APP_FLAGS = [
  ...BASE_APP_FLAGS,
  ...JS_DEPENDENCY_FLAGS,
  '--language <value>',
  '--test-framework <value>',
  '--no-private',
  '--package-scope <value>',
];

// A workspace takes only what it and its composed generators declare: no
// git/github options, test framework or author.
const JS_WORKSPACE_FLAGS = [
  ...PROJECT_FLAGS,
  ...JS_DEPENDENCY_FLAGS,
  '--language <value>',
  '--license <value>',
  '--no-private',
];

const FLAGS: Record<string, string[]> = {
  '@sektek/js:app': JS_APP_FLAGS,
  '@sektek/js:lib': JS_APP_FLAGS,
  '@sektek/js:workspace': JS_WORKSPACE_FLAGS,
  '@sektek/base:app': BASE_APP_FLAGS,
  '@sektek/base:workspace': PROJECT_FLAGS,
};

const PROJECT_DEFAULTS = {
  profile: 'default',
  description: undefined,
  configFile: undefined,
};

// repoVisibility and push are gated on createRepo, which is off, yet a
// skipped prompt still resolves to its own default.
const BASE_APP_DEFAULTS = {
  ...PROJECT_DEFAULTS,
  // No git identity in the isolated config, so authorPrompt yields nothing.
  author: undefined,
  license: 'UNLICENSED',
  gitInit: true,
  createRepo: false,
  repoOwner: undefined,
  githubToken: undefined,
  repoVisibility: 'private',
  push: true,
};

const JS_DEPENDENCY_DEFAULTS = { dependencies: [], devDependencies: [] };

const JS_APP_DEFAULTS = {
  ...BASE_APP_DEFAULTS,
  ...JS_DEPENDENCY_DEFAULTS,
  language: 'javascript',
  testFramework: 'mocha',
  private: true,
  // '' rather than undefined: the prompt-derived packageScope spec resolves
  // it to '' while createRepo is off.
  packageScope: '',
};

const JS_WORKSPACE_DEFAULTS = {
  ...PROJECT_DEFAULTS,
  ...JS_DEPENDENCY_DEFAULTS,
  language: 'javascript',
  license: 'UNLICENSED',
  private: true,
};

const DEFAULTS: Record<string, Record<string, unknown>> = {
  '@sektek/js:app': JS_APP_DEFAULTS,
  '@sektek/js:lib': JS_APP_DEFAULTS,
  '@sektek/js:workspace': JS_WORKSPACE_DEFAULTS,
  '@sektek/base:app': BASE_APP_DEFAULTS,
  '@sektek/base:workspace': PROJECT_DEFAULTS,
};

const CHOICES: Record<string, Record<string, string[]>> = {
  '@sektek/js:app': {
    language: ['javascript', 'typescript'],
    testFramework: ['mocha', 'vitest', 'none'],
    repoVisibility: ['public', 'private'],
  },
  '@sektek/js:lib': {
    language: ['javascript', 'typescript'],
    testFramework: ['mocha', 'vitest', 'none'],
    repoVisibility: ['public', 'private'],
  },
  '@sektek/js:workspace': { language: ['javascript', 'typescript'] },
  '@sektek/base:app': { repoVisibility: ['public', 'private'] },
  '@sektek/base:workspace': {},
};

const restoreEnv = (key: string, value: string | undefined) => {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
};

const isToken = (value: unknown) =>
  typeof value === 'string' && /^gh[opusr]_/.test(value);

describe('option surface', function () {
  for (const namespace of [
    '@sektek/js:app',
    '@sektek/js:lib',
    '@sektek/js:workspace',
  ]) {
    // The base-package/workspace templates render `"private": <%= privatePackage %>`
    // with no fallback, so an undefined private would produce invalid JSON.
    it(`${namespace} resolves private to a boolean even though its prompt is gated by license`, async function () {
      const { private: isPrivate } = await defaultsFor(namespace);

      expect(isPrivate).to.equal(true);
    });
  }

  let configDir: string;
  let originalGlobal: string | undefined;
  let originalNoSystem: string | undefined;
  let originalPath: string | undefined;
  let originalGithubToken: string | undefined;
  let originalGhToken: string | undefined;
  let ghLog: string;

  // Isolate git config so the author default never reads this machine's
  // identity.
  beforeEach(function () {
    configDir = mkdtempSync(join(tmpdir(), 'sektek-gen-surface-gitcfg-'));
    originalGlobal = process.env.GIT_CONFIG_GLOBAL;
    originalNoSystem = process.env.GIT_CONFIG_NOSYSTEM;
    const gitConfigPath = join(configDir, 'gitconfig');
    writeFileSync(gitConfigPath, '');
    process.env.GIT_CONFIG_GLOBAL = gitConfigPath;
    process.env.GIT_CONFIG_NOSYSTEM = '1';

    // A fake `gh` first on PATH records every spawn, and fake tokens sit in
    // the environment, so a default resolve that reached for either shows.
    originalPath = process.env.PATH;
    originalGithubToken = process.env.GITHUB_TOKEN;
    originalGhToken = process.env.GH_TOKEN;
    ghLog = join(configDir, 'gh.log');
    const ghPath = join(configDir, 'gh');
    writeFileSync(
      ghPath,
      `#!/bin/sh\necho "$@" >> '${ghLog}'\necho gho_fakeclitoken\n`,
    );
    chmodSync(ghPath, 0o755);
    process.env.PATH = `${configDir}:${originalPath}`;
    process.env.GITHUB_TOKEN = 'ghp_fakeenvtoken';
    process.env.GH_TOKEN = 'ghs_fakeenvtoken';
  });

  afterEach(function () {
    restoreEnv('GIT_CONFIG_GLOBAL', originalGlobal);
    restoreEnv('GIT_CONFIG_NOSYSTEM', originalNoSystem);
    restoreEnv('PATH', originalPath);
    restoreEnv('GITHUB_TOKEN', originalGithubToken);
    restoreEnv('GH_TOKEN', originalGhToken);
    rmSync(configDir, { recursive: true, force: true });
  });

  for (const { namespace } of NAMESPACES) {
    describe(namespace, function () {
      it('resolves no token and never spawns gh without createRepo', async function () {
        const defaults = await defaultsFor(namespace);

        expect(Object.values(defaults).filter(isToken)).to.deep.equal([]);
        expect(existsSync(ghLog)).to.equal(false);
      });

      // Flag order follows prompts(), so compare order-independently.
      it('registers the expected flags', async function () {
        expect(await flagsFor(namespace)).to.have.members(FLAGS[namespace]);
      });

      it('resolves the expected defaults', async function () {
        const { projectName, ...defaults } = await defaultsFor(namespace);

        // A random suggestion, so only its shape is pinned.
        expect(projectName).to.be.a('string').that.is.not.empty;
        expect(defaults).to.deep.equal(DEFAULTS[namespace]);
      });

      it('offers the expected select choices', async function () {
        expect(await choicesFor(namespace)).to.deep.equal(CHOICES[namespace]);
      });
    });
  }
});
