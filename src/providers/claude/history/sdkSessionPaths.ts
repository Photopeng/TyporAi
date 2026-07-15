import type { FileProbe } from '../../../core/ports';
import { joinPosixPath } from '../../../utils/portablePath';
import type { SDKNativeMessage, SDKSessionReadResult } from './sdkHistoryTypes';

export type HistoryFileProbe = Omit<FileProbe, 'readText'> & {
  readText(path: string): string | Promise<string>;
};

/**
 * Encodes a vault path for the SDK project directory name.
 * The SDK replaces ALL non-alphanumeric characters with `-`.
 * This handles Unicode characters and special chars.
 */
export function encodeVaultPathForSDK(vaultPath: string): string {
  const absolutePath = vaultPath.startsWith('/') ? vaultPath : joinPosixPath('.', vaultPath);
  return absolutePath.replace(/[^a-zA-Z0-9]/g, '-');
}

export function getSDKProjectsPath(homeDirectory?: string): string {
  const home = homeDirectory
    ?? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.HOME
    ?? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.USERPROFILE
    ?? '';
  return joinPosixPath(home, '.claude', 'projects');
}

/** Validates an identifier for safe use in filesystem paths (no traversal, bounded length). */
export function isPathSafeId(value: string): boolean {
  if (!value || value.length === 0 || value.length > 128) {
    return false;
  }
  if (value.includes('..') || value.includes('/') || value.includes('\\')) {
    return false;
  }
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

export function isValidSessionId(sessionId: string): boolean {
  return isPathSafeId(sessionId);
}

export function getSDKSessionPath(vaultPath: string, sessionId: string, homeDirectory?: string): string {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Invalid session ID: ${sessionId}`);
  }

  const projectsPath = getSDKProjectsPath(homeDirectory);
  const encodedVault = encodeVaultPathForSDK(vaultPath);
  return joinPosixPath(projectsPath, encodedVault, `${sessionId}.jsonl`);
}

export function sdkSessionExists(vaultPath: string, sessionId: string, fileProbe?: HistoryFileProbe): boolean {
  try {
    const sessionPath = getSDKSessionPath(vaultPath, sessionId);
    return fileProbe?.exists(sessionPath) ?? false;
  } catch {
    return false;
  }
}

export async function deleteSDKSession(vaultPath: string, sessionId: string, fileProbe?: HistoryFileProbe): Promise<void> {
  try {
    const sessionPath = getSDKSessionPath(vaultPath, sessionId);
    if (!fileProbe?.exists(sessionPath)) {
      return;
    }

    await fileProbe.remove?.(sessionPath);
  } catch {
    // Best-effort deletion
  }
}

export async function readSDKSession(
  vaultPath: string,
  sessionId: string,
  fileProbe?: HistoryFileProbe,
): Promise<SDKSessionReadResult> {
  try {
    const sessionPath = getSDKSessionPath(vaultPath, sessionId);
    if (!fileProbe?.exists(sessionPath)) {
      return { messages: [], skippedLines: 0 };
    }

    const content = await fileProbe.readText(sessionPath);
    const lines = content.split('\n').filter(line => line.trim());
    const messages: SDKNativeMessage[] = [];
    let skippedLines = 0;

    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as SDKNativeMessage;
        messages.push(msg);
      } catch {
        skippedLines++;
      }
    }

    return { messages, skippedLines };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return { messages: [], skippedLines: 0, error: errorMsg };
  }
}
