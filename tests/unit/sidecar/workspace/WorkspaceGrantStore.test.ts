import path from 'node:path';

import { WorkspaceGrantStore } from '@/sidecar/services/workspace/WorkspaceGrantStore';

describe('WorkspaceGrantStore', () => {
  it('rejects paths outside the granted workspace', () => {
    const grants = new WorkspaceGrantStore();
    const root = grants.grant(path.resolve('workspace'));
    expect(grants.contains(path.join(root, 'note.md'))).toBe(true);
    expect(() => grants.require(path.resolve('outside.md'))).toThrow('WORKSPACE_NOT_GRANTED');
    grants.revoke();
    expect(grants.current).toBeNull();
  });
});
