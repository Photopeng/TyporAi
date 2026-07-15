import type { DocumentService } from './DocumentService';
import type { EnvironmentService } from './EnvironmentService';
import type { FileBackupService } from './FileBackupService';
import type { FileProbe } from './FileProbe';
import type { FileStore } from './FileStore';
import type { FileWatchService } from './FileWatchService';
import type { NotificationService } from './NotificationService';
import type { PathService } from './PathService';
import type { PlatformInfo } from './Platform';
import type { ProcessTransportFactory } from './ProcessTransport';
import type { ActivityScheduler } from './Scheduler';
import type { KeyValueStore, WorkspaceStore } from './Storage';

export interface HostServices {
  readonly platform: PlatformInfo;
  readonly files: FileStore;
  readonly fileBackups?: FileBackupService;
  readonly fileProbe?: FileProbe;
  readonly watches: FileWatchService;
  readonly paths: PathService;
  readonly environment: EnvironmentService;
  readonly processes: ProcessTransportFactory;
  readonly documents: DocumentService;
  readonly scheduler: ActivityScheduler;
  readonly settings: KeyValueStore;
  readonly workspace: WorkspaceStore | null;
  readonly notifications: NotificationService;
}
