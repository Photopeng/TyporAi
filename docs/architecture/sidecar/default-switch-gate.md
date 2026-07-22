# Sidecar-only deployment policy

TyporAi deploys the browser-safe renderer and ESM Sidecar on every supported platform. The legacy/ElectronHost renderer, its build command, runtime selector, and release-package artifact have been retired.

Automated quality checks validate the deployment files, but real Typora acceptance evidence remains required for Windows Sidecar and macOS Apple Silicon. A stable-release label still requires that platform evidence, provider compatibility checks, and soak evidence.
