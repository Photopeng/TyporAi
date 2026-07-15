import esbuild from 'esbuild';

await esbuild.build({
  bundle: true,
  entryPoints: ['src/sidecar/main.ts'],
  format: 'cjs',
  logLevel: 'info',
  minify: process.argv[2] === 'production',
  outfile: 'typorai-sidecar.cjs',
  platform: 'node',
  target: 'node24',
});
