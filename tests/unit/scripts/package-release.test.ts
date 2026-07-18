import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const script = path.join(repoRoot, 'scripts', 'package-release.mjs');

describe('package-release script', () => {
  let temporaryRoot: string;

  beforeEach(() => {
    temporaryRoot = mkdtempSync(path.join(tmpdir(), 'typorai-release-package-'));
    writeInput('package.json', JSON.stringify({ version: '9.8.7', engines: { node: '>=24 <25' } }));
    writeInput('manifest.json', '{}');
    writeInput('LICENSE', 'MIT');
    writeInput('README.md', '# TyporAi');
    writeInput('styles.css', 'body {}');
    writeInput('typora-typorai.renderer.js', 'console.log("renderer")');
    writeInput('typora-typorai.js', 'console.log("legacy")');
    writeInput('typorai-sidecar-v1.mjs', 'console.log("sidecar")');
    writeInput('scripts/diagnose-typora.mjs', 'console.log("diagnose")');
    writeInput('scripts/deploy-typora.mjs', readFileSync(path.join(repoRoot, 'scripts', 'deploy-typora.mjs'), 'utf8'));
  });

  afterEach(() => rmSync(temporaryRoot, { recursive: true, force: true }));

  it('creates a platform-specific, checksummed portable deployment package', () => {
    const outputRoot = path.join(temporaryRoot, 'output');
    execFileSync(process.execPath, [script, '--source', temporaryRoot, '--output', outputRoot, '--platform', 'macos-arm64'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });

    const packageDirectory = path.join(outputRoot, 'TyporAi-macos-arm64');
    const releaseManifest = JSON.parse(readFileSync(path.join(packageDirectory, 'release-manifest.json'), 'utf8'));
    expect(releaseManifest).toMatchObject({
      product: 'TyporAi',
      version: '9.8.7',
      platform: 'macos-arm64',
      protocolVersion: 1,
      sidecar: 'typorai-sidecar-v1.mjs',
    });
    expect(releaseManifest.files).toHaveLength(8);
    expect(existsSync(path.join(packageDirectory, 'scripts', 'deploy-typora.mjs'))).toBe(true);
    expect(existsSync(path.join(packageDirectory, 'scripts', 'diagnose-typora.mjs'))).toBe(true);
    expect(readFileSync(path.join(packageDirectory, 'SHA256SUMS.txt'), 'utf8')).toContain(
      `${hash(path.join(packageDirectory, 'typorai-sidecar-v1.mjs'))}  typorai-sidecar-v1.mjs`,
    );
    expect(readFileSync(path.join(packageDirectory, 'INSTALL.md'), 'utf8')).toContain('sudo');
    expect(readFileSync(path.join(packageDirectory, 'scripts', 'deploy-typora.mjs'), 'utf8')).toContain("'release-manifest.json'");
    expect(existsSync(path.join(packageDirectory, 'package.json'))).toBe(false);
  });

  it('includes the Windows-only legacy rollback bundle', () => {
    const outputRoot = path.join(temporaryRoot, 'windows-output');
    execFileSync(process.execPath, [script, '--source', temporaryRoot, '--output', outputRoot, '--platform', 'windows-x64'], { cwd: repoRoot, encoding: 'utf8' });
    const packageDirectory = path.join(outputRoot, 'TyporAi-windows-x64');
    const releaseManifest = JSON.parse(readFileSync(path.join(packageDirectory, 'release-manifest.json'), 'utf8'));
    expect(existsSync(path.join(packageDirectory, 'typora-typorai.js'))).toBe(true);
    expect(releaseManifest.files).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'typora-typorai.js' })]));
  });

  it('installs a macOS package without a repository package.json', () => {
    const outputRoot = path.join(temporaryRoot, 'isolated-output');
    execFileSync(process.execPath, [script, '--source', temporaryRoot, '--output', outputRoot, '--platform', 'macos-arm64'], { cwd: repoRoot, encoding: 'utf8' });

    const packageDirectory = path.join(outputRoot, 'TyporAi-macos-arm64');
    const resourcesDirectory = path.join(temporaryRoot, 'Typora.app', 'Contents', 'Resources', 'TypeMark');
    const homeDirectory = path.join(temporaryRoot, 'home');
    mkdirSync(resourcesDirectory, { recursive: true });
    writeFileSync(path.join(resourcesDirectory, 'index.html'), '<html><body></body></html>', 'utf8');

    execFileSync(process.execPath, ['scripts/deploy-typora.mjs', 'install'], {
      cwd: packageDirectory,
      encoding: 'utf8',
      env: {
        ...process.env,
        TYPORAI_DEPLOY_PLATFORM: 'darwin',
        TYPORA_RESOURCES_DIR: resourcesDirectory,
        TYPORAI_USER_HOME: homeDirectory,
        TYPORAI_SKIP_MACOS_SYSTEM_INTEGRATION: '1',
      },
    });

    const plist = readFileSync(path.join(homeDirectory, 'Library', 'LaunchAgents', 'com.photopeng.typorai.sidecar.plist'), 'utf8');
    expect(plist).toContain('<key>TYPORAI_VERSION</key><string>9.8.7</string>');
  });

  it('rejects an unsupported platform before producing an archive directory', () => {
    expect(() => execFileSync(process.execPath, [script, '--source', temporaryRoot, '--platform', 'linux-x64'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    })).toThrow();
    expect(existsSync(path.join(temporaryRoot, 'dist', 'TyporAi-linux-x64'))).toBe(false);
  });

  function writeInput(relativePath: string, contents: string) {
    const destination = path.join(temporaryRoot, relativePath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, contents, 'utf8');
  }
});

function hash(filePath: string) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}
