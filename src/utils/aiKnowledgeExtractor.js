/**
 * AI Knowledge Base & Assistant Prompt Extractor
 * Parses JSON files (database dumps, product catalogs, FAQ lists, website content)
 * and generates an optimal System Prompt and structured Knowledge Base.
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
 * 1. An array of { q: string, a: string } knowledge entries
 * 2. An auto-generated system prompt tailored to the data
 * 3. A default conversational greeting
 */
export function extractKnowledgeFromJson(jsonData, assistantName = 'Assistant', websiteName = 'the website') {
  const knowledgeBase = [];
  let detectedType = 'general';
  let totalItemsCount = 0;

  // Case 1: Array of FAQ items ({ question, answer } or { q, a } or { title, content })
  if (Array.isArray(jsonData)) {
    totalItemsCount = jsonData.length;
    jsonData.forEach((item) => {
      if (typeof item === 'object' && item !== null) {
        const question = item.question || item.q || item.query || item.title || item.topic || item.name;
        const answer = item.answer || item.a || item.response || item.content || item.description || item.details;

        if (question && answer) {
          const q = String(question).trim();
          const a = typeof answer === 'object' ? JSON.stringify(answer) : String(answer).trim();
          if (isCustomerSafeFaq(q, a)) {
            knowledgeBase.push({ q, a });
          }
        } else if (item.name || item.title) {
          // E.g. Product or Database Row
          detectedType = 'products';
          const title = item.name || item.title;
          const price = item.price ? `Price: ${item.price}. ` : '';
          const category = item.category ? `Category: ${item.category}. ` : '';
          const desc = item.description || item.desc || item.details || '';
          const q = `What is ${title}?`;
          const a = `${title}. ${category}${price}${desc}`.trim();
          if (isCustomerSafeFaq(q, a)) {
            knowledgeBase.push({ q, a });
          }
        }
      }
    });
  } 
  // Case 2: Object with categories or tables (e.g. { faqs: [...], products: [...], pages: [...] })
  else if (typeof jsonData === 'object' && jsonData !== null) {
    const keys = Object.keys(jsonData);
    for (const key of keys) {
      const val = jsonData[key];
      if (Array.isArray(val)) {
        val.forEach(subItem => {
          if (typeof subItem === 'object' && subItem !== null) {
            const q = subItem.q || subItem.question || subItem.name || subItem.title;
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
  if (knowledgeBase.length === 0) {
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

  const systemPrompt = `# ${assistantName} - AI Help Desk Assistant

## Identity & Purpose
You are ${assistantName}, the official AI Voice and Chat Help Desk assistant for ${websiteName}.
Your objective is to provide friendly, direct, concise, and accurate answers to website visitors and customers based on the provided company database and documentation.

## Core Knowledge & Context
You have access to the verified database and website knowledge below:
${knowledgeSummary}

## Conversational Voice Guidelines
- Tone: Welcoming, empathetic, professional, and confident.
- Pacing & Length: Keep answers concise (1 to 2 clear spoken sentences). Avoid lengthy bulleted lists unless explicitly requested.
- Accuracy: Only state facts from the provided database. If an answer cannot be determined from the database, politely invite the user to leave their contact info or connect with human support.
- Action-Oriented: Help users navigate products, find answers, and resolve inquiries efficiently.`;

  const greeting = `Hello! Welcome to ${websiteName}. I am ${assistantName}, your voice assistant. How can I assist you with our services today?`;

  return {
    knowledgeBase,
    systemPrompt,
    greeting,
    detectedType,
    itemsExtracted: knowledgeBase.length
  };
}
