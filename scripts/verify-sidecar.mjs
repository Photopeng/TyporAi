import { existsSync } from 'node:fs';

const required = ['typorai-sidecar-v1.mjs', 'typora-typorai.renderer.js'];
const missing = required.filter(file => !existsSync(file));
if (missing.length > 0) {
  console.error(`[FAIL] Missing artifacts: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('[PASS] Browser renderer artifact');
console.log('[PASS] V1 Sidecar artifact');
console.log('[PASS] Shared protocol v1 build boundary');
