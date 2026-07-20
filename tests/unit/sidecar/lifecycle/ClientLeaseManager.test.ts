import { ClientLeaseManager } from '@/sidecar/lifecycle/ClientLeaseManager';

describe('ClientLeaseManager', () => {
  it('keeps resources isolated by connection and keeps a disconnected lease resumable', () => {
    let now = 100;
    const leases = new ClientLeaseManager({ now: () => now, reconnectGraceMs: 10 });
    leases.connect('connection-a', 'window-a');
    leases.connect('connection-b', 'window-b');
    leases.attachRuntime('connection-a', 'runtime-a');
    leases.attachTurn('connection-a', 'turn-a');
    leases.attachApproval('connection-a', 'approval-a');
    leases.attachWatch('connection-a', 'watch-a');

    expect(leases.ownsRuntime('connection-a', 'runtime-a')).toBe(true);
    expect(leases.ownsRuntime('connection-b', 'runtime-a')).toBe(false);
    expect(leases.ownsTurn('connection-b', 'turn-a')).toBe(false);
    expect(leases.ownsApproval('connection-b', 'approval-a')).toBe(false);

    leases.releaseRuntime('connection-a', 'runtime-a');
    expect(leases.ownsRuntime('connection-a', 'runtime-a')).toBe(false);
    leases.attachRuntime('connection-a', 'runtime-a');

    expect(leases.disconnect('connection-a')).toMatchObject({ clientId: 'window-a', connectionId: 'connection-a', reconnectDeadline: 110 });
    expect(leases.ownsRuntime('connection-a', 'runtime-a')).toBe(true);
    expect(leases.size).toBe(2);
    expect(leases.connect('connection-new', 'window-a', 'connection-a')).toMatchObject({ connectionId: 'connection-a', previousConnectionId: 'connection-new' });
    expect(leases.ownsRuntime('connection-a', 'runtime-a')).toBe(true);
    leases.disconnect('connection-a');
    now = 111;
    expect(leases.expire('connection-a')).toMatchObject({ connectionId: 'connection-a' });
    expect(leases.size).toBe(1);
  });
});
