import { join, relative } from 'node:path';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import { installedGeneratorPackages } from './installed-generator-packages.js';

describe('installedGeneratorPackages', function () {
  let root: string;

  beforeEach(function () {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'sektek-gen-installed-')));
  });

  afterEach(function () {
    rmSync(root, { recursive: true, force: true });
  });

  function writePackage(
    base: string,
    name: string,
    version: string,
    withManifest = true,
  ): void {
    const dir = join(base, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name,
        version,
        exports: {
          '.': './index.js',
          ...(withManifest ? { './manifest': './manifest.js' } : {}),
        },
      }),
    );
    writeFileSync(join(dir, 'index.js'), 'export {};\n');
    writeFileSync(join(dir, 'manifest.js'), 'export {};\n');
  }

  it('finds a generator package and its version', function () {
    writePackage(root, '@sektek/generator-fixture', '1.2.3');

    expect(installedGeneratorPackages(root)).to.deep.include({
      name: '@sektek/generator-fixture',
      version: '1.2.3',
    });
  });

  it('finds packages in a node_modules above cwd', function () {
    writePackage(root, '@sektek/generator-fixture', '1.2.3');
    const nested = join(root, 'a', 'b');
    mkdirSync(nested, { recursive: true });

    expect(installedGeneratorPackages(nested).map(pkg => pkg.name)).to.include(
      '@sektek/generator-fixture',
    );
  });

  it('finds packages above a relative cwd', function () {
    writePackage(root, '@sektek/generator-fixture', '1.2.3');
    const nested = join(root, 'a', 'b');
    mkdirSync(nested, { recursive: true });

    const names = installedGeneratorPackages(
      relative(process.cwd(), nested),
    ).map(pkg => pkg.name);

    expect(names).to.include('@sektek/generator-fixture');
  });

  it('ignores @sektek/generator itself and a package without a manifest', function () {
    writePackage(root, '@sektek/generator', '9.9.9');
    writePackage(root, '@sektek/generator-nomanifest', '1.0.0', false);

    const names = installedGeneratorPackages(root).map(pkg => pkg.name);

    expect(names).to.not.include('@sektek/generator');
    expect(names).to.not.include('@sektek/generator-nomanifest');
  });

  it('prefers the local copy over the fallback copy', function () {
    writePackage(root, '@sektek/generator-base', '0.0.1-local');

    expect(installedGeneratorPackages(root)).to.deep.include({
      name: '@sektek/generator-base',
      version: '0.0.1-local',
    });
  });

  it('reports a missing default package without a version', function () {
    const result = installedGeneratorPackages(root);

    for (const pkg of result.filter(p => p.version === undefined)) {
      expect(['@sektek/generator-base', '@sektek/generator-js']).to.include(
        pkg.name,
      );
    }
  });

  it('returns each package once, sorted by name', function () {
    writePackage(root, '@sektek/generator-zzz', '1.0.0');
    writePackage(root, '@sektek/generator-aaa', '1.0.0');

    const names = installedGeneratorPackages(root).map(pkg => pkg.name);

    expect(names).to.deep.equal([...new Set(names)].sort());
    expect(names.indexOf('@sektek/generator-aaa')).to.be.lessThan(
      names.indexOf('@sektek/generator-zzz'),
    );
  });
});
