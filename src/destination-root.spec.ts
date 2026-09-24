import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';

import {
  locateNewProject,
  resolveDestinationRoot,
} from './destination-root.js';

use(chaiAsPromised);

describe('destination-root', function () {
  let cwd: string;

  beforeEach(function () {
    cwd = realpathSync(mkdtempSync(join(tmpdir(), 'sektek-gen-dest-')));
  });

  afterEach(function () {
    rmSync(cwd, { recursive: true, force: true });
  });

  const makeWorkspace = () =>
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({ name: 'sektek-messaging', workspaces: ['libs/*'] }),
    );

  const run = (
    mode: Parameters<typeof resolveDestinationRoot>[0]['mode'],
    destGiven = false,
    dest = cwd,
  ) =>
    resolveDestinationRoot({
      destGiven,
      dest,
      mode,
      projectName: 'fizzy-otter',
      options: {},
    });

  describe('resolveDestinationRoot', function () {
    describe('with --dest given', function () {
      const explicit = '/somewhere/explicit';

      it('uses --dest verbatim for inPlace', async function () {
        expect(await run({ kind: 'inPlace' }, true, explicit)).to.equal(
          explicit,
        );
      });

      it('uses --dest verbatim for newProjectDir', async function () {
        expect(await run({ kind: 'newProjectDir' }, true, explicit)).to.equal(
          explicit,
        );
      });

      it('uses --dest verbatim for newProjectDir with a subdir, even inside a workspace', async function () {
        makeWorkspace();
        expect(
          await run({ kind: 'newProjectDir', subdir: 'libs' }, true, explicit),
        ).to.equal(explicit);
      });
    });

    describe('without --dest', function () {
      it('scaffolds in place for inPlace', async function () {
        expect(await run({ kind: 'inPlace' })).to.equal(cwd);
      });

      it('creates a named directory under cwd for newProjectDir', async function () {
        expect(await run({ kind: 'newProjectDir' })).to.equal(
          join(cwd, 'fizzy-otter'),
        );
      });

      it('nests under <workspace>/<subdir> for newProjectDir with a subdir inside a workspace', async function () {
        makeWorkspace();
        expect(await run({ kind: 'newProjectDir', subdir: 'libs' })).to.equal(
          join(cwd, 'libs', 'fizzy-otter'),
        );
      });

      it('falls back to cwd for newProjectDir with a subdir outside any workspace', async function () {
        expect(await run({ kind: 'newProjectDir', subdir: 'libs' })).to.equal(
          join(cwd, 'fizzy-otter'),
        );
      });
    });
  });

  describe('generated names', function () {
    it('retries generateName() past an existing directory when no projectName is given', async function () {
      const names = ['taken', 'free'];
      mkdirSync(join(cwd, 'taken'));

      const destination = await resolveDestinationRoot({
        destGiven: false,
        dest: cwd,
        mode: { kind: 'newProjectDir' },
        generateName: () => names.shift()!,
        options: {},
      });

      expect(destination).to.equal(join(cwd, 'free'));
    });

    it('does not retry an explicit projectName that already exists', async function () {
      mkdirSync(join(cwd, 'taken'));

      await expect(
        resolveDestinationRoot({
          destGiven: false,
          dest: cwd,
          mode: { kind: 'newProjectDir' },
          projectName: 'taken',
          generateName: () => 'free',
          options: {},
        }),
      ).to.be.rejectedWith(/after 1 attempts/);
    });
  });

  describe('locateNewProject', function () {
    it('reports the enclosing workspace when one lists the subdir', function () {
      makeWorkspace();
      expect(
        locateNewProject(cwd, { kind: 'newProjectDir', subdir: 'libs' }),
      ).to.deep.equal({
        parentDir: join(cwd, 'libs'),
        workspace: { root: cwd, name: 'sektek-messaging' },
      });
    });

    it('ignores a workspace when the mode has no subdir', function () {
      makeWorkspace();
      expect(locateNewProject(cwd, { kind: 'newProjectDir' })).to.deep.equal({
        parentDir: cwd,
      });
    });
  });
});
