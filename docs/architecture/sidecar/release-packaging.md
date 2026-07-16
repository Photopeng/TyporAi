# Release packaging and rollback

TyporAi release packaging produces one self-contained deployment directory per supported target:

- `windows-x64`
- `macos-x64`
- `macos-arm64`

Each package has the portable renderer, ESM Sidecar, styles, deployment script, license, source manifest, a generated `release-manifest.json`, and `SHA256SUMS.txt`. The release manifest fixes the Sidecar protocol version, Node support range, file hashes, and the exact install, repair, verify, and rollback commands for that package.

Build a package after the normal production build:

```sh
npm run build:all
npm run package:release -- --platform macos-arm64
```

The package is written to `dist/TyporAi-macos-arm64`. Archive only that directory; do not combine platform packages because the manifest is an installation contract.

Before installation, operators must verify `SHA256SUMS.txt`. A deployment changes Typora's entry HTML only after creating both a stable restoration backup and a timestamped backup. `node scripts/deploy-typora.mjs uninstall --restore-backup --remove-plugin-files` restores the stable backup and removes TyporAi's deployed files. This preserves the legacy rollback path while the Sidecar rollout remains gated.

The release workflow rebuilds and tests each target independently, uploads each package as a CI artifact, and publishes each package archive and its checksum manifest with the tagged GitHub release.
