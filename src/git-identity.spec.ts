import { expect } from 'chai';

import {
  deriveAuthorFromGitConfig,
  setGitConfigReaderForTesting,
} from './git-identity.js';

/**
 * Installs a fake reader answering from `values`, and restores the real
 * one afterwards.
 *
 * @param values - The `user.name`/`user.email` values to answer with.
 */
function stubGitConfig(values: Record<string, string>) {
  setGitConfigReaderForTesting(async key => values[key]);
}

describe('git-identity', function () {
  afterEach(function () {
    // Resets to a no-op reader rather than the real CLI-backed one, so no
    // spec here ever depends on (or is broken by) whatever git identity
    // happens to be configured in the environment actually running tests.
    setGitConfigReaderForTesting(async () => undefined);
  });

  describe('deriveAuthorFromGitConfig', function () {
    it('combines user.name and user.email when both are set', async function () {
      stubGitConfig({
        'user.name': 'Ada Lovelace',
        'user.email': 'ada@example.com',
      });

      expect(await deriveAuthorFromGitConfig()).to.equal(
        'Ada Lovelace <ada@example.com>',
      );
    });

    it('falls back to just the name when only user.name is set', async function () {
      stubGitConfig({ 'user.name': 'Ada Lovelace' });

      expect(await deriveAuthorFromGitConfig()).to.equal('Ada Lovelace');
    });

    it('falls back to just the email when only user.email is set', async function () {
      stubGitConfig({ 'user.email': 'ada@example.com' });

      expect(await deriveAuthorFromGitConfig()).to.equal('ada@example.com');
    });

    it('resolves undefined when neither is set', async function () {
      stubGitConfig({});

      expect(await deriveAuthorFromGitConfig()).to.be.undefined;
    });
  });
});
