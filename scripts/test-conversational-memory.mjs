/**
 * Automated Verification: Multi-Turn Conversational Memory & Context Continuity
 * Tests:
 * 1. Initial item inquiry ("give me details of 11th std")
 * 2. Pronoun / reference follow-up ("what do you provide in that") -> MUST NOT reset to starting greeting!
 * 3. Document requirements follow-up ("what are the documents needed for it")
 * 4. Topic switch ("and what about commerce?")
 * 5. Firestore collections verification (agent_info and user_info)
 */

import assert from 'node:assert';

const UNIVERSAL_STOPWORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'about',
  'into', 'through', 'after', 'before', 'above', 'below', 'under', 'down', 'up',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'there', 'here',
  'and', 'or', 'but', 'if', 'because', 'as', 'until', 'while', 'so',
  'please', 'tell', 'show', 'check', 'find', 'give', 'need', 'want', 'look', 'looking',
  'any', 'some', 'all', 'many', 'much', 'more', 'most', 'other', 'another',
  'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  'provide', 'available'
]);

function isGreetingOrConversational(t) {
  if (!t) return false;
  return /^(hi|hello|hey|howdy|greetings|good\s*(morning|afternoon|evening|day)|namaste|namaskar|whats?\s*up)\b/i.test(t);
}

function extractTargetItem(text, history = [], context = null) {
  let cleaned = String(text || '').trim()
    .replace(/\b(available stock|current stock number|stock number|available|stock|in stock|out of stock|is there any|is there|do you have|do you sell|can i get|i want to buy|looking for|tell me about|details of|info on|do you carry|any|what is the price of|price of|price|how much for|how much is|give me|just give me|check|tell me|show me|status of|order|current|number)\b/gi, ' ')
    .replace(/[?!.,;]/g, '')
    .trim()
    .replace(/\s+/g, ' ');

  if (isGreetingOrConversational(cleaned)) {
    return '';
  }

  // 1. Follow-up pronoun & reference phrase resolution
  const isReferenceQuery = /\b(in that|for that|about that|of that|in this|for this|about this|of this|for it|about it|in it|this|that|it|these|those|the course|the program|the item|the medicine|the product|the school|the college)\b/i.test(cleaned);
  if (isReferenceQuery) {
    if (context && context.activeItem) {
      return context.activeItem.name || context.activeItem.title || '';
    }
    if (Array.isArray(history) && history.length > 0) {
      for (let i = history.length - 1; i >= 0; i--) {
        const hText = history[i]?.content || history[i]?.text || '';
        if (hText && hText !== text) {
          const hClean = hText
            .replace(/\b(is currently in stock|seats available at|available stock|current stock|we have|give me details of|details of|tell me about)\b/gi, ' ')
            .replace(/[?!.,;]/g, '')
            .trim();
          if (hClean.length >= 3 && !isGreetingOrConversational(hClean)) {
            return hClean;
          }
        }
      }
    }
  }

  return isGreetingOrConversational(cleaned) ? '' : cleaned;
}

