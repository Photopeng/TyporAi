import esbuild from 'esbuild';
import { builtinModules } from 'node:module';
import path from 'path';
import process from 'process';
import {
  existsSync,
  promises as fsPromises,
  readFileSync,
} from 'fs';
import rendererSafeUnrefHelpers from './scripts/rendererSafeUnref.js';

const {
  findUnsafeTimerUnrefSites,
  patchRendererUnsafeUnrefSites,
} = rendererSafeUnrefHelpers;

// Load .env.local if it exists
if (existsSync('.env.local')) {
  const envContent = readFileSync('.env.local', 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=["']?(.+?)["']?$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const prod = process.argv[2] === 'production';
const entryPoint = 'src/typora/main.ts';
const outfile = 'typora-typorai.js';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getNamedImportAliases(contents, exportName, moduleNames) {
  const aliases = new Set([exportName]);
  const importPattern = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  let match;

  while ((match = importPattern.exec(contents)) !== null) {
    const [, specifiers, moduleName] = match;
    if (!moduleNames.includes(moduleName)) continue;

    for (const specifier of specifiers.split(',')) {
      const parts = specifier.trim().split(/\s+as\s+/);
      if (parts[0] === exportName) {
        aliases.add(parts[1] ?? exportName);
      }
    }
  }

  return [...aliases];
}

function patchSdkImportMetaUrl(contents) {
  let patched = contents.replace(
    'createRequire(import.meta.url)',
    'createRequire(__filename)',
  );

  for (const alias of getNamedImportAliases(patched, 'createRequire', ['module', 'node:module'])) {
    patched = patched.replace(
      new RegExp(`\\b${escapeRegExp(alias)}\\(import\\.meta\\.url\\)`, 'g'),
      `${alias}(__filename)`,
    );
  }

  for (const alias of getNamedImportAliases(patched, 'fileURLToPath', ['url', 'node:url'])) {
    patched = patched.replace(
      new RegExp(`\\b${escapeRegExp(alias)}\\(import\\.meta\\.url\\)`, 'g'),
      '__filename',
    );
  }

  return patched;
}

const patchSdkImportMeta = {
  name: 'patch-sdk-import-meta',
  setup(build) {
    build.onLoad(
      {
        filter: /[\\/]node_modules[\\/](?:@openai[\\/]codex-sdk[\\/]dist[\\/]index\.js|@anthropic-ai[\\/]claude-agent-sdk[\\/]sdk\.mjs)$/,
      },
      async (args) => {
        const contents = await fsPromises.readFile(args.path, 'utf8');
        return {
          contents: patchSdkImportMetaUrl(contents),
          loader: 'js',
        };
      },
    );
  },
};

const patchRendererUnsafeUnref = {
  name: 'patch-renderer-unsafe-unref',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0 || !existsSync(outfile)) return;

      const bundlePath = path.join(process.cwd(), outfile);
      const originalContents = await fsPromises.readFile(bundlePath, 'utf8');
      const patchedBundle = patchRendererUnsafeUnrefSites(originalContents);

      if (patchedBundle.contents !== originalContents) {
        await fsPromises.writeFile(bundlePath, patchedBundle.contents, 'utf8');
      }

      const unsafeMatches = findUnsafeTimerUnrefSites(patchedBundle.contents);
      if (unsafeMatches.length > 0) {
        const details = unsafeMatches
          .slice(0, 5)
          .map((match) => `line ${match.line}: ${match.snippet}`)
          .join('\n');

        throw new Error(
          `Renderer-unsafe timer .unref() calls remain in ${outfile}:\n${details}`,
        );
      }
    });
  },
};

const context = await esbuild.context({
  entryPoints: [entryPoint],
  bundle: true,
  plugins: [patchSdkImportMeta, patchRendererUnsafeUnref],
  external: [
    'electron',
    ...builtinModules,
    ...builtinModules.map(m => `node:${m}`),
  ],
  format: 'cjs',
  target: 'es2018',
  banner: { js: '(() => { var require = window.reqnode || window.require;' },
  footer: { js: '})();' },
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile,
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
