import { expect } from 'chai';

import type { OptionSpec } from './types/index.js';
import { withConfigDefaults } from './with-config-defaults.js';

describe('withConfigDefaults', function () {
  const specs: OptionSpec[] = [
    {
      key: 'author',
      flag: '--author <value>',
      prompt: 'Author',
      kind: 'text',
    },
    {
      key: 'license',
      flag: '--license <value>',
      prompt: 'License',
      kind: 'text',
      default: 'UNLICENSED',
    },
  ];

  it('overrides a spec default with the matching config default', function () {
    const result = withConfigDefaults(specs, { license: 'MIT' });

    expect(result.find(spec => spec.key === 'license')?.default).to.equal(
      'MIT',
    );
  });

  it('leaves a spec unchanged when config has no value for its key', function () {
    const result = withConfigDefaults(specs, { license: 'MIT' });

    expect(result.find(spec => spec.key === 'author')).to.deep.equal(specs[0]);
  });

  it('ignores config keys with no matching spec', function () {
    const result = withConfigDefaults(specs, { notInSpecs: 'whatever' });

    expect(result).to.deep.equal(specs);
  });

  it('does not mutate the original specs array', function () {
    withConfigDefaults(specs, { license: 'MIT' });

    expect(specs.find(spec => spec.key === 'license')?.default).to.equal(
      'UNLICENSED',
    );
  });
});
