/**
 * Stage-1 Deep Website Workflow & Architecture Blueprint Analyzer
 * Inspects uploaded frontend/full-stack files (HTML, JSX, TSX, Vue, JS) BEFORE agent creation
 * to map:
 *   1. Routes & Pages (multi-page HTML files, React/Vue/Next routes, nav links)
 *   2. In-Page Sections & Anchor IDs (<section id="...">, <div id="...">, heading labels)
 *   3. Exact Forms & Input Fields (<form> blocks, action, name, fields, submit CTA, enclosing section/page)
 *   4. End-to-End Customer Workflow Graph & Website Role Summary
 *   5. Quick-Action Workflow Chips & Customer-Facing Workflow FAQs
 */

function trimToCompleteSentence(rawText = '', maxChars = 340) {
  const clean = String(rawText || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxChars) {
    return /[.!?।]$/.test(clean) ? clean : `${clean}.`;
  }
  const sliced = clean.slice(0, maxChars);
  const lastEnd = Math.max(sliced.lastIndexOf('. '), sliced.lastIndexOf('! '), sliced.lastIndexOf('? '), sliced.lastIndexOf('। '));
  if (lastEnd >= 45) {
    return sliced.slice(0, lastEnd + 1).trim();
  }
  const lastDot = Math.max(sliced.lastIndexOf('.'), sliced.lastIndexOf('!'), sliced.lastIndexOf('?'));
  if (lastDot >= 45) {
    return sliced.slice(0, lastDot + 1).trim();
  }
  const lastSpace = sliced.lastIndexOf(' ');
  const wordTrimmed = (lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced)
    .replace(/\b(?:with|for|to|and|or|of|in|at|by|from|the|a|an|as|on|into|through|including)\s*$/i, '')
    .trim();
  return /[.!?।]$/.test(wordTrimmed) ? wordTrimmed : `${wordTrimmed}.`;
}

