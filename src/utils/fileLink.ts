/**
 * TyporAi - File Link Utilities
 *
 * Detects Typora-compatible wikilinks in rendered content and opens workspace files.
 */

interface FileLinkHost {
  metadataCache: { getFirstLinkpathDest(path: string, sourcePath: string): unknown };
  vault: { getAbstractFileByPath(path: string): unknown };
  workspace: { openLinkText(path: string, sourcePath?: string, mode?: string): Promise<void> | void };
}

interface DomEventOwner {
  registerDomEvent<K extends keyof HTMLElementEventMap>(
    element: HTMLElement,
    type: K,
    callback: (event: HTMLElementEventMap[K]) => void,
  ): void;
}

/**
 * Regex pattern to match Typora wikilinks in text content.
 *
 * Matches:
 * - Standard wikilinks: [[note]] or [[folder/note]]
 * - Wikilinks with display text: [[note|display text]]
 * - Wikilinks with headings: [[note#heading]]
 * - Wikilinks with block references: [[note^block]]
 *
 * Does NOT match image embeds ![[image.png]] (those are handled separately).
 */
const WIKILINK_PATTERN_SOURCE = '(?<!!)\\[\\[([^\\]|#^]+)(?:#[^\\]|]+)?(?:\\^[^\\]|]+)?(?:\\|[^\\]]+)?\\]\\]';

/** Creates a fresh regex instance to avoid global state issues */
function createWikilinkPattern(): RegExp {
  return new RegExp(WIKILINK_PATTERN_SOURCE, 'g');
}

interface WikilinkMatch {
  index: number;
  fullMatch: string;
  linkPath: string;
  linkTarget: string;
  displayText: string;
}

function buildWikilinkMatch(
  fullMatch: string,
  linkPath: string,
  index: number
): WikilinkMatch {
  const pipeIndex = fullMatch.lastIndexOf('|');
  const displayText = pipeIndex > 0 ? fullMatch.slice(pipeIndex + 1, -2) : linkPath;

  return {
    index,
    fullMatch,
    linkPath,
    linkTarget: extractLinkTarget(fullMatch),
    displayText,
  };
}

export function extractLinkTarget(fullMatch: string): string {
  const inner = fullMatch.slice(2, -2);
  const pipeIndex = inner.indexOf('|');
  return pipeIndex >= 0 ? inner.slice(0, pipeIndex) : inner;
}

/**
 * Finds all wikilinks in text that exist in the vault.
 * Sorted by index descending for end-to-start processing.
 */
function findWikilinks(app: FileLinkHost, text: string): WikilinkMatch[] {
  const pattern = createWikilinkPattern();
  const matches: WikilinkMatch[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const fullMatch = match[0];
    const linkPath = match[1];

    if (!fileExistsInWorkspace(app, linkPath)) continue;

    matches.push(buildWikilinkMatch(fullMatch, linkPath, match.index));
  }

  return matches.sort((a, b) => b.index - a.index);
}

function fileExistsInWorkspace(app: FileLinkHost, linkPath: string): boolean {
  const file = app.metadataCache.getFirstLinkpathDest(linkPath, '');
  if (file) {
    return true;
  }

  const directFile = app.vault.getAbstractFileByPath(linkPath);
  if (directFile) {
    return true;
  }

  if (!linkPath.endsWith('.md')) {
    const withExt = app.vault.getAbstractFileByPath(linkPath + '.md');
    if (withExt) {
      return true;
    }
  }

  return false;
}

