import esbuild from 'esbuild';

await esbuild.build({
  bundle: true,
  entryPoints: ['src/sidecar/v1-main.ts'],
  format: 'cjs',
  logLevel: 'info',
  minify: process.argv[2] === 'production',
  outfile: 'typorai-sidecar-v1.cjs',
  platform: 'node',
  target: 'node24',
});
