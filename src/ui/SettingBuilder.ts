import { t } from '../i18n/i18n';

export class SettingBuilder {
  constructor(private readonly container: HTMLElement) {}

  heading(label: string): HTMLElement {
    const field = document.createElement('div');
    field.className = 'setting-item setting-item-heading';
    const info = document.createElement('div');
    info.className = 'setting-item-info';
    const name = document.createElement('div');
    name.className = 'setting-item-name';
    name.textContent = label;
    info.append(name);
    field.append(info);
    this.container.append(field);
    return field;
  }

  text(
    label: string,
    value: string,
    onChange: (value: string) => unknown,
    description?: string,
  ): HTMLInputElement {
    const control = this.field(label, description);
    const input = document.createElement('input');
    input.type = 'text'; input.value = value; input.className = 'typorai-setting-input';
    input.addEventListener('input', () => { void this.runChange(control, () => onChange(input.value)); });
    control.append(input); return input;
  }

  textarea(
    label: string,
    value: string,
    onChange: (value: string) => unknown,
    description?: string,
  ): HTMLTextAreaElement {
    const control = this.field(label, description);
    const input = document.createElement('textarea');
    input.value = value;
    input.className = 'typorai-setting-input';
    input.addEventListener('input', () => { void this.runChange(control, () => onChange(input.value)); });
    control.append(input);
    return input;
  }

  select(
    label: string,
    value: string,
    options: Iterable<{ label: string; value: string }>,
    onChange: (value: string) => unknown,
    description?: string,
  ): HTMLSelectElement {
    const control = this.field(label, description);
    const input = document.createElement('select');
    input.className = 'typorai-setting-input';
    for (const option of options) {
      const element = document.createElement('option');
      element.value = option.value;
      element.textContent = option.label;
      input.append(element);
    }
    input.value = value;
    input.addEventListener('change', () => { void this.runChange(control, () => onChange(input.value)); });
    control.append(input);
    return input;
  }

  range(
    label: string,
    value: number,
    limits: { max: number; min: number; step: number },
    onChange: (value: number) => unknown,
    description?: string,
  ): HTMLInputElement {
    const control = this.field(label, description);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(limits.min);
    input.max = String(limits.max);
    input.step = String(limits.step);
    input.value = String(value);
    input.className = 'typorai-setting-range';
    const output = document.createElement('output');
    output.className = 'typorai-setting-range-value';
    output.value = input.value;
    output.textContent = input.value;
    input.addEventListener('input', () => {
      output.value = input.value;
      output.textContent = input.value;
      void this.runChange(control, () => onChange(Number(input.value)));
    });
    control.append(input, output);
    return input;
  }

  toggle(
    label: string,
    value: boolean,
    onChange: (value: boolean) => unknown,
    description?: string,
  ): HTMLInputElement {
    const control = this.field(label, description);
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = value; input.className = 'typorai-setting-toggle';
    input.addEventListener('change', () => { void this.runChange(control, () => onChange(input.checked)); });
    control.append(input); return input;
  }

  private field(label: string, description?: string): HTMLElement {
    const field = document.createElement('div');
    field.className = 'setting-item';
    const info = document.createElement('div');
    info.className = 'setting-item-info';
    const name = document.createElement('div');
    name.className = 'setting-item-name';
    name.textContent = label;
    info.append(name);
    if (description) {
      const desc = document.createElement('div');
      desc.className = 'setting-item-description';
      desc.textContent = description;
      info.append(desc);
    }
    const control = document.createElement('div');
    control.className = 'setting-item-control';
    field.append(info, control);
    this.container.append(field);
    return control;
  }

  private async runChange(control: HTMLElement, change: () => unknown): Promise<void> {
    try {
      await change();
      this.showFeedback(control, t('common.success'), false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.showFeedback(control, `${t('common.error')}: ${detail}`, true);
    }
  }

  private showFeedback(control: HTMLElement, text: string, isError: boolean): void {
    const existing = control.querySelector<HTMLElement>('.typorai-setting-save-feedback');
    const feedback = existing ?? document.createElement('div');
    feedback.className = 'setting-item-description typorai-setting-save-feedback';
    feedback.setAttribute('role', 'status');
    feedback.textContent = text;
    feedback.classList.toggle('typorai-setting-validation-error', isError);
    if (!existing) control.append(feedback);
  }
}
