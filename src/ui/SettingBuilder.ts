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
    onChange: (value: string) => void,
    description?: string,
  ): HTMLInputElement {
    const control = this.field(label, description);
    const input = document.createElement('input');
    input.type = 'text'; input.value = value; input.className = 'typorai-setting-input';
    input.addEventListener('input', () => onChange(input.value));
    control.append(input); return input;
  }

  textarea(
    label: string,
    value: string,
    onChange: (value: string) => void,
    description?: string,
  ): HTMLTextAreaElement {
    const control = this.field(label, description);
    const input = document.createElement('textarea');
    input.value = value;
    input.className = 'typorai-setting-input';
    input.addEventListener('input', () => onChange(input.value));
    control.append(input);
    return input;
  }

  select(
    label: string,
    value: string,
    options: Iterable<{ label: string; value: string }>,
    onChange: (value: string) => void,
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
    input.addEventListener('change', () => onChange(input.value));
    control.append(input);
    return input;
  }

  range(
    label: string,
    value: number,
    limits: { max: number; min: number; step: number },
    onChange: (value: number) => void,
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
      onChange(Number(input.value));
    });
    control.append(input, output);
    return input;
  }

  toggle(
    label: string,
    value: boolean,
    onChange: (value: boolean) => void,
    description?: string,
  ): HTMLInputElement {
    const control = this.field(label, description);
    const input = document.createElement('input');
    input.type = 'checkbox'; input.checked = value; input.className = 'typorai-setting-toggle';
    input.addEventListener('change', () => onChange(input.checked));
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
}
