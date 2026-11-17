/**
 * AI Knowledge Base & Assistant Prompt Extractor
 * Parses JSON files (database dumps, product catalogs, FAQ lists, website content)
 * and generates an optimal System Prompt, structured Database Records, and Knowledge Base.
 */

import { isCustomerSafeFaq } from './codebaseAnalyzer.js';

export function parseJsonFile(fileContent) {
  try {
    let parsed = typeof fileContent === 'string' ? JSON.parse(fileContent) : fileContent;
    return { success: true, data: parsed };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Intelligently analyzes JSON database/website data and extracts:
 * 1. An array of structured databaseRecords ({ name, price, stock, unit, category, dosage, description, rx })
 * 2. An array of { q: string, a: string } customer-facing FAQ knowledge entries
 * 3. An auto-generated system prompt tailored to the data
 * 4. A default conversational greeting
 */
export function extractKnowledgeFromJson(jsonData, assistantName = 'Assistant', websiteName = 'the website') {
  const knowledgeBase = [];
  const databaseRecords = [];
  let detectedType = 'general';

  function addExtractedRecord(item) {
    if (!item || typeof item !== 'object') return;
    const rawName = String(item.name || item.product || item.title || item.item || '').trim();
    if (!rawName || rawName.length < 2 || rawName.length > 70) return;
    // Reject questions, meta prompts, and non-product phrases
    if (/^(what\b|tell me\b|how\b|can you\b|why\b|who\b|test\b|sample\b|untitled\b|sr\.?no\b|action\b|features?\b|services?\b|welcome\b|about\b)/i.test(rawName)) return;
    if (rawName.includes('?') || rawName.includes('{') || rawName.includes('CREATE TABLE')) return;
    if (rawName.split(/\s+/).length > 8) return;

    const price = item.price !== undefined ? (typeof item.price === 'number' ? `₹${item.price}` : String(item.price).trim()) : '';
    const stock = item.stock !== undefined ? Number(item.stock) : (item.quantity !== undefined ? Number(item.quantity) : (item.qty !== undefined ? Number(item.qty) : null));
    const unit = String(item.unit || item.packaging || 'units').trim();
    const category = String(item.category || item.department || item.type || '').trim();
    const dosage = String(item.dosage || item.composition || item.salt || '').trim();
    const desc = String(item.description || item.desc || item.details || '').trim();
    const rx = Boolean(item.rx || item.prescriptionRequired);

    // If item has no price, no stock, and desc starts with "We offer:", it's a feature summary, not a catalog product
    if (!price && (stock === null || isNaN(stock)) && /^(we offer:|welcome to)/i.test(desc)) return;

    const existing = databaseRecords.find(r => r.name.toLowerCase() === rawName.toLowerCase());
    if (!existing) {
      databaseRecords.push({
        id: item.id || `rec_${databaseRecords.length + 1}`,
        name: rawName,
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

  // Case 1: Array of objects (Database rows or FAQ items)
  if (Array.isArray(jsonData)) {
    jsonData.forEach((item) => {
      if (typeof item === 'object' && item !== null) {
        addExtractedRecord(item);

        const question = item.question || item.q || item.query || item.topic;
        const answer = item.answer || item.a || item.response || item.content || item.description || item.details;

        if (question && answer) {
          const q = String(question).trim();
          const a = typeof answer === 'object' ? JSON.stringify(answer) : String(answer).trim();
          if (isCustomerSafeFaq(q, a)) {
            knowledgeBase.push({ q, a });
          }
        } else if (item.name || item.title) {
          detectedType = 'products';
          const title = String(item.name || item.title).trim();
          // Only create FAQ if not starting with question words
          if (!/^(what\b|tell me\b|how\b|can you\b|why\b|who\b)/i.test(title)) {
            const priceStr = item.price ? `Price: ${item.price}. ` : '';
            const categoryStr = item.category ? `Category: ${item.category}. ` : '';
            const descStr = item.description || item.desc || item.details || '';
            const q = `What is ${title}?`;
            const a = `${title}. ${categoryStr}${priceStr}${descStr}`.trim();
            if (isCustomerSafeFaq(q, a)) {
              knowledgeBase.push({ q, a });
            }
          }
        }
      }
    });
  } 
  // Case 2: Object with categories or tables (e.g. { faqs: [...], products: [...], inventory: [...] })
  else if (typeof jsonData === 'object' && jsonData !== null) {
    const inv = jsonData.liveInventory || jsonData.inventory || jsonData.products || jsonData.items || jsonData.catalog || jsonData.records || jsonData.menu;
    if (inv) {
      if (Array.isArray(inv)) {
        inv.forEach(addExtractedRecord);
      } else if (typeof inv === 'object') {
        for (const [key, val] of Object.entries(inv)) {
          if (val && typeof val === 'object') {
            addExtractedRecord({ name: val.name || key, ...val });
          } else if (val !== undefined) {
            addExtractedRecord({ name: key, stock: val });
          }
        }
      }
    }

    const keys = Object.keys(jsonData);
    for (const key of keys) {
      const val = jsonData[key];
      if (Array.isArray(val)) {
        val.forEach(subItem => {
          if (typeof subItem === 'object' && subItem !== null) {
            addExtractedRecord(subItem);
            const q = subItem.q || subItem.question || subItem.query || subItem.topic;
            const a = subItem.a || subItem.answer || subItem.content || subItem.description || subItem.text;
            if (q && a) {
              const qStr = String(q).trim();
              const aStr = String(a).trim();
              if (isCustomerSafeFaq(qStr, aStr)) {
                knowledgeBase.push({ q: qStr, a: aStr });
              }
            }
          }
        });
      } else if (typeof val === 'string' && val.length > 5) {
        const qStr = key.replace(/_/g, ' ');
        const aStr = val.trim();
        if (isCustomerSafeFaq(qStr, aStr)) {
          knowledgeBase.push({ q: qStr, a: aStr });
        }
      }
    }
  }

  // Safe Customer Fallback if no entries mapped
  if (knowledgeBase.length === 0 && databaseRecords.length === 0) {
    knowledgeBase.push({
      q: "What products and services do you offer?",
      a: `Welcome to ${websiteName}! We provide comprehensive solutions and customer assistance. Ask our assistant for details on our products and services.`
    });
    knowledgeBase.push({
      q: "What is this website about?",
      a: `Official online customer service portal for ${websiteName}.`
    });
  }

  // Generate Tailored System Prompt
  const knowledgeSummary = knowledgeBase.slice(0, 15).map(k => `- Q: "${k.q}" -> A: "${k.a.substring(0, 100)}..."`).join('\n');
  const dbSummary = databaseRecords.slice(0, 10).map(r => `- ${r.name}${r.price ? ` (${r.price})` : ''}`).join('\n');

  const systemPrompt = `# ${assistantName} - Customer Support & Help Desk Assistant

## Identity & Purpose
You are ${assistantName}, the official AI Voice and Chat Help Desk assistant for ${websiteName}.
Your objective is to provide friendly, direct, concise, and accurate answers to website visitors and customers based on the provided company database and documentation.

## Core Database & Verified Knowledge
${databaseRecords.length > 0 ? `Database Catalog Records:\n${dbSummary}\n\n` : ''}${knowledgeSummary ? `Knowledge Base:\n${knowledgeSummary}` : ''}

## Conversational Voice Guidelines
- Tone: Welcoming, empathetic, professional, and confident.
- Pacing & Length: Keep answers concise (1 to 2 clear spoken sentences). Avoid lengthy bulleted lists unless explicitly requested.
- Accuracy: Only state facts from the provided database. If an item is not found, state that politely without technical jargon.
- Multilingual: Support English, Hindi, and Marathi seamlessly based on user preference.`;

  const greeting = `Hello! Welcome to ${websiteName}. I am ${assistantName}, your voice and chat assistant. How can I assist you with our catalog, services, or inquiries today?`;

  return {
    knowledgeBase,
    databaseRecords,
    systemPrompt,
    greeting,
    detectedType: databaseRecords.length > 0 ? 'products' : detectedType,
    itemsExtracted: knowledgeBase.length + databaseRecords.length
  };
}
