import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { expect } from 'chai';

import {
  GeneratorPackageNotFoundError,
  generatorPackageName,
  resolveGeneratorPackagePath,
} from './package-resolver.js';

describe('package-resolver', function () {
  let root: string;

  beforeEach(function () {
    root = realpathSync(mkdtempSync(join(tmpdir(), 'sektek-gen-pkg-')));
  });

  afterEach(function () {
    rmSync(root, { recursive: true, force: true });
  });

  function writeFixturePackage(
    packageName: string,
    dir: string,
    subpaths: Record<string, string> = {},
  ): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: packageName,
        version: '0.0.0-fixture',
        exports: {
          '.': './index.js',
          ...Object.fromEntries(
            Object.keys(subpaths).map(name => [`./${name}`, `./${name}.js`]),
          ),
        },
      }),
    );
    writeFileSync(join(dir, 'index.js'), 'export {};\n');
    for (const name of Object.keys(subpaths)) {
      writeFileSync(join(dir, `${name}.js`), 'export {};\n');
    }
  }

  describe('resolveGeneratorPackagePath', function () {
    it('resolves a package that only exists under a fixture cwd node_modules', function () {
      const pkgDir = join(root, 'node_modules', '@scope', 'generator-x');
      writeFixturePackage('@scope/generator-x', pkgDir, { manifest: '' });

      const resolved = resolveGeneratorPackagePath(
        '@scope/generator-x',
        'manifest',
        root,
      );

      expect(resolved).to.equal(realpathSync(join(pkgDir, 'manifest.js')));
    });

    it("falls back to resolving alongside gen's own install", function () {
      // No node_modules under root at all, so the cwd-rooted search must
      // walk all the way up and miss, leaving the global fallback (which
      // resolves against this dev workspace's real @sektek/generator) to
      // succeed.
      const resolved = resolveGeneratorPackagePath(
        '@sektek/generator',
        '',
        root,
      );

      expect(resolved).to.equal(
        fileURLToPath(import.meta.resolve('@sektek/generator')),
      );
    });

    it('prefers a cwd-local install over the global fallback on conflict', function () {
      const pkgDir = join(root, 'node_modules', '@sektek', 'generator');
      writeFixturePackage('@sektek/generator', pkgDir);

      const resolved = resolveGeneratorPackagePath(
        '@sektek/generator',
        '',
        root,
      );

      expect(resolved).to.equal(realpathSync(join(pkgDir, 'index.js')));
    });

    it('throws GeneratorPackageNotFoundError naming both search locations when neither resolves', function () {
      let thrown: GeneratorPackageNotFoundError | undefined;
      try {
        resolveGeneratorPackagePath('@scope/does-not-exist', '', root);
      } catch (error) {
        thrown = error as GeneratorPackageNotFoundError;
      }

      expect(thrown).to.be.instanceOf(GeneratorPackageNotFoundError);
      expect(thrown?.packageName).to.equal('@scope/does-not-exist');
      expect(thrown?.cwd).to.equal(root);
      expect(thrown?.message).to.include(root);
      expect(thrown?.message).to.include("gen's own install");
    });
  });

  describe('generatorPackageName', function () {
    it('builds the @<scope>/generator-<name> convention', function () {
      expect(generatorPackageName('sektek', 'base')).to.equal(
        '@sektek/generator-base',
      );
    });
  });
});
