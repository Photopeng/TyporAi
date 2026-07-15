import esbuild from 'esbuild';

await esbuild.build({
  bundle: true,
  entryPoints: ['src/typora/macos-main.ts'],
  format: 'iife',
  logLevel: 'info',
  minify: process.argv[2] === 'production',
  outfile: 'typorai-macos-renderer.js',
  platform: 'browser',
  target: 'safari14',
});
