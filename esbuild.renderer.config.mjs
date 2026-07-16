import esbuild from 'esbuild';

await esbuild.build({
  bundle: true,
  entryPoints: ['src/renderer/main.ts'],
  format: 'iife',
  logLevel: 'info',
  minify: process.argv[2] === 'production',
  outfile: 'typora-typorai.renderer.js',
  platform: 'browser',
  target: 'safari14',
});
