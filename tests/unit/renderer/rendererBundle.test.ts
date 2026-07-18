import { readFile } from 'node:fs/promises';

describe('browser renderer source boundary', () => {
  it('does not use Electron or Node runtime access', async () => {
    const source = await readFile('src/renderer/main.ts', 'utf8');
    expect(source).not.toMatch(/(?:window\.(?:reqnode|require)|node:|require\s*\(|CodexChatRuntime|ClaudeChatRuntime|OpencodeChatRuntime)/);
  });

  it('mounts the shared full TyporAi workspace instead of a reduced platform panel', async () => {
    const source = await readFile('src/renderer/main.ts', 'utf8');

    expect(source).toContain('mountBridgeTyporAiInTypora');
    expect(source).not.toMatch(/(?:SidecarChatPanel|MacosChatPanel)/);
  });

  it('exposes the active Typora document as a preview view for selection capture', async () => {
    const source = await readFile('src/renderer/mountBridgeTyporAiInTypora.ts', 'utf8');

    expect(source).toContain('getActiveDocumentView()');
    expect(source).toMatch(/getMode\(\): string \{ return 'preview'; \}/);
  });
});
