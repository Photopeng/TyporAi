# Release packaging and rollback

TyporAi release packaging produces one self-contained deployment directory per supported target:

- `windows-x64`
- `macos-arm64`

Each package has the portable renderer, ESM Sidecar, styles, deployment script, license, source manifest, a generated `release-manifest.json`, and `SHA256SUMS.txt`. The release manifest fixes the Sidecar protocol version, Node support range, file hashes, and the exact install, repair, verify, and rollback commands for that package.

Both platform packages contain the same Sidecar renderer/runtime deployment model; no legacy/ElectronHost renderer is packaged.

Build a package after the normal production build:

```sh
npm run build:release
npm run package:release -- --platform macos-arm64
```

The package is written to `dist/TyporAi-macos-arm64`. Archive only that directory; do not combine platform packages because the manifest is an installation contract.

Before installation, operators must verify `SHA256SUMS.txt`. A deployment changes Typora's entry HTML only after creating both a stable restoration backup and a timestamped backup. `node scripts/deploy-typora.mjs uninstall --restore-backup --remove-plugin-files` restores the stable backup and removes TyporAi's deployed files.

Run `node scripts/diagnose-typora.mjs` to collect a local deployment report. The report contains only deployment paths (with the current home directory replaced by `~`), artifact presence, loader status, descriptor metadata, local health, and optional CLI version probes. It never reads the bootstrap token, environment values, prompts, or document contents. Pass `--skip-probes` when no provider executable should be started.

## Release risks and compatibility

`release-manifest.json` is a versioned data contract (`schemaVersion: 1`); consumers must reject an unknown schema rather than infer deployment behavior. A checksum mismatch is a release-integrity failure and must be resolved before executing the installer. The first release line intentionally requires Node 24 and records that range in the manifest, avoiding untested runtime fallback. Sidecar protocol version 1 is also recorded so an incompatible renderer/Sidecar combination can be rejected before a data-writing operation. Platform packages retain the deployment script's stable backup and explicit rollback command.

The release workflow rebuilds and tests each supported target independently, uploads each package as a CI artifact, and publishes each package archive and its checksum manifest with the tagged GitHub release. Intel macOS is not a supported release target.
