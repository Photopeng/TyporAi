import { negotiateProtocolVersion, type ProtocolRange } from '@/protocol';

export function negotiateClientProtocol(range: ProtocolRange): number | null {
  return negotiateProtocolVersion(range);
}
