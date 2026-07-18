# 2026-07 audit cleanup

This change closes the safe, repository-only cleanup items from the 2026-07-18 audit. It deliberately does not remove the Windows legacy renderer: that bundle remains the documented rollback path until the Sidecar default-switch gate is closed.

## Production build contract

`npm run build` is the only default production build. It creates the shared renderer and V1 Sidecar, plus styles. It first removes generated outputs so an old artifact cannot accidentally enter a release package.

Generated bundles (`typora-typorai.renderer.js`, `typorai-sidecar-v1.mjs`, and the retired `typorai-sidecar-v1.cjs`) are not versioned. CI and release packaging build them from a clean checkout before audit, verification, or packaging. Pull requests must not include hand-edited bundles.

`npm run build:legacy` is an explicit Windows rollback build. `npm run build:release` composes the official build with that rollback artifact for the current release packages. Neither command builds the retired macOS renderer or retired CJS Sidecar.

Run `npm run check` for the repository quality gate, and `npm run check:release` to additionally exercise portable package generation.

## Removed chains

- Obsidian development bootstrap: `.env.local.example`, its postinstall hook, and `versions.json`.
- Retired macOS simplified renderer: its configuration, source, tests, and generated output.
- Retired CJS Sidecar: its configuration, source, tests, and generated output.

The release installer now reads a package-local `release-manifest.json` version when installed from a portable package. It falls back to the source manifest and only then to `package.json`, so macOS service registration no longer relies on a repository-only file.

## Verification evidence

The portable-package unit test confirms packages omit `package.json` while carrying an installer that resolves `release-manifest.json`. The standard `check:release` command runs the full repository gate followed by that package test.
