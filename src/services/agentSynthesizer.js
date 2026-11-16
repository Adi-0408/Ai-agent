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
  const { frontend, backend, database, tools, combinedKnowledge } = analysisResult;

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
  const siteTitle = frontend.find(f => f.siteTitle)?.siteTitle || '';
  const siteDesc = frontend.find(f => f.siteDesc)?.siteDesc || '';
  const discoveredProducts = frontend.flatMap(f => f.discoveredProducts || []);

  const frontendExcerpts = frontend.map(f => `File: ${f.fileName}
Site Title: ${f.siteTitle || 'N/A'}
Site Description: ${f.siteDesc || 'N/A'}
Discovered Products/Fleet: ${(f.discoveredProducts || []).join(', ') || 'N/A'}
Pages/Headings: ${f.pages.slice(0, 8).join(', ')}
Forms: ${f.forms.join(', ')}`).join('\n\n');

  const backendExcerpts = backend.map(b => `File: ${b.fileName}
${b.summary}
Endpoints:
${b.endpoints.map(e => ` - ${e.method} ${e.path} (${e.name})`).join('\n')}`).join('\n\n');

  const databaseExcerpts = database.map(d => `File: ${d.fileName}
${d.summary}
Schema: ${d.schema.join(', ')}
Key Data/Specs:
${d.knowledgeBase.slice(0, 10).map(k => ` - Q: ${k.q} -> A: ${k.a.substring(0, 120)}`).join('\n')}`).join('\n\n');

  const topFacts = combinedKnowledge.slice(0, 15).map(k => `- Q: "${k.q}" -> A: "${k.a.substring(0, 120)}"`).join('\n');

  const metaPrompt = `You are an elite AI Agent Architect.
A user has uploaded full-stack files (Frontend, Backend, and Database) and given a prompt instructing how to build an AI Voice Help Desk Agent.

USER PROMPT:
"${userPrompt || 'Build an intelligent voice assistant that guides visitors through this website and explains all products, features, and specs.'}"

UPLOADED FRONTEND CONTEXT (WEBSITE TITLE, MISSION & PRODUCTS):
${frontendExcerpts || 'General website interface and navigation'}

DISCOVERED PRODUCTS & CATALOG:
${discoveredProducts.length > 0 ? discoveredProducts.join(', ') : 'None explicitly tagged, extract from headings/facts below'}

VERIFIED KNOWLEDGE BASE FACTS EXTRACTED FROM FILES:
${topFacts || 'General website information'}

UPLOADED BACKEND CONTEXT (API ROUTES & TOOLS):
${backendExcerpts || 'None provided'}

CRITICAL ARCHITECTURAL RULES:
1. NEVER use generic placeholder text like "[specific service/product]", "[insert company]", or "[your product]". Always use the real names, products, and technical specifications extracted from the user's files.
2. If the files describe a specific brand (e.g. Zenith Motors, Smitash Advisory, Aura Retail), name the assistant specifically (e.g. "Zenith Concierge", "Zenith Engineering Advisor") and write a tailored first greeting.
3. In "knowledgeBase", provide at least 8 to 12 accurate, realistic Q&As detailing:
   - What the website is about (grounded in the site title and description)
   - What products or services are offered (listing the actual products found)
   - Detailed answers for each specific product, model, or technical subsystem
   - Support, consultation, or contact information.

Respond ONLY with a valid JSON object matching this structure (no markdown formatting, no backticks, just raw JSON):
{
  "name": "Concierge Name (e.g. Zenith Concierge)",
  "role": "Concise role (e.g. VIP Hypercar & Engineering Advisor)",
  "greeting": "Friendly, spoken 1-sentence greeting welcoming visitors to the website",
  "voice": "Clara",
  "model": "Groq Qwen 27B (<200ms Free)",
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

  // 1. Try User's Preferred Key First, or cascade: Groq (<200ms) then Gemini
  if (preferredProvider === 'groq' && effectiveGroqKey && effectiveGroqKey.startsWith('gsk_')) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${effectiveGroqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [
            { role: 'system', content: 'You are an AI system architect. Output valid JSON only.' },
            { role: 'user', content: metaPrompt }
          ],
          temperature: 0.3,
          max_tokens: 1500
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        const data = await res.json();
        rawResponse = data.choices[0]?.message?.content || '';
      }
    } catch (e) {
      console.warn("Groq synthesis failed, checking Gemini fallback:", e);
    }
  }

  // 2. Try Gemini with User-Provided Key if Groq didn't return
  if (!rawResponse && effectiveGeminiKey) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${effectiveGeminiKey}`;
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: metaPrompt }] }]
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        const data = await res.json();
        rawResponse = data.candidates[0]?.content?.parts[0]?.text || '';
      }
    } catch (e) {
      console.warn("Gemini synthesis failed:", e);
    }
  }

  // 3. If preferred was Gemini and Groq is fallback
  if (!rawResponse && preferredProvider === 'gemini' && effectiveGroqKey && effectiveGroqKey.startsWith('gsk_')) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${effectiveGroqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'qwen/qwen3.8-27b',
          messages: [
            { role: 'system', content: 'You are an AI system architect. Output valid JSON only.' },
            { role: 'user', content: metaPrompt }
          ],
          temperature: 0.3,
          max_tokens: 1500
        }),
        signal: AbortSignal.timeout(8000)
      });

      if (res.ok) {
        const data = await res.json();
        rawResponse = data.choices[0]?.message?.content || '';
      }
    } catch (e) {
      console.warn("Groq fallback synthesis failed:", e);
    }
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
      model: hasAnyKey ? (effectiveGroqKey ? "Groq Qwen 27B (<200ms Free)" : "Google Gemini 3.8 Flash (Free)") : "Offline Rule-Based Edge Engine",
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

  // Ensure human-readable title ID and attach ONLY user's key (or empty for offline keyless mode)
  const cleanId = (parsedAgent.name || 'AI Assistant').trim().replace(/\//g, '-');
  parsedAgent.id = cleanId;
  parsedAgent.apiKey = effectiveGroqKey || effectiveGeminiKey || '';
  parsedAgent.databaseRecords = Array.isArray(analysisResult?.databaseRecords) ? analysisResult.databaseRecords : [];

  return parsedAgent;
}

function extractAgentNameFromPrompt(prompt = '') {
  const match = prompt.match(/(?:call it|name it|named|agent called|assistant named)\s+["']?([A-Za-z0-9\s]+?)["']?(?:[.,\n]|$)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}
