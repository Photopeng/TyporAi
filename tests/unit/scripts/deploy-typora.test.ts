import { execFileSync } from 'node:child_process';
import {
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
  let createdBundle = false;
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
    ensureBuildInput('typora-typorai.js', 'console.log("bundle");');
    ensureBuildInput('styles.css', 'body { color: inherit; }');
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    if (createdBundle) {
      rmSync(path.join(repoRoot, 'typora-typorai.js'), { force: true });
      createdBundle = false;
    }
    if (createdStyles) {
      rmSync(path.join(repoRoot, 'styles.css'), { force: true });
      createdStyles = false;
    }
  });

  it('installs, verifies, repeats without duplicate loader, uninstalls, and repairs', () => {
    runDeploy('install');
    runDeploy('verify');

    expect(existsSync(path.join(pluginDir, 'typora-typorai.js'))).toBe(true);
    expect(existsSync(path.join(pluginDir, 'styles.css'))).toBe(true);
    expect(readWindowHtml()).toContain(markerStart);

    runDeploy('install');
    expect(countLoaderMarkers(readWindowHtml())).toBe(1);

    runDeploy('uninstall');
    expect(readWindowHtml()).not.toContain(markerStart);
    expect(existsSync(path.join(pluginDir, 'typora-typorai.js'))).toBe(true);

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

  it('installs into the macOS application bundle and Typora user data directory', () => {
    installDir = path.join(tempRoot, 'Applications', 'Typora.app');
    appDataDir = path.join(tempRoot, 'Library', 'Application Support');
    windowHtmlPath = path.join(installDir, 'Contents', 'Resources', 'TypeMark', 'index.html');
    pluginDir = path.join(appDataDir, 'abnerworks.Typora', 'plugins', 'typorai');
    mkdirSync(path.dirname(windowHtmlPath), { recursive: true });
    writeFileSync(windowHtmlPath, '<html><body>Typora</body></html>', 'utf8');

    runDeployWithEnv({
      TYPORAI_DEPLOY_PLATFORM: 'darwin',
      TYPORA_INSTALL_DIR: installDir,
      TYPORA_USER_DATA_DIR: appDataDir,
    }, 'install');

    expect(readWindowHtml()).toContain(markerStart);
    expect(readWindowHtml()).toContain('abnerworks.Typora');
    expect(existsSync(path.join(pluginDir, 'typora-typorai.js'))).toBe(true);
    expect(existsSync(path.join(pluginDir, 'styles.css'))).toBe(true);
    runDeployWithEnv({
      TYPORAI_DEPLOY_PLATFORM: 'darwin',
      TYPORA_INSTALL_DIR: installDir,
      TYPORA_USER_DATA_DIR: appDataDir,
    }, 'verify');
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
    if (name === 'typora-typorai.js') createdBundle = true;
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
