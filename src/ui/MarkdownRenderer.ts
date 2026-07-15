function appendInline(parent: HTMLElement, text: string): void {
  const ownerDocument = parent.ownerDocument;
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|\$[^$\n]+\$)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parent.append(ownerDocument.createTextNode(text.slice(cursor, index)));
    const token = match[0];
    if (token.startsWith('`')) {
      const code = ownerDocument.createElement('code');
      code.textContent = token.slice(1, -1);
      parent.append(code);
    } else if (token.startsWith('**')) {
      const strong = ownerDocument.createElement('strong');
      strong.textContent = token.slice(2, -2);
      parent.append(strong);
    } else if (token.startsWith('*')) {
      const emphasis = ownerDocument.createElement('em');
      emphasis.textContent = token.slice(1, -1);
      parent.append(emphasis);
    } else if (token.startsWith('$')) {
      const math = ownerDocument.createElement('span');
      math.className = 'typorai-markdown-math-inline';
      math.dataset.math = token.slice(1, -1);
      math.textContent = token.slice(1, -1);
      parent.append(math);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        const anchor = ownerDocument.createElement('a');
        anchor.textContent = link[1];
        anchor.href = link[2];
        parent.append(anchor);
      }
    }
    cursor = index + token.length;
  }
  if (cursor < text.length) parent.append(ownerDocument.createTextNode(text.slice(cursor)));
}

function parseTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return null;
  const cells = trimmed.replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
  return cells.length > 1 ? cells : null;
}

function isTableSeparator(line: string): boolean {
  const cells = parseTableRow(line);
  return !!cells && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function appendSafeHtml(target: HTMLElement, html: string): void {
  const template = target.ownerDocument.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script,style,iframe,object,embed,link,meta').forEach(node => node.remove());
  template.content.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith('on') || (name === 'href' && value.startsWith('javascript:'))) {
        node.removeAttribute(attribute.name);
      }
    }
  });
  target.append(template.content);
}

export async function renderMarkdown(markdown: string, target: HTMLElement): Promise<void> {
  target.replaceChildren();
  const lines = markdown.split(/\r?\n/);
  let paragraph: string[] = [];
  let list: HTMLUListElement | HTMLOListElement | null = null;
  let code: HTMLPreElement | null = null;
  let mathBlock: HTMLElement | null = null;
  const flushParagraph = (): void => {
    if (!paragraph.length) return;
    const element = target.ownerDocument.createElement('p');
    appendInline(element, paragraph.join(' '));
    target.append(element);
    paragraph = [];
  };
  const flushList = (): void => { if (list) target.append(list); list = null; };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (line.startsWith('```')) {
      flushParagraph(); flushList();
      if (code) { target.append(code); code = null; }
      else {
        code = target.ownerDocument.createElement('pre');
        const inner = target.ownerDocument.createElement('code');
        const language = line.slice(3).trim();
        if (language) inner.className = `language-${language}`;
        code.append(inner);
      }
      continue;
    }
    if (code) {
      const inner = code.firstElementChild as HTMLElement;
      inner.textContent = `${inner.textContent ?? ''}${inner.textContent ? '\n' : ''}${line}`;
      continue;
    }
    if (line.trim() === '$$') {
      flushParagraph(); flushList();
      if (mathBlock) { target.append(mathBlock); mathBlock = null; }
      else {
        mathBlock = target.ownerDocument.createElement('div');
        mathBlock.className = 'typorai-markdown-math-block';
      }
      continue;
    }
    if (mathBlock) {
      mathBlock.textContent = `${mathBlock.textContent ?? ''}${mathBlock.textContent ? '\n' : ''}${line}`;
      mathBlock.dataset.math = mathBlock.textContent;
      continue;
    }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const tableHeader = parseTableRow(line);
    if (tableHeader && isTableSeparator(lines[index + 1] ?? '')) {
      flushParagraph(); flushList();
      const table = target.ownerDocument.createElement('table');
      const head = table.createTHead().insertRow();
      for (const cell of tableHeader) {
        const header = target.ownerDocument.createElement('th');
        appendInline(header, cell);
        head.append(header);
      }
      const body = table.createTBody();
      index += 2;
      while (index < lines.length) {
        const rowCells = parseTableRow(lines[index]);
        if (!rowCells) { index--; break; }
        const row = body.insertRow();
        for (const cell of rowCells) {
          const data = row.insertCell();
          appendInline(data, cell);
        }
        index++;
      }
      target.append(table);
      continue;
    }
    if (/^<\/?[A-Za-z][\s\S]*>$/.test(line.trim())) {
      flushParagraph(); flushList();
      appendSafeHtml(target, line);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList();
      const element = target.ownerDocument.createElement(`h${heading[1].length}`);
      appendInline(element, heading[2]); target.append(element); continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph(); flushList();
      const element = target.ownerDocument.createElement('blockquote');
      appendInline(element, quote[1]); target.append(element); continue;
    }
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const tag = ordered ? 'OL' : 'UL';
      if (!list || list.tagName !== tag) { flushList(); list = target.ownerDocument.createElement(ordered ? 'ol' : 'ul'); }
      const item = target.ownerDocument.createElement('li');
      appendInline(item, (unordered ?? ordered)?.[1] ?? ''); list.append(item); continue;
    }
    paragraph.push(line.trim());
  }
  if (code) target.append(code);
  if (mathBlock) target.append(mathBlock);
  flushParagraph(); flushList();
}
