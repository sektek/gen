import { expect } from 'chai';

import { listSpec, selectSpec, textSpec } from './fixtures.js';
import { pendingSpecs } from './pending-specs.js';

describe('wizard-steps', function () {
  describe('pendingSpecs', function () {
    it('returns every spec when seed is empty', function () {
      expect(pendingSpecs([textSpec, selectSpec], {})).to.deep.equal([
        textSpec,
        selectSpec,
      ]);
    });

    it('skips a spec whose key is already in seed', function () {
      expect(
        pendingSpecs([textSpec, selectSpec], { description: 'already set' }),
      ).to.deep.equal([selectSpec]);
    });

    it('skips a spec seeded with an explicit undefined value', function () {
      // Not "still pending" — a value of undefined means this key was
      // deliberately answered (e.g. an optional text field left blank),
      // not that it's absent. See pendingSpecs()'s own doc comment.
      expect(
        pendingSpecs([textSpec], { description: undefined }),
      ).to.deep.equal([]);
    });

    it('does not skip a spec whose key is entirely absent from seed', function () {
      expect(pendingSpecs([textSpec], {})).to.deep.equal([textSpec]);
    });

    it('never includes a kind: "list" spec, even when its key is absent from seed', function () {
      // SEK-87: "the wizard should not provide the option to add when
      // being run interactively" - dependencies/devDependencies must never
      // be walked as a wizard step, regardless of seed state.
      expect(pendingSpecs([textSpec, listSpec], {})).to.deep.equal([textSpec]);
    });

    it('never includes a kind: "list" spec even when it is already in seed', function () {
      expect(
        pendingSpecs([textSpec, listSpec], { dependencies: ['lodash'] }),
      ).to.deep.equal([textSpec]);
    });
  });
});
