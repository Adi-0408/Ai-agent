/**
 * Multi-Tier Codebase & File Analyzer
 * Intelligently inspects, categorizes, and extracts knowledge from:
 * 1. Frontend files (.html, .jsx, .tsx, .vue, .js, .css)
 * 2. Backend files (.js, .ts, .py, .json, .go, routes, controllers, OpenAPI)
 * 3. Database & Knowledge Documents (.json, .sql, .csv, .txt, .md, .pdf, .docx, .xml, .yaml, tables, collections)
 */

import { extractDatabaseCredentials } from './databaseKeyExtractor.js';
import { extractWebsiteBlueprint } from './websiteWorkflowAnalyzer.js';
import { parseNumericPrice, computeCatalogStats } from './dataAnalyticsEngine.js';
import { buildCrossPageFrontendIndex } from './frontendIntelligenceExtractor.js';

export function detectFileType(fileName, content) {
  const lowerName = (fileName || '').toLowerCase();
  const lowerContent = (content || '').toLowerCase();

  // 0. Explicit executable code files must NEVER be classified as database files!
  const isBackendCompiledOrScript = /\.(py|go|java|php|rb|rs|c|cpp|cs|swift|kt|sh|bat)$/i.test(lowerName);
  if (isBackendCompiledOrScript) {
    return 'backend';
  }

  // 0.5 JavaScript / TypeScript files: NEVER blindly dump executable JS/TS code into the CSV/text database parser!
  // Only treat as 'database' if it is an explicit static catalog data array file (e.g. productsData.js / courses.js)
  // WITHOUT backend driver / fetch / Firestore / Express / DOM logic.
  if (/\.(m?js|cjs|ts)$/i.test(lowerName)) {
    const hasExplicitCatalogArray = /(?:const|let|var|export\s+const)\s+(?:courses|programs|subjects|products|catalog|inventory|items|medicines|dishes|menu|services|plans|pricing|fleet|models)\s*=\s*[\[{]/i.test(content || '');
    const hasExecutableDriverCode = /\b(fetch\s*\(|axios\.|collection\s*\(|getDocs|setDoc|addDoc|createServer|express\s*\(|router\.|app\.(?:get|post|put|delete)|document\.querySelector|document\.getElementById|addEventListener|localStorage|window\.location|sdkDb|firestore|supabase\.from)\b/i.test(content || '');
    if (hasExplicitCatalogArray && !hasExecutableDriverCode) {
      return 'database';
    }
    if (
      lowerName.includes('route') ||
      lowerName.includes('controller') ||
      lowerName.includes('server') ||
      lowerName.includes('api') ||
      lowerName.includes('endpoint') ||
      lowerName.includes('firebase') ||
      lowerName.includes('supabase') ||
      lowerName.includes('database') ||
      lowerName.includes('db') ||
      lowerName.includes('service') ||
      /\b(router\.|app\.(?:get|post|put|delete)|express\s*\(|fetch\s*\(|collection\s*\(|firestore|supabase|mongodb|mongoose|prisma|sequelize)\b/i.test(content || '')
    ) {
      return 'backend';
    }
    return 'frontend';
  }

  // 1. Database & Document files (Strictly non-code structured data & documents)
  if (
    lowerName.endsWith('.sql') ||
    lowerName.endsWith('.csv') ||
    lowerName.endsWith('.tsv') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.markdown') ||
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.doc') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.rtf') ||
    lowerName.endsWith('.xml') ||
    lowerName.endsWith('.yaml') ||
    lowerName.endsWith('.yml') ||
    lowerName.endsWith('.sqlite') ||
    lowerName.endsWith('.db') ||
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.prisma')
  ) {
    return 'database';
  }

  if (lowerName.endsWith('.json')) {
    // Check if it's an OpenAPI/Swagger backend spec
    if (lowerContent.includes('"openapi"') || lowerContent.includes('"swagger"') || lowerContent.includes('"paths":')) {
      return 'backend';
    }
    return 'database';
  }

  // 2. Backend detection
  if (
    lowerName.includes('route') ||
    lowerName.includes('controller') ||
    lowerName.includes('server') ||
    lowerName.includes('api') ||
    lowerName.includes('endpoint') ||
    lowerContent.includes('router.') ||
    lowerContent.includes('app.get(') ||
    lowerContent.includes('app.post(') ||
    lowerContent.includes('@app.get') ||
    lowerContent.includes('@app.post') ||
    lowerContent.includes('express()') ||
    lowerContent.includes('fastapi()')
  ) {
    return 'backend';
  }

  // 3. Frontend detection
  if (
    lowerName.endsWith('.html') ||
    lowerName.endsWith('.htm') ||
    lowerName.endsWith('.jsx') ||
    lowerName.endsWith('.tsx') ||
    lowerName.endsWith('.vue') ||
    lowerName.endsWith('.svelte') ||
    lowerName.endsWith('.css') ||
    lowerName.endsWith('.scss') ||
    lowerName.includes('page') ||
    lowerName.includes('view') ||
    lowerName.includes('component') ||
    lowerContent.includes('<!doctype html>') ||
    lowerContent.includes('react') ||
    lowerContent.includes('return (') ||
    lowerContent.includes('<div') ||
    lowerContent.includes('<header') ||
    lowerContent.includes('<nav')
  ) {
    return 'frontend';
  }

  return 'database'; // Safe fallback for plain text / unknown document formats
}

/**
 * Parse and extract structured insights from Frontend code (.html, .jsx, .tsx, .vue)
 * Extracts page titles, meta descriptions, headings, products, specs, and rich Q&As.
 */
export function analyzeFrontendFile(fileName, content) {
  const pages = [];
  const navigation = [];
  const forms = [];
  const pricingOrProducts = [];
  const knowledgeBase = [];

  const clean = (str) => (str || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Extract Website Title & Meta Description
  const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const siteTitle = titleMatch ? clean(titleMatch[1]) : '';
  const descMatch = content.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const siteDesc = descMatch ? clean(descMatch[1]) : '';

  if (siteTitle || siteDesc) {
    const fullSummary = siteDesc ? `${siteTitle}. ${siteDesc}` : siteTitle;
    knowledgeBase.push({
      q: "What is this website about?",
      a: fullSummary
    });
    knowledgeBase.push({
      q: "What is the main point or subject of this website?",
      a: fullSummary
    });
  }

  // 2. Extract navigation links or routes
  const linkMatches = content.matchAll(/(?:href|to)=["']([^"']+)["']/gi);
  for (const match of linkMatches) {
    const link = match[1];
    if (link && !link.startsWith('http') && !navigation.includes(link)) {
      navigation.push(link);
    }
  }

  // 3. Extract page or section titles (<title>, <h1>, <h2>, <h3>)
  const headingMatches = content.matchAll(/<(h[1-4])[^>]*>([\s\S]*?)<\/\1>/gi);
  const rawHeadings = [];
  for (const match of headingMatches) {
    const text = clean(match[2]);
    if (text && text.length > 2 && !pages.includes(text) && text.length < 90) {
      pages.push(text);
      rawHeadings.push(text);
    }
  }

  // Strip <script> and <style> blocks once for clean content extraction
  const safeContentForKb = String(content || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  // 4. Extract Heading + Paragraph pairs (Rich Website Knowledge Facts)
  const seenFaqQ = new Set(knowledgeBase.map(k => k.q.toLowerCase()));
  const pushSafeKb = (q, a) => {
    const cleanQ = String(q || '').trim();
    const cleanA = String(a || '').trim();
    if (!cleanQ || !cleanA || seenFaqQ.has(cleanQ.toLowerCase())) return;
    if (!isCustomerSafeFaq(cleanQ, cleanA)) return;
    seenFaqQ.add(cleanQ.toLowerCase());
    knowledgeBase.push({ q: cleanQ, a: cleanA });
  };

  const hPairRegex = /<(h[2-4])[^>]*>([\s\S]*?)<\/\1>[\s\S]{0,120}?<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = hPairRegex.exec(safeContentForKb)) !== null) {
    const hText = clean(pMatch[2]);
    const pText = clean(pMatch[3]);
    if (hText.length > 3 && pText.length > 15 && hText.length < 90) {
      pushSafeKb(`What is ${hText}?`, pText);
    }
  }

  // 4B. Extract Heading + Bulleted/Numbered Lists (<ul>/<ol> — captures Eligibility, Documents, Features, Syllabus, Amenities!)
  const hListRegex = /<(h[2-4])[^>]*>([\s\S]*?)<\/\1>[\s\S]{0,180}?<(?:ul|ol)[^>]*>([\s\S]{10,1600}?)<\/(?:ul|ol)>/gi;
  let lMatch;
  while ((lMatch = hListRegex.exec(safeContentForKb)) !== null) {
    const hText = clean(lMatch[2]);
    if (hText.length <= 3 || hText.length >= 90) continue;
    const liItems = Array.from(lMatch[3].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
      .map(m => clean(m[1]))
      .filter(t => t.length >= 3 && t.length <= 180)
      .slice(0, 8);
    if (liItems.length >= 2) {
      pushSafeKb(`What are the details for ${hText}?`, `${hText} includes: ${liItems.join('; ')}.`);
    }
  }

  // 4C. Extract Definition Lists (<dl><dt>Term</dt><dd>Definition</dd></dl>)
  const dlPairRegex = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
  let dlMatch;
  while ((dlMatch = dlPairRegex.exec(safeContentForKb)) !== null) {
    const term = clean(dlMatch[1]);
    const def = clean(dlMatch[2]);
    if (term.length >= 2 && term.length < 80 && def.length >= 4 && def.length < 350) {
      pushSafeKb(`What is ${term}?`, def);
    }
  }

  // 4D. Extract 2-Column Key-Value Info/Spec Tables (e.g., Timings | 8 AM - 2 PM, Principal | Dr. Sharma, Duration | 2 Years)
  const kvTableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let kvTm;
  while ((kvTm = kvTableRegex.exec(safeContentForKb)) !== null) {
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let kvRm;
    while ((kvRm = rowRe.exec(kvTm[1])) !== null) {
      const cells = Array.from(kvRm[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)).map(m => clean(m[1]));
      if (cells.length === 2 && cells[0].length >= 3 && cells[0].length <= 50 && cells[1].length >= 2 && cells[1].length <= 200) {
        if (!/^(name|item|product|course|price|fee|stock|status|sr\.?\s*no|action)$/i.test(cells[0]) && !/^(?:₹|\$|€|£|rs\.?)\s*\d/i.test(cells[1])) {
          pushSafeKb(`What is ${cells[0]}?`, `${cells[0]}: ${cells[1]}.`);
        }
      }
    }
  }

  // 5. Discover Product Names & Flagship Fleet Items
  const discoveredProducts = [];
  for (const heading of rawHeadings) {
    // Detect products/models/offerings: contains keywords like product, service, course, program, plan, model, item, class, tier
    if (
      /\b(product|service|course|program|plan|package|model|edition|item|class|standard|degree|tier|feature|offering|solution|suite|consultation|medicine|catalog)\b/i.test(heading) &&
      !/anatomy|fleet|navigation|menu|footer|header|welcome|copyright|terms|privacy|home|about us|contact/i.test(heading)
    ) {
      if (!discoveredProducts.includes(heading)) {
        discoveredProducts.push(heading);
      }
    }
  }

  // Also extract product cards
  const productCardMatches = content.matchAll(/class=["'][^"']*(?:product|fleet-card|blueprint-card|item-card)[^"']*["'][\s\S]*?<(h[2-4])[^>]*>([\s\S]*?)<\/\1>/gi);
  for (const match of productCardMatches) {
    const pTitle = clean(match[2]);
    if (pTitle && !discoveredProducts.includes(pTitle)) {
      discoveredProducts.push(pTitle);
    }
  }

  if (discoveredProducts.length > 0) {
    const productList = discoveredProducts.slice(0, 8).join(', ');
    knowledgeBase.push({
      q: "What products or models do you offer?",
      a: `Our products and flagship models include: ${productList}. You can ask me for detailed specifications or features on any of them!`
    });
    knowledgeBase.push({
      q: "What products are on this website?",
      a: `We feature: ${productList}. Which product or model would you like to explore?`
    });
    knowledgeBase.push({
      q: "What do you sell?",
      a: `Our catalog features: ${productList}. Let me know if you would like pricing, specs, or customization details.`
    });
  }

  // 6. Extract form actions / inputs (e.g. contact, search, newsletter)
  const inputMatches = content.matchAll(/name=["']([^"']+)["']/gi);
  for (const match of inputMatches) {
    const name = match[1];
    if (name && !forms.includes(name)) {
      forms.push(name);
    }
  }

  // 7. Check for pricing signs across currencies (₹, Rs., $, €, £)
  const priceMatches = safeContentForKb.matchAll(/(?:₹|\$|€|£|Rs\.?\s*)\s*(\d+(?:,\d{2,3})*(?:\.\d{1,2})?)/gi);
  for (const match of priceMatches) {
    const formattedPrice = match[0].replace(/\s+/g, ' ').trim();
    if (!pricingOrProducts.includes(formattedPrice)) {
      pricingOrProducts.push(formattedPrice);
    }
  }

  if (pricingOrProducts.length > 0) {
    knowledgeBase.push({
      q: "What are your prices or rates?",
      a: `Pricing options identified on our website include ${pricingOrProducts.slice(0, 5).join(', ')}. Custom configurations and bespoke options are also available.`
    });
  }

  // 8. Contact & Support Info
  const emailMatch = content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch || forms.some(f => /email|contact|message/i.test(f))) {
    knowledgeBase.push({
      q: "How do I contact support or reach out?",
      a: emailMatch 
        ? `You can reach our team directly at ${emailMatch[0]}, or submit an inquiry through our website contact form.`
        : "You can submit an inquiry through our online consultation form or reach out to our support team directly."
    });
  }

  // 9. Clean HTML Catalog Extractor (Tables, Semantic Cards & Domain <select> Options — strictly validated!)
  const catalogRecords = [];
  const seenCatNames = new Set();
  const addHtmlCatalogItem = (rawName, price = '', stock = null, desc = '', unit = 'units') => {
    const cleanName = clean(rawName).replace(/^[^\w₹$€£]+/, '').trim();
    const rec = { name: cleanName, price: clean(price), stock, unit, description: clean(desc).slice(0, 180) };
    if (!isValidCustomerCatalogName(cleanName, rec)) return;
    if (seenCatNames.has(cleanName.toLowerCase())) return;
    seenCatNames.add(cleanName.toLowerCase());
    const parsedPrice = parseNumericPrice(rec.price);
    catalogRecords.push({
      id: `html_${catalogRecords.length + 1}`,
      name: cleanName,
      price: rec.price,
      numericPrice: parsedPrice ? parsedPrice.value : null,
      currency: parsedPrice ? parsedPrice.currency : '',
      stock: (stock !== null && !isNaN(stock)) ? Number(stock) : null,
      unit,
      category: '',
      dosage: '',
      description: rec.description,
      rx: false
    });
  };

  if (/\.html?$/i.test(fileName) || /<table|<select|<div[^>]*card/i.test(content)) {
    // Strip <script> and <style> blocks first so inline JS/CSS can NEVER be scanned!
    const safeHtml = String(content || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ');

    // 9A. Semantic Catalog Cards (.course-card, .program-card, .product-card, .menu-item, .pricing-card, .plan-card, .room-card, .service-card, .stream-card)
    const cardBlockRegex = /<(?:div|article|li)\b[^>]*class=["'][^"']*(?:course-card|program-card|stream-card|product-card|item-card|menu-item|pricing-card|plan-card|room-card|service-card|medicine-card|vehicle-card|property-card)[^"']*["'][^>]*>([\s\S]{10,900}?)<\/(?:div|article|li)>/gi;
    let cm;
    while ((cm = cardBlockRegex.exec(safeHtml)) !== null) {
      const cardInner = cm[1];
      const hM = cardInner.match(/<h[2-5][^>]*>([\s\S]*?)<\/h[2-5]>/i);
      if (!hM) continue;
      const pM = cardInner.match(/(?:₹|\$|€|£|Rs\.?\s*)\s*\d[\d,]*(?:\.\d{1,2})?(?:\s*\/\s*[a-zA-Z]+)?/i);
      const sM = cardInner.match(/(\d+)\s*(seats?|units?|strips?|rooms?|pairs?|slots?|portions?|in\s*stock)/i);
      const descM = cardInner.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      addHtmlCatalogItem(hM[1], pM ? pM[0] : '', sM ? parseInt(sM[1], 10) : null, descM ? descM[1] : '', sM && sM[2] ? sM[2] : 'units');
    }

    // 9B. HTML Tables with clean catalog rows
    const tableRegex = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
    let tm;
    while ((tm = tableRegex.exec(safeHtml)) !== null) {
      const tBody = tm[1];
      const ths = Array.from(tBody.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)).map(m => clean(m[1]).toLowerCase());
      const nameIdx = ths.findIndex(h => /course|program|stream|name|product|item|medicine|dish|plan|room|service|model|title/i.test(h));
      const priceIdx = ths.findIndex(h => /fee|price|cost|rate|mrp|tariff/i.test(h));
      const stockIdx = ths.findIndex(h => /seat|stock|qty|quantity|avail|unit|slot/i.test(h));
      if (ths.length > 0 && nameIdx === -1 && priceIdx === -1) continue;

      const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
      let rm;
      while ((rm = rowRegex.exec(tBody)) !== null) {
        if (/<th\b/i.test(rm[1])) continue;
        const tds = Array.from(rm[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map(m => clean(m[1]));
        if (tds.length < 2) continue;
        const colName = nameIdx >= 0 && tds[nameIdx] ? tds[nameIdx] : tds[0];
        const colPrice = priceIdx >= 0 && tds[priceIdx] ? tds[priceIdx] : (tds.find(c => /(?:₹|\$|€|£|Rs\.?)\s*\d/i.test(c)) || '');
        const colStockRaw = stockIdx >= 0 && tds[stockIdx] ? tds[stockIdx] : '';
        const sm = colStockRaw.match(/^(\d+)\s*([a-zA-Z]+)?/);
        addHtmlCatalogItem(colName, colPrice, sm ? parseInt(sm[1], 10) : null, '', sm && sm[2] ? sm[2] : 'units');
      }
    }

    // 9C. Domain <select> dropdowns (e.g. Admission Form "Select Course", Booking Form "Room Type")
    const selectRegex = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
    let selM;
    while ((selM = selectRegex.exec(safeHtml)) !== null) {
      const selAttrs = selM[1] || '';
      if (!/\b(course|courses|program|programme|stream|class|standard|std|branch|degree|department|subject|admission|service|plan|room|vehicle|model|package)\b/i.test(selAttrs)) continue;
      const optRegex = /<option\b[^>]*>([\s\S]*?)<\/option>/gi;
      let om;
      while ((om = optRegex.exec(selM[2])) !== null) {
        const optLabel = clean(om[1]);
        if (!optLabel || /^(-+|select|choose|none|please|--)/i.test(optLabel)) continue;
        addHtmlCatalogItem(optLabel, '', null, '', 'seats');
      }
    }
  }

  const summary = `Frontend file (${fileName}): Extracted site title "${siteTitle || fileName}", ${pages.length} headings, ${catalogRecords.length || discoveredProducts.length} products/models, ${knowledgeBase.length} grounded Q&A facts, and ${forms.length} forms.`;

  return {
    type: 'frontend',
    fileName,
    siteTitle,
    siteDesc,
    pages,
    navigation,
    forms,
    pricingOrProducts,
    discoveredProducts,
    catalogRecords,
    knowledgeBase,
    summary,
    rawExcerpt: content.substring(0, 1500)
  };
}

/**
 * Parse and extract structured endpoints and tools from Backend code
 */
export function analyzeBackendFile(fileName, content) {
  const endpoints = [];

  // Express / Node routes: app.get('/api/...', ...), router.post('/...', ...)
  const expressMatches = content.matchAll(/(?:app|router)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/gi);
  for (const match of expressMatches) {
    const method = match[1].toUpperCase();
    const path = match[2];
    endpoints.push({
      method,
      path,
      name: pathToToolName(method, path),
      description: `Executes ${method} request to ${path}`
    });
  }

  // Python FastAPI / Flask: @app.get('/...'), @router.post('/...')
  const pyMatches = content.matchAll(/@(?:app|router)\.(get|post|put|delete|patch)\(\s*['"`]([^'"`]+)['"`]/gi);
  for (const match of pyMatches) {
    const method = match[1].toUpperCase();
    const path = match[2];
    endpoints.push({
      method,
      path,
      name: pathToToolName(method, path),
      description: `Python backend endpoint for ${method} ${path}`
    });
  }

  // OpenAPI / Swagger JSON paths
  if (content.includes('"paths":')) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.paths) {
        for (const [pathKey, pathObj] of Object.entries(parsed.paths)) {
          for (const [methodKey, methodObj] of Object.entries(pathObj)) {
            if (['get', 'post', 'put', 'delete', 'patch'].includes(methodKey.toLowerCase())) {
              endpoints.push({
                method: methodKey.toUpperCase(),
                path: pathKey,
                name: pathToToolName(methodKey.toUpperCase(), pathKey),
                description: methodObj.summary || methodObj.description || `${methodKey.toUpperCase()} ${pathKey}`
              });
            }
          }
        }
      }
    } catch (e) {
      // Ignore JSON parse error in regex fallback
    }
  }

  // Fallback if no explicit framework found, look for URL paths
  if (endpoints.length === 0) {
    const apiPathMatches = content.matchAll(/['"`](\/api\/[^'"`]+)['"`]/g);
    for (const match of apiPathMatches) {
      const path = match[1];
      endpoints.push({
        method: 'GET',
        path,
        name: pathToToolName('GET', path),
        description: `API endpoint for ${path}`
      });
    }
  }

  const summary = `Backend file (${fileName}): Contains ${endpoints.length} API endpoints (${endpoints.map(e => `${e.method} ${e.path}`).slice(0, 5).join(', ') || 'No REST routes detected'}).`;

  return {
    type: 'backend',
    fileName,
    endpoints,
    summary,
    rawExcerpt: content.substring(0, 1500)
  };
}

/**
 * Convert an HTTP method and URL path to a camelCase tool name
 * e.g. "GET /api/orders/:id" -> "getOrderById"
 */
function pathToToolName(method, path) {
  const cleanPath = path
    .replace(/^\/api\//, '')
    .replace(/^\//, '')
    .replace(/[/{}:_]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');

  const prefix = method.toLowerCase();
  return `${prefix}${cleanPath.charAt(0).toUpperCase() + cleanPath.slice(1)}`;
}

/**
 * Validate that an FAQ entry is strictly customer-facing and clean.
 * Rejects technical database schemas, developer notes, TypeScript types, and code snippets.
 */
export function isCustomerSafeFaq(question, answer) {
  if (!question || !answer) return false;
  const qStr = String(question).trim();
  const aStr = String(answer).trim();

  if (qStr.length < 3 || aStr.length < 2) return false;

  const qLower = qStr.toLowerCase();
  const aLower = aStr.toLowerCase();

  // 1. Technical database & developer questions that regular customers will never ask
  const invalidQuestionPatterns = [
    /\bwhat tables are in the database\b/i,
    /\bdatabase records for\b/i,
    /\bdatabase context from\b/i,
    /\binformation from\b/i,
    /\bwhat is the minstockalert\b/i,
    /\bwhat is minstockalert\b/i,
    /\bwhat is create table\b/i,
    /\bwhat is foreign key\b/i,
    /\bwhat is primary key\b/i,
    /\bwhat is varchar\b/i,
    /\bwhat is api endpoint\b/i,
    /\bwhat is router\b/i,
    /\bwhat is controller\b/i,
    /\bwhat is schema\b/i,
    /\bwhat is batchstockcount\b/i,
    /\bwhat is supplierinvoiceid\b/i,
    /\bwhat is purchaseprice\b/i,
    /\bdatabase\b/i,
    /\btable[_\s]?names?\b/i,
    /\b(database\s+tables?|what\s+tables|show\s+tables)\b/i,
    /\bschema\b/i,
    /\bqueries\b/i,
    /\bquery\b/i,
    /\bsql\b/i,
    /\bpostgres\b/i,
    /\bmysql\b/i,
    /\bmongodb\b/i,
    /\bfirestore\b/i,
    /\bsupabase\b/i,
    /\bapi[_\s]?key\b/i,
    /\bproject[_\s]?id\b/i,
    /\bauth[_\s]?domain\b/i,
    /\bstorage[_\s]?bucket\b/i,
    /\bmessaging[_\s]?sender[_\s]?id\b/i,
    /\bapp[_\s]?id\b/i,
    /\bmeasurement[_\s]?id\b/i,
    /\bdatabase[_\s]?url\b/i,
    /\btoken\b/i,
    /\bcredentials\b/i,
    /\bport\b/i,
    /\bhost\b/i,
    /\bconnection[_\s]?string\b/i,
    /\bwebhook\b/i,
    /\bwhat are the details of\b/i
  ];
  if (invalidQuestionPatterns.some(pat => pat.test(qLower))) return false;

  // 2. Reject questions or answers containing programming code, types, SQL statements, or database dumps
  const codePatterns = [
    /\b(number|string|boolean|any|void)\s*;\s*(\/\/.*)?$/i, // TypeScript/JS type: number; // e.g. 15
    /\b(interface|type|class|enum)\s+[A-Z0-9_]+\s*\{/i,    // interface Foo {
    /^(?:const|let|var)\s+[a-z0-9_]+\s*=/i,                // const x =
    /\bcreate\s+table\b/i,                                  // CREATE TABLE
    /\binsert\s+into\b/i,                                  // INSERT INTO
    /\bselect\s+.*\s+from\b/i,                             // SELECT ... FROM
    /\bupdate\s+.*\s+set\b/i,                              // UPDATE ... SET
    /\bdelete\s+from\b/i,                                  // DELETE FROM
    /\bprimary\s+key\b/i,                                  // PRIMARY KEY
    /\bforeign\s+key\b/i,                                  // FOREIGN KEY
    /\bvarchar\s*\(\d+\)/i,                                // VARCHAR(255)
    /\{[\s\S]*\}\s*;?$/,                                   // Raw JSON/object dump
    /^\s*(\/\/|\/\*|\*)/,                                  // Code comments
    /\b(import|export)\s+.*\s+from\s+['"]/i,               // import ... from '...'
    /\bdef\s+[a-z0-9_]+\s*\(/i,                            // def my_func(
    /\bpublic\s+(static\s+)?(void|int|string)\b/i,         // public void
    /\[Binary File:/i,                                     // [Binary File:
    /\bnull\s*;|\bundefined\s*;/i,
    /^#!/,                                                 // Shebangs (e.g. #!/usr/bin/env bash)
    /\b(bash|powershell|cmd\.exe|node_modules|chmod\s+\+x|chown|npm\s+(?:run|install|build)|git\s+(?:commit|push|checkout)|apt-get|brew\s+install)\b/i, // Developer scripts
    /\b(BEGIN PRIVATE KEY|BEGIN RSA PRIVATE KEY|bearer\s+[a-z0-9_\-\.]{20,})\b/i, // Sensitive secrets
    /: AIza|firebaseapp\.com|firebasestorage\.app|1:\d+:web:/i, // Firebase raw credentials
    /\b(storagebucket|messagingsenderid|appid|measurementid|databaseurl|dotenv)\b/i,
    /\b(id|created_at|updated_at|supplier_id|deleted_at|hash|password|secret|salt)\s*:\s*/i // Database internal dumps
  ];

  if (codePatterns.some(pat => pat.test(aStr))) return false;
  if (codePatterns.some(pat => pat.test(qStr))) return false;

  // 3. Reject developer task notes, repo setup docs, database query descriptions, and backend jargon
  if (/\b(sql query|database query|database table|select query|query the database|db connection|database dump|schema dump|apps\s*script|script\s*toolbar|click\s+deploy|deploy\s+as\s+web\s+app|git\s+clone|optimized\s+for\s+desktop|responsive\s+layout|mobile[- ]first|dark\s+mode\s+toggle|tailwind\s+css|vite\s+build|webpack|source\s+code|repository)\b/i.test(aLower + ' ' + qLower)) {
    return false;
  }
  if (/^[-*•]?\s*(record supplier invoices|automatically increment|purchase history register|todo:|fixme:|refactor|in the apps script|configurable by|optimized for desktop)/i.test(aLower)) {
    return false;
  }

  // 4. Reject meaningless generic dumps
  if (/^database includes table/i.test(aLower)) return false;

  return true;
}

/**
 * Universal Strict Customer Catalog Item Validator.
 * Permanently rejects JS/TS/SQL/HTML/JSON code artifacts (spread operators "...data",
 * comments "// ...", object literals "firstName: firstName", "method: POST",
 * dot-notation SDK calls "sdkDb.collection", credentials, camelCase/snake_case vars)
 * AND developer README/setup bullets ("- In the Apps Script toolbar", "A modern",
 * "- Configurable by Grade", "- Optimized for desktop")
 * while preserving 100% of legitimate offerings across ALL website industries
 * (B.Sc, B.Tech, Dr. Reddy's, Pro Plan v2.0, 2.5L SUV, Std 11th Science, etc.).
 */
export function isValidCustomerCatalogName(rawName, record = null) {
  const name = String(rawName || '').trim();
  if (!name || name.length < 2 || name.length > 75) return false;

  // 1. Reject leading code punctuation, single/triple dots (.replace, ...data), markdown bullets (-, –, —, •), comments (// /* *), brackets, quotes
  if (/^\s*(\.|\/\/|\/\*|\*\/|\*|-|–|—|•|▪|▸|►|◦|·|#|@|!|\$|&|\||<|>|=|\+|\[|\]|\(|\)|\{|\}|;|:|,|`|'|")/.test(name)) return false;

  // 2. Reject code comments, JS/Python method names, or template/operator syntax anywhere
  if (/^\.?(replace|replaceAll|trim|split|slice|splice|join|map|filter|reduce|forEach|find|some|every|includes|indexOf|match|matchAll|test|exec|push|pop|shift|unshift|concat|sort|reverse|keys|values|entries|assign|stringify|parse|toLowerCase|toUpperCase|startsWith|endsWith|substring|substr|charAt|toString|valueOf|then|catch|finally|json|text|blob|arrayBuffer|preventDefault|stopPropagation|addEventListener|querySelector|querySelectorAll|getElementById|appendChild|removeChild|setAttribute|getAttribute|setItem|getItem|removeItem)$/i.test(name)) return false;
  if (name.includes('//') || name.includes('/*') || name.includes('*/')) return false;
  if (name.includes('=>') || name.includes('();') || name.includes('()') || name.includes('===') || name.includes('!==') || name.includes('==') || name.includes('!=') || name.includes('&&') || name.includes('||') || name.includes('+=') || name.includes('-=') || name.includes('??') || name.includes('?.') || name.includes('++') || name.includes('${')) return false;
  if (name.includes('{') || name.includes('}') || name.includes(';') || name.includes('[') || name.includes(']') || name.includes('?') || /CREATE\s+TABLE|INSERT\s+INTO|SELECT\s+.*\s+FROM/i.test(name)) return false;
  if (name.split(/\s+/).length > 9) return false;

  // 3. Reject credentials, API keys, environment variables, and developer configs
  if (/^(api[_-]?key|auth[_-]?domain|project[_-]?id|storage[_-]?bucket|messaging[_-]?sender[_-]?id|sender[_-]?id|app[_-]?id|measurement[_-]?id|database[_-]?url|token|secret|client[_-]?id|client[_-]?secret|password|bearer|authorization|cookie|session|jwt|dotenv|config|options|settings|environment|env)\b/i.test(name)) return false;
  if (/: AIza|firebaseapp\.com|firebasestorage\.app|1:\d+:web:/i.test(name)) return false;

  // 4. Reject JS/JSON object key-value lines (e.g. "firstName: firstName", "first Name: first Name", "method: POST", "headers: ...")
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*\s*:\s*\S+/.test(name)) return false;
  if (/^([a-z][a-zA-Z0-9\s]{1,28})\s*:\s*\1$/i.test(name)) return false;
  if (/^(method|headers|body|type|status|mode|cache|credentials|redirect|referrer|signal|action|url|uri|endpoint|path|route|timeout|retries|payload|params|query|fields|collection|document|doc|ref|data|error|message|code|token|key|id|uid|user\s*id|first\s*name|last\s*name|created\s*at|updated\s*at|timestamp|content\s*type|authorization|accept|origin|host|port)\s*:/i.test(name)) return false;

  // 5. Reject dot-notation code/SDK chains (e.g. "sdkDb.collection", "sdk Db.collection", "db.doc", "res.json", "err.message")
  const withoutSafeDots = name
    .replace(/\b(?:Dr|Mr|Mrs|Ms|St|Sr|Jr|Rs|No|Std|Prof|Inc|Ltd|Pvt|Co|etc)\./gi, ' ')
    .replace(/\b(?:B\.Sc|M\.Sc|B\.Tech|M\.Tech|B\.Com|M\.Com|B\.A|M\.A|B\.E|M\.E|B\.Ed|M\.Ed|Ph\.D|LL\.B|M\.B\.A|B\.B\.A|B\.C\.A|M\.C\.A|B\.Pharm|M\.Pharm|M\.B\.B\.S)\b\.?/gi, ' ')
    .replace(/\bv?\d+\.\d+[a-zA-Z]*\b/g, ' ');
  if (/\b[a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]{1,}\b/.test(withoutSafeDots)) return false;

  // 6. Reject JS/Python/HTTP keywords, statements, and raw technical strings (keep academic "Class 11 Science" valid!)
  if (/^(console\.|function\b|async\b|await\b|const\b|let\b|var\b|for\s*\(|while\s*\(|import\b|export\b|return\b|class\s+[A-Z_$][A-Za-z0-9_$]*\s*(?:\{|extends\b)|if\s*\(|else\b|switch\b|case\b|default\b|try\b|catch\b|finally\b|throw\b|new\s|typeof\b|instanceof\b|window\.|document\.|process\.|localStorage\.|sessionStorage\.|JSON\.|Math\.|Object\.|Array\.|Promise\.|fetch\s*\(|require\s*\(|module\.exports|def\s|self\.)/i.test(name)) return false;
  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|application\/json|text\/plain|content-type|utf-8|cors|null|undefined|true|false|nan)$/i.test(name)) return false;

  // 7. Reject developer documentation, README feature specs & UI boilerplate phrases
  if (/\b(apps\s*script|toolbar|optimized\s+for|responsive|configurable\s+by|mobile[- ]first|dark\s*mode|light\s*mode|desktop,\s*tablet|tablet\s+and\s+mobile|desktop\s+and\s+mobile|viewport|readme|changelog|setup\s+guide|installation|git\s+clone|npm\s+|yarn\s+|vite|webpack|tailwind|react\s+app|next\.?js|firestore|firebase|supabase|webhook|localhost|browser|sidebar|navbar|dropdown|tooltip|modal|animation|css|html|javascript|typescript|json\s+file|sql\s+file|source\s+code|repository|github|vercel|netlify|deployment|deploy\s+as|click\s+deploy|copy\s+the|paste\s+the|downloadable\s+pdfs?)\b/i.test(name)) return false;

  // 8. Reject developer/UI action verbs & non-catalog questions/headings/prose fragments
  if (/^(generate|create|build|run|click|install|download|configure|setup|update|test|verify|deploy|fix|add|remove|delete|edit|include|allow|ensure|enable|disable|check|select|choose|press|provide|support|optimize|use|using|implement)\b/i.test(name)) return false;
  if (/^(what\b|tell me\b|how\b|can you\b|why\b|who\b|sample\b|untitled\b|sr\.?no\b|action\b|features?\b|services?\b|welcome\b|about\b|privacy\b|terms\b|copyright\b|faq\b)/i.test(name)) return false;
  if (/^(?:a|an|the|this|that|these|those)\s+(?:modern|simple|clean|fast|smart|easy|interactive|complete|comprehensive|responsive|lightweight|powerful|scalable|flexible|built|custom|new|full|basic|advanced|user|web|online|digital|automated)\b/i.test(name)) return false;
  if (/^(?:in\s+the|on\s+the|at\s+the|for\s+the|to\s+the|from\s+the|with\s+the|by\s+the|built\s+with|powered\s+by|designed\s+for|made\s+for|optimized\s+for|step\s+\d+)\b/i.test(name)) return false;

  // 9. Reject single-token snake_case or lowercase-leading camelCase code identifiers when lacking real price/stock
  const hasPrice = Boolean(record && record.price !== undefined && String(record.price).trim() !== '');
  const hasStock = Boolean(record && (record.stock !== undefined && record.stock !== null && !isNaN(Number(record.stock))));
  if (!hasPrice && !hasStock && /^(?:a|an|the)\s+[a-z]+$/i.test(name)) return false;
  if (!hasPrice && !hasStock && !/\s/.test(name)) {
    const knownBrands = /^(iPhone|iPad|iMac|iPod|eBay|eBook|OnePlus|PayPal|YouTube|LinkedIn|WhatsApp|PlayStation|MacBook|AirPods|ThinkPad|PowerPoint|WordPress|FastAPI|NextJS|GraphQL)$/i;
    if (!knownBrands.test(name)) {
      if (/^[a-z]+_[a-z0-9_]+$/i.test(name)) return false;
      if (/^[a-z]{2,}[A-Z][a-z]+[A-Za-z0-9]*$/.test(name)) return false;
    }
  }

  return true;
}

/**
 * Parse and extract structured knowledge facts from Database files (JSON, SQL, CSV)
 */
export function analyzeDatabaseFile(fileName, content) {
  const knowledgeBase = [];
  const databaseRecords = [];
  let recordsCount = 0;
  let schema = [];
  let databaseConfig = null;
  let databaseProvider = null;

  const dbCreds = extractDatabaseCredentials(fileName, content);
  if (dbCreds && dbCreds.detected) {
    databaseConfig = dbCreds.config;
    databaseProvider = dbCreds.providerName;
  }

  // Skip developer repository documentation (README.md, SETUP.md, DEPLOY.md, etc.) so internal setup instructions never leak into customer catalog/KB
  const baseDocName = String(fileName || '').split(/[\\/]/).pop().toLowerCase();
  if (/^(readme|contributing|changelog|license|licence|setup|deploy|deployment|install|installation|architecture|todo|apps[_-]?script[\w-]*)\.(md|markdown|txt)$/i.test(baseDocName)) {
    return {
      type: 'database',
      fileName,
      recordsCount: 0,
      schema: [],
      knowledgeBase: [],
      databaseRecords: [],
      databaseConfig,
      databaseProvider,
      summary: `Skipped developer setup document (${fileName}) from customer catalog.`,
      rawExcerpt: ''
    };
  }

  function addDatabaseRecord(rec) {
    if (!rec) return;
    const name = String(rec.name || rec.product || rec.title || rec.item || '').trim();
    if (!isValidCustomerCatalogName(name, rec)) return;

    const price = rec.price !== undefined ? (typeof rec.price === 'number' ? `₹${rec.price}` : String(rec.price).trim()) : '';
    const stock = rec.stock !== undefined ? Number(rec.stock) : (rec.quantity !== undefined ? Number(rec.quantity) : (rec.qty !== undefined ? Number(rec.qty) : null));
    const unit = String(rec.unit || rec.packaging || 'units').trim();
    const category = String(rec.category || rec.department || rec.type || '').trim();
    const dosage = String(rec.dosage || rec.composition || rec.salt || '').trim();
    const desc = String(rec.description || rec.desc || rec.details || '').trim();
    const rx = Boolean(rec.rx || rec.prescriptionRequired);

    // If item has no price, no stock, and desc starts with "We offer:", it's a feature summary, not a catalog product
    if (!price && (stock === null || isNaN(stock)) && /^(we offer:|welcome to)/i.test(desc)) return;

    const existing = databaseRecords.find(r => r.name.toLowerCase() === name.toLowerCase());
    if (!existing) {
      databaseRecords.push({
        id: rec.id || `rec_${databaseRecords.length + 1}`,
        name,
        price,
        stock: isNaN(stock) ? null : stock,
        unit,
        category,
        dosage,
        description: desc,
        rx
      });
    }
  }

  // Case 1: JSON
  if (fileName.toLowerCase().endsWith('.json') || content.trim().startsWith('{') || content.trim().startsWith('[')) {
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        recordsCount = data.length;
        data.forEach(item => {
          if (typeof item === 'object' && item !== null) {
            addDatabaseRecord(item);
            const q = item.question || item.q || item.title || item.name || item.topic;
            const a = item.answer || item.a || item.description || item.content || item.price || item.details;
            if (q && a && isCustomerSafeFaq(String(q), typeof a === 'object' ? JSON.stringify(a) : String(a))) {
              knowledgeBase.push({
                q: String(q).trim(),
                a: typeof a === 'object' ? JSON.stringify(a) : String(a).trim()
              });
            } else if (item.name) {
              const priceStr = item.price ? ` Price: ${typeof item.price === 'number' ? `₹${item.price}` : item.price}.` : '';
              const stockStr = (item.stock !== undefined && item.stock !== null && !isNaN(item.stock)) ? ` Available in stock: ${item.stock} ${item.unit || 'units'}.` : '';
              const descStr = item.description || item.desc || item.details || item.dosage || '';
              const cleanDesc = descStr ? ` ${descStr}.` : '';
              const customerQ = `What is ${item.name}?`;
              const customerA = `${item.name}.${priceStr}${stockStr}${cleanDesc}`.trim();
              if (isCustomerSafeFaq(customerQ, customerA)) {
                knowledgeBase.push({ q: customerQ, a: customerA });
              }
            }
          }
        });
      } else if (typeof data === 'object' && data !== null) {
        schema = Object.keys(data);
        const inv = data.liveInventory || data.inventory || data.products || data.items || data.catalog || data.records;
        if (inv) {
          if (Array.isArray(inv)) {
            inv.forEach(addDatabaseRecord);
          } else if (typeof inv === 'object') {
            for (const [key, val] of Object.entries(inv)) {
              if (val && typeof val === 'object') {
                addDatabaseRecord({ name: val.name || key, ...val });
              } else if (val !== undefined) {
                addDatabaseRecord({ name: key, stock: val });
              }
            }
          }
        }

        Object.entries(data).slice(0, 20).forEach(([k, v]) => {
          if (Array.isArray(v)) {
            recordsCount += v.length;
            v.slice(0, 10).forEach(sub => {
              if (typeof sub === 'object' && sub !== null) {
                addDatabaseRecord(sub);
              }
              const q = sub.question || sub.q || sub.name || sub.title;
              const a = sub.answer || sub.a || sub.content || sub.description;
              if (q && a && isCustomerSafeFaq(String(q), String(a))) {
                knowledgeBase.push({ q: String(q).trim(), a: String(a).trim() });
              }
            });
          } else if (typeof v === 'string' && /^(about|faq|help|service|policy|hours|contact|shipping|returns|delivery)/i.test(k) && isCustomerSafeFaq(k.replace(/_/g, ' '), v)) {
            knowledgeBase.push({ q: k.replace(/_/g, ' '), a: v });
          }
        });
      }
    } catch (e) {
      // Safe skip on unparseable JSON
    }
  }

  // Case 2: SQL file - Parse real customer-facing catalog/medicine/product rows from INSERT INTO
  else if (fileName.toLowerCase().endsWith('.sql') || content.toLowerCase().includes('create table') || content.toLowerCase().includes('insert into')) {
    const tableMatches = content.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"']?[a-zA-Z0-9_]+[`"']?)/gi);
    for (const match of tableMatches) {
      const table = match[1].replace(/[`"']/g, '');
      schema.push(table);
    }

    const insertMatches = content.matchAll(/INSERT\s+INTO\s+([`"']?[a-zA-Z0-9_]+[`"']?)\s*(?:\(([^)]+)\))?\s*VALUES\s*([^;]+);/gi);
    for (const match of insertMatches) {
      recordsCount++;
      const table = match[1].replace(/[`"']/g, '').toLowerCase();
      const rawValues = match[3] || '';

      const isProductTable = /product|medicine|drug|item|catalog|service|inventory/i.test(table);
      if (isProductTable) {
        const tupleMatches = rawValues.matchAll(/\(([^)]+)\)/g);
        for (const tuple of tupleMatches) {
          const rawFields = tuple[1].split(',').map(f => f.trim().replace(/^['"]|['"]$/g, ''));
          const nameField = rawFields.find(f => f.length > 3 && isNaN(f) && !/^\d{4}-\d{2}-\d{2}/.test(f));
          const numFields = rawFields.filter(f => !isNaN(f) && Number(f) > 0);
          const descField = rawFields.find(f => f !== nameField && f.length > 10 && isNaN(f));

          if (nameField) {
            addDatabaseRecord({
              name: nameField,
              price: numFields.length > 0 ? `₹${numFields[0]}` : '',
              stock: numFields.length > 1 ? Number(numFields[1]) : 100,
              description: descField || ''
            });

            if (knowledgeBase.length < 35) {
              let details = `${nameField}.`;
              if (descField) details += ` ${descField}.`;
              if (numFields.length > 0) details += ` Price/Details: ₹${numFields[0]}.`;
              const q = `What is ${nameField}?`;
              if (isCustomerSafeFaq(q, details)) {
                knowledgeBase.push({ q, a: details });
              }
            }
          }
        }
      }
    }
  }

  // Case 3: Strictly CSV / TSV files ONLY (NEVER match JS/TS/code files just because they contain commas!)
  else if (
    (fileName.toLowerCase().endsWith('.csv') || fileName.toLowerCase().endsWith('.tsv')) &&
    !/^\s*(import\b|export\b|const\b|let\b|var\b|function\b|class\b|\/\/|\/\*|<(!doctype|html|script))/i.test(content)
  ) {
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    if (lines.length > 1) {
      const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, '').toLowerCase());
      schema = headers;
      recordsCount = lines.length - 1;

      const nameIdx = headers.findIndex(h => /name|title|product|medicine|item/i.test(h));
      const priceIdx = headers.findIndex(h => /price|cost|rate|fee|mrp/i.test(h));
      const stockIdx = headers.findIndex(h => /stock|qty|quantity|count/i.test(h));
      const catIdx = headers.findIndex(h => /category|type|dept|department/i.test(h));
      const unitIdx = headers.findIndex(h => /unit|packaging/i.test(h));

      lines.slice(1).forEach(line => {
        const cols = line.split(',').map(c => c.trim().replace(/['"]/g, ''));
        if (cols.length >= 2) {
          const itemTitle = nameIdx !== -1 ? cols[nameIdx] : cols[0];
          const itemPrice = priceIdx !== -1 ? cols[priceIdx] : '';
          const itemStock = stockIdx !== -1 ? parseInt(cols[stockIdx], 10) : null;
          const itemCat = catIdx !== -1 ? cols[catIdx] : '';
          const itemUnit = unitIdx !== -1 ? cols[unitIdx] : 'units';

          if (itemTitle && itemTitle.length > 2) {
            addDatabaseRecord({
              name: itemTitle,
              price: itemPrice ? (/[₹$€£]/.test(itemPrice) ? itemPrice : `₹${itemPrice}`) : '',
              stock: isNaN(itemStock) ? null : itemStock,
              category: itemCat,
              unit: itemUnit
            });
          }

          const q = `What is ${itemTitle}?`;
          const a = headers.map((h, i) => `${h}: ${cols[i] || 'N/A'}`).join(', ');
          if (isCustomerSafeFaq(q, a) && knowledgeBase.length < 35) {
            knowledgeBase.push({ q, a });
          }
        }
      });
    }
  }

  // Case 4: JavaScript / TypeScript Data Objects & Dictionaries (Only explicit data collections!)
  else if (fileName.toLowerCase().endsWith('.js') || fileName.toLowerCase().endsWith('.ts')) {
    // Only target explicit catalog variables (courses, programs, products, catalog, inventory, items, medicines, menu, dishes, services, plans)
    const objRegex = /(?:const|let|var)\s+(courses|programs|subjects|products|catalog|inventory|items|medicines|dishes|menu|services|plans|pricing|fleet|models)\s*=\s*(\[[\s\S]*?\]|\{[\s\S]*?\n\s*\};)/gi;
    let match;
    while ((match = objRegex.exec(content)) !== null) {
      const varName = match[1];
      const code = match[2];
      try {
        const fn = new Function('return ' + code.replace(/;\s*$/, ''));
        const obj = fn();
        if (Array.isArray(obj)) {
          obj.forEach(item => {
            if (typeof item === 'object' && item !== null) {
              recordsCount++;
              addDatabaseRecord(item);
            }
          });
        } else if (typeof obj === 'object' && obj !== null) {
          schema.push(varName);
          for (const [key, val] of Object.entries(obj)) {
            if (typeof val === 'object' && val !== null) {
              recordsCount++;
              const title = val.title || val.name || val.heading || key;
              addDatabaseRecord({ name: title, ...val });
              const category = val.category ? `Category: ${val.category}. ` : '';
              const desc = val.description || val.desc || val.summary || '';
              const specs = Array.isArray(val.materials || val.specs || val.features)
                ? ` Key Specs: ${(val.materials || val.specs || val.features).slice(0, 4).join('; ')}.`
                : '';
              
              if (title && (desc || specs)) {
                knowledgeBase.push({
                  q: `What are the details of ${title}?`,
                  a: `${category}${desc}${specs}`.trim()
                });
                knowledgeBase.push({
                  q: `Tell me about the ${key}`,
                  a: `${title}: ${desc}${specs}`.trim()
                });
              }
            }
          }
        }
      } catch (e) {
        // Safe skip on unparseable complex code
      }
    }
  }

  // Case 5: Universal Documents, Markdown, Plain Text, PDF/DOCX text, XML, YAML (NEVER executable source code!)
  const lowerExt = (fileName || '').toLowerCase();
  const isSourceCodeFile = /\.(m?js|cjs|ts|jsx|tsx|vue|svelte|css|scss|less|html?|py|go|java|php|rb|rs|c|cpp|cs|sh|bat)$/i.test(lowerExt);
  const isDocumentOrText =
    !isSourceCodeFile && (
      lowerExt.endsWith('.md') ||
      lowerExt.endsWith('.markdown') ||
      lowerExt.endsWith('.txt') ||
      lowerExt.endsWith('.doc') ||
      lowerExt.endsWith('.docx') ||
      lowerExt.endsWith('.pdf') ||
      lowerExt.endsWith('.rtf') ||
      lowerExt.endsWith('.xml') ||
      lowerExt.endsWith('.yaml') ||
      lowerExt.endsWith('.yml') ||
      lowerExt.endsWith('.log') ||
      lowerExt.endsWith('.env') ||
      lowerExt.endsWith('.ini') ||
      knowledgeBase.length === 0
    );

  if (isDocumentOrText && content) {
    // Sanitize non-printable binary junk (e.g. from PDF/DOCX or binary streams)
    const sanitizedText = content
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const rawLines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const discoveredItems = [];

    // 1. Extract Markdown / Section Headings (# Heading, ## Subheading, Heading:)
    const headingBlockRegex = /(?:^|\n)(#{1,4}\s+([^\n]+)|([A-Z0-9\s]{3,40}):)\n+([\s\S]*?)(?=\n#{1,4}\s+|\n[A-Z0-9\s]{3,40}:|$)/g;
    let hMatch;
    while ((hMatch = headingBlockRegex.exec(content)) !== null) {
      const heading = (hMatch[2] || hMatch[3] || '').trim();
      const body = (hMatch[4] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (heading.length > 2 && body.length > 10) {
        recordsCount++;
        knowledgeBase.push({
          q: `What is ${heading}?`,
          a: body.substring(0, 400)
        });
        if (/product|fleet|service|model|plan|package/i.test(heading)) {
          discoveredItems.push(heading);
        }
      }
    }

    // 2. Extract explicit Q&A patterns (Q: ... A: ... or Question: ... Answer: ...)
    const qaRegex = /(?:Q(?:uestion)?:\s*([^\n]+)\s*\n+A(?:nswer)?:\s*([^\n]+))/gi;
    let qaMatch;
    while ((qaMatch = qaRegex.exec(content)) !== null) {
      const q = qaMatch[1].trim();
      const a = qaMatch[2].trim();
      if (q && a) {
        recordsCount++;
        knowledgeBase.push({ q, a });
      }
    }

    // 3. Extract Bulleted Product / Service List Items (- Product: Description or * Feature: Details)
    for (const line of rawLines) {
      const bulletMatch = line.match(/^[-*•]\s+(?:\*\*([^*]+)\*\*|([A-Za-z0-9\s—–-]+))[:–—]\s*(.+)$/);
      if (bulletMatch) {
        const itemTitle = (bulletMatch[1] || bulletMatch[2] || '').trim();
        const itemDesc = (bulletMatch[3] || '').trim();
        if (itemTitle.length > 2 && itemDesc.length > 8 && itemTitle.length < 60) {
          const q = `What is ${itemTitle}?`;
          const a = `${itemTitle}: ${itemDesc}`;
          if (isCustomerSafeFaq(q, a)) {
            recordsCount++;
            discoveredItems.push(itemTitle);
            knowledgeBase.push({ q, a });
          }
        }
      }
    }

    // 4. Extract Key-Value Attributes (Key: Value)
    for (const line of rawLines) {
      const kvMatch = line.match(/^([A-Za-z0-9\s]{3,35}):\s+(.+)$/);
      if (kvMatch) {
        const key = kvMatch[1].trim();
        const val = kvMatch[2].trim();

        // Skip credentials, environment variables, technical config keys
        if (/^(api[_-]?key|auth[_-]?domain|project[_-]?id|storage[_-]?bucket|messaging[_-]?sender[_-]?id|sender[_-]?id|app[_-]?id|measurement[_-]?id|database[_-]?url|token|secret|client[_-]?id|password|port|host|db[_-]|private[_-]?key|jwt|cookie|session|ssl|cors)/i.test(key)) continue;
        if (/: AIza|firebaseapp\.com|firebasestorage\.app|1:\d+:web:/i.test(val)) continue;

        const q = `What is the ${key.toLowerCase()}?`;
        const a = `${key}: ${val}`;
        if (val.length > 3 && !line.startsWith('http') && isCustomerSafeFaq(q, a)) {
          knowledgeBase.push({ q, a });
        }
      }
    }

    // 5. Synthesize Master Catalog Summary if products or items discovered
    if (discoveredItems.length > 0) {
      const uniqueItems = Array.from(new Set(discoveredItems));
      const catalogSummary = `We offer: ${uniqueItems.slice(0, 10).join(', ')}. Ask me for details or specifications on any of these!`;
      knowledgeBase.unshift({
        q: "What products do you offer?",
        a: catalogSummary
      });
      knowledgeBase.unshift({
        q: "What products are available?",
        a: catalogSummary
      });
      knowledgeBase.unshift({
        q: "Tell me about your products",
        a: catalogSummary
      });
    }

    // 6. Synthesize Overview & Subject from Document Intro
    const introParagraph = rawLines.slice(0, 6).join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (introParagraph.length > 30 && !introParagraph.includes('{') && !introParagraph.includes('CREATE TABLE')) {
      const cleanSummary = introParagraph.substring(0, 350);
      knowledgeBase.unshift({
        q: "What is this website about?",
        a: cleanSummary
      });
      knowledgeBase.unshift({
        q: "What is the main point or subject of this website?",
        a: cleanSummary
      });
    }
  }

  // Filter out any technical or developer code items
  const sanitizedKnowledgeBase = knowledgeBase.filter(item => isCustomerSafeFaq(item.q, item.a));

  if (sanitizedKnowledgeBase.length === 0) {
    const cleanName = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    sanitizedKnowledgeBase.push({
      q: "What services and assistance do you provide?",
      a: "We provide comprehensive customer guidance, product assistance, and support. Please feel free to ask about our offerings or services!"
    });
    sanitizedKnowledgeBase.push({
      q: "What is this website about?",
      a: `Official support and customer guide for ${cleanName}.`
    });
  }

  const summary = `Knowledge Document (${fileName}): Analyzed and indexed ${sanitizedKnowledgeBase.length} customer-facing facts and ${databaseRecords.length} structured database records.`;

  return {
    type: 'database',
    fileName,
    recordsCount: recordsCount || sanitizedKnowledgeBase.length,
    schema,
    knowledgeBase: sanitizedKnowledgeBase,
    databaseRecords,
    databaseConfig,
    databaseProvider,
    summary,
    rawExcerpt: content.substring(0, 1500)
  };
}

/**
 * Universal multi-file analyzer
 * Accepts an array of { name: string, content: string }
 * Returns combined frontend, backend, and database analyses.
 */
export function analyzeFullStackFiles(fileList = []) {
  const result = {
    frontend: [],
    backend: [],
    database: [],
    tools: [],
    combinedKnowledge: [],
    databaseRecords: [],
    databaseConfig: null,
    databaseProvider: null,
    summary: ''
  };

  for (const file of fileList) {
    // Detect database credentials in any uploaded file (Firebase, Supabase, etc.)
    const creds = extractDatabaseCredentials(file.name, file.content);
    if (creds && creds.detected && creds.config) {
      result.databaseConfig = creds.config;
      result.databaseProvider = creds.providerName;
    }

    const detectedType = detectFileType(file.name, file.content);
    if (detectedType === 'frontend') {
      const analysis = analyzeFrontendFile(file.name, file.content);
      result.frontend.push(analysis);
      if (analysis.knowledgeBase && analysis.knowledgeBase.length > 0) {
        result.combinedKnowledge.push(...analysis.knowledgeBase);
      }
      if (analysis.catalogRecords && analysis.catalogRecords.length > 0) {
        result.databaseRecords.push(...analysis.catalogRecords);
      }
    } else if (detectedType === 'backend') {
      const analysis = analyzeBackendFile(file.name, file.content);
      result.backend.push(analysis);
      // Map endpoints directly to tools
      analysis.endpoints.forEach(ep => {
        result.tools.push({
          id: `tool_${ep.name}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          name: ep.name,
          type: 'API Request Tool',
          method: ep.method,
          endpoint: `https://api.yourwebsite.com${ep.path}`,
          description: ep.description
        });
      });
    } else {
      const analysis = analyzeDatabaseFile(file.name, file.content);
      result.database.push(analysis);
      if (analysis.knowledgeBase && analysis.knowledgeBase.length > 0) {
        result.combinedKnowledge.push(...analysis.knowledgeBase);
      }
      if (analysis.databaseRecords && Array.isArray(analysis.databaseRecords)) {
        result.databaseRecords.push(...analysis.databaseRecords);
      }
    }
  }

  // Strictly validate & deduplicate database records by name (ZERO code lines allowed!)
  const seenRecordNames = new Set();
  result.databaseRecords = result.databaseRecords.filter(rec => {
    const norm = (rec?.name || '').toLowerCase().trim();
    if (!norm || !isValidCustomerCatalogName(rec?.name, rec) || seenRecordNames.has(norm)) return false;
    seenRecordNames.add(norm);
    return true;
  });

  // Detect Website Archetype first using site title, frontend pages, records, and KB
  const detectedSiteTitle = result.frontend.find(f => f.siteTitle)?.siteTitle || '';
  const feHeadingsText = result.frontend.flatMap(f => f.pages || []).join(' ');
  result.archetype = detectWebsiteArchetype(detectedSiteTitle, feHeadingsText, result.databaseRecords, result.combinedKnowledge);
  result.archetypeMetadata = getArchetypeMetadata(result.archetype, detectedSiteTitle || 'our website');

  // Stage-1 Deep Website Workflow & Structure Blueprint Discovery (routes, sections, forms, fields, workflows)
  const siteBlueprint = extractWebsiteBlueprint(fileList, result.archetype, detectedSiteTitle);
  result.siteBlueprint = siteBlueprint;

  // Whole-Website Frontend Intelligence Extraction (KPIs, Stats, Charts, Report Tables & Cross-Page Summaries)
  const frontendIntelligence = buildCrossPageFrontendIndex(fileList, siteBlueprint.routes || []);
  result.frontendIntelligence = frontendIntelligence;
  siteBlueprint.frontendIndex = {
    pages: frontendIntelligence.pages.slice(0, 15),
    metrics: frontendIntelligence.metrics.slice(0, 30),
    charts: frontendIntelligence.charts.slice(0, 10).map(c => ({
      title: c.title,
      points: (c.points || []).slice(0, 12),
      min: c.min,
      max: c.max,
      trend: c.trend,
      unit: c.unit || '',
      summary: c.summary,
      pageLabel: c.pageLabel,
      pagePath: c.pagePath
    })),
    reportTables: frontendIntelligence.reportTables.slice(0, 8).map(t => ({
      title: t.title,
      headers: t.headers,
      rowCount: t.rowCount,
      rows: (t.rows || []).slice(0, 12),
      summary: t.summary,
      pageLabel: t.pageLabel,
      pagePath: t.pagePath
    }))
  };

  // Merge customer-facing workflow/form FAQs & frontend KPI/chart FAQs into combinedKnowledge
  if (Array.isArray(siteBlueprint.workflowFaqs) && siteBlueprint.workflowFaqs.length > 0) {
    result.combinedKnowledge.push(...siteBlueprint.workflowFaqs);
  }
  if (Array.isArray(frontendIntelligence.faqs) && frontendIntelligence.faqs.length > 0) {
    result.combinedKnowledge.push(...frontendIntelligence.faqs);
  }

  // Strictly filter combinedKnowledge for customer safety
  result.combinedKnowledge = result.combinedKnowledge.filter(item => isCustomerSafeFaq(item.q, item.a));

  // Deduplicate combinedKnowledge by question
  const seenQ = new Set();
  result.combinedKnowledge = result.combinedKnowledge.filter(item => {
    const qNorm = (item.q || '').toLowerCase().trim();
    if (!qNorm || seenQ.has(qNorm)) return false;
    seenQ.add(qNorm);
    return true;
  });

  // Summary generation
  const feCount = result.frontend.length;
  const beCount = result.backend.length;
  const dbCount = result.database.length;
  const totalTools = result.tools.length;
  const totalKb = result.combinedKnowledge.length;
  const totalDbRecords = result.databaseRecords.length;
  const totalForms = siteBlueprint.forms?.length || 0;
  const totalSections = siteBlueprint.sections?.length || 0;
  const totalRoutes = siteBlueprint.routes?.length || 0;

  // Precompute normalized catalog analytics for instant downstream reasoning
  const stats = computeCatalogStats(result.databaseRecords || []);
  result.catalogAnalytics = {
    count: stats.count,
    pricedCount: stats.pricedCount,
    inStockCount: stats.inStockCount,
    outOfStockCount: stats.outOfStockCount,
    minPrice: stats.minPriceEntry ? { name: stats.minPriceEntry.item.name, price: stats.minPriceEntry.item.price, value: stats.minPriceEntry.priceValue } : null,
    maxPrice: stats.maxPriceEntry ? { name: stats.maxPriceEntry.item.name, price: stats.maxPriceEntry.item.price, value: stats.maxPriceEntry.priceValue } : null,
    avgPrice: stats.avgPrice,
    currency: stats.currency,
    categories: stats.categories
  };

  result.summary = `Analyzed ${fileList.length} files (${feCount} Frontend, ${beCount} Backend, ${dbCount} Database). Mapped ${totalRoutes} routes, ${totalSections} sections, ${totalForms} interactive forms, ${totalDbRecords} database records, and ${totalKb} verified customer FAQs.`;

  return result;
}

/**
 * Detect the business/domain archetype of a website or database across all 10 archetypes.
 */
export function detectWebsiteArchetype(siteTitle = '', summary = '', sampleRecords = [], sampleKb = []) {
  const recordsText = (sampleRecords || []).map(r => `${r.name || ''} ${r.category || ''} ${r.description || ''}`).join(' ');
  const kbText = (sampleKb || []).map(k => `${k.q || ''} ${k.a || ''}`).join(' ');
  const combined = `${siteTitle} ${summary} ${recordsText} ${kbText}`.toLowerCase();

  if (/\b(admission|admissions|school|college|university|academy|academic|student|students|course|courses|degree|diploma|syllabus|faculty|tuition|shikshan|sanstha|vidyalaya|curriculum|exam|campus|hall\s*ticket|scholarship|standard\s*\d+|std\s*\d+|grade\s*\d+)\b/i.test(combined)) {
    return 'academic';
  }
  if (/\b(pharmacy|medicine|medicines|drug|drugs|pill|pills|tablet|tablets|prescription|capsule|syrup|dosage|clinic|hospital|patient|doctor|pharma|wellness)\b/i.test(combined)) {
    return 'healthcare';
  }
  if (/\b(restaurant|cafe|dining|food|dish|dishes|menu|bakery|pizza|burger|meal|kitchen|cuisine|dessert|beverage|chef|order\s*food|table\s*reservation)\b/i.test(combined)) {
    return 'food';
  }
  if (/\b(hotel|resort|room|rooms|stay|suite|check-in|check-out|villa|hostel|vacation|banquet)\b/i.test(combined)) {
    return 'hospitality';
  }
  if (/\b(software|saas|subscription|pricing\s*tier|starter\s*plan|pro\s*plan|enterprise\s*plan|cloud\s*platform|free\s*trial)\b/i.test(combined)) {
    return 'saas';
  }
  if (/\b(car|cars|vehicle|vehicles|automotive|dealership|showroom|test\s*drive|suv|sedan|motorcycle|bike|servicing)\b/i.test(combined)) {
    return 'automotive';
  }
  if (/\b(finance|financial|tax\s*filing|itr|gst|wealth\s*management|accounting|audit|loan|loans|investment|mutual\s*fund|consultancy)\b/i.test(combined)) {
    return 'financial';
  }
  if (/\b(real\s*estate|property|properties|apartment|apartments|flat|flats|2bhk|3bhk|plot|plots|site\s*visit|floor\s*plan)\b/i.test(combined)) {
    return 'realestate';
  }
  if (/\b(shop|store|e-commerce|ecommerce|sneaker|shoe|shoes|clothing|apparel|fashion|electronics|gadget|watch|cart|checkout|shipping|return\s*policy|add\s*to\s*cart)\b/i.test(combined)) {
    return 'ecommerce';
  }
  return 'general';
}

/**
 * Returns localized nouns and role descriptors based on archetype
 */
export function getArchetypeMetadata(archetype = 'general', brandName = 'our website') {
  switch (archetype) {
    case 'academic':
      return {
        archetype: 'academic',
        roleTitle: 'Academic Admissions & Student Support Guide',
        catalogHeading: 'Verified Academic Programs, Courses & Admissions Database',
        nouns: {
          en: 'courses / programs',
          hi: 'कोर्स / कार्यक्रम',
          mr: 'अभ्यासक्रम / कोर्सेस'
        },
        greeting: `Hello! Welcome to ${brandName}. I am your academic admissions and student support assistant. How can I help you with our courses, admissions, eligibility, or application process today?`,
        consumerClarification: 'I am here to assist students and parents with our academic admissions, courses, fees, eligibility criteria, and campus guidance. How can I help your application today?'
      };
    case 'healthcare':
      return {
        archetype: 'healthcare',
        roleTitle: 'Healthcare & Pharmacy Customer Specialist',
        catalogHeading: 'Verified Medicines & Healthcare Catalog Database',
        nouns: {
          en: 'medicines / products',
          hi: 'दवाइयां / उत्पाद',
          mr: 'औषधे / उत्पादने'
        },
        greeting: `Hello! Welcome to ${brandName}. I am your customer support guide for medicines, available stock, and healthcare products. How can I assist your health and wellness needs today?`,
        consumerClarification: 'I am here to help customers with our products, prices, stock availability, and store services. What item would you like to know about?'
      };
    case 'food':
      return {
        archetype: 'food',
        roleTitle: 'Menu & Dining Experience Guide',
        catalogHeading: 'Verified Restaurant Menu & Cuisine Database',
        nouns: {
          en: 'dishes / menu items',
          hi: 'व्यंजन / मेनू',
          mr: 'पदार्थ / मेनू'
        },
        greeting: `Hello! Welcome to ${brandName}. I am your dining assistant. How can I assist you with our menu, specials, or dining inquiries today?`,
        consumerClarification: 'I am here to help you explore our menu dishes, ingredients, prices, and dining options. What can I get started for you?'
      };
    case 'hospitality':
      return {
        archetype: 'hospitality',
        roleTitle: 'Guest Experience & Reservations Guide',
        catalogHeading: 'Verified Room Types, Suites & Amenities Database',
        nouns: {
          en: 'rooms / suites',
          hi: 'कमरे / सुइट्स',
          mr: 'खोल्या / सुइट्स'
        },
        greeting: `Hello! Welcome to ${brandName}. I am your guest assistance guide. How can I assist your stay, room reservations, or amenities today?`,
        consumerClarification: 'I am here to help guests with room bookings, amenities, rates, and stay inquiries. How can I assist your visit?'
      };
    case 'saas':
      return {
        archetype: 'saas',
        roleTitle: 'Product & Solutions Specialist',
        catalogHeading: 'Verified Software Solutions & Subscription Plans',
        nouns: {
          en: 'plans / solutions',
          hi: 'प्लान्स / सेवाएं',
          mr: 'प्लॅन्स / सेवा'
        },
        greeting: `Hello! Welcome to ${brandName}. I am your product and solutions specialist. How can I assist you with our features, pricing, or integrations today?`,
        consumerClarification: 'I am here to help you learn about our software features, plans, and technical capabilities. What solution are you looking for?'
      };
    default:
      return {
        archetype: 'general',
        roleTitle: 'Customer Support & Help Desk Assistant',
        catalogHeading: 'Verified Store Catalog & Product Database',
        nouns: {
          en: 'products / services',
          hi: 'उत्पाद / सेवाएं',
          mr: 'उत्पादने / सेवा'
        },
        greeting: `Hello! Welcome to ${brandName}. I am your customer support guide. How can I assist you with our products, services, or inquiries today?`,
        consumerClarification: 'I am here to help you with our products, prices, stock availability, and customer services. How can I assist you today?'
      };
  }
}
