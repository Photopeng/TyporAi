import { type JsonRpcRequest, type JsonRpcResponse, PROTOCOL_MAX_VERSION, PROTOCOL_MIN_VERSION, rpcError, validateSystemInitializeParams } from '@/protocol';

import { tokenMatches } from './Authentication';
import { negotiateClientProtocol } from './VersionNegotiation';

export interface RpcRouterOptions {
  readonly token: string;
  readonly sidecarVersion: string;
}

export class RpcRouter {
  constructor(private readonly options: RpcRouterOptions) {}

  route(request: JsonRpcRequest): JsonRpcResponse {
    if (request.method !== 'system.initialize') return this.failure(request.id, 'METHOD_NOT_SUPPORTED', 'Method is not available.');
    const parsed = validateSystemInitializeParams(request.params);
    if (!parsed.ok) return this.failure(request.id, 'INVALID_PARAMS', 'Invalid initialize request.');
    if (!tokenMatches(this.options.token, parsed.value.token)) return this.failure(request.id, 'AUTH_FAILED', 'Authentication failed.');
    const version = negotiateClientProtocol(parsed.value.protocol);
    if (version === null) return this.failure(request.id, 'PROTOCOL_VERSION_MISMATCH', 'No compatible protocol version exists.');
    return {
      jsonrpc: '2.0', id: request.id, result: {
        connectionId: crypto.randomUUID(), sidecarVersion: this.options.sidecarVersion, protocolVersion: version,
        capabilities: {}, providerStatus: {}, workspaceGrant: {}, serverTime: Date.now(),
      },
    };
  }

  health(): { readonly protocolMax: number; readonly protocolMin: number; readonly status: 'ok' } {
    return { protocolMax: PROTOCOL_MAX_VERSION, protocolMin: PROTOCOL_MIN_VERSION, status: 'ok' };
  }

  routeAuthenticated(request: JsonRpcRequest): JsonRpcResponse {
    if (request.method === 'system.health') return { jsonrpc: '2.0', id: request.id, result: this.health() };
    return this.failure(request.id, 'METHOD_NOT_SUPPORTED', 'Method is not available.');
  }

  private failure(id: string | number, code: Parameters<typeof rpcError>[0], message: string): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: rpcError(code, message) };
  }
}
