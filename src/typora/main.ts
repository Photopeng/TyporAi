import { mountApp } from '../bootstrap/mount';

function boot(): void {
  void mountApp().catch((error) => {
    const root = document.getElementById('typorai-typora-root') ?? document.body.appendChild(document.createElement('section'));
    root.id = 'typorai-typora-root';
    root.textContent = error instanceof Error ? error.message : String(error);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
