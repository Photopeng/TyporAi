export function parseSidecarPort(value: string | undefined): number {
  const port = Number(value);
  if (!value || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('TYPORAI_SIDECAR_PORT must be an integer between 1 and 65535');
  }
  return port;
}
