import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const rules = [
  {
    name: 'Typora-only source must not import Obsidian APIs or compatibility shims',
    directories: ['src'],
    patterns: [
      /from\s*["']obsidian["']/,
      /obsidian-shim/,
      /\b(?:WorkspaceLeaf|ItemView|PluginSettingTab|MarkdownView|TFile|TFolder)\b/,
      /\b(?:class|interface|type)\s+(?:Vault|Plugin)\b/,
    ],
  },
  {
    name: 'user-visible Chinese copy must live in the i18n catalog',
    directories: ['src'],
    excludeDirectories: ['src/i18n'],
    patterns: [/[\u3400-\u9fff]/],
  },
  {
    name: 'renderer layers must not import host APIs or the compatibility shim',
    directories: ['src/core', 'src/application', 'src/providers', 'src/ui'],
    patterns: [
      /from\s*["'](?:node:)?(?:fs|path|os|crypto|child_process|process)["']/,
      /window\.(?:reqnode|File|bridge)/,
      /from\s*["']obsidian["']/,
    ],
  },
  {
    name: 'providers and features must not own external processes',
    directories: ['src/providers', 'src/features'],
    patterns: [
      /from\s*["'](?:node:)?child_process["']/,
      /\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(/,
    ],
  },
];

const failures = [];
for (const rule of rules) {
  for (const directory of rule.directories) {
    const absoluteDirectory = path.join(root, directory);
    if (!fs.existsSync(absoluteDirectory)) continue;
    for (const file of walk(absoluteDirectory)) {
      if (!file.endsWith('.ts')) continue;
      if ((rule.excludeDirectories ?? []).some(excluded => {
        const excludedPath = path.join(root, excluded);
        return file === excludedPath || file.startsWith(`${excludedPath}${path.sep}`);
      })) continue;
      const contents = fs.readFileSync(file, 'utf8');
      for (const pattern of rule.patterns) {
        if (pattern.test(contents)) {
          failures.push(`${rule.name}: ${path.relative(root, file)} / ${pattern}`);
          break;
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Architecture audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Architecture audit passed.');
}

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(file);
    else yield file;
  }
}
