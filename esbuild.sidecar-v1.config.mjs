import esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const outfile = 'typorai-sidecar-v1.mjs';

await esbuild.build({
  bundle: true,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  entryPoints: ['src/sidecar/v1-main.ts'],
  format: 'esm',
  logLevel: 'info',
  minify: process.argv[2] === 'production',
  outfile,
  platform: 'node',
  target: 'node24',
});

// esbuild can preserve whitespace-only lines from bundled dependencies. Keep
// generated release output compact and make `git diff --check` stable.
const output = readFileSync(outfile, 'utf8').replace(/[\t ]+\n/g, '\n');
writeFileSync(outfile, output, 'utf8');