function extractLinkPathFromTarget(linkTarget: string): string {
  const subpathIndex = linkTarget.search(/[#^]/);
  return subpathIndex >= 0 ? linkTarget.slice(0, subpathIndex) : linkTarget;
}

/**
 * Creates a link element for a wikilink.
 * Click handling is done via event delegation in registerFileLinkHandler.
 */
function createWikilink(
  ownerDocument: Document,
  linkTarget: string,
  displayText: string
): HTMLElement {
  const link = ownerDocument.createElement('a');
  link.className = 'typorai-file-link internal-link';
  link.textContent = displayText;
  link.setAttribute('data-href', linkTarget);
  link.setAttribute('href', linkTarget);
  return link;
}

function repairEmptyInternalLink(app: FileLinkHost, link: HTMLAnchorElement): void {
  if ((link.textContent || '').trim()) return;

  const linkTarget = link.dataset.href || link.getAttribute('data-href') || link.getAttribute('href');
  if (!linkTarget) return;

  const linkPath = extractLinkPathFromTarget(linkTarget);
  if (!linkPath || !fileExistsInWorkspace(app, linkPath)) return;

  link.classList.add('typorai-file-link');
  if (!link.dataset.href) {
    link.setAttribute('data-href', linkTarget);
  }
  link.textContent = linkTarget;
}

/**
 * Registers a delegated click handler for file links on a container.
 * Should be called once on the messages container.
 * Handles both our custom .typorai-file-link and Typora's .internal-link.
 */
export function registerFileLinkHandler(
  app: FileLinkHost,
  container: HTMLElement,
  component: DomEventOwner
): void {
  component.registerDomEvent(container, 'click', (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    // Handle both our links and Typora's internal links
    const link = target.closest('.typorai-file-link, .internal-link') as HTMLAnchorElement;

    if (link) {
      event.preventDefault();
      const linkTarget = link.dataset.href || link.getAttribute('href');
      if (linkTarget) {
        void app.workspace.openLinkText(linkTarget, '', 'tab');
      }
    }
  });
}

function buildFragmentWithLinks(ownerDocument: Document, text: string, matches: WikilinkMatch[]): DocumentFragment {
  const fragment = ownerDocument.createDocumentFragment();
  let currentIndex = text.length;

  for (const { index, fullMatch, linkTarget, displayText } of matches) {
    const endIndex = index + fullMatch.length;

    if (endIndex < currentIndex) {
      fragment.insertBefore(
        ownerDocument.createTextNode(text.slice(endIndex, currentIndex)),
        fragment.firstChild
      );
    }

    fragment.insertBefore(createWikilink(ownerDocument, linkTarget, displayText), fragment.firstChild);
    currentIndex = index;
  }

  if (currentIndex > 0) {
    fragment.insertBefore(
      ownerDocument.createTextNode(text.slice(0, currentIndex)),
      fragment.firstChild
    );
  }

  return fragment;
}

function processTextNode(app: FileLinkHost, node: Text): boolean {
  const text = node.textContent;
  if (!text || !text.includes('[[')) return false;

  const matches = findWikilinks(app, text);
  if (matches.length === 0) return false;

  node.parentNode?.replaceChild(buildFragmentWithLinks(node.ownerDocument, text, matches), node);
  return true;
}

/**
 * Call after MarkdownRenderer.renderMarkdown().
 * Catches wikilinks that remain as raw text after rendering, especially inline code spans.
 */
export function processFileLinks(app: FileLinkHost, container: HTMLElement): void {
  if (!app || !container) return;

  // Repair resolved internal links that rendered as empty anchors.
  container.querySelectorAll('a.internal-link').forEach((linkEl) => {
    repairEmptyInternalLink(app, linkEl as HTMLAnchorElement);
  });

  // Wikilinks in inline code aren't rendered by Typora's MarkdownRenderer
  container.querySelectorAll('code').forEach((codeEl) => {
    if (codeEl.parentElement?.tagName === 'PRE') return;

    const text = codeEl.textContent;
    if (!text || !text.includes('[[')) return;

    const matches = findWikilinks(app, text);
    if (matches.length === 0) return;

    codeEl.textContent = '';
    codeEl.appendChild(buildFragmentWithLinks(container.ownerDocument, text, matches));
  });

  const walker = container.ownerDocument.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const tagName = parent.tagName.toUpperCase();
        if (tagName === 'PRE' || tagName === 'CODE' || tagName === 'A') {
          return NodeFilter.FILTER_REJECT;
        }

        if (parent.closest('pre, code, a, .typorai-file-link, .internal-link')) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  // Modifying DOM while walking causes issues, so collect first
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }

  for (const textNode of textNodes) {
    processTextNode(app, textNode);
  }
}
