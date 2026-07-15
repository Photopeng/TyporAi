import { WatchRegistry } from '@/application/watch/WatchRegistry';
import type { DocumentService, EnvironmentService, FileProbe, FileWatchService, HostServices, PathService } from '@/core/ports';

import { ElectronFileBackupService } from './ElectronFileBackupService';
import { ElectronFileStore } from './ElectronFileStore';
import { ElectronProcessTransport } from './ElectronProcessTransport';
import { electronRequire } from './electronRequire';
import { ElectronWatchBackend } from './ElectronWatchBackend';

export type ElectronHostDependencies = Omit<HostServices, 'documents' | 'files' | 'watches' | 'paths' | 'environment' | 'processes' | 'platform'> & {
  createDocuments: (watches: FileWatchService) => DocumentService;
};

export function createElectronHost(dependencies: ElectronHostDependencies): HostServices {
  const { createDocuments, ...rest } = dependencies;
  const processValue = electronRequire('process') as { platform?: string; env: Record<string, string | undefined> };
  const path = electronRequire('path') as PathService;
  const environment: EnvironmentService = {
    get: key => processValue.env[key] ?? null,
    homeDirectory: () => processValue.env.HOME ?? processValue.env.USERPROFILE ?? null,
    async findExecutable(): Promise<string | null> { return null; },
  };
  const fileProbe: FileProbe = {
    exists: target => {
      try { return Boolean((electronRequire('fs') as { existsSync(path: string): boolean }).existsSync(target)); } catch { return false; }
    },
    isFile: target => {
      try { return Boolean((electronRequire('fs') as { statSync(path: string): { isFile(): boolean } }).statSync(target).isFile()); } catch { return false; }
    },
    readText: target => (electronRequire('fs') as { readFileSync(path: string, encoding: string): string }).readFileSync(target, 'utf8'),
    list: target => {
      try {
        return (electronRequire('fs') as { readdirSync(path: string, options: { withFileTypes: true }): Array<{ name: string; isFile(): boolean }> }).readdirSync(target, { withFileTypes: true }).map(entry => ({ name: entry.name, isFile: entry.isFile() }));
      } catch { return []; }
    },
    remove: async target => { (electronRequire('fs') as { promises: { rm(path: string, options: { force: boolean }): Promise<void> } }).promises.rm(target, { force: true }); },
  };
  const operatingSystem = processValue.platform === 'win32' ? 'windows' : processValue.platform === 'darwin' ? 'macos' : processValue.platform === 'linux' ? 'linux' : 'unknown';
  const watches = new WatchRegistry(new ElectronWatchBackend());
  return { ...rest, documents: createDocuments(watches), platform: { runtime: 'electron', operatingSystem, appVersion: null }, files: new ElectronFileStore(), fileBackups: new ElectronFileBackupService(), fileProbe, watches, paths: path, environment, processes: new ElectronProcessTransport() };
}
