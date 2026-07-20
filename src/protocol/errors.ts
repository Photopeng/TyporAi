export const RPC_ERROR_CODES = [
  'AUTH_FAILED',
  'INVALID_PARAMS',
  'PROTOCOL_VERSION_MISMATCH',
  'METHOD_NOT_SUPPORTED',
  'CAPABILITY_UNAVAILABLE',
  'WORKSPACE_NOT_GRANTED',
  'PATH_OUTSIDE_WORKSPACE',
  'PATH_CHANGED',
  'FILE_CONFLICT',
  'PROCESS_NOT_ALLOWED',
  'PROCESS_LIMIT_REACHED',
  'PROVIDER_NOT_READY',
  'PROVIDER_VERSION_UNSUPPORTED',
  'SESSION_REVISION_CONFLICT',
  'SETTINGS_REVISION_CONFLICT',
  'TAB_LAYOUT_REVISION_CONFLICT',
  'SESSION_NOT_FOUND',
  'RUNTIME_NOT_FOUND',
  'RUNTIME_OWNERSHIP_MISMATCH',
  'WATCH_NOT_FOUND',
  'BLOB_NOT_FOUND',
  'UNAUTHORIZED_RESOURCE',
  'IDEMPOTENCY_KEY_REUSED',
  'PERSISTENCE_FAILED',
  'STATE_CORRUPTED',
  'TURN_ALREADY_ACTIVE',
  'TURN_NOT_FOUND',
  'REQUEST_CANCELLED',
  'SIDECAR_RESTARTED',
  'PAYLOAD_TOO_LARGE',
  'INTERNAL_ERROR',
] as const;

export type RpcErrorCode = typeof RPC_ERROR_CODES[number];

export interface RpcError {
  readonly code: RpcErrorCode;
  readonly message: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

export function rpcError(code: RpcErrorCode, message: string, data?: Readonly<Record<string, unknown>>): RpcError {
  return data ? { code, message, data } : { code, message };
}
