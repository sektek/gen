import type { ReactElement } from 'react';
import { expect } from 'chai';

import { WizardCancelledError } from './wizard-cancelled-error.js';
import type { WizardProps } from './wizard/types/index.js';
import { runWizard } from './run-wizard.js';

// Under tsx a SIGTERM/SIGHUP with no listener of its own ends the test
// process, so keep one for the duration of each test that emits them.
const noop = () => {};

describe('runWizard', function () {
  let props: WizardProps;
  let unmounts: number;
  let renderOptions: { exitOnCtrlC?: boolean } | undefined;

  const renderApp = ((
    element: ReactElement<WizardProps>,
    options?: { exitOnCtrlC?: boolean },
  ) => {
    props = element.props;
    renderOptions = options;
    return {
      unmount: () => {
        unmounts++;
      },
    };
  }) as unknown as NonNullable<Parameters<typeof runWizard>[3]>['renderApp'];

  afterEach(function () {
    props.onCancel!();
    process.off('SIGTERM', noop);
    process.off('SIGHUP', noop);
  });

  beforeEach(function () {
    process.on('SIGTERM', noop);
    process.on('SIGHUP', noop);
    unmounts = 0;
    renderOptions = undefined;
  });

  const rejection = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error as WizardCancelledError;
    }
    return undefined;
  };

  const start = () => runWizard('@sektek/base:app', {}, {}, { renderApp });

  it('turns off ink exitOnCtrlC so the wizard owns ctrl+c', async function () {
    const result = start();

    expect(renderOptions?.exitOnCtrlC).to.equal(false);

    props.onCancel!();
    await rejection(result);
  });

  it('resolves with the answers on completion and unmounts', async function () {
    const result = start();

    props.onComplete({ a: 1 }, ['a']);

    expect(await result).to.deep.equal({
      answers: { a: 1 },
      answeredKeys: ['a'],
    });
    expect(unmounts).to.equal(1);
  });

  it('rejects with SIGINT when the wizard reports ctrl+c, unmounting ink', async function () {
    const result = start();

    props.onCancel!();

    const error = await rejection(result);
    expect(error).to.be.instanceOf(WizardCancelledError);
    expect(error?.signal).to.equal('SIGINT');
    expect(unmounts).to.equal(1);
  });

  for (const signal of ['SIGTERM', 'SIGHUP'] as const) {
    it(`rejects with ${signal} when the process receives it`, async function () {
      const result = start();

      process.emit(signal);

      const error = await rejection(result);
      expect(error).to.be.instanceOf(WizardCancelledError);
      expect(error?.signal).to.equal(signal);
      expect(unmounts).to.equal(1);
    });
  }

  it('removes its signal listeners once cancelled or completed', async function () {
    const before = process.listenerCount('SIGTERM');

    const cancelled = start();
    props.onCancel!();
    await rejection(cancelled);
    const completed = start();
    props.onComplete({}, []);
    await completed;

    expect(process.listenerCount('SIGTERM')).to.equal(before);
  });

  it('ignores a signal after completion', async function () {
    const result = start();
    props.onComplete({}, []);
    await result;

    process.emit('SIGTERM');

    expect(unmounts).to.equal(1);
  });
});
