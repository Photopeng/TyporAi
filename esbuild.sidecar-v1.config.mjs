import esbuild from 'esbuild';

await esbuild.build({
  bundle: true,
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  entryPoints: ['src/sidecar/v1-main.ts'],
  format: 'esm',
  logLevel: 'info',
  minify: process.argv[2] === 'production',
  outfile: 'typorai-sidecar-v1.mjs',
  platform: 'node',
  target: 'node24',
});
