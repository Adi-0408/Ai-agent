/**
 * Multi-Tier Codebase & File Analyzer
 * Intelligently inspects, categorizes, and extracts knowledge from:
 * 1. Frontend files (.html, .jsx, .tsx, .vue, .js, .css)
 * 2. Backend files (.js, .ts, .py, .json, .go, routes, controllers, OpenAPI)
 * 3. Database & Knowledge Documents (.json, .sql, .csv, .txt, .md, .pdf, .docx, .xml, .yaml, tables, collections)
 */

import { extractDatabaseCredentials } from './databaseKeyExtractor.js';

export function detectFileType(fileName, content) {
  const lowerName = (fileName || '').toLowerCase();
  const lowerContent = (content || '').toLowerCase();

  // 1. Database & Document files
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
    lowerName.endsWith('.prisma') ||
    lowerName.includes('database') ||
    lowerName.includes('schema') ||
    lowerName.includes('dump') ||
    lowerName.includes('catalog') ||
    lowerName.includes('doc')
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
    lowerName.endsWith('.py') ||
    lowerName.endsWith('.go') ||
    lowerName.endsWith('.java') ||
    lowerName.endsWith('.php') ||
    lowerName.endsWith('.rb') ||
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

  return 'database'; // Universal safe fallback for documents & data
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

  // 4. Extract Heading + Paragraph pairs (Rich Website Knowledge Facts)
  const hPairRegex = /<(h[2-4])[^>]*>([\s\S]*?)<\/\1>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch;
  while ((pMatch = hPairRegex.exec(content)) !== null) {
    const hText = clean(pMatch[2]);
    const pText = clean(pMatch[3]);
    if (hText.length > 3 && pText.length > 15 && hText.length < 90) {
      knowledgeBase.push({
        q: `What is ${hText}?`,
        a: pText
      });
    }
  }

  // 5. Discover Product Names & Flagship Fleet Items
  const discoveredProducts = [];
  for (const heading of rawHeadings) {
    // Detect products/models: contains keywords like car, model, edition, gt, apex, ev, v8, v12, pro, plus, plan, suite, service
    if (
      /zenith|gt|apex|ev|turbo|hybrid|v12|v8|motor|chassis|suspension|brake|exhaust|telemetry|model|edition|package|studio|atelier|customizer/i.test(heading) &&
      !/anatomy|fleet|navigation|menu|footer|header|welcome/i.test(heading)
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

  // 7. Check for pricing signs like $ or USD
  const priceMatches = content.matchAll(/\$\s?(\d+(?:,\d{3})*(?:\.\d{2})?)/g);
  for (const match of priceMatches) {
    if (!pricingOrProducts.includes(`$${match[1]}`)) {
      pricingOrProducts.push(`$${match[1]}`);
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

  const summary = `Frontend file (${fileName}): Extracted site title "${siteTitle || fileName}", ${pages.length} headings, ${discoveredProducts.length} products/models, ${knowledgeBase.length} grounded Q&A facts, and ${forms.length} forms.`;

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
    /\b(id|created_at|updated_at|supplier_id|deleted_at|hash|password|secret|salt)\s*:\s*/i // Database internal dumps
  ];

  if (codePatterns.some(pat => pat.test(aStr))) return false;
  if (codePatterns.some(pat => pat.test(qStr))) return false;

  // 3. Reject developer task notes, database query descriptions, and backend jargon
  if (/\b(sql query|database query|database table|select query|query the database|db connection|database dump|schema dump)\b/i.test(aLower)) {
    return false;
  }
  if (/^[-*•]?\s*(record supplier invoices|automatically increment|purchase history register|todo:|fixme:|refactor)/i.test(aLower)) {
    return false;
  }

  // 4. Reject meaningless generic dumps
  if (/^database includes table/i.test(aLower)) return false;

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

  function addDatabaseRecord(rec) {
    if (!rec) return;
    const name = String(rec.name || rec.product || rec.title || rec.item || '').trim();
    if (!name || name.length < 2 || name.length > 70) return;
    if (/^(what\b|tell me\b|how\b|can you\b|why\b|who\b|test\b|sample\b|untitled\b|sr\.?no\b|action\b|features?\b|services?\b|welcome\b|about\b)/i.test(name)) return;
    if (name.includes('?') || name.includes('{') || name.includes('CREATE TABLE')) return;
    if (name.split(/\s+/).length > 8) return;

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

  // Case 3: CSV file
  else if (fileName.toLowerCase().endsWith('.csv') || content.includes(',')) {
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

  // Case 4: JavaScript / TypeScript Data Objects & Dictionaries
  else if (fileName.toLowerCase().endsWith('.js') || fileName.toLowerCase().endsWith('.ts') || content.includes('const ') || content.includes('let ')) {
    const objRegex = /(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(\{[\s\S]*?\n\s*\};)/g;
    let match;
    while ((match = objRegex.exec(content)) !== null) {
      const varName = match[1];
      const code = match[2];
      try {
        const fn = new Function('return ' + code.replace(/;\s*$/, ''));
        const obj = fn();
        if (typeof obj === 'object' && obj !== null) {
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

  // Case 5: Universal Documents, Markdown, Plain Text, PDF/DOCX text, XML, YAML, and All File Types
  const lowerExt = (fileName || '').toLowerCase();
  const isDocumentOrText =
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
    knowledgeBase.length === 0;

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

  // Deduplicate database records by name
  const seenRecordNames = new Set();
  result.databaseRecords = result.databaseRecords.filter(rec => {
    const norm = (rec.name || '').toLowerCase().trim();
    if (!norm || seenRecordNames.has(norm)) return false;
    seenRecordNames.add(norm);
    return true;
  });

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

  result.summary = `Analyzed ${fileList.length} files (${feCount} Frontend, ${beCount} Backend, ${dbCount} Database). Indexed ${totalDbRecords} live database records, discovered ${totalTools} backend API tools, and extracted ${totalKb} verified knowledge points across products, services, and specifications.`;

  return result;
}
