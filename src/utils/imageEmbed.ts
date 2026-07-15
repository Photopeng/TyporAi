/**
 * TyporAi - Image Embed Utilities
 *
 * Replaces wikilink image embeds with HTML <img> tags
 * before MarkdownRenderer processes the content.
 *
 * Note: This is display-only - the agent still receives the wikilink text.
 */

import { escapeHtml } from './inlineEdit';

interface WorkspaceFileRef {
  path: string;
  basename: string;
}

interface ImageEmbedHost {
  vault: {
    getAbstractFileByPath(path: string): unknown;
    getResourcePath(file: WorkspaceFileRef): string;
  };
  metadataCache: {
    getFirstLinkpathDest(path: string, sourcePath: string): WorkspaceFileRef | null;
  };
}

function getWorkspaceFile(host: ImageEmbedHost, filePath: string): WorkspaceFileRef | null {
  const value = host.vault.getAbstractFileByPath(filePath);
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<WorkspaceFileRef>;
  return typeof candidate.path === 'string' && typeof candidate.basename === 'string'
    ? candidate as WorkspaceFileRef
    : null;
}

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'ico',
]);

const IMAGE_EMBED_PATTERN = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

interface ReplaceImageEmbedsOptions {
  mediaFolder?: string;
  sourcePath?: string;
}

function isImagePath(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return ext ? IMAGE_EXTENSIONS.has(ext) : false;
}

function resolveImageFile(
  app: ImageEmbedHost,
  imagePath: string,
  options: Required<ReplaceImageEmbedsOptions>
): WorkspaceFileRef | null {
  let file = getWorkspaceFile(app, imagePath);
  if (file) return file;

  if (options.mediaFolder) {
    const withFolder = `${options.mediaFolder}/${imagePath}`;
    file = getWorkspaceFile(app, withFolder);
    if (file) return file;
  }

  const resolved = app.metadataCache.getFirstLinkpathDest(imagePath, options.sourcePath);
  if (resolved) return resolved;

  return null;
}


/** Supports formats: "100" (width only) or "100x200" (width x height) */
function buildStyleAttribute(altText: string | undefined): string {
  if (!altText) return '';

  const dimMatch = altText.match(/^(\d+)(?:x(\d+))?$/);
  if (!dimMatch) return '';

  const width = dimMatch[1];
  const height = dimMatch[2];

  if (height) {
    return ` style="width: ${width}px; height: ${height}px;"`;
  }
  return ` style="width: ${width}px;"`;
}

function createImageHtml(
  app: ImageEmbedHost,
  file: WorkspaceFileRef,
  altText: string | undefined
): string {
  const src = app.vault.getResourcePath(file);
  const alt = escapeHtml(altText || file.basename);
  const style = buildStyleAttribute(altText);

  return `<span class="typorai-embedded-image"><img src="${escapeHtml(src)}" alt="${alt}" loading="lazy"${style}></span>`;
}

function createFallbackHtml(wikilink: string): string {
  return `<span class="typorai-embedded-image-fallback">${escapeHtml(wikilink)}</span>`;
}

function normalizeOptions(options?: string | ReplaceImageEmbedsOptions): Required<ReplaceImageEmbedsOptions> {
  if (typeof options === 'string') {
    return { mediaFolder: options, sourcePath: '' };
  }

  return {
    mediaFolder: options?.mediaFolder ?? '',
    sourcePath: options?.sourcePath ?? '',
  };
}

/**
 * Call before MarkdownRenderer.render().
 * Non-image embeds (e.g., ![[note.md]]) pass through unchanged.
 */
export function replaceImageEmbedsWithHtml(
  markdown: string,
  app: ImageEmbedHost,
  options?: string | ReplaceImageEmbedsOptions
): string {
  if (!app?.vault || !app?.metadataCache) {
    return markdown;
  }

  const normalizedOptions = normalizeOptions(options);

  // Reset lastIndex to avoid issues with global regex
  IMAGE_EMBED_PATTERN.lastIndex = 0;

  return markdown.replace(
    IMAGE_EMBED_PATTERN,
    (match, imagePath: string, altText: string | undefined) => {
      try {
        if (!isImagePath(imagePath)) {
          return match;
        }

        const file = resolveImageFile(app, imagePath, normalizedOptions);
        if (!file) {
          return createFallbackHtml(match);
        }

        return createImageHtml(app, file, altText);
      } catch {
        return createFallbackHtml(match);
      }
    }
  );
}
