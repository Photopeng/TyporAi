/**
 * TyporAi - Context Utilities
 *
 * Note and context file formatting for prompts.
 */

import type { ChatTurnRequest } from '../core/runtime/types';
import { appendBrowserContext } from './browser';
import { appendCanvasContext } from './canvas';
import { appendEditorContext } from './editor';

const LINKED_NOTE_TAG = 'linked_note';
const NOTE_CONTEXT_TAG_PATTERN = '(linked_note|current_note)';

// Matches note context at the START of prompt (legacy placement)
const NOTE_CONTEXT_PREFIX_REGEX = new RegExp(`^<${NOTE_CONTEXT_TAG_PATTERN}>\\n[\\s\\S]*?<\\/\\1>\\n\\n`);
// Matches note context at the END of prompt (current placement)
const NOTE_CONTEXT_SUFFIX_REGEX = new RegExp(`\\n\\n<${NOTE_CONTEXT_TAG_PATTERN}>\\n[\\s\\S]*?<\\/\\1>$`);

/**
 * Pattern to match XML context tags appended to prompts.
 * These tags are always preceded by \n\n separator.
 * Matches: linked_note/current_note, editor_selection (with attributes), editor_cursor (with attributes),
 * current_typora_document/current_typora_selection, context_files, canvas_selection, browser_selection
 */
export const XML_CONTEXT_PATTERN = /\n\n<(?:linked_note|current_note|current_typora_document|current_typora_selection|editor_selection|editor_cursor|context_files|canvas_selection|browser_selection)[\s>]/;
const BRACKET_CONTEXT_PATTERN = /\n\[(?:Current note|Editor selection from|Browser selection from|Canvas selection from)\b/;

export function formatCurrentNote(notePath: string): string {
  return `<${LINKED_NOTE_TAG}>\n${notePath}\n</${LINKED_NOTE_TAG}>`;
}

export function appendCurrentNote(prompt: string, notePath: string): string {
  return `${prompt}\n\n${formatCurrentNote(notePath)}`;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function appendTyporaDocumentContext(
  prompt: string,
  document: NonNullable<ChatTurnRequest['typoraDocument']>,
): string {
  const attrs = [
    `path="${escapeXmlAttribute(document.path ?? 'untitled.md')}"`,
    document.truncated ? 'truncated="true"' : '',
  ].filter(Boolean).join(' ');
  const selection = document.selection
    ? `\n\n<current_typora_selection>\n${document.selection}\n</current_typora_selection>`
    : '';
  return `${prompt}\n\n<current_typora_document ${attrs}>\n${document.content}\n</current_typora_document>${selection}`;
}

export function appendPromptContext(prompt: string, request: ChatTurnRequest): string {
  let nextPrompt = prompt;

  if (request.currentNotePath) {
    nextPrompt = appendCurrentNote(nextPrompt, request.currentNotePath);
  }

  if (request.typoraDocument) {
    nextPrompt = appendTyporaDocumentContext(nextPrompt, request.typoraDocument);
  }

  if (request.editorSelection) {
    nextPrompt = appendEditorContext(nextPrompt, request.editorSelection);
  }

  if (request.browserSelection) {
    nextPrompt = appendBrowserContext(nextPrompt, request.browserSelection);
  }

  if (request.canvasSelection) {
    nextPrompt = appendCanvasContext(nextPrompt, request.canvasSelection);
  }

  return nextPrompt;
}

/**
 * Strips note context from a prompt.
 * Handles legacy <current_note> tags and canonical <linked_note> tags.
 */
export function stripCurrentNoteContext(prompt: string): string {
  const strippedPrefix = prompt.replace(NOTE_CONTEXT_PREFIX_REGEX, '');
  if (strippedPrefix !== prompt) {
    return strippedPrefix;
  }
  return prompt.replace(NOTE_CONTEXT_SUFFIX_REGEX, '');
}

/**
 * Extracts user content that appears before XML context tags.
 * Handles two formats:
 * 1. Legacy: content inside <query> tags
 * 2. Current: user content first, context XML appended after
 */
export function extractContentBeforeXmlContext(text: string): string | undefined {
  if (!text) return undefined;

  // Legacy format: content inside <query> tags
  const queryMatch = text.match(/<query>\n?([\s\S]*?)\n?<\/query>/);
  if (queryMatch) {
    return queryMatch[1].trim();
  }

  // Current format: user content before any XML context tags
  // Context tags are always appended with \n\n separator
  const xmlMatch = text.match(XML_CONTEXT_PATTERN);
  if (xmlMatch?.index !== undefined) {
    return text.substring(0, xmlMatch.index).trim();
  }

  return undefined;
}

export function extractUserDisplayContent(text: string): string | undefined {
  if (!text) return undefined;

  const xmlDisplayContent = extractContentBeforeXmlContext(text);
  if (xmlDisplayContent !== undefined) {
    return xmlDisplayContent;
  }

  const bracketMatch = text.match(BRACKET_CONTEXT_PATTERN);
  if (bracketMatch?.index !== undefined) {
    return text.substring(0, bracketMatch.index).trim();
  }

  return undefined;
}

/**
 * Extracts the actual user query from an XML-wrapped prompt.
 * Used for comparing prompts during history deduplication.
 *
 * Always returns a string - falls back to stripping all XML tags if no
 * structured context is found.
 */
export function extractUserQuery(prompt: string): string {
  if (!prompt) return '';

  // Try to extract content before XML context
  const extracted = extractContentBeforeXmlContext(prompt);
  if (extracted !== undefined) {
    return extracted;
  }

  // No XML context - return the whole prompt stripped of any remaining tags
  return prompt
    .replace(/<(linked_note|current_note)>[\s\S]*?<\/\1>\s*/g, '')
    .replace(/<current_typora_document[\s\S]*?<\/current_typora_document>\s*/g, '')
    .replace(/<current_typora_selection>[\s\S]*?<\/current_typora_selection>\s*/g, '')
    .replace(/<editor_selection[\s\S]*?<\/editor_selection>\s*/g, '')
    .replace(/<editor_cursor[\s\S]*?<\/editor_cursor>\s*/g, '')
    .replace(/<context_files>[\s\S]*?<\/context_files>\s*/g, '')
    .replace(/<canvas_selection[\s\S]*?<\/canvas_selection>\s*/g, '')
    .replace(/<browser_selection[\s\S]*?<\/browser_selection>\s*/g, '')
    .trim();
}

function formatContextFilesLine(files: string[]): string {
  return `<context_files>\n${files.join(', ')}\n</context_files>`;
}

export function appendContextFiles(prompt: string, files: string[]): string {
  return `${prompt}\n\n${formatContextFilesLine(files)}`;
}
