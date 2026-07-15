import type { EnvironmentService, FileStore, PathService, WorkspaceStore } from '@/core/ports';

import { ApplicationWorkspaceStore } from './ApplicationWorkspaceStore';

export function createUserHomeStore(
  environment: EnvironmentService,
  files: FileStore,
  paths: PathService,
): WorkspaceStore | null {
  const home = environment.homeDirectory();
  return home ? new ApplicationWorkspaceStore(home, files, paths) : null;
}
