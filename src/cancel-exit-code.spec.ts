import { expect } from 'chai';

import { cancelExitCode } from './cancel-exit-code.js';

describe('cancelExitCode', function () {
  it('maps SIGINT to 130', function () {
    expect(cancelExitCode('SIGINT')).to.equal(130);
  });

  it('maps SIGTERM to 143', function () {
    expect(cancelExitCode('SIGTERM')).to.equal(143);
  });

  it('maps SIGHUP to 129', function () {
    expect(cancelExitCode('SIGHUP')).to.equal(129);
  });
});
