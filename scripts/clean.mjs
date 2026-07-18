#!/usr/bin/env node
import { rmSync } from 'node:fs';

// Generated artifacts are intentionally not versioned. Removing every output
// before the official build prevents a release package from mixing old chains.
for (const output of [
  'styles.css',
  'typora-typorai.renderer.js',
  'typorai-sidecar-v1.mjs',
  'typorai-sidecar-v1.cjs',
  'typorai-macos-renderer.js',
  'typorai-sidecar.cjs',
]) {
  rmSync(output, { force: true });
}
