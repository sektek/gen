import { expect } from 'chai';

import { isInteractive } from './is-interactive.js';

describe('isInteractive', function () {
  let originalStdout: boolean | undefined;
  let originalStdin: boolean | undefined;

  const setTty = (stdout: boolean, stdin: boolean) => {
    process.stdout.isTTY = stdout;
    process.stdin.isTTY = stdin;
  };

  beforeEach(function () {
    originalStdout = process.stdout.isTTY;
    originalStdin = process.stdin.isTTY;
  });

  afterEach(function () {
    process.stdout.isTTY = originalStdout;
    process.stdin.isTTY = originalStdin;
  });

  it('is true when both streams are TTYs and --no-interactive was not given', function () {
    setTty(true, true);
    expect(isInteractive(true)).to.be.true;
    expect(isInteractive(undefined)).to.be.true;
  });

  it('is false when --no-interactive was given', function () {
    setTty(true, true);
    expect(isInteractive(false)).to.be.false;
  });

  it('is false when stdout is not a TTY', function () {
    setTty(false, true);
    expect(isInteractive(true)).to.be.false;
  });

  it('is false when stdin is not a TTY', function () {
    setTty(true, false);
    expect(isInteractive(true)).to.be.false;
  });
});
