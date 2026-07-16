import { readFile } from 'node:fs/promises';
import path from 'node:path';

const fixtureRoot = path.resolve(__dirname, '../../fixtures/provider-events');
const providers = ['claude', 'codex', 'opencode'] as const;

describe('provider-event migration fixtures', () => {
  it.each(providers)('contains a non-empty, parseable, sanitized %s stream', async provider => {
    const fixture = await readFile(path.join(fixtureRoot, provider, 'stream.jsonl'), 'utf8');
    const events = fixture.trim().split('\n').map(line => JSON.parse(line) as unknown);

    expect(events.length).toBeGreaterThan(0);
    expect(fixture).not.toMatch(/(?:api[_-]?key|authorization|bearer\s+)[^\s]*/i);
  });
});
