import { ManagedProcessRegistry } from '@/sidecar/services/process/ManagedProcessRegistry';
import { SidecarProcessTransport } from '@/sidecar/services/process/SidecarProcessTransport';

describe('SidecarProcessTransport', () => {
  it('owns a process session and releases it after exit', async () => {
    const registry = new ManagedProcessRegistry();
    const transport = new SidecarProcessTransport(registry);
    const session = await transport.start({ executable: process.execPath, args: ['-e', 'process.stdout.write("ok")'], cwd: process.cwd(), stdioMode: 'pipe' });
    let output = '';
    session.onStdout(chunk => { output += chunk; });
    await new Promise<void>(resolve => session.onExit(() => resolve()));
    expect(output).toBe('ok');
    expect(registry.size).toBe(0);
  });

  it('terminates all Sidecar-owned children through the registry', async () => {
    const registry = new ManagedProcessRegistry();
    const transport = new SidecarProcessTransport(registry);
    const session = await transport.start({ executable: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: process.cwd(), stdioMode: 'pipe' });
    expect(registry.size).toBe(1);
    registry.terminateAll('SIGKILL');
    await new Promise<void>(resolve => session.onExit(() => resolve()));
    expect(registry.size).toBe(0);
  });
});
