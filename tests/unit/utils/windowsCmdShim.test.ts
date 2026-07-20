import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { resolveWindowsCmdShimSpawnSpec } from '@/utils/windowsCmdShim';

describe('resolveWindowsCmdShimSpawnSpec', () => {
  const originalPlatform = process.platform;
  let temporaryDirectory: string;

  beforeEach(() => {
    temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'typorai-cmd-shim-'));
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { configurable: true, value: originalPlatform });
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('routes a bare npm command through its .cmd shim on the child PATH', () => {
    const shim = path.join(temporaryDirectory, 'opencode.cmd');
    fs.writeFileSync(shim, '@echo off\r\n');

    const resolved = resolveWindowsCmdShimSpawnSpec({
      args: ['acp', '--cwd=C:\\vault'],
      command: 'opencode',
      env: { ComSpec: 'C:\\Windows\\System32\\cmd.exe', PATH: temporaryDirectory },
    });

    expect(resolved).toMatchObject({
      command: 'C:\\Windows\\System32\\cmd.exe',
      killProcessTree: true,
      windowsVerbatimArguments: true,
    });
    expect(resolved.args.join(' ')).toContain('opencode.cmd');
  });

  it('leaves a native macOS-style executable untouched', () => {
    Object.defineProperty(process, 'platform', { configurable: true, value: 'darwin' });

    expect(resolveWindowsCmdShimSpawnSpec({
      args: ['acp'],
      command: '/opt/homebrew/bin/opencode',
      env: { PATH: '/opt/homebrew/bin' },
    })).toEqual({ args: ['acp'], command: '/opt/homebrew/bin/opencode' });
  });
});
