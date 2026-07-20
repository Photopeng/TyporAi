import type { PermissionMode } from '@/core/types/settings';

export interface UnifiedPermissionPolicy {
  readonly approvals: 'always' | 'never' | 'on-risk';
  readonly filesystem: 'full-access' | 'read-only' | 'workspace-write';
  readonly network: 'allow' | 'deny';
  readonly planOnly: boolean;
}

/** Maps persisted product modes to explicit provider-neutral safety semantics. */
export function resolveUnifiedPermissionPolicy(mode: unknown): UnifiedPermissionPolicy {
  switch (mode as PermissionMode) {
    case 'yolo': return { approvals: 'never', filesystem: 'full-access', network: 'allow', planOnly: false };
    case 'plan': return { approvals: 'on-risk', filesystem: 'workspace-write', network: 'deny', planOnly: true };
    default: return { approvals: 'on-risk', filesystem: 'workspace-write', network: 'deny', planOnly: false };
  }
}
