import { expect } from 'chai';
import { spy } from 'sinon';

import { listenForCancelSignals } from './cancel-signals.js';

// Under tsx a SIGTERM/SIGHUP with no listener of its own ends the test
// process, so keep one for the duration of each test that emits them.
const noop = () => {};

describe('listenForCancelSignals', function () {
  beforeEach(function () {
    process.on('SIGTERM', noop);
    process.on('SIGHUP', noop);
  });

  afterEach(function () {
    process.off('SIGTERM', noop);
    process.off('SIGHUP', noop);
  });

  it('reports SIGTERM and SIGHUP', function () {
    const onSignal = spy();
    const stop = listenForCancelSignals(onSignal);

    process.emit('SIGTERM');
    process.emit('SIGHUP');
    stop();

    expect(onSignal.args).to.deep.equal([['SIGTERM'], ['SIGHUP']]);
  });

  it('removes its listeners when stopped', function () {
    const before = process.listenerCount('SIGTERM');
    const stop = listenForCancelSignals(() => {});
    expect(process.listenerCount('SIGTERM')).to.equal(before + 1);

    stop();

    expect(process.listenerCount('SIGTERM')).to.equal(before);
  });
});
