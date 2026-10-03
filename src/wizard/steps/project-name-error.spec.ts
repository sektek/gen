import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import { projectNameError } from './project-name-error.js';

describe('wizard-steps', function () {
  describe('projectNameError', function () {
    let cwd: string;

    beforeEach(function () {
      cwd = mkdtempSync(join(tmpdir(), 'sektek-gen-wizard-steps-'));
    });

    afterEach(function () {
      rmSync(cwd, { recursive: true, force: true });
    });

    it('returns undefined for a name that is safe and not already taken', function () {
      expect(projectNameError('brave-otter', cwd)).to.be.undefined;
    });

    it("rejects a name that isn't a safe path segment", function () {
      expect(projectNameError('../escaped', cwd)).to.match(
        /isn't a valid directory name/,
      );
    });

    it('rejects a name that already exists under cwd', function () {
      mkdirSync(join(cwd, 'taken-name'));
      expect(projectNameError('taken-name', cwd)).to.match(/already exists/);
    });
  });
});
