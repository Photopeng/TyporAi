import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { ApprovalCallback } from '../../core/runtime/types';
import { pathGuard } from '../../shared/pathGuard';

const MAX_READ_BYTES = 1_000_000;
const MAX_WRITE_BYTES = 1_000_000;
const DEFAULT_SEARCH_LIMIT = 80;
const MAX_SEARCH_LIMIT = 200;
const SEARCH_FILE_BYTES = 512_000;

export interface WorkspaceToolContext {
  workspacePath: string;
  currentDocument?: string;
  currentFilePath?: string | null;
  requestApproval?: ApprovalCallback | null;
  selection?: string;
  replaceSelection?: (text: string) => boolean | void;
}

export type WorkspaceToolName =
  | 'read_file'
  | 'write_file'
  | 'list_directory'
  | 'search_workspace'
  | 'get_current_document'
  | 'replace_selection'
  | 'read_local_file'
  | 'search_vault';

export interface WorkspaceToolCall {
  name: WorkspaceToolName;
  input: Record<string, unknown>;
}

export const ANTHROPIC_WORKSPACE_TOOLS = [
  {
    name: 'read_file',
    description: 'Read a UTF-8 text file inside the current Typora workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative file path. Absolute paths and traversal are blocked.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write a UTF-8 text file inside the current Typora workspace. Existing files are backed up before replacement.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative file path. Absolute paths and traversal are blocked.' },
        content: { type: 'string', description: 'New file content.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and folders inside the current Typora workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Workspace-relative directory path. Defaults to workspace root.' },
      },
    },
  },
  {
    name: 'search_workspace',
    description: 'Search Markdown and text files inside the current Typora workspace.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'number', description: 'Maximum result count. Defaults to 80 and is capped at 200.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_current_document',
    description: 'Return the current Typora document path, selected text, and markdown content.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'replace_selection',
    description: 'Replace the current Typora selection with the provided text.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Replacement text.' },
      },
      required: ['text'],
    },
  },
] as const;

export async function executeWorkspaceTool(
  context: WorkspaceToolContext,
  call: WorkspaceToolCall,
): Promise<string> {
  const toolName = normalizeToolName(call.name);

  if (toolName === 'read_file') {
    const filePath = await resolveWorkspacePath(context.workspacePath, String(call.input.path ?? ''));
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error('Path is not a file.');
    if (stat.size > MAX_READ_BYTES) throw new Error(`File is too large to read (${stat.size} bytes).`);
    return await fs.readFile(filePath, 'utf8');
  }

  if (toolName === 'write_file') {
    const filePath = await resolveWorkspacePath(context.workspacePath, String(call.input.path ?? ''));
    const content = String(call.input.content ?? '');
    if (Buffer.byteLength(content, 'utf8') > MAX_WRITE_BYTES) {
      throw new Error(`File content is too large to write (${Buffer.byteLength(content, 'utf8')} bytes).`);
    }
    await requireMutationApproval(context, toolName, call.input);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await backupExistingFile(filePath);
    await fs.writeFile(filePath, content, 'utf8');
    return `Wrote ${workspaceRelativePath(context.workspacePath, filePath)}`;
  }

  if (toolName === 'list_directory') {
    const directoryPath = await resolveWorkspacePath(context.workspacePath, String(call.input.path ?? '.'));
    const stat = await fs.stat(directoryPath);
    if (!stat.isDirectory()) throw new Error('Path is not a directory.');
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    return entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(entry => `${entry.isDirectory() ? 'dir' : 'file'} ${entry.name}`)
      .join('\n');
  }

  if (toolName === 'search_workspace') {
    const query = String(call.input.query ?? '').trim();
    if (!query) throw new Error('query is required.');
    const maxResults = clampSearchLimit(call.input.maxResults);
    const matches = await searchWorkspace(context.workspacePath, query, maxResults);
    return matches.length > 0 ? matches.join('\n') : 'No matches found.';
  }

  if (toolName === 'get_current_document') {
    return JSON.stringify({
      currentFilePath: context.currentFilePath ?? null,
      selection: context.selection ?? '',
      content: context.currentDocument ?? '',
    }, null, 2);
  }

  if (toolName === 'replace_selection') {
    const text = String(call.input.text ?? '');
    if (!context.replaceSelection) {
      throw new Error('Typora selection replacement is unavailable in this runtime.');
    }
    await requireMutationApproval(context, toolName, call.input);
    const result = context.replaceSelection(text);
    if (result === false) {
      throw new Error('Typora did not accept the replacement text.');
    }
    return 'Replaced current Typora selection.';
  }

  throw new Error(`Unsupported tool: ${call.name}`);
}

async function searchWorkspace(root: string, query: string, maxResults: number): Promise<string[]> {
  const results: string[] = [];
  const queue = [await resolveWorkspacePath(root, '.')];
  const lowerQuery = query.toLowerCase();
  const searchableExtensions = new Set(['.md', '.markdown', '.txt', '.ts', '.tsx', '.js', '.json', '.yaml', '.yml']);

  while (queue.length > 0 && results.length < maxResults) {
    const current = queue.shift();
    if (!current) continue;

    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.typorai') continue;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }

      if (!searchableExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const stat = await fs.stat(entryPath).catch(() => null);
      if (!stat?.isFile() || stat.size > SEARCH_FILE_BYTES) continue;
      const content = await fs.readFile(entryPath, 'utf8').catch(() => '');
      if (!content.toLowerCase().includes(lowerQuery)) continue;

      const relativePath = workspaceRelativePath(root, entryPath);
      const line = content.split(/\r?\n/).findIndex(value => value.toLowerCase().includes(lowerQuery));
      results.push(`${relativePath}:${line + 1}`);
    }
  }

  return results;
}

async function resolveWorkspacePath(workspacePath: string, requestedPath: string): Promise<string> {
  if (!workspacePath) throw new Error('Typora workspace path is unavailable.');
  return await pathGuard.resolve(workspacePath, requestedPath || '.');
}

async function backupExistingFile(filePath: string): Promise<void> {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) return;

  const backupPath = `${filePath}.typorai.bak`;
  await fs.copyFile(filePath, backupPath);
}

function workspaceRelativePath(workspacePath: string, filePath: string): string {
  return path.relative(path.resolve(workspacePath), filePath).replace(/\\/g, '/');
}

function normalizeToolName(name: WorkspaceToolName): WorkspaceToolName {
  if (name === 'read_local_file') return 'read_file';
  if (name === 'search_vault') return 'search_workspace';
  return name;
}

function clampSearchLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SEARCH_LIMIT;
  }
  return Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.floor(value)));
}

async function requireMutationApproval(
  context: WorkspaceToolContext,
  toolName: WorkspaceToolName,
  input: Record<string, unknown>,
): Promise<void> {
  if (!context.requestApproval) {
    return;
  }

  const decision = await context.requestApproval(
    toolName,
    input,
    describeMutation(toolName, input),
    {
      decisionReason: 'Typora workspace write access requires confirmation.',
    },
  );

  if (decision === 'allow' || decision === 'allow-always') {
    return;
  }

  throw new Error('Access denied by user approval.');
}

function describeMutation(toolName: WorkspaceToolName, input: Record<string, unknown>): string {
  if (toolName === 'write_file') {
    return `Write workspace file: ${String(input.path ?? '(unknown)')}`;
  }

  if (toolName === 'replace_selection') {
    return 'Replace the current Typora selection.';
  }

  return `${toolName}: ${JSON.stringify(input)}`;
}
