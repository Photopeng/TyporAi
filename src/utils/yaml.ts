function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function parseValue(rawValue: string): unknown {
  const value = rawValue.trim();
  if (value === '') return null;
  if (value.startsWith('{') && value.endsWith('}')) {
    try { return JSON.parse(value); } catch { return unquote(value); }
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map(item => unquote(item.trim())).filter(Boolean);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  const numeric = Number(value);
  return Number.isNaN(numeric) ? unquote(value) : numeric;
}

/** Small, deterministic YAML subset used by TyporAi frontmatter files. */
export function parseYamlRecord(yaml: string): Record<string, unknown> | null {
  if (!yaml.trim()) return null;
  const result: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);
  let arrayKey: string | null = null;
  let arrayValues: unknown[] = [];

  const flushArray = (): void => {
    if (!arrayKey) return;
    result[arrayKey] = arrayValues.length > 0 ? arrayValues : '';
    arrayKey = null;
    arrayValues = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (arrayKey && trimmed.startsWith('- ')) {
      arrayValues.push(parseValue(trimmed.slice(2)));
      continue;
    }
    flushArray();
    const match = trimmed.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!rawValue.trim()) {
      arrayKey = key;
      continue;
    }
    result[key] = parseValue(rawValue);
  }
  flushArray();
  return Object.keys(result).length > 0 ? result : null;
}