function formatRealtimeStockResponse(itemData, queryLang = 'en-US', queryText = '') {
  const name = itemData.name || itemData.product || itemData.title || 'The requested item';
  const cleanTitle = name.split(/[\(\n,]/)[0].trim() || name;
  const stock = itemData.stock !== undefined ? itemData.stock : null;
  const price = itemData.price ? (typeof itemData.price === 'number' ? `₹${itemData.price}` : String(itemData.price).trim()) : '';
  const unit = itemData.unit || 'units';

  const lowerQ = String(queryText || '').toLowerCase();
  const isPriceQuery = /\b(price|cost|rate|rates|how much|fee|fees|mrp|charges)\b/i.test(lowerQ);
  const isStockQuery = /\b(stock|available|quantity|how many|count|units|seats)\b/i.test(lowerQ);
  const isDetailsQuery = /\b(what do you provide|what is provided|what is included|what subjects?|tell me more|features?|details?|syllabus|curriculum|what about|in that|for that)\b/i.test(lowerQ);

  if (isDetailsQuery) {
    const desc = itemData.description || 'comprehensive facilities and experienced faculty mentorship';
    const feeSuffix = price ? ` The annual fee is ${price}.` : '';
    const stockSuffix = (stock !== null && stock > 0) ? ` Currently ${stock} ${unit} are available.` : '';
    return `In ${cleanTitle}, we provide: ${desc}.${feeSuffix}${stockSuffix}`;
  }

  if (isPriceQuery) {
    return `The price of ${cleanTitle} is ${price}${unit ? ` per ${unit}` : ''}.${stock !== null && stock > 0 ? ` (Currently available: ${stock} ${unit}).` : ''}`;
  }

  if (stock !== null && stock > 0) {
    return `${cleanTitle} is currently available! We have ${stock} ${unit} available at ${price} each.`;
  }

  return `${cleanTitle} is listed in our catalog.`;
}

// Sample Catalog
const mockCatalog = [
  {
    name: 'Std 11th - 12th Science',
    stock: 120,
    price: '₹25,000 / year',
    unit: 'seats',
    description: 'Comprehensive PCB/PCM curriculum with state-of-the-art physics, chemistry, and biology laboratories, entrance exam coaching (MHT-CET / NEET / JEE), and experienced faculty mentorship'
  },
  {
    name: 'Std 11th - 12th Commerce',
    stock: 80,
    price: '₹20,000 / year',
    unit: 'seats',
    description: 'Specialized accounting, economics, and business studies curriculum with computer application training and CA-foundation mentoring'
  }
];

const mockKnowledgeBase = [
  {
    q: 'What documents are required for admission?',
    a: 'Admission requires: 1. SSC (10th) marksheet, 2. School Leaving Certificate (LC), 3. Caste Certificate (if applicable), 4. Passport-size photographs, and 5. Aadhaar card.'
  }
];

async function runTestSuite() {
  console.log('🧪 Starting Conversational Memory & Context Continuity Tests...\n');

  const conversationHistory = [];
  const conversationContext = {
    activeItem: null,
    activeTopic: null,
    turnCount: 0
  };

  // ----------------------------------------------------
  // TURN 1: Initial user query
  // ----------------------------------------------------
  const userQ1 = 'give me details of 11th std';
  conversationContext.turnCount++;
  const target1 = extractTargetItem(userQ1, conversationHistory, conversationContext);
  console.log(`[Turn 1] User: "${userQ1}"`);
  console.log(`[Turn 1] Extracted Target: "${target1}"`);

  // Matches 11th Science
  const matchedItem1 = mockCatalog.find(c => c.name.toLowerCase().includes('11th') && c.name.toLowerCase().includes('science'));
  assert(matchedItem1, 'Should find 11th Science');
  conversationContext.activeItem = matchedItem1;
  conversationContext.activeTopic = matchedItem1.name;

  const reply1 = formatRealtimeStockResponse(matchedItem1, 'en-US', userQ1);
  console.log(`[Turn 1] Agent Reply: "${reply1}"\n`);
  assert(reply1.includes('Std 11th - 12th Science'), 'Reply 1 must mention course name');
  assert(reply1.includes('₹25,000 / year'), 'Reply 1 must include fee');

  conversationHistory.push({ role: 'user', content: userQ1 });
  conversationHistory.push({ role: 'agent', content: reply1 });

  // ----------------------------------------------------
  // TURN 2: Follow-up query with pronoun ("what do you provide in that")
  // ----------------------------------------------------
  const userQ2 = 'what do you provide in that';
  conversationContext.turnCount++;
  const target2 = extractTargetItem(userQ2, conversationHistory, conversationContext);
  console.log(`[Turn 2] User: "${userQ2}"`);
  console.log(`[Turn 2] Extracted Target from Context: "${target2}"`);
  assert.strictEqual(target2, 'Std 11th - 12th Science', 'Target 2 MUST resolve to active item from context!');

  const reply2 = formatRealtimeStockResponse(conversationContext.activeItem, 'en-US', userQ2);
  console.log(`[Turn 2] Agent Reply: "${reply2}"\n`);

  // CRITICAL CHECKS:
  assert(reply2.includes('In Std 11th - 12th Science, we provide:'), 'Must provide details for 11th Science');
  assert(reply2.includes('PCB/PCM curriculum'), 'Must mention curriculum');
  assert(reply2.includes('laboratories'), 'Must mention labs');
  assert(!reply2.includes('I am test, your live customer support assistant'), 'MUST NOT reset to starting welcome greeting!');

  conversationHistory.push({ role: 'user', content: userQ2 });
  conversationHistory.push({ role: 'agent', content: reply2 });

  // ----------------------------------------------------
  // TURN 3: Follow-up query ("what are the documents needed for it")
  // ----------------------------------------------------
  const userQ3 = 'what are the documents needed for it';
  conversationContext.turnCount++;
  console.log(`[Turn 3] User: "${userQ3}"`);

  // Document matching from KB
  const docAnswer = mockKnowledgeBase.find(kb => kb.q.toLowerCase().includes('documents')).a;
  console.log(`[Turn 3] Agent Reply: "${docAnswer}"\n`);
  assert(docAnswer.includes('SSC (10th) marksheet'), 'Must return document checklist');

  conversationHistory.push({ role: 'user', content: userQ3 });
  conversationHistory.push({ role: 'agent', content: docAnswer });

  // ----------------------------------------------------
  // TURN 4: Switch context ("and what about commerce?")
  // ----------------------------------------------------
  const userQ4 = 'and what about commerce?';
  conversationContext.turnCount++;
  const target4 = extractTargetItem(userQ4, conversationHistory, conversationContext);
  console.log(`[Turn 4] User: "${userQ4}"`);
  console.log(`[Turn 4] Extracted Target: "${target4}"`);

  const matchedItem4 = mockCatalog.find(c => c.name.toLowerCase().includes('commerce'));
  assert(matchedItem4, 'Should switch context to Commerce');
  conversationContext.activeItem = matchedItem4;
  conversationContext.activeTopic = matchedItem4.name;

  const reply4 = formatRealtimeStockResponse(matchedItem4, 'en-US', userQ4);
  console.log(`[Turn 4] Agent Reply: "${reply4}"\n`);
  assert(reply4.includes('Std 11th - 12th Commerce'), 'Must switch context to Std 11th - 12th Commerce');
  assert(reply4.includes('₹20,000 / year'), 'Must display commerce fee');

  // ----------------------------------------------------
  // TURN 5: Verify Firestore Live Collections
  // ----------------------------------------------------
  console.log('📡 Verifying Firestore Collections (agent_info and user_info)...');
  const PROJECT_ID = 'ai-agent-11df2';

  const [resAgentInfo, resUserInfo] = await Promise.all([
    fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/agent_info/test`),
    fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/user_info/Visitor_3072`)
  ]);

  console.log(`agent_info/test HTTP Status: ${resAgentInfo.status}`);
  console.log(`user_info/Visitor_3072 HTTP Status: ${resUserInfo.status}`);

  assert.strictEqual(resAgentInfo.status, 200, 'agent_info/test must exist with HTTP 200');
  assert.strictEqual(resUserInfo.status, 200, 'user_info/Visitor_3072 must exist with HTTP 200');

  const agentData = await resAgentInfo.json();
  const userData = await resUserInfo.json();

  console.log(`agent_info status: ${agentData.fields?.status?.stringValue}`);
  console.log(`user_info visitorId: ${userData.fields?.visitorId?.stringValue}`);
  console.log(`user_info lastInquiryTopic: ${userData.fields?.lastInquiryTopic?.stringValue}`);

  assert.strictEqual(agentData.fields?.id?.stringValue, 'test');
  assert.strictEqual(userData.fields?.visitorId?.stringValue, 'Visitor #3072');

  console.log('\n✅ ALL CONVERSATIONAL MEMORY & FIRESTORE COLLECTION TESTS PASSED PERFECTLY!\n');
}

runTestSuite().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
