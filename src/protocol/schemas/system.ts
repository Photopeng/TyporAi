import type { SystemInitializeParams } from '../methods/system';

export type SchemaResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export function validateSystemInitializeParams(value: unknown): SchemaResult<SystemInitializeParams> {
  if (!isRecord(value)) return { ok: false, reason: 'params must be an object' };
  const allowed = new Set(['token', 'clientId', 'rendererVersion', 'protocol', 'platform', 'lastConnectionId']);
  if (Object.keys(value).some(key => !allowed.has(key))) return { ok: false, reason: 'params contains an unknown field' };
  if (!isNonEmptyString(value.token) || value.token.length > 4096) return { ok: false, reason: 'token must be a bounded string' };
  if (!isNonEmptyString(value.clientId) || !isNonEmptyString(value.rendererVersion)) return { ok: false, reason: 'clientId and rendererVersion are required' };
  const protocol = isRecord(value.protocol) ? value.protocol : null;
  if (!protocol || !Number.isInteger(protocol.min) || !Number.isInteger(protocol.max) || (protocol.min as number) > (protocol.max as number)) {
    return { ok: false, reason: 'protocol range is invalid' };
  }
  if (value.platform !== 'windows' && value.platform !== 'macos') return { ok: false, reason: 'platform is invalid' };
  if (value.lastConnectionId !== null && typeof value.lastConnectionId !== 'string') return { ok: false, reason: 'lastConnectionId is invalid' };
  return { ok: true, value: value as unknown as SystemInitializeParams };
}
