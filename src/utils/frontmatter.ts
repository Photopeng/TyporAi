import { parseYamlRecord } from './yaml';

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const VALID_KEY_PATTERN = /^[\w-]+$/;

function isValidKey(key: string): boolean {
  return key.length > 0 && VALID_KEY_PATTERN.test(key);
}

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseScalarValue(rawValue: string): unknown {
  const value = rawValue.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '') return null;
  if (!Number.isNaN(Number(value))) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
      .map(item => unquote(item));
  }
  return unquote(value);
}

function applyBlockScalars(yamlContent: string, result: Record<string, unknown>): void {
  const lines = yamlContent.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index].match(/^([\w-]+):\s*([|>])[-+]?\s*$/);
    if (!header) continue;

    const [, key, style] = header;
    const blockLines: string[] = [];
    let blockIndent: number | null = null;
    let cursor = index + 1;

    while (cursor < lines.length) {
      const line = lines[cursor];
      if (line.trim() === '') {
        blockLines.push('');
        cursor += 1;
        continue;
      }

      const indent = line.match(/^\s*/)?.[0].length ?? 0;
      if (indent === 0) break;
      blockIndent ??= indent;
      if (indent < blockIndent) break;
      blockLines.push(line.slice(blockIndent));
      cursor += 1;
    }

    while (blockLines.length > 0 && blockLines[blockLines.length - 1] === '') {
      blockLines.pop();
    }

    if (style === '|') {
      result[key] = blockLines.join('\n');
    } else {
      const paragraphs: string[] = [];
      let paragraph: string[] = [];
      const flush = (): void => {
        if (paragraph.length > 0) paragraphs.push(paragraph.join(' '));
        paragraph = [];
      };
      for (const line of blockLines) {
        if (line === '') flush();
        else paragraph.push(line);
      }
      flush();
      result[key] = paragraphs.join('\n\n');
    }

    index = cursor - 1;
  }
}

/** Handles malformed YAML (e.g. unquoted values with colons) by line-by-line key:value extraction. */
function parseFrontmatterFallback(yamlContent: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yamlContent.split(/\r?\n/);
  let currentListKey: string | null = null;
  let currentList: unknown[] = [];

  function flushList(): void {
    if (!currentListKey) return;
    result[currentListKey] = currentList;
    currentListKey = null;
    currentList = [];
  }

  let pendingBareKey: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (currentListKey) {
      if (trimmed.startsWith('- ')) {
        currentList.push(parseScalarValue(trimmed.slice(2)));
        continue;
      }
      flushList();
    }

    if (pendingBareKey) {
      if (trimmed.startsWith('- ')) {
        currentListKey = pendingBareKey;
        currentList = [];
        pendingBareKey = null;
        currentList.push(parseScalarValue(trimmed.slice(2)));
        continue;
      }
      result[pendingBareKey] = '';
      pendingBareKey = null;
    }

    const colonIndex = trimmed.indexOf(': ');
    if (colonIndex === -1) {
      if (trimmed.endsWith(':')) {
        const key = trimmed.slice(0, -1).trim();
        if (isValidKey(key)) {
          pendingBareKey = key;
        }
      }
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    if (!isValidKey(key)) continue;
    result[key] = parseScalarValue(trimmed.slice(colonIndex + 2));
  }

  if (pendingBareKey) {
    result[pendingBareKey] = '';
  }

  flushList();
  applyBlockScalars(yamlContent, result);
  return result;
}

export function parseFrontmatter(
  content: string
): { frontmatter: Record<string, unknown>; body: string } | null {
  const match = content.match(FRONTMATTER_PATTERN);
  if (!match) return null;

  try {
    const parsed: unknown = parseYamlRecord(match[1]);
    if (parsed === null && match[1].trim()) return null;
    if (parsed !== null && parsed !== undefined && typeof parsed !== 'object') {
      return null;
    }
    const frontmatter = (parsed as Record<string, unknown>) ?? {};
    applyBlockScalars(match[1], frontmatter);
    return {
      frontmatter,
      body: match[2],
    };
  } catch {
    const fallbackParsed = parseFrontmatterFallback(match[1]);
    if (Object.keys(fallbackParsed).length > 0) {
      return {
        frontmatter: fallbackParsed,
        body: match[2],
      };
    }
    return null;
  }
}

export function extractString(
  fm: Record<string, unknown>,
  key: string
): string | undefined {
  const val = fm[key];
  if (typeof val === 'string' && val.length > 0) return val;
  if (Array.isArray(val) && val.length > 0 && val.every(v => typeof v === 'string')) {
    return val.map(v => `[${v}]`).join(' ');
  }
  return undefined;
}

export function normalizeStringArray(val: unknown): string[] | undefined {
  if (val === undefined || val === null) return undefined;

  if (Array.isArray(val)) {
    return val.map(v => String(v).trim()).filter(Boolean);
  }

  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return undefined;
    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
  }

  return undefined;
}

export function extractStringArray(
  fm: Record<string, unknown>,
  key: string
): string[] | undefined {
  return normalizeStringArray(fm[key]);
}

export function extractBoolean(
  fm: Record<string, unknown>,
  key: string
): boolean | undefined {
  const val = fm[key];
  if (typeof val === 'boolean') return val;
  return undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

const MAX_SLUG_LENGTH = 64;
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const YAML_RESERVED_WORDS = new Set(['true', 'false', 'null', 'yes', 'no', 'on', 'off']);

export type SlugValidationError = 'required' | 'tooLong' | 'invalidChars' | 'reservedWord';

export function validateSlugName(name: string): SlugValidationError | null {
  if (!name) return 'required';
  if (name.length > MAX_SLUG_LENGTH) return 'tooLong';
  if (!SLUG_PATTERN.test(name)) return 'invalidChars';
  if (YAML_RESERVED_WORDS.has(name)) return 'reservedWord';
  return null;
}

export const MAX_SLUG_NAME_LENGTH = MAX_SLUG_LENGTH;
