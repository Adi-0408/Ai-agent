/**
 * Pure parser for Rich AI Messages:
 * - Extracts trailing "Relevant sections: [Label](href) · [Related](href2)" into clickable pill descriptors
 * - Tokenizes inline markdown (**bold**, `code`, [Label](url), and bare https:// URLs) safely with zero HTML injection
 * - Strips markdown/link metadata for clean natural Text-to-Speech (TTS) audio
 */

export function classifySectionLinkIcon(label = '', href = '') {
  const combined = `${label} ${href}`.toLowerCase();
  if (/\b(form|apply|register|admission\s+form|enroll|checkout|inquiry|booking\s+form)\b/i.test(combined)) {
    return { icon: '📝', targetType: 'form' };
  }
  if (/\b(dashboard|analytics|chart|graph|report|table|metrics|kpi|stats)\b/i.test(combined)) {
    return { icon: '📊', targetType: 'dashboard' };
  }
  if (/^https?:\/\//i.test(href) || (href.startsWith('/') && href !== '/' && !href.startsWith('/#'))) {
    return { icon: '↗', targetType: 'page' };
  }
  return { icon: '📍', targetType: 'section' };
}

/**
 * Extracts structured section links from trailing "Relevant sections: [Label](href) · ..."
 * and returns { bodyText, sectionLinks }.
 */
export function parseMessageWithSectionLinks(rawText = '') {
  const str = String(rawText || '');
  if (!str) return { bodyText: '', sectionLinks: [] };

  const sectionLinks = [];
  const seen = new Set();

  // Match trailing or standalone "Relevant sections: [Label](href) · [Label2](href2)"
  const relBlockRe = /(?:^|\n\s*|\s+)Relevant\s+sections:\s*([^\n]+)$/i;
  const match = str.match(relBlockRe);
  let bodyText = str;

  if (match && match[1]) {
    const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    let lm;
    while ((lm = linkRe.exec(match[1])) !== null) {
      const label = lm[1].trim();
      const href = lm[2].trim();
      if (!label || !href) continue;
      // Only allow safe protocols / relative paths / hash anchors (block javascript: / data:)
      if (/^\s*(?:javascript|vbscript|data):/i.test(href)) continue;
      const key = `${label.toLowerCase()}::${href.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { icon, targetType } = classifySectionLinkIcon(label, href);
      sectionLinks.push({
        label,
        href,
        icon,
        targetType,
        role: sectionLinks.length === 0 ? 'primary' : 'related'
      });
    }

    if (sectionLinks.length > 0) {
      bodyText = str.slice(0, match.index).trim();
    }
  }

  return { bodyText, sectionLinks };
}

/**
 * Tokenizes a single line of text into safe structured spans:
 * { type: 'text' | 'bold' | 'code' | 'link', text, href? }
 */
export function tokenizeInlineRichText(line = '') {
  const str = String(line || '');
  if (!str) return [];

  const tokens = [];
  const pattern = /(\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(https?:\/\/[^\s<>"')\]]+))/g;
  let lastIdx = 0;
  let m;

  while ((m = pattern.exec(str)) !== null) {
    if (m.index > lastIdx) {
      tokens.push({ type: 'text', text: str.slice(lastIdx, m.index) });
    }
    if (m[2] !== undefined && m[3] !== undefined) {
      const href = m[3].trim();
      if (/^\s*(?:javascript|vbscript|data):/i.test(href)) {
        tokens.push({ type: 'text', text: m[2] });
      } else {
        tokens.push({ type: 'link', text: m[2].trim(), href });
      }
    } else if (m[4] !== undefined) {
      tokens.push({ type: 'bold', text: m[4] });
    } else if (m[5] !== undefined) {
      tokens.push({ type: 'code', text: m[5] });
    } else if (m[6] !== undefined) {
      const cleanedUrl = m[6].replace(/[.,;:!?]+$/, '');
      const trailingPunct = m[6].slice(cleanedUrl.length);
      tokens.push({ type: 'link', text: cleanedUrl, href: cleanedUrl });
      if (trailingPunct) tokens.push({ type: 'text', text: trailingPunct });
    }
    lastIdx = pattern.lastIndex;
  }

  if (lastIdx < str.length) {
    tokens.push({ type: 'text', text: str.slice(lastIdx) });
  }

  return tokens;
}

/**
 * Resolves a section link's href safely for navigation:
 * - Absolute https:// URLs stay as-is
 * - Relative paths / #anchors resolve against siteBaseUrl when provided
 */
export function resolveSectionHref(href = '', siteBaseUrl = '') {
  const cleanHref = String(href || '').trim();
  if (!cleanHref || /^\s*(?:javascript|vbscript|data):/i.test(cleanHref)) {
    return { resolvedUrl: '', isExternal: false, isHashOnly: false, hashId: '' };
  }
  if (/^https?:\/\//i.test(cleanHref)) {
    return { resolvedUrl: cleanHref, isExternal: true, isHashOnly: false, hashId: '' };
  }
  if (cleanHref.startsWith('#')) {
    const hashId = cleanHref.slice(1);
    if (siteBaseUrl && /^https?:\/\//i.test(siteBaseUrl)) {
      const base = siteBaseUrl.replace(/\/+$/, '');
      return { resolvedUrl: `${base}/${cleanHref}`, isExternal: true, isHashOnly: false, hashId };
    }
    return { resolvedUrl: cleanHref, isExternal: false, isHashOnly: true, hashId };
  }
  if (siteBaseUrl && /^https?:\/\//i.test(siteBaseUrl)) {
    try {
      const joined = new URL(cleanHref, siteBaseUrl).toString();
      return { resolvedUrl: joined, isExternal: true, isHashOnly: false, hashId: '' };
    } catch (_) {}
  }
  return { resolvedUrl: cleanHref, isExternal: false, isHashOnly: false, hashId: '' };
}

/**
 * Strips markdown link brackets, URLs, and trailing "Relevant sections:" block
 * so Voice Sandbox / TTS speaks clean, natural prose.
 */
export function stripLinksForSpeech(rawText = '') {
  const { bodyText } = parseMessageWithSectionLinks(rawText);
  return String(bodyText || '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*#_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
