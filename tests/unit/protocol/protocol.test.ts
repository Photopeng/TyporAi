import { isRpcMethod, negotiateProtocolVersion, parseJsonRpcMessage, RPC_ERROR_CODES, validateSystemInitializeParams } from '@/protocol';

describe('Protocol v1', () => {
  it('negotiates the shared version', () => {
    expect(negotiateProtocolVersion({ min: 1, max: 1 })).toBe(1);
    expect(negotiateProtocolVersion({ min: 2, max: 3 })).toBeNull();
  });

  it('rejects malformed, oversized, and malformed-id JSON-RPC input', () => {
    expect(parseJsonRpcMessage('{')).toBeNull();
    expect(parseJsonRpcMessage(JSON.stringify({ jsonrpc: '2.0', id: {}, method: 'system.initialize' }))).toBeNull();
    expect(parseJsonRpcMessage('x'.repeat(32), 8)).toBeNull();
  });

  it('accepts a valid initialize request and rejects unknown or invalid fields', () => {
    const params = { token: 't'.repeat(64), clientId: 'renderer-1', rendererVersion: '2.0.27', protocol: { min: 1, max: 1 }, platform: 'windows', lastConnectionId: null };
    expect(validateSystemInitializeParams(params).ok).toBe(true);
    expect(validateSystemInitializeParams({ ...params, extra: true }).ok).toBe(false);
    expect(validateSystemInitializeParams({ ...params, protocol: { min: 2, max: 1 } }).ok).toBe(false);
  });

  it('publishes only documented methods and stable errors', () => {
    expect(isRpcMethod('system.initialize')).toBe(true);
    expect(isRpcMethod('process.start')).toBe(false);
    expect(RPC_ERROR_CODES).toContain('PROTOCOL_VERSION_MISMATCH');
    expect(RPC_ERROR_CODES).toContain('PAYLOAD_TOO_LARGE');
    expect(RPC_ERROR_CODES).toContain('INVALID_PARAMS');
    expect(RPC_ERROR_CODES).toContain('SETTINGS_REVISION_CONFLICT');
  });
});
