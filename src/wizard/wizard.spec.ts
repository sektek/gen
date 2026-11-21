import { PassThrough } from 'node:stream';

import type { Prompt, PromptContext } from '@sektek/generator';
import { expect } from 'chai';
import { render } from 'ink';

import type { RunWizardOptions } from '../types/index.js';
import { promptsToOptionSpecs } from '../prompt-adapter.js';
import { runWizard } from '../run-wizard.js';

const GENERATOR = '@acme/widget:app';

describe('Wizard', function () {
  it('hands the generator namespace to providers and includePrompt tests it re-evaluates', async function () {
    const seen: Array<string | undefined> = [];
    const prompt: Prompt = {
      name: 'gated',
      type: 'text',
      label: 'gated',
      provider: (context: PromptContext) => {
        seen.push(context.generator);
        return 'default';
      },
      includePrompt: (context: PromptContext) => {
        seen.push(context.generator);
        return false;
      },
      capabilities: [],
    };
    const promptContext = { configDefaults: {}, generator: GENERATOR };
    const specs = await promptsToOptionSpecs(
      [prompt],
      { ...promptContext, answers: {}, flagsGiven: {} },
      { keepGated: true },
    );
    seen.length = 0;

    const stdin = Object.assign(new PassThrough(), {
      isTTY: true,
      setRawMode: () => stdin,
      ref: () => stdin,
      unref: () => stdin,
    });
    const renderApp = ((element, options) =>
      render(element, {
        ...options,
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: new PassThrough() as unknown as NodeJS.WriteStream,
        debug: true,
      })) as NonNullable<RunWizardOptions['renderApp']>;

    await runWizard(specs, {}, {}, { promptContext, renderApp });

    expect(seen).to.have.length.greaterThan(0);
    expect(seen).to.satisfy((all: Array<string | undefined>) =>
      all.every(generator => generator === GENERATOR),
    );
  });
});
