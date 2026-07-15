// scripts/sync-locales.mjs
// Deep-merge new English keys into all other locale files.
// Existing translations are preserved; missing keys get English values.
import * as fs from 'fs';
import * as path from 'path';

const LOCALES_DIR = path.join(process.cwd(), 'src/i18n/locales');
const en = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, 'en.json'), 'utf-8'));

function deepMerge(target, source) {
  if (typeof source !== 'object' || source === null) return target;
  if (Array.isArray(source)) return target;
  for (const key of Object.keys(source)) {
    if (
      typeof source[key] === 'object' &&
      source[key] !== null &&
      !Array.isArray(source[key])
    ) {
      if (!(key in target) || typeof target[key] !== 'object' || target[key] === null) {
        target[key] = {};
      }
      deepMerge(target[key], source[key]);
    } else {
      if (!(key in target)) {
        target[key] = source[key];
      }
    }
  }
  return target;
}

const files = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json') && f !== 'en.json');

for (const file of files) {
  const filePath = path.join(LOCALES_DIR, file);
  const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const merged = deepMerge(JSON.parse(JSON.stringify(existing)), en);
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  console.log(`Updated ${file}`);
}

console.log('Done. All locales synced with en.json');
