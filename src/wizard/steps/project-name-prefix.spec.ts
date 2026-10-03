import { expect } from 'chai';

import { projectNamePrefix } from './project-name-prefix.js';

describe('wizard-steps', function () {
  describe('projectNamePrefix', function () {
    it("prefers an explicit configDefaults.projectName over the workspace's name", function () {
      expect(
        projectNamePrefix({
          configDefaults: { projectName: 'sektek-messaging' },
          workspace: { root: '/ws', name: 'other-workspace' },
        }),
      ).to.equal('sektek-messaging');
    });

    it('falls back to the workspace name with no configDefaults.projectName', function () {
      expect(
        projectNamePrefix({
          configDefaults: {},
          workspace: { root: '/ws', name: 'sektek-messaging' },
        }),
      ).to.equal('sektek-messaging');
    });

    it('ignores a non-string or empty configDefaults.projectName', function () {
      expect(
        projectNamePrefix({
          configDefaults: { projectName: '' },
          workspace: { root: '/ws', name: 'sektek-messaging' },
        }),
      ).to.equal('sektek-messaging');
      expect(
        projectNamePrefix({
          configDefaults: { projectName: 42 },
          workspace: { root: '/ws', name: 'sektek-messaging' },
        }),
      ).to.equal('sektek-messaging');
    });

    it('returns undefined with neither a configDefaults.projectName nor a workspace', function () {
      expect(projectNamePrefix({ configDefaults: {} })).to.be.undefined;
    });
  });
});
