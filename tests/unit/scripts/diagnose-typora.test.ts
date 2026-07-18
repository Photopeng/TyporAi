import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const script = path.join(repoRoot, 'scripts', 'diagnose-typora.mjs');

describe('diagnose-typora script', () => {
  let temporaryRoot: string;

  beforeEach(() => { temporaryRoot = mkdtempSync(path.join(tmpdir(), 'typorai-diagnostics-')); });
  afterEach(() => { rmSync(temporaryRoot, { recursive: true, force: true }); });

  it('reports absent deployment components without reading secrets or probing CLIs', () => {
    const result = JSON.parse(execFileSync(process.execPath, [script,
      '--data-dir', path.join(temporaryRoot, 'sidecar'),
      '--plugin-dir', path.join(temporaryRoot, 'plugin'),
      '--typora-resources-dir', path.join(temporaryRoot, 'resources'),
      '--skip-probes',
    ], { cwd: repoRoot, encoding: 'utf8' }));

    expect(result.deployment.renderer.exists).toBe(false);
    expect(result.deployment.descriptor.exists).toBe(false);
    expect(result.service).toEqual({ reachable: false, reason: 'descriptor-unavailable' });
    expect(result.persistedRuntime).toEqual(expect.objectContaining({
      status: 'service-missing',
      serviceExists: false,
      node: expect.objectContaining({ path: null, exists: false }),
    }));
    expect(result.providerCli).toEqual([]);
    expect(result.privacy).toEqual(expect.objectContaining({
      tokenRead: false,
      environmentValuesRead: false,
      documentContentsRead: false,
      pathsRedacted: true,
    }));
  });
});
