type IconChild = { tag: 'path' | 'circle' | 'line' | 'rect'; attributes: Record<string, string> };

const ICONS: Record<string, IconChild[]> = {
  'alert-circle': [{ tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' } }, { tag: 'path', attributes: { d: 'M12 8v4M12 16h.01' } }],
  bot: [{ tag: 'rect', attributes: { x: '4', y: '6', width: '16', height: '14', rx: '3' } }],
  check: [{ tag: 'path', attributes: { d: 'm5 12 4 4L19 6' } }],
  'check-circle': [{ tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' } }, { tag: 'path', attributes: { d: 'm8 12 3 3 5-6' } }],
  'clipboard-paste': [{ tag: 'rect', attributes: { x: '5', y: '4', width: '14', height: '17', rx: '2' } }, { tag: 'path', attributes: { d: 'M9 4V2h6v2M9 12h6M12 9l3 3-3 3' } }],
  clock: [{ tag: 'circle', attributes: { cx: '12', cy: '12', r: '9' } }, { tag: 'path', attributes: { d: 'M12 7v5l3 2' } }],
  copy: [{ tag: 'rect', attributes: { x: '8', y: '8', width: '11', height: '11', rx: '2' } }, { tag: 'path', attributes: { d: 'M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3' } }],
  download: [{ tag: 'path', attributes: { d: 'M12 3v12m-4-4 4 4 4-4M4 20h16' } }],
  dot: [{ tag: 'circle', attributes: { cx: '12', cy: '12', r: '2.5' } }],
  'dollar-sign': [{ tag: 'path', attributes: { d: 'M12 2v20M17 6.5C16 5.5 14.5 5 12.5 5 10 5 8 6.2 8 8s1.5 2.7 4.5 3.2S17 12.4 17 15s-2 4-5 4c-2.2 0-4-.7-5-2' } }],
  'external-link': [{ tag: 'path', attributes: { d: 'M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5' } }],
  file: [{ tag: 'path', attributes: { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6' } }],
  'file-pen': [{ tag: 'path', attributes: { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 17l5.5-5.5 2 2L11 19H9z' } }],
  'file-plus': [{ tag: 'path', attributes: { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M12 12v6M9 15h6' } }],
  'file-text': [{ tag: 'path', attributes: { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' } }, { tag: 'path', attributes: { d: 'M14 2v6h6M8 13h8M8 17h6' } }],
  folder: [{ tag: 'path', attributes: { d: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' } }],
  'folder-open': [{ tag: 'path', attributes: { d: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v1H5a2 2 0 0 0-1.9 1.4L3 14z' } }, { tag: 'path', attributes: { d: 'm3 14 1.1-2.6A2 2 0 0 1 6 10h15l-2 7a2 2 0 0 1-1.9 1.5H5a2 2 0 0 1-2-2z' } }],
  'folder-search': [{ tag: 'path', attributes: { d: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v4' } }, { tag: 'circle', attributes: { cx: '15', cy: '16', r: '3' } }, { tag: 'path', attributes: { d: 'm17.5 18.5 2 2M3 10h10' } }],
  'git-fork': [{ tag: 'circle', attributes: { cx: '6', cy: '4', r: '2' } }, { tag: 'circle', attributes: { cx: '18', cy: '4', r: '2' } }, { tag: 'circle', attributes: { cx: '12', cy: '20', r: '2' } }, { tag: 'path', attributes: { d: 'M6 6v3c0 3 2 4 6 4s6-1 6-4V6M12 13v5' } }],
  globe: [{ tag: 'circle', attributes: { cx: '12', cy: '12', r: '9' } }, { tag: 'path', attributes: { d: 'M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18' } }],
  'help-circle': [{ tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' } }, { tag: 'path', attributes: { d: 'M9.5 9a2.7 2.7 0 1 1 4.4 2.1c-1.2.8-1.9 1.3-1.9 2.9M12 18h.01' } }],
  list: [{ tag: 'path', attributes: { d: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01' } }],
  'list-checks': [{ tag: 'path', attributes: { d: 'm3 6 1.5 1.5L7 5M10 6h11m-18 6 1.5 1.5L7 11m3 1h11m-18 6 1.5 1.5L7 17m3 1h11' } }],
  'list-clock': [{ tag: 'path', attributes: { d: 'M4 6h10M4 11h8M4 16h6' } }, { tag: 'circle', attributes: { cx: '17', cy: '16', r: '4' } }, { tag: 'path', attributes: { d: 'M17 14v2l1.5 1' } }],
  'loader-2': [{ tag: 'path', attributes: { d: 'M21 12a9 9 0 1 1-6.2-8.6' } }],
  map: [{ tag: 'path', attributes: { d: 'm3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15' } }],
  'message-circle-plus': [{ tag: 'path', attributes: { d: 'M21 11a8 8 0 1 1-4-7M8 19l-5 2 2-5M18 2v6M15 5h6' } }],
  'message-square': [{ tag: 'path', attributes: { d: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z' } }],
  'message-square-dot': [{ tag: 'path', attributes: { d: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4zM8 11h.01M12 11h.01M16 11h.01' } }],
  package: [{ tag: 'path', attributes: { d: 'm12 2 9 5-9 5-9-5zM3 7v10l9 5 9-5V7M12 12v10' } }],
  'panel-right-close': [{ tag: 'rect', attributes: { x: '3', y: '3', width: '18', height: '18', rx: '2' } }, { tag: 'path', attributes: { d: 'M15 3v18m-4-6-3-3 3-3' } }],
  pencil: [{ tag: 'path', attributes: { d: 'm4 20 4.5-1 10-10-3.5-3.5-10 10zM13.5 7l3.5 3.5' } }],
  plus: [{ tag: 'path', attributes: { d: 'M12 5v14M5 12h14' } }],
  'refresh-cw': [{ tag: 'path', attributes: { d: 'M20 6v5h-5M4 18v-5h5M18.5 10A7 7 0 0 0 6 7M5.5 14A7 7 0 0 0 18 17' } }],
  'rotate-ccw': [{ tag: 'path', attributes: { d: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5' } }],
  search: [{ tag: 'circle', attributes: { cx: '11', cy: '11', r: '7' } }, { tag: 'path', attributes: { d: 'm16 16 5 5' } }],
  'search-check': [{ tag: 'circle', attributes: { cx: '10', cy: '10', r: '6' } }, { tag: 'path', attributes: { d: 'm14.5 14.5 5 5m-12-9 2 2 3-4' } }],
  settings: [{ tag: 'circle', attributes: { cx: '12', cy: '12', r: '3' } }, { tag: 'path', attributes: { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.09a2 2 0 0 1 1 1.74v.5a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z' } }],
  'sliders-horizontal': [{ tag: 'line', attributes: { x1: '4', y1: '6', x2: '20', y2: '6' } }, { tag: 'line', attributes: { x1: '4', y1: '12', x2: '20', y2: '12' } }, { tag: 'line', attributes: { x1: '4', y1: '18', x2: '20', y2: '18' } }, { tag: 'circle', attributes: { cx: '9', cy: '6', r: '2' } }, { tag: 'circle', attributes: { cx: '15', cy: '12', r: '2' } }, { tag: 'circle', attributes: { cx: '8', cy: '18', r: '2' } }],
  'square-plus': [{ tag: 'rect', attributes: { x: '3', y: '3', width: '18', height: '18', rx: '3' } }, { tag: 'path', attributes: { d: 'M12 8v8M8 12h8' } }],
  terminal: [{ tag: 'rect', attributes: { x: '3', y: '4', width: '18', height: '16', rx: '2' } }, { tag: 'path', attributes: { d: 'm7 9 3 3-3 3M13 15h4' } }],
  'toggle-left': [{ tag: 'rect', attributes: { x: '3', y: '7', width: '18', height: '10', rx: '5' } }, { tag: 'circle', attributes: { cx: '8', cy: '12', r: '3' } }],
  'toggle-right': [{ tag: 'rect', attributes: { x: '3', y: '7', width: '18', height: '10', rx: '5' } }, { tag: 'circle', attributes: { cx: '16', cy: '12', r: '3' } }],
  'trash-2': [{ tag: 'path', attributes: { d: 'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6' } }],
  wrench: [{ tag: 'path', attributes: { d: 'M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4L14 12l-2-2z' } }],
  x: [{ tag: 'path', attributes: { d: 'M18 6 6 18M6 6l12 12' } }],
  'x-circle': [{ tag: 'circle', attributes: { cx: '12', cy: '12', r: '10' } }, { tag: 'path', attributes: { d: 'm9 9 6 6m0-6-6 6' } }],
  zap: [{ tag: 'path', attributes: { d: 'm13 2-9 12h8l-1 8 9-12h-8z' } }],
};

export function setIcon(element: HTMLElement, icon: string): void {
  element.dataset.icon = icon;
  element.setAttribute('data-icon', icon);
  element.classList.add('typorai-icon-rendered');
  element.querySelectorAll('svg.typorai-inline-icon').forEach(existing => existing.remove());
  const owner = element.ownerDocument ?? document;
  const svg = owner.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('typorai-inline-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const child of ICONS[icon] ?? ICONS.wrench) {
    const node = owner.createElementNS('http://www.w3.org/2000/svg', child.tag);
    for (const [key, value] of Object.entries(child.attributes)) node.setAttribute(key, value);
    svg.appendChild(node);
  }
  if (typeof element.prepend === 'function') element.prepend(svg);
  else element.appendChild(svg);
}
