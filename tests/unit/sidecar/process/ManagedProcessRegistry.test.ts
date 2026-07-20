import { ManagedProcessRegistry } from '@/sidecar/services/process/ManagedProcessRegistry';

describe('ManagedProcessRegistry', () => {
  it('waits for every Sidecar-owned process and reports unreaped children', async () => {
    const signals: string[] = [];
    const registry = new ManagedProcessRegistry();
    registry.add({ id: 'provider', terminate: async signal => { signals.push(`provider:${signal}`); return { exit: { code: 0, signal: null }, reaped: true }; } });
    registry.add({ id: 'helper', terminate: async signal => { signals.push(`helper:${signal}`); return { exit: { code: null, signal: 'SIGKILL' }, reaped: false }; } });
    const report = await registry.terminateAll('SIGKILL');
    expect(signals).toEqual(['provider:SIGKILL', 'helper:SIGKILL']);
    expect(report).toEqual({ terminatedIds: ['provider', 'helper'], unreapedIds: ['helper'] });
    expect(registry.size).toBe(0);
  });
});
