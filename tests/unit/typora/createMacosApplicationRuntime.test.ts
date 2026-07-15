/**
 * @jest-environment jsdom
 */

import { createMacosApplicationRuntime } from '@/typora/createMacosApplicationRuntime';
import { TyporaEditorApi } from '@/typora/editor-api';

describe('createMacosApplicationRuntime', () => {
  it('creates a browser host backed by the Sidecar bridge', async () => {
    const application = createMacosApplicationRuntime(new TyporaEditorApi(), {
      endpoint: 'ws://127.0.0.1:17328/rpc',
      homeDirectory: '/Users/test',
      protocolVersion: 1,
      token: 'test-token',
    });

    expect(application.runtime.host.platform).toEqual({
      appVersion: null,
      operatingSystem: 'macos',
      runtime: 'webkit',
    });
    expect(application.runtime.host.paths.join('/Users/test', 'notes', 'a.md')).toBe('/Users/test/notes/a.md');

    await application.dispose();
  });
});
