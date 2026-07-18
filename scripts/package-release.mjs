#!/usr/bin/env node
/**
 * Assemble a self-contained TyporAi deployment directory for one platform.
 * The archive is deliberately dependency-free: the copied deployment script
 * and the bundled ESM sidecar run with the supported Node 24 runtime.
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const platforms = new Set(['windows-x64', 'macos-x64', 'macos-arm64']);
const args = process.argv.slice(2);
const platform = readArgument('--platform') ?? process.env.TYPORAI_RELEASE_PLATFORM;
const root = path.resolve(readArgument('--source') ?? scriptRoot);
const outputRoot = path.resolve(root, readArgument('--output') ?? 'dist');

if (!platforms.has(platform)) {
  throw new Error(`A supported --platform is required (${[...platforms].join(', ')}).`);
}

const packageDirectory = path.join(outputRoot, `TyporAi-${platform}`);
const files = [
  'typora-typorai.renderer.js',
  'styles.css',
  'typorai-sidecar-v1.mjs',
  'manifest.json',
  'LICENSE',
  'README.md',
  'scripts/diagnose-typora.mjs',
  'scripts/deploy-typora.mjs',
];
if (platform === 'windows-x64') files.splice(1, 0, 'typora-typorai.js');

for (const relativePath of files) {
  const absolutePath = path.join(root, relativePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`Missing release input: ${relativePath}. Run npm run build:release first.`);
  }
}

rmSync(packageDirectory, { recursive: true, force: true });
mkdirSync(packageDirectory, { recursive: true });
for (const relativePath of files) {
  const destination = path.join(packageDirectory, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(path.join(root, relativePath), destination);
}

const project = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const packagedFiles = files.map(relativePath => ({
  path: relativePath.replaceAll('\\', '/'),
  sha256: sha256(path.join(packageDirectory, relativePath)),
}));
const releaseManifest = {
  schemaVersion: 1,
  product: 'TyporAi',
  version: project.version,
  platform,
  node: project.engines?.node ?? '>=24 <25',
  protocolVersion: 1,
  renderer: 'typora-typorai.renderer.js',
  sidecar: 'typorai-sidecar-v1.mjs',
  deployment: {
    install: 'node scripts/deploy-typora.mjs install',
    repair: 'node scripts/deploy-typora.mjs repair',
    verify: 'node scripts/deploy-typora.mjs verify',
    uninstall: 'node scripts/deploy-typora.mjs uninstall --restore-backup --remove-plugin-files',
  },
  files: packagedFiles,
};
writeFileSync(path.join(packageDirectory, 'release-manifest.json'), `${JSON.stringify(releaseManifest, null, 2)}\n`, 'utf8');

const checksums = [...packagedFiles, {
  path: 'release-manifest.json',
  sha256: sha256(path.join(packageDirectory, 'release-manifest.json')),
}].map(entry => `${entry.sha256}  ${entry.path}`).join('\n');
writeFileSync(path.join(packageDirectory, 'SHA256SUMS.txt'), `${checksums}\n`, 'utf8');
writeFileSync(path.join(packageDirectory, 'INSTALL.md'), installationGuide(platform), 'utf8');

console.log(`Packaged ${packageDirectory}`);

function readArgument(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function installationGuide(targetPlatform) {
  const privilege = targetPlatform.startsWith('macos')
    ? 'Close Typora, then use sudo if Typora is in /Applications.'
    : 'Close Typora and run the command from an elevated terminal if its installation directory is protected.';
  return `# TyporAi ${targetPlatform} release package\n\n`
    + `Requires Node.js ${project.engines?.node ?? '>=24 <25'} and desktop Typora. ${privilege}\n\n`
    + 'Verify the package before installation:\n\n'
    + '```sh\nsha256sum -c SHA256SUMS.txt\n```\n\n'
    + 'On macOS, use `shasum -a 256 -c SHA256SUMS.txt` if `sha256sum` is unavailable.\n\n'
    + 'Install, repair, verify, and uninstall:\n\n'
    + '```sh\nnode scripts/deploy-typora.mjs install\nnode scripts/deploy-typora.mjs repair\nnode scripts/deploy-typora.mjs verify\nnode scripts/deploy-typora.mjs uninstall --restore-backup --remove-plugin-files\n```\n\n'
    + 'The installer creates a timestamped Typora entry-file backup before it changes the loader. '
    + 'Use the uninstall command with `--restore-backup` to restore the stable pre-install backup.\n';
}
