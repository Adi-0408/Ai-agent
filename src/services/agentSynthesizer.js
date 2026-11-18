import { getUserApiKeys } from './aiCompletionService.js';

/**
 * Synthesize a Complete AI Agent from:
 * 1. User Prompt (e.g. "make an agent that assists visitors with booking and uses our database and backend")
 * 2. Multi-tier Codebase Files (Frontend, Backend, Database)
 * 3. Strict BYOK User Configuration (Groq or Gemini key)
 *
 * @param {string} userPrompt - High-level directive from user
 * @param {object} analysisResult - Result from analyzeFullStackFiles()
 * @param {object} userApiConfig - Optional explicit user API keys ({ groqKey, geminiKey, preferredProvider, allowOfflineRuleBased })
 * @returns {Promise<object>} Synthesized agent blueprint
 */
export async function synthesizeAgentFromFilesAndPrompt(userPrompt, analysisResult, userApiConfig = {}) {
  const { frontend, backend, database, tools, combinedKnowledge, databaseRecords, siteBlueprint, frontendIntelligence } = analysisResult;

  // Resolve user's BYOK keys (never fallback to developer keys)
  const storedKeys = getUserApiKeys();
  const effectiveGroqKey = (userApiConfig.groqKey || storedKeys.groqKey || '').trim();
  const effectiveGeminiKey = (userApiConfig.geminiKey || storedKeys.geminiKey || '').trim();
  const preferredProvider = userApiConfig.preferredProvider || storedKeys.preferredProvider || (effectiveGroqKey ? 'groq' : 'gemini');
  const allowOffline = Boolean(userApiConfig.allowOfflineRuleBased);

  const hasAnyKey = Boolean((effectiveGroqKey && effectiveGroqKey.startsWith('gsk_')) || (effectiveGeminiKey && effectiveGeminiKey.length > 15));

  // If no user API key is provided and offline rule-based mode is not explicitly allowed, throw MISSING_USER_API_KEY
  if (!hasAnyKey && !allowOffline) {
    const error = new Error('A personal Groq (gsk_...) or Google Gemini (AIza...) API key is required to synthesize an AI agent.');
    error.code = 'MISSING_USER_API_KEY';
    throw error;
  }

  // Extract primary website title and products
  const siteTitle = frontend.find(f => f.siteTitle)?.siteTitle || siteBlueprint?.brandName || '';
  const siteDesc = frontend.find(f => f.siteDesc)?.siteDesc || '';
  const discoveredProducts = frontend.flatMap(f => f.discoveredProducts || []);

  // Stage-1 Website Workflow & Structure Blueprint Summary (Fed directly into Stage-2 Synthesis!)
  const blueprintBlock = siteBlueprint ? `
WEBSITE ROLE & ARCHITECTURE:
${siteBlueprint.roleSummary || 'Customer website portal'}

END-TO-END CUSTOMER WORKFLOW:
${(siteBlueprint.workflows || []).map(w => `Step ${w.step}: ${w.title} -> ${w.action} [Target: ${w.href || w.targetPath || w.targetId || 'page'}]`).join('\n') || 'Standard customer inquiry workflow'}

DISCOVERED INTERACTIVE FORMS (EXACT FIELDS & REDIRECT TARGETS):
${(siteBlueprint.forms || []).map(f => `- Form: "${f.title}" (Target: ${f.href || f.path || f.id}, Submit: "${f.submitLabel}", Fields: ${f.fields.join(', ') || 'Standard inputs'})`).join('\n') || 'None detected'}

DISCOVERED IN-PAGE SECTIONS & ANCHORS:
${(siteBlueprint.sections || []).slice(0, 12).map(s => `- ${s.label} (${s.href}${s.page ? ` on ${s.page}` : ''})`).join('\n') || 'None detected'}

DISCOVERED PAGES / ROUTES:
${(siteBlueprint.routes || []).slice(0, 12).map(r => `- ${r.label} (${r.path})`).join('\n') || 'Single-page site'}

FRONTEND DASHBOARD METRICS, CHARTS, REPORTS & CROSS-PAGE INSIGHTS:
${(() => {
  const fi = frontendIntelligence || siteBlueprint?.frontendIndex;
  if (!fi) return 'Standard frontend content';
  const lines = [];
  if (Array.isArray(fi.metrics) && fi.metrics.length > 0) {
    lines.push(`Displayed KPIs/Stats: ${fi.metrics.slice(0, 12).map(m => `${m.label}: ${m.value}${m.delta ? ` (${m.delta})` : ''} [${m.pageLabel}]`).join('; ')}`);
  }
  if (Array.isArray(fi.charts) && fi.charts.length > 0) {
    lines.push(`Charts/Graphs: ${fi.charts.slice(0, 5).map(c => c.summary || c.title).join(' | ')}`);
  }
  if (Array.isArray(fi.reportTables) && fi.reportTables.length > 0) {
    lines.push(`Report Tables: ${fi.reportTables.slice(0, 4).map(t => t.summary || t.title).join(' | ')}`);
  }
  if (Array.isArray(fi.pages) && fi.pages.length > 1) {
    lines.push(`Cross-Page Map: ${fi.pages.slice(0, 8).map(p => `${p.pageLabel} (${p.pagePath}): ${p.summary.slice(0, 120)}`).join(' || ')}`);
  }
  return lines.join('\n') || 'Standard frontend content';
})()}
` : '';

  const frontendExcerpts = frontend.slice(0, 8).map(f => `File: ${f.fileName}
Site Title: ${f.siteTitle || 'N/A'}
Site Description: ${(f.siteDesc || 'N/A').slice(0, 180)}
Discovered Products/Fleet: ${(f.discoveredProducts || []).slice(0, 10).join(', ') || 'N/A'}
Pages/Headings: ${f.pages.slice(0, 6).join(', ')}
Forms: ${f.forms.slice(0, 5).join(', ')}`).join('\n\n').slice(0, 2200);

  const backendExcerpts = backend.slice(0, 6).map(b => `File: ${b.fileName}
${(b.summary || '').slice(0, 200)}
Endpoints:
${b.endpoints.slice(0, 8).map(e => ` - ${e.method} ${e.path} (${e.name})`).join('\n')}`).join('\n\n').slice(0, 1600);

  const databaseExcerpts = database.slice(0, 6).map(d => `File: ${d.fileName}
${(d.summary || '').slice(0, 200)}
Schema: ${d.schema.slice(0, 8).join(', ')}
Key Data/Specs:
${d.knowledgeBase.slice(0, 8).map(k => ` - Q: ${k.q} -> A: ${k.a.substring(0, 100)}`).join('\n')}`).join('\n\n').slice(0, 1600);

  const topFacts = combinedKnowledge.slice(0, 15).map(k => `- Q: "${k.q}" -> A: "${k.a.substring(0, 120)}"`).join('\n');

  const dbRecordsSummary = (databaseRecords || []).slice(0, 30).map(r => 
    `- ${r.name}: ${r.price ? (typeof r.price === 'number' ? `₹${r.price}` : r.price) : 'Price on request'}${r.stock !== null && r.stock !== undefined ? ` [Stock: ${r.stock} ${r.unit || 'units'}]` : ''}${r.dosage ? ` (${r.dosage})` : ''}`
  ).join('\n');

  const metaPrompt = `You are an elite AI Agent Architect.
A user has uploaded full-stack files (Frontend, Backend, and Database) and given a prompt instructing how to build an AI Voice Help Desk Agent.

USER PROMPT:
"${userPrompt || 'Build an intelligent voice assistant that guides visitors through this website and explains all products, features, and specs.'}"

UPLOADED FRONTEND CONTEXT (WEBSITE TITLE, MISSION & PRODUCTS):
${frontendExcerpts || 'General website interface and navigation'}

STAGE-1 DISCOVERED WEBSITE WORKFLOW, FORMS & NAVIGATION BLUEPRINT:
${blueprintBlock || 'Standard website structure'}

DISCOVERED PRODUCTS & CATALOG:
${discoveredProducts.length > 0 ? discoveredProducts.join(', ') : 'None explicitly tagged, extract from headings/facts below'}

VERIFIED STORE DATABASE CATALOG & RECORDS:
${dbRecordsSummary || 'None explicitly provided in upload; live bridge active'}

VERIFIED KNOWLEDGE BASE FACTS EXTRACTED FROM FILES:
${topFacts || 'General website information'}

UPLOADED BACKEND CONTEXT (API ROUTES & TOOLS):
${backendExcerpts || 'None provided'}

CRITICAL ARCHITECTURAL RULES:
1. NEVER use generic placeholder text like "[specific service/product]", "[insert company]", or "[your product]". Always use the real names, products, and technical specifications extracted from the user's files.
2. If the files describe a specific brand (e.g. Sangli Shikshan Sanstha, Aura Retail, Horizon Care), name the assistant specifically (e.g. "Admissions Counselor", "Retail Concierge") and write a tailored first greeting.
3. In "knowledgeBase", provide at least 8 to 12 accurate, realistic Q&As detailing:
   - What the website is about (grounded in the site title and description)
   - What products or services are offered (listing the actual products found)
   - Detailed answers for each specific product, model, or technical subsystem
   - Support, consultation, or contact information.
4. Train the systemPrompt with Flipkart/Amazon-grade helpdesk accuracy, analytical reasoning, and honest reliability: deeply grounded in the verified store database catalog, answering directly with real product names, exact prices, stock, comparisons, and clear guidance with zero hallucination. Explicitly instruct the agent that if a fact is not in its verified data, it must honestly communicate uncertainty rather than guessing or inventing details.
5. STRICT CUSTOMER-ONLY AUDIENCE: The assistant is used solely by ordinary website visitors, customers, and shoppers, NOT by developers or database engineers. All questions and answers in "knowledgeBase" must be 100% customer-facing (product pricing, stock availability, specifications, services, contact, policies). NEVER include internal database schema queries, table names, SQL queries, database architecture, or developer notes in "knowledgeBase" or "systemPrompt".

Respond ONLY with a valid JSON object matching this structure (no markdown formatting, no backticks, just raw JSON):
{
  "name": "Concierge Name (e.g. Admissions Counselor)",
  "role": "Concise role (e.g. Student Admissions Counselor)",
  "greeting": "Friendly, spoken 1-sentence greeting welcoming visitors to the website",
  "voice": "Clara",
  "model": "Groq Llama 3.3 70B Versatile",
  "systemPrompt": "Comprehensive system prompt instructing the agent on identity, grounded website products, specifications, and spoken pacing.",
  "tools": [
    {
      "name": "toolName",
      "type": "API Request Tool",
      "method": "GET",
      "endpoint": "https://api.yourwebsite.com/api/...",
      "description": "Short explanation of what the tool does"
    }
  ],
  "knowledgeBase": [
    {
      "q": "What is this website about?",
      "a": "Accurate, grounded description of this website."
    },
    {
      "q": "What products or services do you offer?",
      "a": "Comprehensive list of actual products or models found in the files."
    }
  ],
  "explanation": "Clear 2-sentence summary explaining how the agent was created from the user's prompt and files."
}`;

  let rawResponse = '';

  const callGroqSynthesis = async () => {
    const groqPlan = [
      { modelId: 'llama-3.3-70b-versatile', timeoutMs: 7000 },
      { modelId: 'llama-3.1-8b-instant', timeoutMs: 5000 }
    ];
    for (const { modelId, timeoutMs } of groqPlan) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${effectiveGroqKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: modelId,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: 'You are an AI system architect. First understand the website workflow, forms, and structure, then output valid JSON only.' },
              { role: 'user', content: metaPrompt }
            ],
            temperature: 0.25,
            max_tokens: 1500
          }),
          signal: AbortSignal.timeout(timeoutMs)
        });

        if (res.ok) {
          const data = await res.json();
          const txt = data.choices?.[0]?.message?.content || '';
          if (txt) return txt;
        }
      } catch (e) {
        console.warn(`Groq synthesis (${modelId}) failed:`, e);
      }
    }
    return '';
  };

  const callGeminiSynthesis = async () => {
    const geminiPlan = [
      { modelId: 'gemini-2.5-flash', timeoutMs: 7000 },
      { modelId: 'gemini-2.0-flash', timeoutMs: 5000 }
    ];
    for (const { modelId, timeoutMs } of geminiPlan) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${effectiveGeminiKey}`;
        const res = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: metaPrompt }] }],
            generationConfig: {
              temperature: 0.25,
              responseMimeType: 'application/json'
            }
          }),
          signal: AbortSignal.timeout(timeoutMs)
        });

        if (res.ok) {
          const data = await res.json();
          const txt = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (txt) return txt;
        }
      } catch (e) {
        console.warn(`Gemini synthesis (${modelId}) failed:`, e);
      }
    }
    return '';
  };

  // 1. Try User's Preferred Key First, then automatic cascade
  if (preferredProvider === 'groq' && effectiveGroqKey && effectiveGroqKey.startsWith('gsk_')) {
    rawResponse = await callGroqSynthesis();
  }
  if (!rawResponse && effectiveGeminiKey) {
    rawResponse = await callGeminiSynthesis();
  }
  if (!rawResponse && preferredProvider === 'gemini' && effectiveGroqKey && effectiveGroqKey.startsWith('gsk_')) {
    rawResponse = await callGroqSynthesis();
  }

  // 4. Parse JSON response
  let parsedAgent = null;
  if (rawResponse) {
    try {
      const cleanJson = rawResponse
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      parsedAgent = JSON.parse(cleanJson);
    } catch (err) {
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsedAgent = JSON.parse(jsonMatch[0]);
        } catch (e) {}
      }
    }
  }

  // 5. Sanitize parsed agent from any potential LLM bracket placeholders
  if (parsedAgent && parsedAgent.knowledgeBase) {
    parsedAgent.knowledgeBase = parsedAgent.knowledgeBase.map(item => {
      let q = item.q || '';
      let a = item.a || '';
      if (a.includes('[') && a.includes(']')) {
        const matchingReal = combinedKnowledge.find(k => k.q.toLowerCase().includes(q.toLowerCase()) || q.toLowerCase().includes(k.q.toLowerCase()));
        if (matchingReal && !matchingReal.a.includes('[')) {
          a = matchingReal.a;
        } else if (siteDesc) {
          a = `${siteTitle || 'Our company'} is dedicated to: ${siteDesc}`;
        } else {
          a = a.replace(/\[specific service\/product\]/gi, (discoveredProducts[0] || 'our flagship services'))
               .replace(/\[[^\]]+\]/g, 'our official offerings');
        }
      }
      return { q, a };
    });

    if (parsedAgent.greeting && parsedAgent.greeting.includes('[')) {
      parsedAgent.greeting = `Hello! Welcome to ${siteTitle || 'our website'}. How can I assist you today?`;
    }
    if (parsedAgent.systemPrompt && parsedAgent.systemPrompt.includes('[')) {
      parsedAgent.systemPrompt = parsedAgent.systemPrompt.replace(/\[specific service\/product\]/gi, (discoveredProducts.join(', ') || 'our flagship offerings')).replace(/\[[^\]]+\]/g, 'our services');
    }

    const existingQuestions = new Set(parsedAgent.knowledgeBase.map(k => (k.q || '').toLowerCase().trim()));
    combinedKnowledge.forEach(k => {
      if (parsedAgent.knowledgeBase.length < 25 && !existingQuestions.has((k.q || '').toLowerCase().trim())) {
        parsedAgent.knowledgeBase.push(k);
        existingQuestions.add((k.q || '').toLowerCase().trim());
      }
    });
  }

  // 6. Deterministic fallback if LLM offline, no key, or parse failed
  if (!parsedAgent || !parsedAgent.name) {
    const detectedBrand = siteTitle.split(/[—–|-]/)[0].trim() || 'Website';
    const defaultName = extractAgentNameFromPrompt(userPrompt) || (siteTitle ? `${detectedBrand} Concierge` : 'Website Concierge');
    const combinedKb = combinedKnowledge.length > 0 ? combinedKnowledge.slice(0, 30) : [
      { q: "What is this website about?", a: `${siteTitle || 'Our website'} provides comprehensive online customer support, detailed product inquiries, and digital assistance.` },
      { q: "What products or services do you offer?", a: discoveredProducts.length > 0 ? `Our flagship models and products include: ${discoveredProducts.slice(0, 6).join(', ')}.` : "We offer bespoke products, consultation sessions, and online customer care." },
      { q: "How can I contact human support?", a: "You can reach our team via our contact form or leave an inquiry anytime." }
    ];

    const fallbackTools = tools.length > 0 ? tools : [
      {
        name: "contactSupport",
        type: "Webhook Tool",
        method: "POST",
        endpoint: "https://api.yourwebsite.com/api/contact",
        description: "Sends visitor inquiry to internal customer support"
      }
    ];

    parsedAgent = {
      name: defaultName,
      role: siteTitle ? `${detectedBrand} Product & VIP Advisor` : "Full-Stack AI Help Desk & Action Assistant",
      greeting: `Hello! Welcome to ${siteTitle || defaultName}. How can I assist you with our products, specifications, or inquiries today?`,
      voice: "Clara",
      model: hasAnyKey ? (effectiveGroqKey ? "Groq Llama 3.3 70B Versatile" : "Google Gemini 2.5 Flash") : "Groq Llama 3.3 70B Versatile",
      preset: "High Intelligence",
      systemPrompt: `# ${defaultName} - AI Voice & Chat Customer Support Agent

## Core Identity & Assignment
You are ${defaultName}, the dedicated omni-channel AI Customer Support & Help Desk Agent created directly from this website's codebase, data catalog, and business knowledge.
Your mission is to provide world-class customer service across BOTH voice and chat systems: helping customers resolve issues, answering product/service questions, explaining pricing and policies, guiding them step-by-step, and triggering backend actions.

## Guidelines from User Prompt:
"${userPrompt}"

## Frontend UI Context:
${frontendExcerpts || 'General website interface and navigation'}

## Discovered Products & Catalog:
${discoveredProducts.length > 0 ? discoveredProducts.join(', ') : 'Refer to Knowledge Base Facts below'}

## Backend Action Tools:
You have access to backend API tools: ${fallbackTools.map(t => `${t.name} (${t.method} ${t.endpoint})`).join(', ')}.
Trigger these tools whenever a visitor requests actions like looking up records, submitting inquiries, or checking status.

## Verified Knowledge Base Facts:
${combinedKb.slice(0, 20).map(k => `- Q: ${k.q} -> A: ${k.a}`).join('\n')}

## Voice Pacing & Conversational Constraints:
- Keep spoken answers to 1-2 clear, helpful sentences.
- Be warm, accurate, and prompt. If unsure, politely guide the user or trigger the support tool.
- Normal & General Questions: In addition to business FAQs and website facts, warmly and helpfully address normal everyday questions, greetings, small talk, and general inquiries in 1-2 spoken sentences. Never refuse casual conversation or state you lack data for ordinary questions.`,
      tools: fallbackTools,
      knowledgeBase: combinedKb,
      explanation: `Synthesized your full-stack files into ${defaultName}. Analyzed ${frontend.length} frontend views, indexed ${discoveredProducts.length} flagship products, and verified ${combinedKb.length} grounded knowledge entries.`
    };
  }

  // Ensure human-readable title ID and attach ONLY user's key, records, archetype, and Stage-1 siteBlueprint
  const cleanId = (parsedAgent.name || 'AI Assistant').trim().replace(/\//g, '-');
  parsedAgent.id = cleanId;
  parsedAgent.apiKey = effectiveGroqKey || effectiveGeminiKey || '';
  parsedAgent.databaseRecords = Array.isArray(analysisResult?.databaseRecords) ? analysisResult.databaseRecords : [];
  parsedAgent.archetype = analysisResult?.archetype || 'general';
  parsedAgent.siteBlueprint = siteBlueprint || null;

  return parsedAgent;
}

function extractAgentNameFromPrompt(prompt = '') {
  const match = prompt.match(/(?:call it|name it|named|agent called|assistant named)\s+["']?([A-Za-z0-9\s]+?)["']?(?:[.,\n]|$)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}
