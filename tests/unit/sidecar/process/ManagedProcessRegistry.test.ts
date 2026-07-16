import { ManagedProcessRegistry } from '@/sidecar/services/process/ManagedProcessRegistry';

describe('ManagedProcessRegistry', () => {
  it('reaps every Sidecar-owned process on shutdown', () => {
    const signals: string[] = [];
    const registry = new ManagedProcessRegistry();
    registry.add({ id: 'provider', terminate: signal => signals.push(`provider:${signal}`) });
    registry.add({ id: 'helper', terminate: signal => signals.push(`helper:${signal}`) });
    registry.terminateAll('SIGKILL');
    expect(signals).toEqual(['provider:SIGKILL', 'helper:SIGKILL']);
    expect(registry.size).toBe(0);
  });
});
