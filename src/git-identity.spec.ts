import { expect } from 'chai';

import {
  deriveAuthorFromGitConfig,
  resetGitConfigReaderForTesting,
  setGitConfigReaderForTesting,
} from './git-identity.js';

/**
 * Installs a fake reader answering from `values`. Restoration is handled
 * by the suite's own `afterEach` below, not by this function.
 *
 * @param values - The `user.name`/`user.email` values to answer with.
 */
function stubGitConfig(values: Record<string, string>) {
  setGitConfigReaderForTesting(async key => values[key]);
}

describe('git-identity', function () {
  afterEach(function () {
    resetGitConfigReaderForTesting();
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