function stripTags(html = '') {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[^}]{0,80}\}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanizeSlug(slug = '') {
  return String(slug || '')
    .replace(/^#/, '')
    .replace(/^\//, '')
    .replace(/\.(html?|jsx|tsx|vue|php)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function extractKeywords(...parts) {
  const stop = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'our', 'are', 'you', 'html', 'page', 'section', 'div', 'index', 'main', 'view', 'component']);
  const tokens = parts
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stop.has(w));
  return Array.from(new Set(tokens)).slice(0, 14);
}

function isFrontendSource(file) {
  const name = String(file?.name || file?.relativePath || '').toLowerCase();
  const content = String(file?.content || '');
  if (/\.(html?|jsx|tsx|vue|svelte)$/i.test(name)) return true;
  if (/\.(js|ts)$/i.test(name) && /(<form|<section|<Route|createBrowserRouter|href=|to=|document\.getElementById)/i.test(content)) return true;
  return /<!doctype html>|<html|<form|<section/i.test(content);
}

/**
 * Extract all routes/pages from uploaded files
 */
function extractRoutes(frontendFiles) {
  const routes = [];
  const seenPath = new Set();

  const addRoute = (rawPath, label = '', sourceFile = '', isPrimaryPage = false) => {
    const cleanPath = String(rawPath || '').trim();
    if (!cleanPath || cleanPath === '#' || cleanPath.startsWith('http') || cleanPath.startsWith('mailto:') || cleanPath.startsWith('tel:') || cleanPath.startsWith('javascript:')) return;
    if (cleanPath.startsWith('#')) return; // Handled in sections
    const normKey = cleanPath.toLowerCase().replace(/\/+$/, '') || '/';
    if (seenPath.has(normKey)) {
      if (label) {
        const existing = routes.find(r => r.path.toLowerCase().replace(/\/+$/, '') === normKey);
        if (existing && (!existing.label || existing.label === humanizeSlug(existing.path))) {
          existing.label = label;
          existing.keywords = extractKeywords(existing.path, label, existing.sourceFile);
        }
      }
      return;
    }
    seenPath.add(normKey);
    const finalLabel = (label && label.length >= 2 && label.length <= 60) ? label : (normKey === '/' ? 'Home' : humanizeSlug(cleanPath));
    routes.push({
      path: cleanPath.startsWith('/') || cleanPath.endsWith('.html') || cleanPath.endsWith('.htm') ? cleanPath : `/${cleanPath}`,
      label: finalLabel,
      sourceFile,
      isPrimaryPage,
      keywords: extractKeywords(cleanPath, finalLabel)
    });
  };

  for (const file of frontendFiles) {
    const fName = String(file.name || file.relativePath || '').split(/[\\/]/).pop() || '';
    const content = String(file.content || '');

    // 1. Multi-page HTML files themselves represent navigable routes
    if (/\.html?$/i.test(fName)) {
      const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      const pageLabel = stripTags(h1Match?.[1] || '') || stripTags(titleMatch?.[1] || '').split(/[|–—-]/)[0].trim() || humanizeSlug(fName);
      addRoute(fName.toLowerCase() === 'index.html' ? '/' : `/${fName}`, pageLabel, fName, true);
    }

    // 2. React Router / Vue Router <Route path="..." ...>
    const routeRegex = /<Route[^>]*path=["'`]([^"'`]+)["'`][^>]*(?:element=\{<\s*([A-Za-z0-9_]+)|component=\{?\s*([A-Za-z0-9_]+))?/gi;
    let m;
    while ((m = routeRegex.exec(content)) !== null) {
      const rPath = m[1];
      const compName = m[2] || m[3] || '';
      if (rPath && rPath !== '*') {
        addRoute(rPath, compName ? humanizeSlug(compName) : humanizeSlug(rPath), fName, true);
      }
    }

    // 3. Object-based router configs: { path: '/admissions', name: 'Admissions' }
    const objRouteRegex = /path\s*:\s*["'`]([^"'`]+)["'`](?:[^}]{0,120}(?:name|title|label)\s*:\s*["'`]([^"'`]+)["'`])?/gi;
    while ((m = objRouteRegex.exec(content)) !== null) {
      if (m[1] && m[1] !== '*' && !m[1].startsWith('/api/')) {
        addRoute(m[1], m[2] || humanizeSlug(m[1]), fName, true);
      }
    }

    // 4. Anchor / <Link> navigation tags: <a href="/apply.html">Apply Now</a> or <Link to="/checkout">Checkout</Link>
    const anchorRegex = /<(?:a|Link|NavLink)[^>]*(?:href|to)=["'`]([^"'`#][^"'`]*)["'`][^>]*>([\s\S]*?)<\/(?:a|Link|NavLink)>/gi;
    while ((m = anchorRegex.exec(content)) !== null) {
      const href = m[1].trim();
      const text = stripTags(m[2]);
      if (href && !/\.(css|js|png|jpg|jpeg|svg|ico|webp|woff2?|pdf)$/i.test(href) && !href.startsWith('http')) {
        addRoute(href, text || humanizeSlug(href), fName, false);
      }
    }
  }

  return routes.slice(0, 25);
}

function resolveFileRoutePath(fileName, routes = []) {
  const fName = String(fileName || '').split(/[\\/]/).pop() || '';
  if (/\.html?$/i.test(fName)) {
    return fName.toLowerCase() === 'index.html' ? '/' : `/${fName}`;
  }
  const baseSlug = fName.replace(/\.(jsx|tsx|vue|svelte|js|ts)$/i, '').replace(/page$/i, '').toLowerCase();
  if (baseSlug && baseSlug !== 'app' && baseSlug !== 'index' && baseSlug !== 'home' && baseSlug !== 'main') {
    const matched = (routes || []).find(r => {
      const rp = String(r.path || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const rl = String(r.label || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return rp === baseSlug || rl.includes(baseSlug) || baseSlug.includes(rp);
    });
    if (matched && matched.path) return matched.path;
  }
  return '/';
}

/**
 * Extract all in-page sections & anchor IDs with their exact headings and keywords
 */
function extractSections(frontendFiles, routes = []) {
  const sections = [];
  const seen = new Set();

  const addSection = (id, label, page, excerpt = '', pagePath = '/') => {
    const cleanId = String(id || '').replace(/^#/, '').trim();
    if (!cleanId || cleanId.length < 2 || cleanId.length > 60) return;
    if (/^(root|app|__next|voice-helpdesk-root|modal|overlay|backdrop|icon|svg|btn|button|input|label|nav-toggle|menu-btn|result[-_]|output[-_]|calc[-_]|display[-_]|total[-_]|error[-_]|status[-_]|badge[-_]|toast[-_]|alert[-_]|spinner[-_])/i.test(cleanId)) return;
    const key = `${cleanId.toLowerCase()}::${(page || '').toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);

    const finalLabel = (label && label.length >= 2 && label.length <= 75) ? label : humanizeSlug(cleanId);
    const fullHref = pagePath && pagePath !== '/' ? `${pagePath}#${cleanId}` : `#${cleanId}`;
    sections.push({
      id: cleanId,
      path: pagePath || '/',
      href: fullHref,
      label: finalLabel,
      page: page || 'index.html',
      excerpt: trimToCompleteSentence(excerpt, 480),
      keywords: extractKeywords(cleanId, finalLabel, excerpt.slice(0, 100))
    });
  };

  for (const file of frontendFiles) {
    const fName = String(file.name || file.relativePath || '').split(/[\\/]/).pop() || 'index.html';
    const content = String(file.content || '');
    const pagePath = resolveFileRoutePath(fName, routes);

    // 1. Match ONLY the opening tag so regex lastIndex NEVER consumes sibling <section> elements!
    const secOpenRegex = /<(section|div|article|main|footer|aside)\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = secOpenRegex.exec(content)) !== null) {
      const tag = m[1].toLowerCase();
      const id = m[2].trim();
      const afterOpen = content.slice(m.index + m[0].length, m.index + m[0].length + 1800);
      const closeIdx = afterOpen.search(new RegExp(`</${tag}>|<section\\b`, 'i'));
      const innerPreview = closeIdx >= 0 ? afterOpen.slice(0, closeIdx) : afterOpen;
      const hMatch = innerPreview.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
      const pMatch = innerPreview.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const heading = hMatch ? stripTags(hMatch[1]) : '';
      const para = pMatch ? stripTags(pMatch[1]) : '';

      const isSemanticId = /(section|course|program|fee|price|pricing|admission|apply|form|contact|about|service|product|catalog|menu|room|book|reserve|faq|eligib|document|checkout|cart|test-?drive|schedule|inventory|hero|feature|review|testimonial|support|location|hours|timing)/i.test(id);
      if (tag === 'section' || tag === 'footer' || heading || isSemanticId) {
        addSection(id, heading || humanizeSlug(id), fName, para, pagePath);
      }
    }

    // 2. In-page anchor links <a href="#fee-structure">Fee Structure</a>
    const hashLinkRegex = /<a[^>]*href=["']#([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    while ((m = hashLinkRegex.exec(content)) !== null) {
      const id = m[1].trim();
      const text = stripTags(m[2]);
      if (id) addSection(id, text || humanizeSlug(id), fName, '', pagePath);
    }
  }

  return sections.slice(0, 30);
}

/**
 * Extract all <form> blocks with exact form ID/name/action, nearest title, submit button label, and fields!
 */
function extractForms(frontendFiles, routes = []) {
  const forms = [];
  const seen = new Set();

  for (const file of frontendFiles) {
    const fName = String(file.name || file.relativePath || '').split(/[\\/]/).pop() || 'index.html';
    const content = String(file.content || '');
    const pageTitleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const pageTitle = pageTitleMatch ? stripTags(pageTitleMatch[1]).split(/[|–—-]/)[0].trim() : '';

    // Match every <form ...> ... </form> block
    const formRegex = /<form\b([^>]*)>([\s\S]*?)<\/form>/gi;
    let m;
    let formIdx = 0;
    while ((m = formRegex.exec(content)) !== null) {
      formIdx++;
      const attrs = m[1] || '';
      const body = m[2] || '';
      const startIndex = m.index;

      const idMatch = attrs.match(/\bid=["']([^"']+)["']/i);
      const nameMatch = attrs.match(/\bname=["']([^"']+)["']/i);
      const actionMatch = attrs.match(/\baction=["']([^"']+)["']/i);
      const classMatch = attrs.match(/\b(?:class|className)=["']([^"']+)["']/i);

      const formId = idMatch ? idMatch[1].trim() : '';
      const formName = nameMatch ? nameMatch[1].trim() : '';
      const formAction = actionMatch ? actionMatch[1].trim() : '';

      // Look back up to 500 chars before <form> to find enclosing section ID and heading
      const preceding = content.slice(Math.max(0, startIndex - 600), startIndex);
      const enclosingIds = Array.from(preceding.matchAll(/<(?:section|div|article|main)\b[^>]*\bid=["']([^"']+)["']/gi));
      const sectionId = formId || (enclosingIds.length > 0 ? enclosingIds[enclosingIds.length - 1][1].trim() : '');

      const precedingHeadings = Array.from(preceding.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi));
      const innerHeading = body.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
      const rawTitle = (innerHeading && stripTags(innerHeading[1])) ||
                       (precedingHeadings.length > 0 && stripTags(precedingHeadings[precedingHeadings.length - 1][1])) ||
                       (formId ? humanizeSlug(formId) : '') ||
                       (formName ? humanizeSlug(formName) : '') ||
                       pageTitle ||
                       `${humanizeSlug(fName)} Form`;

      // Extract submit button label
      const btnMatch = body.match(/<button[^>]*type=["']submit["'][^>]*>([\s\S]*?)<\/button>/i) ||
                       body.match(/<button[^>]*>([\s\S]*?)<\/button>/i) ||
                       body.match(/<input[^>]*type=["']submit["'][^>]*value=["']([^"']+)["']/i);
      const submitLabel = btnMatch ? stripTags(btnMatch[1]) : 'Submit';

      // Extract label map: for="fieldId" -> Label text
      const labelByFor = new Map();
      const labelMatches = body.matchAll(/<label[^>]*\b(?:for|htmlFor)=["']([^"']+)["'][^>]*>([\s\S]*?)<\/label>/gi);
      for (const lm of labelMatches) {
        const key = lm[1].trim().toLowerCase();
        const txt = stripTags(lm[2]).replace(/[*:]+\s*$/g, '').trim();
        if (key && txt) labelByFor.set(key, txt);
      }

      // Extract all form fields (<input>, <select>, <textarea>)
      const fields = [];
      const seenField = new Set();
      const fieldRegex = /<(input|select|textarea)\b([^>]*)>/gi;
      let fm;
      while ((fm = fieldRegex.exec(body)) !== null) {
        const tag = fm[1].toLowerCase();
        const fAttrs = fm[2] || '';
        const typeMatch = fAttrs.match(/\btype=["']([^"']+)["']/i);
        const fType = typeMatch ? typeMatch[1].toLowerCase() : (tag === 'select' ? 'select' : tag === 'textarea' ? 'textarea' : 'text');
        if (['hidden', 'submit', 'reset', 'button'].includes(fType)) continue;

        const fId = (fAttrs.match(/\bid=["']([^"']+)["']/i) || [])[1] || '';
        const fNameAttr = (fAttrs.match(/\bname=["']([^"']+)["']/i) || [])[1] || '';
        const fPlaceholder = (fAttrs.match(/\bplaceholder=["']([^"']+)["']/i) || [])[1] || '';
        const fAria = (fAttrs.match(/\baria-label=["']([^"']+)["']/i) || [])[1] || '';

        const fieldLabel =
          (fId && labelByFor.get(fId.toLowerCase())) ||
          (fNameAttr && labelByFor.get(fNameAttr.toLowerCase())) ||
          fAria ||
          (fPlaceholder && fPlaceholder.replace(/^(enter|select|choose|your)\s+/i, '').trim()) ||
          (fNameAttr ? humanizeSlug(fNameAttr) : '') ||
          (fId ? humanizeSlug(fId) : '');

        const cleanField = String(fieldLabel || '').replace(/[*:]+\s*$/g, '').trim();
        if (cleanField && cleanField.length >= 2 && cleanField.length <= 45 && !seenField.has(cleanField.toLowerCase())) {
          seenField.add(cleanField.toLowerCase());
          fields.push(cleanField);
        }
      }

      // Skip tiny search-bar-only forms if they only have 1 "search" field
      if (fields.length === 1 && /^search/i.test(fields[0]) && !/admission|apply|book|order|contact|register|checkout|enroll/i.test(rawTitle)) {
        continue;
      }

      const key = `${rawTitle.toLowerCase()}::${(sectionId || fName).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const targetPath = resolveFileRoutePath(fName, routes);
      const anchor = formId || sectionId;
      const fullHref = targetPath && targetPath !== '/'
        ? (anchor ? `${targetPath}#${anchor}` : targetPath)
        : (anchor ? `#${anchor}` : '');
      forms.push({
        id: formId || sectionId || `form_${formIdx}`,
        formId,
        formName,
        sectionId,
        action: formAction,
        page: fName,
        path: targetPath,
        href: fullHref,
        title: rawTitle.slice(0, 75),
        submitLabel: submitLabel.slice(0, 40),
        fields: fields.slice(0, 12),
        keywords: extractKeywords(rawTitle, formId, formName, sectionId, submitLabel, classMatch?.[1] || '', ...fields.slice(0, 6))
      });
    }
  }

  return forms.slice(0, 15);
}

/**
 * Synthesize end-to-end customer workflow steps & quick actions grounded in actual discovered files
 */
function buildWorkflowsAndSummary(blueprint, archetype, brandName) {
  const { routes, sections, forms } = blueprint;
  const workflows = [];

  const findSectionByPat = (pat) => sections.find(s => pat.test(`${s.id} ${s.label} ${(s.keywords || []).join(' ')}`));
  const findFormByPat = (pat) => forms.find(f => pat.test(`${f.title} ${f.id} ${f.submitLabel} ${(f.keywords || []).join(' ')}`));
  const findRouteByPat = (pat) => routes.find(r => pat.test(`${r.path} ${r.label} ${(r.keywords || []).join(' ')}`));

  const primaryForm =
    findFormByPat(/admission|application|apply|enroll|register|checkout|order|book|reserve|appointment|test.?drive|trial|signup|consult/i) ||
    forms[0] || null;
  const contactForm = findFormByPat(/contact|inquiry|enquiry|support|message|callback/i) || null;
  const catalogSection = findSectionByPat(/course|program|product|catalog|inventory|menu|dish|plan|pricing|room|vehicle|property|service/i) || sections[0] || null;
  const pricingSection = findSectionByPat(/fee|price|pricing|rate|plan|cost|tariff/i) || null;

  if (catalogSection) {
    workflows.push({
      step: workflows.length + 1,
      title: `Explore ${catalogSection.label}`,
      action: `Browse available options in the ${catalogSection.label} section`,
      targetType: 'section',
      targetId: catalogSection.id,
      targetPath: catalogSection.page === 'index.html' ? '' : `/${catalogSection.page}`,
      href: catalogSection.href
    });
  }

  if (pricingSection && pricingSection.id !== catalogSection?.id) {
    workflows.push({
      step: workflows.length + 1,
      title: `Review ${pricingSection.label}`,
      action: `Check transparent pricing and details in ${pricingSection.label}`,
      targetType: 'section',
      targetId: pricingSection.id,
      targetPath: pricingSection.page === 'index.html' ? '' : `/${pricingSection.page}`,
      href: pricingSection.href
    });
  }

  if (primaryForm) {
    workflows.push({
      step: workflows.length + 1,
      title: `Complete ${primaryForm.title}`,
      action: primaryForm.fields.length > 0
        ? `Fill in ${primaryForm.fields.slice(0, 4).join(', ')} and click "${primaryForm.submitLabel}"`
        : `Fill in the ${primaryForm.title} and click "${primaryForm.submitLabel}"`,
      targetType: 'form',
      targetId: primaryForm.formId || primaryForm.sectionId || primaryForm.id,
      targetPath: primaryForm.path,
      href: primaryForm.href
    });
  }

  const contactTarget = contactForm || findSectionByPat(/contact|support|help|location/i) || findRouteByPat(/contact|support/i);
  if (contactTarget && contactTarget.id !== primaryForm?.id) {
    workflows.push({
      step: workflows.length + 1,
      title: contactTarget.title || contactTarget.label || 'Contact Support',
      action: `Reach out directly via ${contactTarget.title || contactTarget.label || 'Contact'}`,
      targetType: contactForm ? 'form' : (contactTarget.href ? 'section' : 'route'),
      targetId: contactTarget.formId || contactTarget.sectionId || contactTarget.id || '',
      targetPath: contactTarget.path || '',
      href: contactTarget.href || contactTarget.path || ''
    });
  }

  // Build up to 3 clean, word-boundary-safe quick-action chips for the widget UI
  const quickActions = [];
  const cleanChipLabel = (raw, fallback) => {
    const str = String(raw || fallback || '').replace(/\s+/g, ' ').trim();
    if (!str) return fallback;
    if (str.length <= 20) return str;
    const words = str.split(' ');
    let out = '';
    for (const w of words) {
      if ((out ? `${out} ${w}` : w).length <= 20) out = out ? `${out} ${w}` : w;
      else break;
    }
    return out.length >= 4 ? out : fallback;
  };
  const pushChip = (label, query, icon) => {
    if (quickActions.length >= 3) return;
    if (!label || quickActions.some(q => q.label.toLowerCase() === label.toLowerCase())) return;
    quickActions.push({ label, query, icon });
  };

  if (catalogSection) {
    pushChip(cleanChipLabel(catalogSection.label, 'Explore Options'), `Show me ${catalogSection.label}`, 'list');
  }
  if (pricingSection && !/^(result|total|output|calc)/i.test(pricingSection.id || '')) {
    pushChip(cleanChipLabel(pricingSection.label, 'Pricing & Fees'), `What is the ${pricingSection.label}?`, 'price');
  }
  if (primaryForm) {
    pushChip(cleanChipLabel(primaryForm.title, 'Open Form'), `Take me to ${primaryForm.title}`, 'form');
  } else if (contactTarget) {
    pushChip(cleanChipLabel(contactTarget.label || 'Contact Us', 'Contact Us'), `Take me to ${contactTarget.label || 'Contact'}`, 'nav');
  }

  const roleMap = {
    academic: 'Academic Admissions & Student Portal',
    healthcare: 'Pharmacy & Healthcare Service Portal',
    ecommerce: 'Online Store & E-Commerce Platform',
    food: 'Restaurant Menu & Dining Ordering Portal',
    saas: 'SaaS Product & Subscription Platform',
    hospitality: 'Hotel & Guest Reservation Portal',
    automotive: 'Automotive Showroom & Test-Drive Portal',
    financial: 'Financial & Tax Advisory Portal',
    realestate: 'Real Estate Listings & Site-Visit Portal',
    general: 'Customer Service & Business Portal'
  };

  const roleLabel = roleMap[archetype] || roleMap.general;
  const roleSummary = `${brandName || 'This website'} operates as a ${roleLabel} with ${routes.length} page route(s), ${sections.length} navigable section(s), and ${forms.length} interactive form(s)${primaryForm ? ` centered around "${primaryForm.title}"` : ''}.`;

  return { workflows, quickActions, roleSummary };
}

/**
 * Generate 100% customer-facing FAQs directly grounded in discovered forms, sections, and workflows
 */
export function generateWorkflowFaqs(blueprint, brandName = 'our website') {
  const faqs = [];
  if (!blueprint) return faqs;

  if (blueprint.workflows && blueprint.workflows.length > 0) {
    const stepsText = blueprint.workflows.map(w => `${w.step}. ${w.title} (${w.action})`).join(' → ');
    faqs.push({
      q: `How does ${brandName} work or what is the step-by-step process?`,
      a: `Here is how to get started on ${brandName}: ${stepsText}.`
    });
  }

  for (const form of (blueprint.forms || []).slice(0, 6)) {
    const fieldText = form.fields.length > 0
      ? ` You will simply need to fill in ${form.fields.slice(0, 5).join(', ')}.`
      : '';
    faqs.push({
      q: `How do I fill or find the ${form.title}?`,
      a: `I would be happy to guide you! To complete the ${form.title}, please fill in the required details and click "${form.submitLabel}".${fieldText} Just ask me to open the form and I will take you straight there.`
    });
  }

  for (const sec of (blueprint.sections || []).slice(0, 6)) {
    if (sec.excerpt && sec.excerpt.length >= 20) {
      const cleanExcerpt = trimToCompleteSentence(sec.excerpt, 320);
      faqs.push({
        q: `Tell me about ${sec.label}`,
        a: `${sec.label}: ${cleanExcerpt}`
      });
    }
  }

  return faqs;
}

/**
 * Master Stage-1 entry point: Analyze uploaded files FIRST to produce a complete siteBlueprint
 */
export function extractWebsiteBlueprint(fileList = [], archetype = 'general', brandName = '') {
  const frontendFiles = (fileList || []).filter(isFrontendSource);
  const routes = extractRoutes(frontendFiles);
  const sections = extractSections(frontendFiles, routes);
  const forms = extractForms(frontendFiles, routes);

  const detectedBrand = brandName || (() => {
    for (const f of frontendFiles) {
      const m = String(f.content || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (m) return stripTags(m[1]).split(/[|–—-]/)[0].trim();
    }
    return 'this website';
  })();

  const partial = { routes, sections, forms };
  const { workflows, quickActions, roleSummary } = buildWorkflowsAndSummary(partial, archetype, detectedBrand);

  const blueprint = {
    brandName: detectedBrand,
    archetype,
    roleSummary,
    routes,
    sections,
    forms,
    workflows,
    quickActions,
    analyzedFrontendCount: frontendFiles.length
  };

  blueprint.workflowFaqs = generateWorkflowFaqs(blueprint, detectedBrand);
  return blueprint;
}
