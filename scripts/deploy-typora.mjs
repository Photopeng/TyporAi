#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
const loader = buildLoader();

try {
  run(requestedAction, {
    dryRun: flags.has('--dry-run'),
    removePluginFiles: flags.has('--remove-plugin-files'),
    restoreBackup: flags.has('--restore-backup'),
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

function run(action, options) {
  if (action === 'verify') {
    verifyInstall();
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
    verifyInstall();
  }
}

function install(options) {
  assertInstallInputs();
  logPlan(`Installing TyporAi plugin into ${paths.pluginDir}`, options);

  if (!options.dryRun) {
    mkdirSync(paths.pluginDir, { recursive: true });
    copyFileSync(paths.bundlePath, paths.deployedBundlePath);
    if (existsSync(paths.stylesPath)) {
      copyFileSync(paths.stylesPath, paths.deployedStylesPath);
    }
  }

  const windowHtml = readFileSync(paths.windowHtmlPath, 'utf8');
  const nextWindowHtml = upsertLoader(removeLegacyLoader(windowHtml));
  if (nextWindowHtml === windowHtml) {
    if (!options.dryRun) {
      ensureStableBackup(windowHtml);
    }
    console.log('Loader is already up to date.');
    return;
  }

  if (!options.dryRun) {
    createBackups();
    writeWindowHtmlSafely(nextWindowHtml);
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
}

function verifyInstall() {
  const failures = [];

  if (!existsSync(paths.deployedBundlePath)) {
    failures.push(`Missing deployed bundle: ${paths.deployedBundlePath}`);
  }
  if (!existsSync(paths.deployedStylesPath)) {
    failures.push(`Missing deployed styles: ${paths.deployedStylesPath}`);
  }
  if (!existsSync(paths.windowHtmlPath)) {
    failures.push(`Missing Typora window.html: ${paths.windowHtmlPath}`);
  } else {
    const windowHtml = readFileSync(paths.windowHtmlPath, 'utf8');
    if (!hasLoader(windowHtml)) {
      failures.push(`Missing TyporAi loader marker in ${paths.windowHtmlPath}`);
    }
    if (!windowHtml.includes('"plugins", "typorai", "typora-typorai.js"')) {
      failures.push('Loader does not point at the Typora plugin directory.');
    }
    if (hasLegacyLoader(windowHtml)) {
      failures.push('Legacy loader marker is still present.');
    }
  }

  if (failures.length > 0) {
    throw new Error(`Verification failed:\n- ${failures.join('\n- ')}`);
  }

  console.log('TyporAi deployment verified.');
  console.log(`Bundle: ${paths.deployedBundlePath}`);
  console.log(`Styles: ${paths.deployedStylesPath}`);
  console.log(`Loader: ${paths.windowHtmlPath}`);
}

function assertInstallInputs() {
  if (!existsSync(paths.bundlePath)) {
    throw new Error(`Missing Typora bundle: ${paths.bundlePath}. Run npm run build:typora first.`);
  }
  if (!existsSync(paths.stylesPath)) {
    throw new Error(`Missing Typora styles: ${paths.stylesPath}. Run npm run build:typora first.`);
  }
  assertWindowHtmlExists();
}

function assertWindowHtmlExists() {
  if (!existsSync(paths.windowHtmlPath)) {
    throw new Error(`Missing Typora window.html: ${paths.windowHtmlPath}`);
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

function buildLoader() {
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
    var pluginPath = path.join(userDataDir, "plugins", "typorai", "typora-typorai.js");
    if (!fs.existsSync(pluginPath)) return;
    if (document.getElementById("typorai-typora-runtime")) return;
    var script = document.createElement("script");
    script.id = "typorai-typora-runtime";
    script.defer = true;
    script.src = pathToFileURL(pluginPath).href;
    document.head.appendChild(script);
  } catch (error) {
    console.error("[TyporAi] loader failed", error);
  }
})();
</script>
${markerEnd}`;
}

function resolvePaths() {
  const platform = deploymentPlatform;
  const typoraInstallDir = resolveTyporaInstallDir(platform);
  const typoraResourcesDir = resolveTyporaResourcesDir(typoraInstallDir, platform);
  const windowHtmlPath = path.join(typoraResourcesDir, platform === 'darwin' ? 'index.html' : 'window.html');
  const appData = resolveTyporaUserDataDir(platform);
  const typoraUserDataDir = path.join(appData, platform === 'darwin' ? 'abnerworks.Typora' : 'Typora');
  const pluginDir = path.join(typoraUserDataDir, 'plugins', 'typorai');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  return {
    appData,
    bundlePath: path.join(root, 'typora-typorai.js'),
    deployedBundlePath: path.join(pluginDir, 'typora-typorai.js'),
    deployedStylesPath: path.join(pluginDir, 'styles.css'),
    pluginDir,
    pluginsRoot: path.join(typoraUserDataDir, 'plugins'),
    stableBackupPath: `${windowHtmlPath}.typorai.bak`,
    stylesPath: path.join(root, 'styles.css'),
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

  return platform === 'darwin'
    ? path.join(typoraInstallDir, 'Contents', 'Resources', 'TypeMark')
    : path.join(typoraInstallDir, 'resources');
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
