import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const markerStart = '<!-- TyporAi Typora Plugin Loader: start -->';
const repoRoot = process.cwd();

describe('deploy-typora script', () => {
  let createdRenderer = false;
  let createdSidecar = false;
  let createdStyles = false;
  let tempRoot: string;
  let installDir: string;
  let appDataDir: string;
  let stableBackupPath: string;
  let windowHtmlPath: string;
  let pluginDir: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'typorai-typora-deploy-'));
    installDir = path.join(tempRoot, 'Typora');
    appDataDir = path.join(tempRoot, 'AppData');
    windowHtmlPath = path.join(installDir, 'resources', 'window.html');
    stableBackupPath = `${windowHtmlPath}.typorai.bak`;
    pluginDir = path.join(appDataDir, 'Typora', 'plugins', 'typorai');

    mkdirSync(path.dirname(windowHtmlPath), { recursive: true });
    writeFileSync(windowHtmlPath, '<html><head></head><body><main>Typora</main></body></html>', 'utf8');
    ensureBuildInput('typora-typorai.renderer.js', 'console.log("renderer");');
    ensureBuildInput('typorai-sidecar-v1.mjs', 'console.log("sidecar");');
    ensureBuildInput('styles.css', 'body { color: inherit; }');
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    if (createdRenderer) {
      rmSync(path.join(repoRoot, 'typora-typorai.renderer.js'), { force: true });
      createdRenderer = false;
    }
    if (createdSidecar) {
      rmSync(path.join(repoRoot, 'typorai-sidecar-v1.mjs'), { force: true });
      createdSidecar = false;
    }
    if (createdStyles) {
      rmSync(path.join(repoRoot, 'styles.css'), { force: true });
      createdStyles = false;
    }
  });

  it('installs, verifies, repeats without duplicate loader, uninstalls, and repairs', () => {
    runDeploy('install');
    runDeploy('verify');

    expect(existsSync(path.join(pluginDir, 'typora-typorai.renderer.js'))).toBe(true);
    expect(existsSync(path.join(pluginDir, 'typorai-sidecar-v1.mjs'))).toBe(true);
    expect(existsSync(path.join(pluginDir, 'styles.css'))).toBe(true);
    expect(existsSync(path.join(pluginDir, 'installation-state.json'))).toBe(true);
    expect(readWindowHtml()).toContain(markerStart);
    expect(readWindowHtml()).toContain('refreshEndpoint');
    expect(readWindowHtml()).toContain(`var sidecarNodePath = ${JSON.stringify(process.execPath)}`);
    expect(readWindowHtml()).toContain('spawn(sidecarNodePath, [sidecarPath]');
    expect(readWindowHtml()).toContain('function hasLiveSidecar()');
    expect(readWindowHtml()).not.toContain('spawn(process.execPath, [sidecarPath]');

    runDeploy('install');
    expect(countLoaderMarkers(readWindowHtml())).toBe(1);

    runDeploy('uninstall');
    expect(readWindowHtml()).not.toContain(markerStart);
    expect(existsSync(path.join(pluginDir, 'typora-typorai.renderer.js'))).toBe(true);

    runDeploy('repair');
    runDeploy('verify');
    expect(countLoaderMarkers(readWindowHtml())).toBe(1);
  });

  it('can remove plugin files during uninstall', () => {
    runDeploy('install');

    runDeploy('uninstall', '--remove-plugin-files');

    expect(readWindowHtml()).not.toContain(markerStart);
    expect(existsSync(pluginDir)).toBe(false);
  });

  it('removes retired renderer artifacts when installing the Sidecar deployment', () => {
    mkdirSync(pluginDir, { recursive: true });
    writeFileSync(path.join(pluginDir, 'typora-typorai.js'), 'retired renderer', 'utf8');
    writeFileSync(path.join(pluginDir, 'typora-typorai.legacy.js'), 'retired renderer', 'utf8');

    runDeploy('install');

    expect(existsSync(path.join(pluginDir, 'typora-typorai.js'))).toBe(false);
    expect(existsSync(path.join(pluginDir, 'typora-typorai.legacy.js'))).toBe(false);
  });

  it('creates a restorable stable backup when the loader is already installed', () => {
    runDeploy('install');
    rmSync(stableBackupPath, { force: true });

    runDeploy('install');

    expect(existsSync(stableBackupPath)).toBe(true);
    expect(readFileSync(stableBackupPath, 'utf8')).not.toContain(markerStart);
  });

  it('does not write files during dry-run install', () => {
    runDeploy('install', '--dry-run');

    expect(readWindowHtml()).not.toContain(markerStart);
    expect(existsSync(pluginDir)).toBe(false);
  });

  it('returns machine-readable staged verification output', () => {
    runDeploy('install');
    const result = JSON.parse(runDeploy('verify', '--json')) as { ok: boolean; checks: Array<{ name: string; passed: boolean }> };
    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Renderer files', passed: true }),
      expect.objectContaining({ name: 'Sidecar artifact', passed: true }),
      expect.objectContaining({ name: 'Installation state', passed: true }),
      expect.objectContaining({ name: 'Loader marker', passed: true }),
    ]));
  });

  it('installs into the macOS application bundle and Typora user data directory', () => {
    installDir = path.join(tempRoot, 'Applications', 'Typora.app');
    appDataDir = path.join(tempRoot, 'Library', 'Application Support');
    windowHtmlPath = path.join(installDir, 'Contents', 'Resources', 'TypeMark', 'index.html');
    pluginDir = path.join(appDataDir, 'abnerworks.Typora', 'plugins', 'typorai');
    mkdirSync(path.dirname(windowHtmlPath), { recursive: true });
    writeFileSync(windowHtmlPath, '<html><body>Typora</body></html>', 'utf8');

    runDeployWithEnv({
      TYPORAI_DEPLOY_PLATFORM: 'darwin',
      TYPORAI_SIDECAR_PORT: '18328',
      TYPORA_INSTALL_DIR: installDir,
      TYPORA_USER_DATA_DIR: appDataDir,
    }, 'install');

    expect(readWindowHtml()).toContain(markerStart);
    expect(readWindowHtml()).toContain('typora-typorai.renderer.js');
    expect(readWindowHtml()).toContain('typorai-bootstrap.js');
    expect(readWindowHtml()).toContain('TyporAi is starting');
    expect(readWindowHtml()).not.toContain('window.reqnode');
    expect(readWindowHtml()).not.toContain('18328/rpc');
    expect(existsSync(path.join(pluginDir, 'typora-typorai.renderer.js'))).toBe(true);
    expect(existsSync(path.join(pluginDir, 'typorai-sidecar-v1.mjs'))).toBe(true);
    expect(existsSync(path.join(pluginDir, 'styles.css'))).toBe(true);
    const bootstrap = readFileSync(path.join(pluginDir, 'typorai-bootstrap.js'), 'utf8');
    expect(bootstrap).toContain('ws://127.0.0.1:18328/rpc');
    expect(bootstrap).toContain(`"homeDirectory":${JSON.stringify(tempRoot)}`);
    expect(bootstrap).toMatch(/"token":"[0-9a-f]{64}"/);
    expect(readFileSync(path.join(tempRoot, 'Library', 'LaunchAgents', 'com.photopeng.typorai.sidecar.plist'), 'utf8')).toContain('<key>PATH</key>');
    runDeployWithEnv({
      TYPORAI_DEPLOY_PLATFORM: 'darwin',
      TYPORAI_SIDECAR_PORT: '18328',
      TYPORA_INSTALL_DIR: installDir,
      TYPORA_USER_DATA_DIR: appDataDir,
    }, 'verify');
  });

  it('repairs user-owned macOS plugin artifacts when the installed loader is not writable', () => {
    installDir = path.join(tempRoot, 'Applications', 'Typora.app');
    appDataDir = path.join(tempRoot, 'Library', 'Application Support');
    windowHtmlPath = path.join(installDir, 'Contents', 'Resources', 'TypeMark', 'index.html');
    pluginDir = path.join(appDataDir, 'abnerworks.Typora', 'plugins', 'typorai');
    mkdirSync(path.dirname(windowHtmlPath), { recursive: true });
    writeFileSync(windowHtmlPath, '<html><body>Typora</body></html>', 'utf8');
    const env = {
      TYPORAI_DEPLOY_PLATFORM: 'darwin',
      TYPORA_INSTALL_DIR: installDir,
      TYPORA_USER_DATA_DIR: appDataDir,
    };

    runDeployWithEnv(env, 'install');
    const deployedRenderer = path.join(pluginDir, 'typora-typorai.renderer.js');
    writeFileSync(deployedRenderer, 'stale reduced renderer', 'utf8');
    chmodSync(windowHtmlPath, 0o444);
    try {
      runDeployWithEnv(env, 'repair');
    } finally {
      chmodSync(windowHtmlPath, 0o644);
    }

    expect(readFileSync(deployedRenderer)).toEqual(readFileSync(path.join(repoRoot, 'typora-typorai.renderer.js')));
  });

  it('fails verification when a deployed renderer is stale', () => {
    runDeploy('install');
    writeFileSync(path.join(pluginDir, 'typora-typorai.renderer.js'), 'stale reduced renderer', 'utf8');

    expect(() => runDeploy('verify')).toThrow(/Renderer artifact does not match/);
  });

  it('reports a clear error for a non-standard macOS Typora resource layout', () => {
    installDir = path.join(tempRoot, 'Applications', 'Typora.app');
    appDataDir = path.join(tempRoot, 'Library', 'Application Support');

    expect(() => runDeployWithEnv({
      TYPORAI_DEPLOY_PLATFORM: 'darwin',
      TYPORA_INSTALL_DIR: installDir,
      TYPORA_USER_DATA_DIR: appDataDir,
    }, 'verify')).toThrow(/Typora resources directory was not found[\s\S]*TYPORA_RESOURCES_DIR/);
  });

  it('detects Linux resources and XDG config plugin directory', () => {
    installDir = path.join(tempRoot, 'usr', 'share', 'typora');
    appDataDir = path.join(tempRoot, 'xdg');
    windowHtmlPath = path.join(installDir, 'resources', 'window.html');
    pluginDir = path.join(appDataDir, 'Typora', 'plugins', 'typorai');
    mkdirSync(path.dirname(windowHtmlPath), { recursive: true });
    writeFileSync(windowHtmlPath, '<html><body>Typora</body></html>', 'utf8');

    runDeployWithEnv({
      TYPORAI_DEPLOY_PLATFORM: 'linux',
      TYPORA_LINUX_INSTALL_DIR: installDir,
      XDG_CONFIG_HOME: appDataDir,
    }, 'install');

    expect(readWindowHtml()).toContain(markerStart);
    expect(existsSync(path.join(pluginDir, 'styles.css'))).toBe(true);
  });

  function ensureBuildInput(name: string, contents: string): void {
    const filePath = path.join(repoRoot, name);
    if (existsSync(filePath)) return;
    writeFileSync(filePath, contents, 'utf8');
    if (name === 'typora-typorai.renderer.js') createdRenderer = true;
    if (name === 'typorai-sidecar-v1.mjs') createdSidecar = true;
    if (name === 'styles.css') createdStyles = true;
  }

  function runDeploy(...args: string[]): string {
    return runDeployWithEnv({
      APPDATA: appDataDir,
      TYPORA_INSTALL_DIR: installDir,
      TYPORAI_DEPLOY_PLATFORM: 'win32',
    }, ...args);
  }

  function runDeployWithEnv(envOverrides: Record<string, string>, ...args: string[]): string {
    return execFileSync(process.execPath, ['scripts/deploy-typora.mjs', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        TYPORAI_SKIP_MACOS_SYSTEM_INTEGRATION: '1',
        TYPORAI_SKIP_TYPORA_PROCESS_CHECK: '1',
        ...envOverrides,
      },
    });
  }

  function readWindowHtml(): string {
    return readFileSync(windowHtmlPath, 'utf8');
  }
});

function countLoaderMarkers(contents: string): number {
  return contents.split(markerStart).length - 1;
}
