import { type Prompt } from '@sektek/generator';
import { expect } from 'chai';

import { buildProgram } from './cli/build-program.js';
import { promptSpecsFor } from './cli/prompt-specs-for.js';
import { promptsFor } from './registry/index.js';
import { resolveAnswers } from './cli/resolve-answers.js';
import { schemaFor } from './schema.js';

// Every call into schema.ts-specific behavior goes through the helpers
// below, so retargeting this spec at another option source touches only
// them.

const NAMESPACES = [
  { namespace: '@sektek/js:app', isJs: true, hasScope: true },
  { namespace: '@sektek/js:lib', isJs: true, hasScope: true },
  // Never composes base-package, so no packageScope prompt.
  { namespace: '@sektek/js:workspace', isJs: true, hasScope: false },
  { namespace: '@sektek/base:app', isJs: false, hasScope: false },
  { namespace: '@sektek/base:workspace', isJs: false, hasScope: false },
];

// Only the prompts whose schema.ts entry is already retired: the rest still
// come from schema.ts here, so the pinned flag order stays as it was.
async function retiredPrompts(namespace: string): Promise<Prompt[]> {
  return (await promptsFor(namespace)).filter(
    prompt => prompt.name === 'packageScope',
  );
}

async function flagsFor(namespace: string): Promise<string[]> {
  const specs = await promptSpecsFor(
    { kind: 'newProjectDir' },
    { answers: {}, flagsGiven: {}, configDefaults: {} },
    { prompts: await retiredPrompts(namespace) },
  );
  return buildProgram(namespace, specs)
    .options.map(option => option.flags)
    .filter(flags => !CLI_FLAGS.includes(flags));
}

async function defaultsFor(
  namespace: string,
): Promise<Record<string, unknown>> {
  const specs = await promptSpecsFor(
    { kind: 'newProjectDir' },
    { answers: {}, flagsGiven: {}, configDefaults: {} },
    { prompts: await retiredPrompts(namespace) },
  );
  const { answers } = await resolveAnswers({
    namespace,
    flagsGiven: {},
    configDefaults: {},
    interactive: false,
    promptSpecs: specs,
    promptContext: { configDefaults: {} },
    destCwd: process.cwd(),
  });
  return answers;
}

function choicesFor(namespace: string): Record<string, readonly string[]> {
  return Object.fromEntries(
    schemaFor(namespace)
      .filter(spec => spec.kind === 'select')
      .map(spec => [spec.key, spec.choices ?? []]),
  );
}

// Registered by buildProgram() itself, not by the option schema.
const CLI_FLAGS = ['--no-interactive', '--install', '--force', '--dest <path>'];

const BASE_FLAGS = [
  '--profile <value>',
  '--description <value>',
  '--no-git-init',
  '--create-repo',
  '--repo-visibility <value>',
  '--repo-owner <value>',
  '--github-token <value>',
  '--no-push',
  '--config-file <path>',
];

const JS_FLAGS = [
  '--profile <value>',
  '--description <value>',
  '--language <value>',
  '--test-framework <value>',
  '--author <value>',
  '--license <value>',
  '--no-private',
  '--dependencies <list>',
  '--dependency <pkg>',
  '--dev-dependencies <list>',
  '--dev-dependency <pkg>',
  '--no-git-init',
  '--create-repo',
  '--repo-visibility <value>',
  '--repo-owner <value>',
  '--github-token <value>',
  '--no-push',
  '--config-file <path>',
];

const SCOPE_FLAG = '--package-scope <value>';

const BASE_DEFAULTS = {
  profile: 'default',
  description: undefined,
  gitInit: true,
  createRepo: false,
  repoVisibility: 'private',
  repoOwner: undefined,
  githubToken: undefined,
  push: true,
  configFile: undefined,
};

const JS_DEFAULTS = {
  profile: 'default',
  description: undefined,
  language: 'javascript',
  testFramework: 'mocha',
  author: undefined,
  license: 'UNLICENSED',
  private: true,
  dependencies: [],
  devDependencies: [],
  gitInit: true,
  createRepo: false,
  repoVisibility: 'private',
  repoOwner: undefined,
  githubToken: undefined,
  push: true,
  configFile: undefined,
};

// '' rather than undefined: the prompt-derived packageScope spec resolves
// it to '' while createRepo is off.
const SCOPE_DEFAULTS = { packageScope: '' };

const JS_CHOICES = {
  language: ['javascript', 'typescript'],
  testFramework: ['mocha', 'vitest', 'none'],
  repoVisibility: ['public', 'private'],
};

const BASE_CHOICES = { repoVisibility: ['public', 'private'] };

describe('option surface', function () {
  for (const { namespace, isJs, hasScope } of NAMESPACES) {
    describe(namespace, function () {
      // Prompt-derived flags register after the schema ones, so compare
      // order-independently.
      it('registers the expected flags', async function () {
        expect(await flagsFor(namespace)).to.have.members([
          ...(isJs ? JS_FLAGS : BASE_FLAGS),
          ...(hasScope ? [SCOPE_FLAG] : []),
          '--project-name <value>',
        ]);
      });

      it('resolves the expected defaults', async function () {
        const { projectName, ...defaults } = await defaultsFor(namespace);

        // A random suggestion, so only its shape is pinned.
        expect(projectName).to.be.a('string').that.is.not.empty;
        expect(defaults).to.deep.equal({
          ...(isJs ? JS_DEFAULTS : BASE_DEFAULTS),
          ...(hasScope ? SCOPE_DEFAULTS : {}),
        });
      });

      it('offers the expected select choices', function () {
        expect(choicesFor(namespace)).to.deep.equal(
          isJs ? JS_CHOICES : BASE_CHOICES,
        );
      });
    });
  }
});
