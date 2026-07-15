import { CapabilityUnavailableError } from '@/core/ports';

describe('core ports', () => {
  it('exposes a typed capability error instead of silently falling back', () => {
    const error = new CapabilityUnavailableError('process transport');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Capability unavailable: process transport');
  });
});
