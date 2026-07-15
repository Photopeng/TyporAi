export interface RpcRequest {
  readonly id: string;
  readonly method: string;
  readonly params?: unknown;
}

export interface RpcResponse {
  readonly id: string;
  readonly result?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
}

export interface RpcEvent {
  readonly type: 'event';
  readonly event: string;
  readonly params?: unknown;
}

export interface SidecarBootstrap {
  readonly endpoint: string;
  readonly homeDirectory?: string;
  readonly protocolVersion: 1;
  readonly token: string;
}

export const SIDECAR_PROTOCOL_VERSION = 1;
