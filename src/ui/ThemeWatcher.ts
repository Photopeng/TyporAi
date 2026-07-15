import { ThemeBridge } from './ThemeBridge';

export interface ThemeWatchHandle {
  observer: MutationObserver | null;
  dispose(): void;
}

export interface ThemeWatchOptions {
  frames?: number;
}

export function watchTheme(
  surface: HTMLElement,
  bridge: Pick<ThemeBridge, 'apply'> = new ThemeBridge(),
  options: ThemeWatchOptions = {},
): ThemeWatchHandle {
  const apply = (): void => bridge.apply(surface);
  let frame: number | null = null;
  const frameCount = Math.max(1, options.frames ?? 1);
  const schedule = (): void => {
    if (frame !== null) return;
    let remainingFrames = frameCount;
    const next = (): void => {
      frame = requestAnimationFrame(() => {
        remainingFrames -= 1;
        if (remainingFrames > 0) {
          next();
          return;
        }
        frame = null;
        apply();
      });
    };
    next();
  };
  let observer: MutationObserver | null = null;
  if (typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  }

  let detachMatchMedia: (() => void) | null = null;
  if (typeof window.matchMedia === 'function') {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', schedule);
      detachMatchMedia = () => media.removeEventListener('change', schedule);
    } else if (typeof media.addListener === 'function') {
      media.addListener(schedule);
      detachMatchMedia = () => media.removeListener(schedule);
    }
  }
  apply();
  return {
    observer,
    dispose: () => {
      observer?.disconnect();
      detachMatchMedia?.();
      if (frame !== null) cancelAnimationFrame(frame);
      observer = null;
      detachMatchMedia = null;
    },
  };
}
