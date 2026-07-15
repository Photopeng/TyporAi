import { DefaultExecutionPolicy, ExecutionPolicyError } from '@/core/ports';

const spec = {
  executable: 'claude',
  args: ['--json'],
  cwd: '/workspace',
  stdioMode: 'pipe' as const,
};

describe('DefaultExecutionPolicy', () => {
  it('enforces executable authorization and concurrency', () => {
    const policy = new DefaultExecutionPolicy({
      allowedExecutables: ['claude'],
      maxConcurrent: 1,
    });
    const lease = policy.acquire?.(spec);
    expect(() => policy.acquire?.({ ...spec, executable: 'sh' })).toThrow(ExecutionPolicyError);
    expect(() => policy.acquire?.(spec)).toThrow('concurrency limit');
    lease?.release();
    expect(() => policy.acquire?.(spec)).not.toThrow();
  });

  it('enforces output budget and emits lifecycle audit events', () => {
    const events: string[] = [];
    const policy = new DefaultExecutionPolicy({
      maxOutputBytes: 4,
      onAudit: event => events.push(event.type),
    });
    const lease = policy.acquire?.(spec);
    expect(() => lease?.recordOutput(5)).toThrow('output budget');
    lease?.release();
    expect(events).toEqual(['started', 'released']);
  });
});
