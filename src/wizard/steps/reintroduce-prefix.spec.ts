import { expect } from 'chai';

import { reintroducePrefix } from './reintroduce-prefix.js';

describe('wizard-steps', function () {
  describe('reintroducePrefix', function () {
    it("joins the prefix onto the typed input with generateProjectName's own '-' separator", function () {
      expect(reintroducePrefix('sektek-messaging', 'x')).to.deep.equal({
        value: 'sektek-messaging-x',
        cursorOffset: 'sektek-messaging-x'.length,
      });
    });

    it('places the cursor at the end for a multi-character (pasted) input', function () {
      expect(reintroducePrefix('sektek-messaging', 'fizzy')).to.deep.equal({
        value: 'sektek-messaging-fizzy',
        cursorOffset: 'sektek-messaging-fizzy'.length,
      });
    });
  });
});
