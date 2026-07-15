import type { RewindFilesResult } from '@anthropic-ai/claude-agent-sdk';

import type { FileBackup, FileBackupService, PathService } from '../../../core/ports';
import type { ChatRewindMode, ChatRewindResult } from '../../../core/runtime/types';

export interface ExecuteClaudeRewindDeps {
  assistantMessageId: string | undefined;
  mode: ChatRewindMode;
  rewindFiles: (userMessageId: string, dryRun?: boolean) => Promise<RewindFilesResult>;
  closePersistentQuery: (reason: string) => void;
  setPendingResumeAt: (assistantMessageId: string) => void;
  resetSession: () => void;
  vaultPath: string | null;
  fileBackups?: FileBackupService;
  paths?: PathService;
}

function resolveRewindPaths(
  filesChanged: readonly string[],
  vaultPath: string | null,
  paths: PathService,
): string[] {
  return filesChanged.map(filePath => (
    paths.isAbsolute(filePath) || !vaultPath ? filePath : paths.join(vaultPath, filePath)
  ));
}

async function createBackup(
  filesChanged: string[] | undefined,
  deps: ExecuteClaudeRewindDeps,
): Promise<FileBackup | null> {
  if (!filesChanged || filesChanged.length === 0) return null;
  if (!deps.fileBackups || !deps.paths) {
    throw new Error('Claude code rewind requires Typora host file-backup services.');
  }
  return deps.fileBackups.create(resolveRewindPaths(filesChanged, deps.vaultPath, deps.paths));
}

export async function executeClaudeRewind(
  userMessageId: string,
  deps: ExecuteClaudeRewindDeps,
): Promise<ChatRewindResult> {
  if (deps.mode === 'conversation') {
    if (deps.assistantMessageId) {
      deps.setPendingResumeAt(deps.assistantMessageId);
      deps.closePersistentQuery('conversation rewind');
    } else {
      deps.resetSession();
    }
    return { canRewind: true, filesChanged: [] };
  }

  const preview = await deps.rewindFiles(userMessageId, true);
  if (!preview.canRewind) return preview;
  const backup = await createBackup(preview.filesChanged, deps);

  try {
    const result = await deps.rewindFiles(userMessageId);
    if (!result.canRewind) {
      await backup?.restore();
      deps.closePersistentQuery('rewind failed');
      return result;
    }

    if (deps.assistantMessageId) {
      deps.setPendingResumeAt(deps.assistantMessageId);
      deps.closePersistentQuery('rewind');
    } else {
      deps.resetSession();
    }
    return {
      ...result,
      filesChanged: preview.filesChanged,
      insertions: preview.insertions,
      deletions: preview.deletions,
    };
  } catch (error) {
    try {
      await backup?.restore();
    } catch (rollbackError) {
      deps.closePersistentQuery('rewind failed');
      throw new Error(
        `Rewind failed and files could not be fully restored: ${rollbackError instanceof Error ? rollbackError.message : 'Unknown error'}`,
        { cause: rollbackError },
      );
    }
    deps.closePersistentQuery('rewind failed');
    throw new Error(
      `Rewind failed but files were restored: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { cause: error },
    );
  } finally {
    await backup?.cleanup();
  }
}
