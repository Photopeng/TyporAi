#!/usr/bin/env node
/**
 * Produce a local, redacted deployment diagnostic report. It deliberately
 * never reads tokens, prompts, document contents, or environment values.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const home = os.homedir();
const platform = process.platform;
const appData = platform === 'darwin'
  ? path.join(home, 'Library', 'Application Support', 'abnerworks.Typora')
  : path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'Typora');
const dataDir = value('--data-dir') ?? (platform === 'darwin'
  ? path.join(home, 'Library', 'Application Support', 'TyporAi', 'sidecar')
  : path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), 'TyporAi', 'sidecar'));
const pluginDir = value('--plugin-dir') ?? path.join(appData, 'plugins', 'typorai');
const resourcesDir = value('--typora-resources-dir') ?? (platform === 'darwin'
  ? path.join('/Applications/Typora.app', 'Contents', 'Resources', 'TypeMark')
  : path.join('C:', 'Program Files', 'Typora', 'resources'));
const entryFile = path.join(resourcesDir, platform === 'darwin' ? 'index.html' : 'window.html');
const descriptorPath = path.join(dataDir, 'connection.json');
const persistedRuntime = diagnosePersistedRuntime();
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  application: readManifest(),
  runtime: { node: process.version, platform, arch: process.arch },
  deployment: {
    pluginDirectory: describe(pluginDir),
    renderer: describe(path.join(pluginDir, 'typora-typorai.renderer.js')),
    sidecar: describe(path.join(pluginDir, 'typorai-sidecar-v1.mjs')),
    loader: { path: redact(entryFile), installed: hasLoader(entryFile) },
    descriptor: descriptorSummary(descriptorPath),
  },
  service: await health(descriptorPath),
  persistedRuntime,
  providerCli: args.includes('--skip-probes') ? [] : ['claude', 'codex', 'opencode'].map(probe),
  privacy: {
    tokenRead: false,
    environmentValuesRead: false,
    documentContentsRead: false,
    pathsRedacted: true,
  },
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

function value(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function readManifest() {
  try {
    const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
    return { id: manifest.id, version: manifest.version };
  } catch {
    return { id: 'typorai', version: 'unknown' };
  }
}

function redact(target) {
  return target === home || target.startsWith(`${home}${path.sep}`) ? `~${target.slice(home.length)}` : target;
}

function describe(target) {
  if (!existsSync(target)) return { path: redact(target), exists: false };
  const stats = statSync(target);
  return { path: redact(target), exists: true, type: stats.isDirectory() ? 'directory' : 'file', bytes: stats.isFile() ? stats.size : undefined };
}

function hasLoader(target) {
  try { return readFileSync(target, 'utf8').includes('TyporAi Typora Plugin Loader: start'); } catch { return false; }
}

function descriptorSummary(target) {
  try {
    const descriptor = JSON.parse(readFileSync(target, 'utf8'));
    return { exists: true, host: descriptor.host === '127.0.0.1' ? descriptor.host : 'invalid', port: Number.isInteger(descriptor.port) ? descriptor.port : null, sidecarVersion: descriptor.sidecarVersion ?? null, protocolMin: descriptor.protocolMin ?? null, protocolMax: descriptor.protocolMax ?? null };
  } catch {
    return { exists: false, host: null, port: null, sidecarVersion: null, protocolMin: null, protocolMax: null };
  }
}

function diagnosePersistedRuntime() {
  const configuredNodePath = persistedNodePath();
  const serviceExists = configuredNodePath !== null;
  const node = describeNode(configuredNodePath);
  const sidecar = describe(path.join(pluginDir, 'typorai-sidecar-v1.mjs'));
  const descriptor = descriptorSummary(descriptorPath);
  return {
    status: runtimeStatus({ serviceExists, node, sidecar, descriptor }),
    serviceExists,
    node,
    sidecar,
  };
}

function persistedNodePath() {
  if (platform === 'darwin') {
    const agent = path.join(home, 'Library', 'LaunchAgents', 'com.photopeng.typorai.sidecar.plist');
    try { return readFileSync(agent, 'utf8').match(/<key>ProgramArguments<\/key><array><string>([^<]+)<\/string>/)?.[1] ?? null; } catch { return null; }
  }
  if (platform === 'win32') {
    try {
      const task = spawnSync('schtasks', ['/Query', '/TN', '\\TyporAi Sidecar', '/XML'], { encoding: 'utf8', windowsHide: true });
      return `${task.stdout ?? ''}`.match(/<Command>([^<]+)<\/Command>/i)?.[1] ?? null;
    } catch { return null; }
  }
  return null;
}

function describeNode(nodePath) {
  if (!nodePath || !existsSync(nodePath)) return { path: nodePath ? redact(nodePath) : null, exists: false, executable: false, version: null, compatible: false };
  try {
    const result = spawnSync(nodePath, ['--version'], { encoding: 'utf8', timeout: 1500, windowsHide: true });
    const version = `${result.stdout ?? ''}`.trim();
    const major = Number(version.match(/^v(\d+)/)?.[1]);
    return { path: redact(nodePath), exists: true, executable: !result.error && result.status === 0, version: version || null, compatible: major === 24 };
  } catch { return { path: redact(nodePath), exists: true, executable: false, version: null, compatible: false }; }
}

function runtimeStatus({ serviceExists, node, sidecar, descriptor }) {
  if (!serviceExists) return 'service-missing';
  if (!node.exists || !node.executable) return 'node-missing';
  if (!node.compatible) return 'node-version-incompatible';
  if (!sidecar.exists) return 'sidecar-missing';
  if (descriptor.exists && descriptor.sidecarVersion && descriptor.sidecarVersion !== readManifest().version) return 'descriptor-stale';
  return descriptor.exists ? 'healthy' : 'health-unreachable';
}

async function health(target) {
  const descriptor = descriptorSummary(target);
  if (!descriptor.exists || descriptor.host !== '127.0.0.1' || !descriptor.port) return { reachable: false, reason: 'descriptor-unavailable' };
  return new Promise(resolve => {
    const req = request({ host: descriptor.host, port: descriptor.port, path: '/health', method: 'GET', timeout: 1500 }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ reachable: response.statusCode === 200, status: typeof parsed.status === 'string' ? parsed.status : 'unknown', protocolVersion: parsed.protocolVersion ?? null });
        } catch { resolve({ reachable: false, reason: 'invalid-health-response' }); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve({ reachable: false, reason: 'health-unreachable' }));
    req.end();
  });
}

function probe(command) {
  try {
    const result = spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 1500, windowsHide: true });
    const version = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split(/\r?\n/, 1)[0] ?? '';
    return { command, available: !result.error && result.status === 0, version: version.slice(0, 200) || null };
  } catch { return { command, available: false, version: null }; }
}
