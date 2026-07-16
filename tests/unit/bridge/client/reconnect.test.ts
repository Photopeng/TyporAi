import { reconnectDelayMs } from '@/bridge/client/reconnect';

describe('reconnectDelayMs', () => {
  it('uses capped exponential backoff with bounded jitter', () => {
    expect(reconnectDelayMs(0, () => 0)).toBe(200);
    expect(reconnectDelayMs(3, () => 0.5)).toBe(2000);
    expect(reconnectDelayMs(99, () => 1)).toBe(12000);
  });
});
