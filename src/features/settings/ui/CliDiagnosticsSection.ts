import { ProviderWorkspaceRegistry } from '../../../core/providers/ProviderWorkspaceRegistry';
import { t } from '../../../i18n/i18n';
import { SettingBuilder } from '../../../ui/SettingBuilder';
import { cliPathRequiresNode } from '../../../utils/env';

interface CliDiagnosticResult {
  architecture: string;
  error: string | null;
  login: string;
  path: string | null;
  version: string | null;
}

type CliProviderId = 'claude' | 'codex' | 'opencode';

/** Shared, bounded CLI diagnostic panel. It never sends workspace content or starts a chat runtime. */
export function renderCliDiagnosticsSection(
  container: HTMLElement,
  providerId: CliProviderId,
  settings: Record<string, unknown>,
): void {
  const builder = new SettingBuilder(container);
  builder.heading(t('settings.cliProvider.diagnostics'));

  const output = container.ownerDocument.createElement('pre');
  output.className = 'typorai-cli-diagnostics setting-item-description';
  let latest = initialDiagnostic(providerId, settings);
  renderDiagnostic(output, latest);
  container.append(output);

  const controls = container.ownerDocument.createElement('div');
  controls.className = 'setting-item-control';
  const test = container.ownerDocument.createElement('button');
  test.type = 'button';
  test.textContent = t('settings.cliProvider.testStartup');
  const copy = container.ownerDocument.createElement('button');
  copy.type = 'button';
  copy.textContent = t('settings.cliProvider.copyDiagnostics');
  controls.append(test, copy);
  container.append(controls);

  test.addEventListener('click', () => {
    void (async () => {
      test.disabled = true;
      latest = await probeCli(providerId, settings);
      renderDiagnostic(output, latest);
      test.disabled = false;
    })();
  });
  copy.addEventListener('click', () => {
    void globalThis.navigator?.clipboard?.writeText(redactDiagnostic(renderDiagnosticText(latest)));
  });
}

function initialDiagnostic(
  providerId: CliProviderId,
  settings: Record<string, unknown>,
): CliDiagnosticResult {
  return {
    architecture: process.arch,
    error: null,
    login: t('settings.cliProvider.diagnosticNotProbed'),
    path: ProviderWorkspaceRegistry.getCliResolver(providerId)?.resolveFromSettings(settings) ?? null,
    version: null,
  };
}

async function probeCli(
  providerId: CliProviderId,
  settings: Record<string, unknown>,
): Promise<CliDiagnosticResult> {
  const initial = initialDiagnostic(providerId, settings);
  const host = ProviderWorkspaceRegistry.getHostServices();
  if (!initial.path) return { ...initial, error: t('settings.cliProvider.diagnosticPathMissing') };
  if (!host) return { ...initial, error: t('settings.cliProvider.diagnosticUnavailable') };

  let executable = initial.path;
  let args = ['--version'];
  if (cliPathRequiresNode(executable)) {
    const node = await host.environment.findExecutable('node');
    if (!node) return { ...initial, error: t('settings.cliProvider.diagnosticNodeMissing') };
    args = [executable, '--version'];
    executable = node;
  }

  try {
    const cwd = host.environment.homeDirectory() ?? '.';
    const result = await runProcess(executable, args, cwd);
    const login = await probeLogin(providerId, executable, initial.path, cwd);
    return {
      ...initial,
      error: result.error,
      login,
      version: result.output || null,
    };
  } catch (error) {
    return { ...initial, error: error instanceof Error ? error.message : String(error) };
  }
}

async function probeLogin(
  providerId: CliProviderId,
  executable: string,
  cliPath: string,
  cwd: string,
): Promise<string> {
  const providerArgs: Record<CliProviderId, string[]> = {
    claude: ['auth', 'status'],
    codex: ['login', 'status'],
    opencode: ['providers', 'list'],
  };
  const args = cliPathRequiresNode(cliPath)
    ? [cliPath, ...providerArgs[providerId]]
    : providerArgs[providerId];
  try {
    const result = await runProcess(executable, args, cwd);
    if (result.error) return t('common.disabled');
    if (providerId === 'opencode' && /\b0 credentials\b/i.test(result.output)) {
      return t('common.disabled');
    }
    return t('common.enabled');
  } catch {
    return t('common.disabled');
  }
}

async function runProcess(executable: string, args: string[], cwd: string): Promise<{ error: string | null; output: string }> {
  const host = ProviderWorkspaceRegistry.getHostServices();
  if (!host) throw new Error(t('settings.cliProvider.diagnosticUnavailable'));
  const session = await host.processes.start({ executable, args, cwd, stdioMode: 'pipe' });
  let output = '';
  const consume = (chunk: string): void => { output = `${output}${chunk}`.slice(-4_000); };
  const removeStdout = session.onStdout(consume);
  const removeStderr = session.onStderr(consume);
  const exit = await new Promise<{ code: number | null }>((resolve) => {
    const timeout = setTimeout(() => {
      void session.terminate({ gracePeriodMs: 500, reason: 'timeout' }).then(result => resolve({ code: result.code }));
    }, 10_000);
    session.onExit(result => {
      clearTimeout(timeout);
      resolve({ code: result.code });
    });
  });
  removeStdout();
  removeStderr();
  await session.dispose();
  const trimmed = output.trim();
  return {
    error: exit.code === 0 ? null : `${t('settings.cliProvider.diagnosticExitCode')}: ${exit.code ?? t('common.unknown')}`,
    output: trimmed,
  };
}

function renderDiagnostic(output: HTMLElement, result: CliDiagnosticResult): void {
  output.textContent = renderDiagnosticText(result);
}

function renderDiagnosticText(result: CliDiagnosticResult): string {
  return [
    `${t('settings.cliProvider.diagnosticPath')}: ${result.path ?? t('common.unknown')}`,
    `${t('settings.cliProvider.diagnosticArchitecture')}: ${result.architecture}`,
    `${t('settings.cliProvider.diagnosticVersion')}: ${result.version ?? t('common.unknown')}`,
    `${t('settings.cliProvider.diagnosticLogin')}: ${result.login}`,
    `${t('settings.cliProvider.diagnosticLatestError')}: ${result.error ?? t('common.unknown')}`,
  ].join('\n');
}

function redactDiagnostic(value: string): string {
  return value
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;"'}]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|secret|password)\s*[=:]\s*["']?)[^\s,;"'}]+/gi, '$1[REDACTED]');
}
