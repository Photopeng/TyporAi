export type HotkeyScope = 'global' | 'panel' | 'editor';

export interface HotkeyAdapter {
  register(scope: HotkeyScope, combo: string, handler: (event: KeyboardEvent) => void): string;
  unregister(id: string): void;
  unregisterAll(): void;
}

interface HotkeyRegistration {
  id: string;
  scope: HotkeyScope;
  combo: string;
  handler: (event: KeyboardEvent) => void;
}

export interface DomHotkeyAdapterOptions {
  panelRoot?: HTMLElement | null;
  editorRoot?: HTMLElement | null;
  platform?: 'windows' | 'macos' | 'linux' | 'unknown';
}

export class DomHotkeyAdapter implements HotkeyAdapter {
  private registrations = new Map<string, HotkeyRegistration>();
  private nextId = 0;
  private readonly listener = (event: KeyboardEvent): void => this.dispatch(event);

  constructor(private readonly options: DomHotkeyAdapterOptions = {}) {
    document.addEventListener('keydown', this.listener);
  }

  register(scope: HotkeyScope, combo: string, handler: (event: KeyboardEvent) => void): string {
    const id = `hotkey-${++this.nextId}`;
    this.registrations.set(id, {
      id,
      scope,
      combo: normalizeCombo(combo, this.options.platform),
      handler,
    });
    return id;
  }

  unregister(id: string): void {
    this.registrations.delete(id);
  }

  unregisterAll(): void {
    this.registrations.clear();
    document.removeEventListener('keydown', this.listener);
  }

  private dispatch(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }

    const actual = comboFromEvent(event);
    for (const registration of this.registrations.values()) {
      if (registration.combo !== actual) continue;
      if (!this.scopeMatches(registration.scope)) continue;

      registration.handler(event);
      if (event.defaultPrevented) {
        break;
      }
    }
  }

  private scopeMatches(scope: HotkeyScope): boolean {
    if (scope === 'global') return true;

    const active = document.activeElement;
    if (!active) return false;

    const root = scope === 'panel'
      ? this.options.panelRoot
      : this.options.editorRoot;
    return !!root && root.contains(active);
  }
}

function comboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Ctrl');
  if (event.metaKey) parts.push('Meta');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(normalizeKey(event.key));
  return parts.join('+');
}

function normalizeCombo(
  combo: string,
  platform: DomHotkeyAdapterOptions['platform'],
): string {
  return combo
    .split('+')
    .map(part => part.trim().toLowerCase() === 'mod'
      ? (platform === 'macos' ? 'Meta' : 'Ctrl')
      : normalizeKey(part.trim()))
    .filter(Boolean)
    .join('+');
}

function normalizeKey(key: string): string {
  if (key.length === 1) return key.toUpperCase();
  const lower = key.toLowerCase();
  if (lower === 'control') return 'Ctrl';
  if (lower === 'cmd' || lower === 'command') return 'Meta';
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
