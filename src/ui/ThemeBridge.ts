export class ThemeBridge {
  apply(surface: HTMLElement, source: HTMLElement = document.body): void {
    const style = getComputedStyle(source);
    const background = style.backgroundColor || '#ffffff';
    const foreground = style.color || '#1f2937';
    const dark = this.isDark(background);
    surface.classList.toggle('theme-dark', dark);
    surface.classList.toggle('theme-light', !dark);
    surface.style.setProperty('--typorai-surface', background);
    surface.style.setProperty('--typorai-foreground', foreground);
  }

  private isDark(color: string): boolean {
    const values = color.match(/\d+/g)?.slice(0, 3).map(Number);
    return values ? (values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722) < 128 : false;
  }
}
