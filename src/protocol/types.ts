import type { RpcError } from './errors';

export type JsonRpcId = string | number;

export interface JsonRpcRequest<TParams = unknown> {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params?: TParams;
}

export interface JsonRpcNotification<TParams = unknown> {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: TParams;
}

export interface JsonRpcSuccess<TResult = unknown> {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId;
  readonly result: TResult;
}

export interface JsonRpcFailure {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId | null;
  readonly error: RpcError;
}

export type JsonRpcResponse<TResult = unknown> = JsonRpcSuccess<TResult> | JsonRpcFailure;

export interface RpcEventEnvelope<TPayload = unknown> {
  readonly connectionId: string;
  readonly streamId: string;
  readonly seq: number;
  readonly event: string;
  readonly payload: TPayload;
  readonly timestamp: number;
}
