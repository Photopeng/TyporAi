export const PROTOCOL_VERSION = 1 as const;
export const PROTOCOL_MIN_VERSION = PROTOCOL_VERSION;
export const PROTOCOL_MAX_VERSION = PROTOCOL_VERSION;

export interface ProtocolRange {
  readonly min: number;
  readonly max: number;
}

export function negotiateProtocolVersion(client: ProtocolRange): number | null {
  const min = Math.max(client.min, PROTOCOL_MIN_VERSION);
  const max = Math.min(client.max, PROTOCOL_MAX_VERSION);
  return min <= max ? max : null;
}
