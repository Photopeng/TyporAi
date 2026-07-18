function rendererHome(): string {
  const value = (globalThis as { __TYPORAI_HOME_DIRECTORY__?: unknown }).__TYPORAI_HOME_DIRECTORY__;
  return typeof value === 'string' ? value : '';
}

export function homedir(): string { return rendererHome(); }
export function hostname(): string { return ''; }
export function tmpdir(): string { return '/tmp'; }

export default { homedir, hostname, tmpdir };
