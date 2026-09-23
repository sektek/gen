import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import { findWorkspaceRoot } from './workspace-root.js';

describe('findWorkspaceRoot', function () {
  let root: string;

  beforeEach(function () {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'sektek-gen-ws-')));
  });

  afterEach(function () {
    rmSync(root, { recursive: true, force: true });
  });

  const writePackageJson = (dir: string, pkg: Record<string, unknown>) =>
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg));

  it('finds a workspace listing <subdir>/* at cwd itself', function () {
    writePackageJson(root, {
      name: 'sektek-messaging',
      workspaces: ['apps/*', 'libs/*'],
    });

    expect(findWorkspaceRoot(root, 'libs')).to.deep.equal({
      root,
      name: 'sektek-messaging',
    });
  });

  it('finds a workspace at an ancestor of cwd', function () {
    writePackageJson(root, {
      name: 'sektek-messaging',
      workspaces: ['libs/*'],
    });
    const nested = join(root, 'libs', 'existing', 'src');
    mkdirSync(nested, { recursive: true });
    writePackageJson(join(root, 'libs', 'existing'), { name: 'existing' });

    expect(findWorkspaceRoot(nested, 'libs')).to.deep.equal({
      root,
      name: 'sektek-messaging',
    });
  });

  it('returns undefined when no package.json lists the subdir', function () {
    expect(findWorkspaceRoot(root, 'libs')).to.be.undefined;
  });

  it('returns undefined when the workspace does not list <subdir>/*', function () {
    writePackageJson(root, {
      name: 'sektek-messaging',
      workspaces: ['apps/*'],
    });

    expect(findWorkspaceRoot(root, 'libs')).to.be.undefined;
  });

  it('returns undefined for a cwd that does not exist yet', function () {
    expect(findWorkspaceRoot(join(root, 'missing'), 'libs')).to.be.undefined;
  });
});
