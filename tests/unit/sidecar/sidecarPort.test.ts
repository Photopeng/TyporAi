import { parseSidecarPort } from '@/sidecar/sidecarPort';

describe('parseSidecarPort', () => {
  it('accepts a configured TCP port', () => {
    expect(parseSidecarPort('17328')).toBe(17328);
  });

  it.each([undefined, '', '0', '65536', '1.5', 'invalid'])('rejects an invalid port: %s', value => {
    expect(() => parseSidecarPort(value)).toThrow('TYPORAI_SIDECAR_PORT');
  });
});
