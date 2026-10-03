import { expect } from 'chai';

import { isInteractive } from './is-interactive.js';
import { overrideProperty } from './override-property.js';

describe('isInteractive', function () {
  const restores: Array<() => void> = [];

  const setTty = (stdout: boolean, stdin: boolean) => {
    restores.push(
      overrideProperty(process.stdout, 'isTTY', stdout),
      overrideProperty(process.stdin, 'isTTY', stdin),
    );
  };

  afterEach(function () {
    while (restores.length > 0) {
      restores.pop()!();
    }
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
