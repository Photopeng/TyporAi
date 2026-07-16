import type { ActivityScheduler, DocumentService, HostServices, NotificationService, PathService, PlatformInfo, WorkspaceStore } from '@/core/ports';
import { CapabilityUnavailableError } from '@/core/ports';

import type { WebSocketRpcClient } from '../client/WebSocketRpcClient';
import { BridgeFileStore } from './BridgeFileStore';
import { BridgeSettingsStore } from './BridgeSettingsStore';
import { BridgeWatchService } from './BridgeWatchService';

export interface BridgeHostDependencies {
  readonly documents: DocumentService;
  readonly notifications: NotificationService;
  readonly paths: PathService;
  readonly platform: PlatformInfo;
  readonly scheduler: ActivityScheduler;
  readonly workspace: WorkspaceStore | null;
}

/**
 * Browser-side composition root. Every durable capability crosses the RPC
 * boundary; browser-only DOM and scheduling capabilities remain injected.
 */
export function createBridgeHost(rpc: WebSocketRpcClient, dependencies: BridgeHostDependencies): HostServices {
  const unavailable = (): never => { throw new CapabilityUnavailableError('Sidecar-backed synchronous probe'); };
  return {
    ...dependencies,
    files: new BridgeFileStore(rpc),
    settings: new BridgeSettingsStore(rpc),
    watches: new BridgeWatchService(rpc),
    environment: {
      get: () => null,
      homeDirectory: () => null,
      findExecutable: async () => null,
    },
    fileProbe: { exists: unavailable, isFile: unavailable, readText: unavailable, list: unavailable },
    processes: { start: async () => { throw new CapabilityUnavailableError('generic renderer process transport'); } },
  };
}
