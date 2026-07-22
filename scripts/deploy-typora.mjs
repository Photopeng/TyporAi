#!/usr/bin/env node
import {
  chownSync,
  copyFileSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  accessSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const markerStart = '<!-- TyporAi Typora Plugin Loader: start -->';
const markerEnd = '<!-- TyporAi Typora Plugin Loader: end -->';
const legacyProductName = 'Clau' + 'dian';
const legacyMarkerStart = `<!-- ${legacyProductName} Typora Plugin Loader: start -->`;
const legacyMarkerEnd = `<!-- ${legacyProductName} Typora Plugin Loader: end -->`;

const actions = new Set(['install', 'uninstall', 'repair', 'verify']);
const args = process.argv.slice(2);
const requestedAction = args.find(arg => actions.has(arg)) ?? 'install';
const flags = new Set(args.filter(arg => arg.startsWith('--')));
const deploymentPlatform = process.env.TYPORAI_DEPLOY_PLATFORM || process.platform;
const paths = resolvePaths();

try {
  run(requestedAction, {
    dryRun: flags.has('--dry-run'),
    json: flags.has('--json'),
    removePluginFiles: flags.has('--remove-plugin-files'),
    restoreBackup: flags.has('--restore-backup'),
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

function run(action, options) {
  if (action === 'verify') {
    verifyInstall(options);
    return;
  }

  if (!options.dryRun) {
    assertTyporaIsNotRunning();
  }

  if (action === 'uninstall') {
    uninstall(options);
    return;
  }

  install(options);
  if (!options.dryRun) {
    verifyInstall(options);
  }
}

function install(options) {
  assertInstallInputs();
  const windowHtml = readFileSync(paths.windowHtmlPath, 'utf8');
  const nextWindowHtml = upsertLoader(removeLegacyLoader(windowHtml));
  const loaderNeedsUpdate = nextWindowHtml !== windowHtml;
  if (!options.dryRun && loaderNeedsUpdate) {
    assertWindowHtmlWritable();
  }
  logPlan(`Installing TyporAi plugin into ${paths.pluginDir}`, options);

  if (!options.dryRun) {
    mkdirSync(paths.pluginDir, { recursive: true });
    for (const retiredRendererPath of paths.retiredRendererPaths) {
      rmSync(retiredRendererPath, { force: true });
    }
    copyFileSync(paths.bundlePath, paths.deployedBundlePath);
    if (existsSync(paths.stylesPath)) {
      copyFileSync(paths.stylesPath, paths.deployedStylesPath);
    }
    installSidecarRuntime();
  }

  if (!loaderNeedsUpdate) {
    if (!options.dryRun) {
      ensureStableBackup(windowHtml);
      writeInstallationState(windowHtml, nextWindowHtml);
    }
    console.log('Loader is already up to date.');
    return;
  }

  if (!options.dryRun) {
    createBackups();
    writeWindowHtmlSafely(nextWindowHtml);
    if (deploymentPlatform === 'darwin') resignMacosApp();
    writeInstallationState(windowHtml, nextWindowHtml);
  }

  console.log(`Copied bundle to ${paths.deployedBundlePath}`);
  if (existsSync(paths.stylesPath)) {
    console.log(`Copied styles to ${paths.deployedStylesPath}`);
  }
  console.log(`Injected loader into ${paths.windowHtmlPath}`);
}

function uninstall(options) {
  assertWindowHtmlExists();
  logPlan(`Uninstalling TyporAi loader from ${paths.windowHtmlPath}`, options);

  if (options.restoreBackup) {
    restoreStableBackup(options);
  } else {
    const windowHtml = readFileSync(paths.windowHtmlPath, 'utf8');
    const nextWindowHtml = removeLegacyLoader(removeLoader(windowHtml));
    if (nextWindowHtml === windowHtml) {
      console.log('No TyporAi loader marker found.');
    } else if (!options.dryRun) {
      createBackups();
      writeWindowHtmlSafely(nextWindowHtml);
      console.log(`Removed loader from ${paths.windowHtmlPath}`);
    }
  }

  if (options.removePluginFiles) {
    assertPluginDirIsSafe();
    if (!options.dryRun && existsSync(paths.pluginDir)) {
      rmSync(paths.pluginDir, { recursive: true, force: true });
    }
    console.log(`Removed plugin files from ${paths.pluginDir}`);
  }

  if (!options.dryRun) rmSync(paths.installationStatePath, { force: true });

  if (deploymentPlatform === 'darwin' && !options.dryRun) {
    uninstallMacosSidecar(options.removePluginFiles);
  }
  if (deploymentPlatform === 'win32' && !options.dryRun && shouldManageWindowsSystemIntegration()) uninstallWindowsSidecar();
}

function verifyInstall(options = {}) {
  const failures = [];
  const checks = [];

  const check = (name, passed, detail) => {
    checks.push({ name, passed, detail });
    if (!passed) failures.push(detail);
  };

  check('Renderer files', existsSync(paths.deployedBundlePath) && existsSync(paths.deployedStylesPath), `Missing deployed renderer files in ${paths.pluginDir}`);
  check(
    'Renderer artifact matches',
    filesMatch(paths.bundlePath, paths.deployedBundlePath),
    `Renderer artifact does not match the current build: ${paths.deployedBundlePath}`,
  );
  check(
    'Renderer styles match',
    filesMatch(paths.stylesPath, paths.deployedStylesPath),
    `Renderer styles do not match the current build: ${paths.deployedStylesPath}`,
  );
  check('Sidecar artifact', existsSync(paths.deployedSidecarPath), `Missing sidecar: ${paths.deployedSidecarPath}`);
  check('Installation state', hasValidInstallationState(), `Missing or invalid installation state: ${paths.installationStatePath}`);
  check(
    'Sidecar artifact matches',
    filesMatch(paths.sidecarPath, paths.deployedSidecarPath),
    `Sidecar artifact does not match the current build: ${paths.deployedSidecarPath}`,
  );
  check('Bootstrap token', existsSync(paths.sidecarTokenPath), `Missing sidecar token: ${paths.sidecarTokenPath}`);
  if (deploymentPlatform === 'darwin') {
    check('Renderer bootstrap', existsSync(paths.deployedBootstrapPath), `Missing renderer bootstrap: ${paths.deployedBootstrapPath}`);
    if (existsSync(paths.deployedBootstrapPath)) {
      const bootstrap = readFileSync(paths.deployedBootstrapPath, 'utf8');
      check('Renderer bootstrap endpoint', bootstrap.includes(`ws://127.0.0.1:${paths.sidecarPort}/rpc`), 'Renderer bootstrap does not match the configured Sidecar port.');
    }
    check('Sidecar service registration', existsSync(paths.launchAgentPath), `Missing LaunchAgent: ${paths.launchAgentPath}`);
  }
  if (!existsSync(paths.windowHtmlPath)) {
    check('Loader marker', false, `Missing Typora window.html: ${paths.windowHtmlPath}`);
  } else {
    const windowHtml = readFileSync(paths.windowHtmlPath, 'utf8');
    check('Loader marker', hasLoader(windowHtml), `Missing TyporAi loader marker in ${paths.windowHtmlPath}`);
    check('Shared renderer loader', windowHtml.includes('typora-typorai.renderer.js'), 'Loader does not point at the Typora plugin directory.');
    check('Legacy fallback hygiene', !hasLegacyLoader(windowHtml), 'Legacy loader marker is still present.');
  }

  if (failures.length > 0) {
    if (options.json) console.log(JSON.stringify({ checks, ok: false, platform: deploymentPlatform }));
    throw new Error(`Verification failed:\n- ${failures.join('\n- ')}`);
  }

  if (options.json) { console.log(JSON.stringify({ checks, ok: true, platform: deploymentPlatform })); return; }
  console.log('TyporAi deployment verified.');
  for (const entry of checks) console.log(`[PASS] ${entry.name}`);
}

function assertInstallInputs() {
  if (!existsSync(paths.bundlePath)) {
    throw new Error(`Missing Typora bundle: ${paths.bundlePath}. Run npm run build first.`);
  }
  if (!existsSync(paths.stylesPath)) {
    throw new Error(`Missing Typora styles: ${paths.stylesPath}. Run npm run build first.`);
  }
  if (!existsSync(paths.sidecarPath)) throw new Error(`Missing sidecar: ${paths.sidecarPath}. Run npm run build first.`);
  assertWindowHtmlExists();
}

function filesMatch(sourcePath, deployedPath) {
  if (!existsSync(sourcePath) || !existsSync(deployedPath)) return false;
  return readFileSync(sourcePath).equals(readFileSync(deployedPath));
}

function writeInstallationState(originalWindowHtml, deployedWindowHtml) {
  const files = [paths.deployedBundlePath, paths.deployedSidecarPath, paths.deployedStylesPath]
    .filter(existsSync)
    .map(target => ({ path: path.basename(target), sha256: sha256File(target) }));
  const state = {
    files,
    installedAt: new Date().toISOString(),
    platform: deploymentPlatform,
    typoraInstallDir: paths.typoraInstallDir,
    typoraVersion: null,
    typoraiVersion: resolveTyporAiVersion(),
    windowHtmlDeployedSha256: sha256(deployedWindowHtml),
    windowHtmlOriginalSha256: sha256(originalWindowHtml),
  };
  writeFileSync(paths.installationStatePath, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function hasValidInstallationState() {
  if (!existsSync(paths.installationStatePath)) return false;
  try {
    const state = JSON.parse(readFileSync(paths.installationStatePath, 'utf8'));
    return state && typeof state === 'object'
      && state.typoraiVersion === resolveTyporAiVersion()
      && state.platform === deploymentPlatform && Array.isArray(state.files);
  } catch { return false; }
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function sha256File(target) { return createHash('sha256').update(readFileSync(target)).digest('hex'); }
function resolveTyporAiVersion() {
  const packagePath = path.join(root, 'package.json');
  const manifestPath = path.join(root, 'manifest.json');
  if (existsSync(packagePath)) return JSON.parse(readFileSync(packagePath, 'utf8')).version;
  if (existsSync(manifestPath)) return JSON.parse(readFileSync(manifestPath, 'utf8')).version;
  throw new Error('TyporAi version metadata is missing.');
}

function assertWindowHtmlExists() {
  if (!existsSync(paths.windowHtmlPath)) {
    throw new Error(`Missing Typora window.html: ${paths.windowHtmlPath}`);
  }
}

function assertWindowHtmlWritable() {
  try {
    accessSync(paths.windowHtmlPath, constants.W_OK);
  } catch {
    if (deploymentPlatform === 'darwin') {
      throw new Error(
        `Typora's entry file is not writable: ${paths.windowHtmlPath}. `
        + `Close Typora and rerun with administrator privileges, for example:\n`
        + `sudo ${process.execPath} scripts/deploy-typora.mjs install`,
      );
    }
    throw new Error(`Typora's entry file is not writable: ${paths.windowHtmlPath}`);
  }
}

function assertTyporaIsNotRunning() {
  if (process.env.TYPORAI_SKIP_TYPORA_PROCESS_CHECK === '1') {
    return;
  }

  if (deploymentPlatform === 'darwin') {
    try {
      const output = execFileSync('pgrep', ['-x', 'Typora'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (output.trim()) {
        throw new Error('Typora is running. Quit Typora before installing, repairing, or uninstalling.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Typora is running')) {
        throw error;
      }
    }
    return;
  }

  if (deploymentPlatform !== 'win32') return;

  try {
    const output = execFileSync('tasklist', ['/FI', 'IMAGENAME eq Typora.exe'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const hasTyporaProcess = output
      .split(/\r?\n/)
      .some(line => /^\s*Typora\.exe\s+/i.test(line));
    if (hasTyporaProcess) {
      throw new Error('Typora is running. Close Typora before installing, repairing, or uninstalling.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Typora is running')) {
      throw error;
    }
  }
}

function createBackups() {
  copyFileSync(paths.windowHtmlPath, paths.stableBackupPath);
  copyFileSync(paths.windowHtmlPath, paths.timestampBackupPath);
  console.log(`Backed up window.html to ${paths.stableBackupPath}`);
  console.log(`Backed up window.html to ${paths.timestampBackupPath}`);
}

function ensureStableBackup(windowHtml) {
  if (existsSync(paths.stableBackupPath)) {
    return;
  }

  const restorableWindowHtml = hasLoader(windowHtml)
    ? removeLoader(windowHtml)
    : windowHtml;
  writeFileSync(paths.stableBackupPath, restorableWindowHtml, 'utf8');
  console.log(`Created missing stable backup at ${paths.stableBackupPath}`);
}

function restoreStableBackup(options) {
  if (!existsSync(paths.stableBackupPath)) {
    throw new Error(`No stable backup found: ${paths.stableBackupPath}`);
  }

  if (!options.dryRun) {
    writeWindowHtmlSafely(readFileSync(paths.stableBackupPath, 'utf8'));
  }
  console.log(`Restored window.html from ${paths.stableBackupPath}`);
}

function writeWindowHtmlSafely(contents) {
  if (!hasLoader(contents) && contents.includes(markerStart)) {
    throw new Error('Refusing to write partial TyporAi loader marker.');
  }

  const tmpPath = path.join(paths.typoraResourcesDir, 'window.tmp.html');
  writeFileSync(tmpPath, contents, 'utf8');

  const written = readFileSync(tmpPath, 'utf8');
  if (written !== contents) {
    throw new Error('Temporary window.html verification failed.');
  }

  renameSync(tmpPath, paths.windowHtmlPath);
}

function upsertLoader(windowHtml) {
  const loader = buildLoader(paths);
  const pattern = markerPattern();
  if (pattern.test(windowHtml)) {
    return windowHtml.replace(pattern, loader);
  }
  if (!windowHtml.includes('</body>')) {
    throw new Error('Could not inject TyporAi loader: </body> marker was not found.');
  }
  return windowHtml.replace('</body>', `${loader}\n</body>`);
}

function removeLoader(windowHtml) {
  return windowHtml.replace(markerPattern(), '');
}

function removeLegacyLoader(windowHtml) {
  return windowHtml.replace(legacyMarkerPattern(), '');
}

function hasLoader(windowHtml) {
  return markerPattern().test(windowHtml);
}

function hasLegacyLoader(windowHtml) {
  return legacyMarkerPattern().test(windowHtml);
}

function markerPattern() {
  return new RegExp(`${escapeRegExp(markerStart)}[\\s\\S]*?${escapeRegExp(markerEnd)}`);
}

function legacyMarkerPattern() {
  return new RegExp(`${escapeRegExp(legacyMarkerStart)}[\\s\\S]*?${escapeRegExp(legacyMarkerEnd)}`);
}

function buildLoader(resolvedPaths) {
  if (deploymentPlatform === 'darwin') return buildMacosBrowserLoader(resolvedPaths);
  return buildBrowserLoader(resolvedPaths);
}

function buildMacosBrowserLoader(resolvedPaths) {
  const bootstrapUrl = pathToFileURL(resolvedPaths.deployedBootstrapPath).href;
  const rendererUrl = pathToFileURL(resolvedPaths.deployedBundlePath).href;
  const stylesUrl = pathToFileURL(resolvedPaths.deployedStylesPath).href;
  return `${markerStart}
<link id="typorai-style" rel="stylesheet" href="${escapeHtmlAttribute(stylesUrl)}">
<section
 id="typorai-typora-root"
 class="typorai-bootstrap-root"
 data-typorai-sidecar="pending"
 role="status"
 aria-live="polite"
>
 TyporAi is starting…
</section>
<script id="typorai-typora-bootstrap" src="${escapeHtmlAttribute(bootstrapUrl)}"></script>
<script id="typorai-typora-runtime" defer src="${escapeHtmlAttribute(rendererUrl)}"></script>
${markerEnd}`;
}

function buildBrowserLoader(resolvedPaths) {
  return `${markerStart}
<script id="typorai-typora-loader">
(function () {
  try {
    var req = window.reqnode || window.require;
    if (!req) return;
    var fs = req("fs");
    var path = req("path");
    var os = req("os");
    var process = req("process");
    var pathToFileURL = req("url").pathToFileURL;
    var userDataDir;
    if (process.platform === "darwin") {
      userDataDir = path.join(os.homedir(), "Library", "Application Support", "abnerworks.Typora");
    } else if (process.platform === "linux") {
      userDataDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "Typora");
    } else {
      var appData = process.env.APPDATA || path.join(process.env.USERPROFILE || os.homedir(), "AppData", "Roaming");
      userDataDir = path.join(appData, "Typora");
    }
    var pluginPath = ${JSON.stringify(resolvedPaths.deployedBundlePath)};
    var sidecarPath = ${JSON.stringify(resolvedPaths.deployedSidecarPath)};
    var sidecarNodePath = ${JSON.stringify(process.execPath)};
    var sidecarDataDir = ${JSON.stringify(resolvedPaths.sidecarDataDir)};
    var tokenPath = ${JSON.stringify(resolvedPaths.sidecarTokenPath)};
    var descriptorPath = ${JSON.stringify(resolvedPaths.sidecarDescriptorPath)};
    if (!fs.existsSync(pluginPath) || !fs.existsSync(sidecarPath) || !fs.existsSync(tokenPath)) return;
    if (document.getElementById("typorai-typora-runtime")) return;
    if (!document.getElementById("typorai-style")) { var style = document.createElement("link"); style.id = "typorai-style"; style.rel = "stylesheet"; style.href = pathToFileURL(${JSON.stringify(resolvedPaths.deployedStylesPath)}).href; document.head.appendChild(style); }
    function readBootstrap() {
        var descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf8"));
        if (!descriptor.port || descriptor.host !== "127.0.0.1") throw new Error("invalid descriptor");
        return { endpoint: "ws://127.0.0.1:" + descriptor.port + "/rpc", protocolVersion: 1, token: fs.readFileSync(tokenPath, "utf8").trim() };
    }
    var launchCooldownUntil = 0;
    function hasLiveSidecar() {
      try {
        var descriptor = JSON.parse(fs.readFileSync(descriptorPath, "utf8"));
        if (!Number.isInteger(descriptor.pid) || descriptor.pid <= 0) return false;
        process.kill(descriptor.pid, 0);
        return true;
      } catch (_) { return false; }
    }
    function ensureSidecar() {
      if (hasLiveSidecar() || Date.now() < launchCooldownUntil) return;
      launchCooldownUntil = Date.now() + 2000;
      try { fs.unlinkSync(descriptorPath); } catch (_) {}
      var child = req("child_process").spawn(sidecarNodePath, [sidecarPath], { detached: true, stdio: "ignore", windowsHide: true, env: Object.assign({}, process.env, { TYPORAI_SIDECAR_DATA_DIR: sidecarDataDir, TYPORAI_SIDECAR_DESCRIPTOR: descriptorPath, TYPORAI_SIDECAR_TOKEN_FILE: tokenPath, TYPORAI_VERSION: ${JSON.stringify(resolveTyporAiVersion())} }) });
      child.unref();
    }
    function mount() {
      try {
        var bootstrap = readBootstrap();
        bootstrap.refreshEndpoint = function() { return readBootstrap().endpoint; };
        window.__TYPORAI_BOOTSTRAP__ = bootstrap;
        var script = document.createElement("script"); script.id = "typorai-typora-runtime"; script.defer = true; script.src = pathToFileURL(pluginPath).href; document.head.appendChild(script);
      } catch (_) { ensureSidecar(); setTimeout(mount, 100); }
    }
    ensureSidecar();
    mount();
  } catch (error) {
    console.error("[TyporAi] loader failed", error);
  }
})();
</script>
${markerEnd}`;
}

function installSidecarRuntime() {
  mkdirSync(paths.sidecarDataDir, { recursive: true });
  if (!existsSync(paths.sidecarTokenPath)) {
    writeFileSync(paths.sidecarTokenPath, randomBytes(32).toString('hex'), { encoding: 'utf8', mode: 0o600 });
  }
  chmodSync(paths.sidecarTokenPath, 0o600);
  // Typora's on-demand launcher reuses connection.json when it exists. Stop
  // that process before replacing the bundle so Repair cannot silently keep
  // serving an older Sidecar implementation.
  if (deploymentPlatform === 'win32' && shouldManageWindowsSystemIntegration()) terminateWindowsSidecar();
  copyFileSync(paths.sidecarPath, paths.deployedSidecarPath);
  if (deploymentPlatform === 'win32') { if (shouldManageWindowsSystemIntegration()) installWindowsSidecar(); return; }
  if (deploymentPlatform !== 'darwin') return;
  mkdirSync(paths.sidecarLogsDir, { recursive: true });
  mkdirSync(path.dirname(paths.launchAgentPath), { recursive: true });
  writeFileSync(paths.launchAgentPath, buildLaunchAgentPlist(), 'utf8');
  writeMacosRendererBootstrap();
  repairMacosUserOwnership();
  if (shouldManageMacosSystemIntegration()) {
    const uid = resolveLaunchAgentUid();
    try { execFileSync('launchctl', ['bootout', `gui/${uid}`, paths.launchAgentPath], { stdio: 'ignore' }); } catch {}
    execFileSync('launchctl', ['bootstrap', `gui/${uid}`, paths.launchAgentPath], { stdio: 'inherit' });
    execFileSync('launchctl', ['kickstart', '-k', `gui/${uid}/${paths.launchAgentLabel}`], { stdio: 'inherit' });
  }
}

function writeMacosRendererBootstrap() {
  const bootstrap = JSON.stringify({
    endpoint: `ws://127.0.0.1:${paths.sidecarPort}/rpc`,
    homeDirectory: paths.deploymentHome,
    protocolVersion: 1,
    token: readSidecarToken(),
  }).replace(/</g, '\\u003c');
  writeFileSync(paths.deployedBootstrapPath, `window.__TYPORAI_BOOTSTRAP__ = ${bootstrap};\n`, { encoding: 'utf8', mode: 0o600 });
  chmodSync(paths.deployedBootstrapPath, 0o600);
}

function repairMacosUserOwnership() {
  if (process.platform !== 'darwin' || process.getuid?.() !== 0) return;
  const uid = resolveLaunchAgentUid();
  const gid = resolveLaunchAgentGid();
  if (uid <= 0 || gid <= 0) throw new Error('Could not resolve the macOS console user for TyporAi user files.');
  for (const target of [
    paths.pluginDir,
    paths.deployedBundlePath,
    paths.deployedStylesPath,
    paths.deployedSidecarPath,
    paths.deployedBootstrapPath,
    paths.sidecarDataDir,
    paths.sidecarTokenPath,
    paths.sidecarLogsDir,
    path.dirname(paths.launchAgentPath),
    paths.launchAgentPath,
  ]) {
    if (existsSync(target)) chownSync(target, uid, gid);
  }
}

function installWindowsSidecar() {
  const taskName = '\\TyporAi Sidecar';
  const command = `"${process.execPath}" "${paths.deployedSidecarPath}"`;
  try {
    execFileSync('schtasks', ['/Create', '/TN', taskName, '/SC', 'ONLOGON', '/RL', 'LIMITED', '/TR', command, '/F'], { stdio: 'inherit' });
  } catch {
    console.warn('Windows Sidecar scheduled task was not registered. Typora will start the Sidecar on demand; run Repair from an elevated terminal to enable persistent startup.');
    return;
  }
  try { execFileSync('schtasks', ['/Run', '/TN', taskName], { stdio: 'ignore' }); } catch {}
}

function uninstallWindowsSidecar() {
  try { execFileSync('schtasks', ['/Delete', '/TN', '\\TyporAi Sidecar', '/F'], { stdio: 'ignore' }); } catch {}
  terminateWindowsSidecar();
}

function terminateWindowsSidecar() {
  if (!existsSync(paths.sidecarDescriptorPath)) return;
  try {
    const descriptor = JSON.parse(readFileSync(paths.sidecarDescriptorPath, 'utf8'));
    if (Number.isInteger(descriptor.pid) && descriptor.pid > 0) {
      execFileSync('taskkill', ['/pid', String(descriptor.pid), '/t', '/f'], { stdio: 'ignore' });
    }
  } catch {}
  rmSync(paths.sidecarDescriptorPath, { force: true });
}

function shouldManageWindowsSystemIntegration() {
  return process.platform === 'win32'
    && process.env.TYPORAI_SKIP_WINDOWS_SYSTEM_INTEGRATION !== '1'
    && !process.env.JEST_WORKER_ID;
}

function uninstallMacosSidecar(removeData) {
  if (shouldManageMacosSystemIntegration()) {
    try { execFileSync('launchctl', ['bootout', `gui/${resolveLaunchAgentUid()}`, paths.launchAgentPath], { stdio: 'ignore' }); } catch {}
  }
  rmSync(paths.launchAgentPath, { force: true });
  if (removeData) rmSync(paths.sidecarDataDir, { recursive: true, force: true });
}

function resignMacosApp() {
  if (!shouldManageMacosSystemIntegration()) return;
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', paths.typoraInstallDir], { stdio: 'inherit' });
}

function shouldManageMacosSystemIntegration() {
  return process.platform === 'darwin' && process.env.TYPORAI_SKIP_MACOS_SYSTEM_INTEGRATION !== '1';
}

function resolveLaunchAgentUid() {
  const sudoUid = Number(process.env.SUDO_UID);
  if (Number.isInteger(sudoUid) && sudoUid > 0) return sudoUid;

  // AppleScript's `do shell script ... with administrator privileges` runs
  // as root without sudo's environment. Register the LaunchAgent for the
  // interactive console user instead of incorrectly targeting gui/0.
  if (process.platform === 'darwin') {
    try {
      const consoleUid = Number(execFileSync('stat', ['-f', '%u', '/dev/console'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }).trim());
      if (Number.isInteger(consoleUid) && consoleUid > 0) return consoleUid;
    } catch {}
  }

  return process.getuid?.() ?? 0;
}

function resolveLaunchAgentGid() {
  const sudoGid = Number(process.env.SUDO_GID);
  if (Number.isInteger(sudoGid) && sudoGid > 0) return sudoGid;
  if (process.platform === 'darwin') {
    try {
      const consoleGid = Number(execFileSync('stat', ['-f', '%g', '/dev/console'], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      }).trim());
      if (Number.isInteger(consoleGid) && consoleGid > 0) return consoleGid;
    } catch {}
  }
  return process.getgid?.() ?? 0;
}

function readSidecarToken() {
  return readFileSync(paths.sidecarTokenPath, 'utf8').trim();
}

function buildLaunchAgentPlist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${paths.launchAgentLabel}</string>
<key>ProgramArguments</key><array><string>${escapeXml(process.execPath)}</string><string>${escapeXml(paths.deployedSidecarPath)}</string></array>
<key>EnvironmentVariables</key><dict>
<key>TYPORAI_SIDECAR_TOKEN_FILE</key><string>${escapeXml(paths.sidecarTokenPath)}</string>
<key>TYPORAI_SIDECAR_DATA_DIR</key><string>${escapeXml(paths.sidecarDataDir)}</string>
<key>TYPORAI_SIDECAR_PORT</key><string>${paths.sidecarPort}</string>
<key>TYPORAI_ALLOWED_ROOTS</key><string>${escapeXml(paths.deploymentHome)}</string>
<key>TYPORAI_VERSION</key><string>${escapeXml(readProjectVersion())}</string>
<key>PATH</key><string>${escapeXml(resolveSidecarPath())}</string>
</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
<key>StandardOutPath</key><string>${escapeXml(paths.sidecarLogPath)}</string>
<key>StandardErrorPath</key><string>${escapeXml(paths.sidecarErrorLogPath)}</string>
</dict></plist>`;
}

function escapeXml(value) { return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]); }
function escapeHtmlAttribute(value) { return escapeXml(value); }
function readProjectVersion() {
  const releaseManifestPath = path.join(root, 'release-manifest.json');
  if (existsSync(releaseManifestPath)) {
    const version = JSON.parse(readFileSync(releaseManifestPath, 'utf8')).version;
    if (typeof version === 'string' && version.length > 0) return version;
  }

  const manifestPath = path.join(root, 'manifest.json');
  if (existsSync(manifestPath)) {
    const version = JSON.parse(readFileSync(manifestPath, 'utf8')).version;
    if (typeof version === 'string' && version.length > 0) return version;
  }

  return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
}
function resolveSidecarPath() {
  const entries = [
    path.dirname(process.execPath),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    ...(process.env.PATH ?? '').split(path.delimiter),
  ].filter(Boolean);
  return [...new Set(entries)].join(path.delimiter);
}

function resolvePaths() {
  const platform = deploymentPlatform;
  const typoraInstallDir = resolveTyporaInstallDir(platform);
  const typoraResourcesDir = resolveTyporaResourcesDir(typoraInstallDir, platform);
  const windowHtmlPath = path.join(typoraResourcesDir, platform === 'darwin' ? 'index.html' : 'window.html');
  const appData = resolveTyporaUserDataDir(platform);
  const typoraUserDataDir = path.join(appData, platform === 'darwin' ? 'abnerworks.Typora' : 'Typora');
  const pluginDir = path.join(typoraUserDataDir, 'plugins', 'typorai');
  const deploymentHome = platform === 'darwin'
    ? path.dirname(path.dirname(appData))
    : resolveDeploymentHome(platform);
  const sidecarDataDir = platform === 'darwin'
    ? path.join(deploymentHome, 'Library', 'Application Support', 'TyporAi', 'sidecar')
    : platform === 'win32'
      ? path.join(appData, 'TyporAi', 'sidecar')
      : path.join(deploymentHome, '.typorai', 'sidecar');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  return {
    appData,
    bundlePath: path.join(root, 'typora-typorai.renderer.js'),
    deployedBootstrapPath: path.join(pluginDir, 'typorai-bootstrap.js'),
    deployedSidecarPath: path.join(pluginDir, 'typorai-sidecar-v1.mjs'),
    retiredRendererPaths: [
      path.join(pluginDir, 'typora-typorai.js'),
      path.join(pluginDir, 'typora-typorai.legacy.js'),
    ],
    installationStatePath: path.join(pluginDir, 'installation-state.json'),
    deployedBundlePath: path.join(pluginDir, 'typora-typorai.renderer.js'),
    deployedStylesPath: path.join(pluginDir, 'styles.css'),
    pluginDir,
    pluginsRoot: path.join(typoraUserDataDir, 'plugins'),
    stableBackupPath: `${windowHtmlPath}.typorai.bak`,
    stylesPath: path.join(root, 'styles.css'),
    sidecarPath: path.join(root, 'typorai-sidecar-v1.mjs'),
    sidecarDataDir,
    sidecarErrorLogPath: path.join(deploymentHome, 'Library', 'Logs', 'TyporAi', 'sidecar-error.log'),
    sidecarLogPath: path.join(deploymentHome, 'Library', 'Logs', 'TyporAi', 'sidecar.log'),
    sidecarLogsDir: path.join(deploymentHome, 'Library', 'Logs', 'TyporAi'),
    sidecarPort: Number(process.env.TYPORAI_SIDECAR_PORT ?? '17328'),
    sidecarDescriptorPath: path.join(sidecarDataDir, 'connection.json'),
    sidecarTokenPath: path.join(sidecarDataDir, 'auth-token'),
    launchAgentLabel: process.env.TYPORAI_SIDECAR_LAUNCH_AGENT_LABEL ?? 'com.photopeng.typorai.sidecar',
    launchAgentPath: path.join(
      deploymentHome,
      'Library',
      'LaunchAgents',
      `${process.env.TYPORAI_SIDECAR_LAUNCH_AGENT_LABEL ?? 'com.photopeng.typorai.sidecar'}.plist`,
    ),
    deploymentHome,
    timestampBackupPath: `${windowHtmlPath}.typorai-backup-${timestamp}`,
    typoraInstallDir,
    typoraResourcesDir,
    windowHtmlPath,
  };
}

function resolveTyporaInstallDir(platform) {
  if (process.env.TYPORA_INSTALL_DIR) {
    return process.env.TYPORA_INSTALL_DIR;
  }

  if (platform === 'linux') {
    return process.env.TYPORA_LINUX_INSTALL_DIR || '/usr/share/typora';
  }

  if (platform === 'darwin') {
    if (process.env.TYPORA_MACOS_APP_PATH) return process.env.TYPORA_MACOS_APP_PATH;
    const homeDirectory = resolveDeploymentHome(platform);
    const candidates = [
      '/Applications/Typora.app',
      path.join(homeDirectory, 'Applications', 'Typora.app'),
    ];
    return candidates.find(candidate => existsSync(candidate)) ?? candidates[0];
  }

  return 'C:\\Program Files\\Typora';
}

function resolveTyporaResourcesDir(typoraInstallDir, platform) {
  if (process.env.TYPORA_RESOURCES_DIR) {
    return process.env.TYPORA_RESOURCES_DIR;
  }

  const resourcesDir = platform === 'darwin'
    ? path.join(typoraInstallDir, 'Contents', 'Resources', 'TypeMark')
    : path.join(typoraInstallDir, 'resources');
  if (platform === 'darwin' && !existsSync(resourcesDir)) {
    throw new Error(
      `Typora resources directory was not found at ${resourcesDir}. `
      + 'Set TYPORA_RESOURCES_DIR to the directory containing index.html when using a non-standard Typora bundle.',
    );
  }
  return resourcesDir;
}

function resolveTyporaUserDataDir(platform) {
  if (process.env.TYPORA_USER_DATA_DIR) {
    return process.env.TYPORA_USER_DATA_DIR;
  }

  if (platform === 'linux') {
    return process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  }

  if (platform === 'darwin') {
    return path.join(resolveDeploymentHome(platform), 'Library', 'Application Support');
  }

  return process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
}

function resolveDeploymentHome(platform) {
  if (process.env.TYPORAI_USER_HOME) return process.env.TYPORAI_USER_HOME;
  if (platform === 'darwin' && process.env.SUDO_USER && process.env.SUDO_USER !== 'root') {
    try {
      const output = execFileSync('/usr/bin/dscl', [
        '.',
        '-read',
        `/Users/${process.env.SUDO_USER}`,
        'NFSHomeDirectory',
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const match = output.match(/NFSHomeDirectory:\s*(.+)\s*$/);
      if (match?.[1]) return match[1].trim();
    } catch {}
    return path.join('/Users', process.env.SUDO_USER);
  }
  return os.homedir();
}

function assertPluginDirIsSafe() {
  const relative = path.relative(paths.pluginsRoot, paths.pluginDir);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative === '') {
    throw new Error(`Refusing to remove unexpected plugin directory: ${paths.pluginDir}`);
  }
}

function logPlan(message, options) {
  console.log(`${options.dryRun ? '[dry-run] ' : ''}${message}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
