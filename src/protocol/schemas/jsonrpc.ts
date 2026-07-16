import type { JsonRpcNotification, JsonRpcRequest } from '../types';

export type ParsedIncomingMessage = JsonRpcRequest | JsonRpcNotification;

export function parseJsonRpcMessage(raw: string, maximumBytes = 1_048_576): ParsedIncomingMessage | null {
  if (new TextEncoder().encode(raw).byteLength > maximumBytes) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string' || !message.method) return null;
  if ('id' in message && typeof message.id !== 'string' && typeof message.id !== 'number') return null;
  return message as unknown as ParsedIncomingMessage;
}
