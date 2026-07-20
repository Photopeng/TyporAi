import { resolveUnifiedPermissionPolicy } from '@/core/security/UnifiedPermissionPolicy';

describe('UnifiedPermissionPolicy', () => {
  it('uses workspace-scoped approval for the safe default', () => {
    expect(resolveUnifiedPermissionPolicy('normal')).toEqual({ approvals: 'on-risk', filesystem: 'workspace-write', network: 'deny', planOnly: false });
  });

  it('requires explicit full-access mode before allowing unrestricted execution', () => {
    expect(resolveUnifiedPermissionPolicy('yolo')).toMatchObject({ approvals: 'never', filesystem: 'full-access', network: 'allow' });
  });
});
