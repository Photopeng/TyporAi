import esbuild from 'esbuild';
import path from 'node:path';

const rendererProviderBoundary = {
  name: 'renderer-provider-boundary',
  setup(build) {
    build.onResolve({ filter: /^\.\/providers$/ }, args => {
      if (path.normalize(args.importer) !== path.resolve('src/main.ts')) return null;
      return { path: path.resolve('src/renderer/emptyProviders.ts') };
    });
  },
};

const rendererBrowserBoundary = {
  name: 'renderer-browser-boundary',
  setup(build) {
    const shims = path.resolve('src/renderer/shims');
    const builtins = new Map([
      ['events', 'nodeEvents.ts'],
      ['fs', 'nodeFs.ts'],
      ['node:fs', 'nodeFs.ts'],
      ['os', 'nodeOs.ts'],
      ['node:os', 'nodeOs.ts'],
      ['path', 'nodePath.ts'],
      ['node:path', 'nodePath.ts'],
    ]);
    build.onResolve({ filter: /^(?:node:)?(?:events|fs|os|path)$/ }, args => {
      const target = builtins.get(args.path);
      return target ? { path: path.join(shims, target) } : null;
    });
    build.onResolve({ filter: /[\\/]utils[\\/]electronCompat$/ }, () => ({
      path: path.join(shims, 'electronCompat.ts'),
    }));
    build.onResolve({ filter: /[\\/]utils[\\/]env$/ }, () => ({
      path: path.join(shims, 'env.ts'),
    }));
    build.onResolve({ filter: /[\\/]utils[\\/]path$/ }, () => ({
      path: path.join(shims, 'path.ts'),
    }));
  },
};

await esbuild.build({
  bundle: true,
  entryPoints: ['src/renderer/main.ts'],
  format: 'iife',
  logLevel: 'info',
  minify: process.argv[2] === 'production',
  outfile: 'typora-typorai.renderer.js',
  platform: 'browser',
  plugins: [rendererProviderBoundary, rendererBrowserBoundary],
  // Typora embeds Chromium on every desktop platform. Target the same language
  // level as the native renderer bundle instead of Safari's JavaScriptCore;
  // esbuild cannot down-level CodeMirror's destructuring for Safari 14.
  target: 'es2018',
});
