import { readFile } from 'node:fs/promises';

describe('browser renderer source boundary', () => {
  it('does not use Electron or Node runtime access', async () => {
    const source = await readFile('src/renderer/main.ts', 'utf8');
    expect(source).not.toMatch(/(?:window\.(?:reqnode|require)|node:|require\s*\(|CodexChatRuntime|ClaudeChatRuntime|OpencodeChatRuntime)/);
  });
});
