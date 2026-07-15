import { DisposableBag } from './DisposableBag';

const TOOLTIP_ATTR = 'data-typorai-tooltip';
const TOOLTIP_SHOW_DELAY_MS = 500;

export function setTyporAiTooltip(element: HTMLElement, text: string | null | undefined): void {
  element.title = '';
  element.removeAttribute('title');
  if (!text) {
    element.removeAttribute(TOOLTIP_ATTR);
    return;
  }

  element.setAttribute(TOOLTIP_ATTR, text);
}

export function installTyporAiTooltips(root: HTMLElement | Document = document): DisposableBag {
  const doc = root instanceof Document ? root : root.ownerDocument;
  const bag = new DisposableBag();
  let activeHost: HTMLElement | null = null;
  let tooltipEl: HTMLElement | null = null;
  let showTimer: number | null = null;

  const clearShowTimer = (): void => {
    if (showTimer !== null) {
      window.clearTimeout(showTimer);
      showTimer = null;
    }
  };

  const hide = (): void => {
    clearShowTimer();
    activeHost = null;
    tooltipEl?.remove();
    tooltipEl = null;
  };

  const getTooltipHost = (target: EventTarget | null): HTMLElement | null => {
    if (!(target instanceof Element)) return null;
    const host = target.closest<HTMLElement>(`[${TOOLTIP_ATTR}]`);
    if (!host) return null;
    host.title = '';
    host.removeAttribute('title');
    return host;
  };

  const positionTooltip = (): void => {
    if (!tooltipEl || !activeHost) return;
    const margin = 8;
    const gap = 7;
    const hostRect = activeHost.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const viewportWidth = doc.defaultView?.innerWidth ?? window.innerWidth;
    const viewportHeight = doc.defaultView?.innerHeight ?? window.innerHeight;

    let left = hostRect.left + hostRect.width / 2 - tooltipRect.width / 2;
    left = Math.max(margin, Math.min(left, viewportWidth - tooltipRect.width - margin));

    const hasSpaceBelow = hostRect.bottom + gap + tooltipRect.height + margin <= viewportHeight;
    const top = hasSpaceBelow
      ? hostRect.bottom + gap
      : Math.max(margin, hostRect.top - gap - tooltipRect.height);

    tooltipEl.style.left = `${Math.round(left)}px`;
    tooltipEl.style.top = `${Math.round(top)}px`;
    tooltipEl.dataset.placement = hasSpaceBelow ? 'bottom' : 'top';
  };

  const show = (host: HTMLElement): void => {
    const text = host.getAttribute(TOOLTIP_ATTR);
    if (!text) return;
    clearShowTimer();
    activeHost = host;
    tooltipEl?.remove();
    tooltipEl = doc.createElement('div');
    tooltipEl.className = 'typorai-floating-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    tooltipEl.textContent = text;
    doc.body.append(tooltipEl);
    positionTooltip();
    tooltipEl.classList.add('visible');
  };

  const scheduleShow = (host: HTMLElement): void => {
    if (activeHost === host && tooltipEl) return;
    clearShowTimer();
    showTimer = window.setTimeout(() => show(host), TOOLTIP_SHOW_DELAY_MS);
  };

  const onPointerOver = (event: PointerEvent): void => {
    const host = getTooltipHost(event.target);
    if (!host) return;
    if (event.relatedTarget instanceof Node && host.contains(event.relatedTarget)) return;
    scheduleShow(host);
  };

  const onPointerOut = (event: PointerEvent): void => {
    if (!activeHost) return;
    if (event.relatedTarget instanceof Node && activeHost.contains(event.relatedTarget)) return;
    hide();
  };

  const onFocusIn = (event: FocusEvent): void => {
    const host = getTooltipHost(event.target);
    if (host) show(host);
  };

  const onFocusOut = (): void => hide();
  const onReposition = (): void => positionTooltip();

  doc.addEventListener('pointerover', onPointerOver, true);
  doc.addEventListener('pointerout', onPointerOut, true);
  doc.addEventListener('focusin', onFocusIn, true);
  doc.addEventListener('focusout', onFocusOut, true);
  window.addEventListener('scroll', onReposition, true);
  window.addEventListener('resize', onReposition);

  bag.add(() => doc.removeEventListener('pointerover', onPointerOver, true));
  bag.add(() => doc.removeEventListener('pointerout', onPointerOut, true));
  bag.add(() => doc.removeEventListener('focusin', onFocusIn, true));
  bag.add(() => doc.removeEventListener('focusout', onFocusOut, true));
  bag.add(() => window.removeEventListener('scroll', onReposition, true));
  bag.add(() => window.removeEventListener('resize', onReposition));
  bag.add(hide);

  return bag;
}
