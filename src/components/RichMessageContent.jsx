import React from 'react';
import {
  parseMessageWithSectionLinks,
  tokenizeInlineRichText,
  resolveSectionHref
} from '../utils/richMessageParser';

/**
 * Renders detailed AI responses cleanly with:
 * - Structured paragraphs, bold emphasis, inline code, and clickable inline links
 * - Dedicated clickable Primary + Related Section Navigation pills extracted from "Relevant sections: ..."
 * - Zero dangerouslySetInnerHTML (100% XSS-safe)
 */
export default function RichMessageContent({
  text = '',
  isUser = false,
  siteBaseUrl = '',
  onSectionNavigate = null,
  compact = false
}) {
  const raw = String(text || '');
  if (!raw) return null;

  if (isUser) {
    return <div className="whitespace-pre-wrap break-words leading-relaxed">{raw}</div>;
  }

  const { bodyText, sectionLinks } = parseMessageWithSectionLinks(raw);
  const lines = bodyText.split('\n');

  const handleLinkClick = (e, label, href, linkMeta = null) => {
    const resolved = resolveSectionHref(href, siteBaseUrl);

    // 1. If a matching element with that ID exists on the current page, smooth-scroll cleanly (zero blue box!)
    if (resolved.hashId && typeof document !== 'undefined') {
      const el = document.getElementById(resolved.hashId);
      if (el && typeof el.scrollIntoView === 'function') {
        e.preventDefault();
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }

    // 2. If it resolves to a real external http(s) URL, allow default target="_blank" navigation
    if (resolved.isExternal && resolved.resolvedUrl) {
      return;
    }

    // 3. Otherwise delegate to Studio callback (e.g. open matching uploaded file / Live Files preview)
    if (typeof onSectionNavigate === 'function') {
      e.preventDefault();
      onSectionNavigate({ label, href, ...(linkMeta || {}) });
    }
  };

  return (
    <div className="space-y-1.5 break-words leading-relaxed">
      <div className="whitespace-pre-wrap break-words leading-relaxed">
        {lines.map((line, lineIdx) => {
          const tokens = tokenizeInlineRichText(line);
          return (
            <React.Fragment key={lineIdx}>
              {tokens.map((tok, tokIdx) => {
                if (tok.type === 'bold') {
                  return <strong key={tokIdx} className="font-semibold text-slate-900">{tok.text}</strong>;
                }
                if (tok.type === 'code') {
                  return (
                    <code
                      key={tokIdx}
                      className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[0.9em] text-indigo-700"
                    >
                      {tok.text}
                    </code>
                  );
                }
                if (tok.type === 'link') {
                  const resolved = resolveSectionHref(tok.href, siteBaseUrl);
                  return (
                    <a
                      key={tokIdx}
                      href={resolved.resolvedUrl || tok.href}
                      target={resolved.isExternal ? '_blank' : undefined}
                      rel={resolved.isExternal ? 'noopener noreferrer' : undefined}
                      onClick={(e) => handleLinkClick(e, tok.text, tok.href)}
                      className="text-indigo-600 hover:text-indigo-800 underline underline-offset-2 font-medium cursor-pointer"
                    >
                      {tok.text}
                    </a>
                  );
                }
                return <React.Fragment key={tokIdx}>{tok.text}</React.Fragment>;
              })}
              {lineIdx < lines.length - 1 && '\n'}
            </React.Fragment>
          );
        })}
      </div>

      {sectionLinks.length > 0 && (
        <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'pt-1.5' : 'pt-2'} border-t border-slate-100`}>
          {sectionLinks.slice(0, 3).map((link, idx) => {
            const resolved = resolveSectionHref(link.href, siteBaseUrl);
            const isPrimary = idx === 0 || link.role === 'primary';
            return (
              <a
                key={`${link.href}-${idx}`}
                href={resolved.resolvedUrl || link.href}
                target={resolved.isExternal ? '_blank' : undefined}
                rel={resolved.isExternal ? 'noopener noreferrer' : undefined}
                onClick={(e) => handleLinkClick(e, link.label, link.href, link)}
                className={`inline-flex items-center gap-1 rounded-lg transition-all cursor-pointer no-underline ${
                  compact ? 'px-2 py-1 text-[10.5px]' : 'px-2.5 py-1 text-[11.5px]'
                } ${
                  isPrimary
                    ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-semibold shadow-2xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 font-medium'
                }`}
                title={`Navigate to ${link.label} (${link.href})`}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
                <span className="opacity-70">→</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
