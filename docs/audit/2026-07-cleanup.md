# 2026-07 audit cleanup

This change closes the safe, repository-only cleanup items from the 2026-07-18 audit. The Windows legacy renderer was subsequently retired; all supported deployments use the Sidecar renderer and runtime.

## Production build contract

`npm run build` is the only default production build. It creates the shared renderer and V1 Sidecar, plus styles. It first removes generated outputs so an old artifact cannot accidentally enter a release package.

Generated bundles (`typora-typorai.renderer.js`, `typorai-sidecar-v1.mjs`, and the retired `typorai-sidecar-v1.cjs`) are not versioned. CI and release packaging build them from a clean checkout before audit, verification, or packaging. Pull requests must not include hand-edited bundles.

## Dependency audit evidence

The 2026-07-18 dependency review used `npm explain`, Knip, depcheck, and a full dependency-tree check. `tslib` remains a production dependency because TypeScript is configured with `importHelpers`; `@modelcontextprotocol/sdk`, `@codemirror/state`, `@codemirror/view`, `smol-toml`, and `ws` each have direct runtime imports. Knip's reported renderer and sidecar entries are esbuild entry points, so they are not deletion candidates. The unused development-only `tsx` package was removed.

`npm run build:release` produces the sole supported Sidecar deployment artifacts. It does not build a legacy renderer or a CJS Sidecar.

Run `npm run check` for the repository quality gate, and `npm run check:release` to additionally exercise portable package generation.

## Removed chains

- Obsidian development bootstrap: `.env.local.example`, its postinstall hook, and `versions.json`.
- Retired macOS simplified renderer: its configuration, source, tests, and generated output.
- Retired CJS Sidecar: its configuration, source, tests, and generated output.

The release installer now reads a package-local `release-manifest.json` version when installed from a portable package. It falls back to the source manifest and only then to `package.json`, so macOS service registration no longer relies on a repository-only file.

## Verification evidence

The portable-package unit test confirms packages omit `package.json` while carrying an installer that resolves `release-manifest.json`. The standard `check:release` command runs the full repository gate followed by that package test.
