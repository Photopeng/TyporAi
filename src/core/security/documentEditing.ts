import {
  TOOL_APPLY_PATCH,
  TOOL_BASH,
  TOOL_BASH_OUTPUT,
  TOOL_EDIT,
  TOOL_KILL_SHELL,
  TOOL_NOTEBOOK_EDIT,
  TOOL_WRITE,
  TOOL_WRITE_STDIN,
} from '../tools/toolNames';
import type { PermissionMode } from '../types/settings';

export const DOCUMENT_MUTATION_TOOLS = [
  TOOL_APPLY_PATCH,
  TOOL_WRITE,
  TOOL_EDIT,
  TOOL_NOTEBOOK_EDIT,
  TOOL_BASH,
  TOOL_BASH_OUTPUT,
  TOOL_WRITE_STDIN,
  TOOL_KILL_SHELL,
  'edit',
  'write',
  'write_file',
  'replace_selection',
] as const;

const DOCUMENT_MUTATION_TOOL_SET = new Set<string>(DOCUMENT_MUTATION_TOOLS);
const MUTATING_MCP_TOOL_PATTERN = /(?:^|__)(?:write|edit|patch|delete|remove|move|rename|replace|insert|create|apply)(?:_|$)/i;

export function isDocumentEditingAllowed(permissionMode: unknown): boolean {
  return permissionMode === 'yolo';
}

export function isDocumentMutationTool(toolName: string): boolean {
  return DOCUMENT_MUTATION_TOOL_SET.has(toolName)
    || (toolName.startsWith('mcp__') && MUTATING_MCP_TOOL_PATTERN.test(toolName));
}

export function getDocumentMutationToolsForMode(permissionMode: PermissionMode): string[] {
  return isDocumentEditingAllowed(permissionMode) ? [] : [...DOCUMENT_MUTATION_TOOLS];
}
