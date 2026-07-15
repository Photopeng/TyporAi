import type { DocumentService, EnvironmentService, HostServices, PathService } from '@/core/ports';
import type { SidecarBootstrap } from '@/sidecar/protocol';

import { BridgeClient } from './BridgeClient';
import { BridgeEnvironmentService } from './BridgeEnvironmentService';
import { BridgeFileStore } from './BridgeFileStore';
import { BridgeFileWatchService } from './BridgeFileWatchService';
import { BridgeProcessTransport } from './BridgeProcessTransport';

export type BridgeHostDependencies = Omit<HostServices, 'documents' | 'files' | 'watches' | 'paths' | 'environment' | 'processes' | 'platform'> & {
  readonly bootstrap: SidecarBootstrap;
  readonly client?: BridgeClient;
  readonly createDocuments: (watches: BridgeFileWatchService) => DocumentService;
};

export function createBridgeHost(dependencies: BridgeHostDependencies): HostServices {
  const client = dependencies.client ?? new BridgeClient(dependencies.bootstrap);
  const watches = new BridgeFileWatchService(client);
  const environment: EnvironmentService = new BridgeEnvironmentService(
    client,
    dependencies.bootstrap.homeDirectory ?? null,
  );
  return {
    documents: dependencies.createDocuments(watches),
    environment,
    fileBackups: dependencies.fileBackups,
    fileProbe: dependencies.fileProbe,
    files: new BridgeFileStore(client),
    notifications: dependencies.notifications,
    paths: browserPathService,
    platform: { appVersion: null, operatingSystem: 'macos', runtime: 'webkit' },
    processes: new BridgeProcessTransport(client),
    scheduler: dependencies.scheduler,
    settings: dependencies.settings,
    watches,
    workspace: dependencies.workspace,
  };
}

const browserPathService: PathService = {
  join: (...parts) => normalize(parts.filter(Boolean).join('/')),
  dirname: value => {
    const normalized = normalize(value);
    const index = normalized.lastIndexOf('/');
    return index <= 0 ? '/' : normalized.slice(0, index);
  },
  isAbsolute: value => value.startsWith('/'),
  normalize,
  relative: (from, to) => {
    const fromParts = normalize(from).split('/').filter(Boolean);
    const toParts = normalize(to).split('/').filter(Boolean);
    while (fromParts[0] === toParts[0]) { fromParts.shift(); toParts.shift(); }
    return `${fromParts.map(() => '..').concat(toParts).join('/')}` || '.';
  },
};

function normalize(value: string): string {
  const absolute = value.startsWith('/');
  const output: string[] = [];
  for (const part of value.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') output.pop(); else output.push(part);
  }
  return `${absolute ? '/' : ''}${output.join('/')}` || (absolute ? '/' : '.');
}
