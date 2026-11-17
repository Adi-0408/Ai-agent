import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { generateAIResponse } from '../src/services/aiCompletionService.js';

const widgetCode = fs.readFileSync(path.resolve('public/widget.js'), 'utf-8');

function extractSlice(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  const e = src.indexOf(endMarker, s);
  if (s === -1 || e === -1) throw new Error(`Failed to extract between "${startMarker}" and "${endMarker}"`);
  return src.substring(s, e);
}

// Build a live harness executing the REAL production functions from public/widget.js
function createWidgetEngine(initialAgentConfig) {
  const archetypesSrc = extractSlice(widgetCode, 'const ARCHETYPE_PROFILES =', 'let lastConfigFetchAt =');
  const coreEngineSrc = extractSlice(widgetCode, 'function isCustomerSafeFaq(', '// Maintain multi-turn conversation memory');

  const factory = new Function('initialConfig', `
    let agentConfig = initialConfig;
    const conversationHistory = [];
    const conversationContext = {
      activeItem: null,
      activeTopic: null,
      lastDisplayedItems: [],
      catalogOffset: 0,
      lastIntent: null,
      lastReply: '',
      fallbackCount: 0,
      turnCount: 0
    };
    const getWidgetScript = () => null;
    ${archetypesSrc}
    function detectTextLanguage(text) {
      if (/[\\u0900-\\u097F]/.test(String(text || ''))) {
        if (/(आहे|नाही|काय|कसे|तुम्ही|आपण|अभ्यासक्रम|किंमत|साठा|द्या|सांगा)/.test(text)) return 'mr-IN';
        return 'hi-IN';
      }
      return 'en-US';
    }
    ${coreEngineSrc}

    async function sendTurn(userText) {
      conversationHistory.push({ role: 'user', content: userText });
      const bridge = await resolveDatabaseBridge(userText, agentConfig, conversationContext);
      if (bridge && (bridge.status === 'FOUND_CATALOG_LIST' || bridge.status === 'FOUND_PRICE_OVERVIEW')) {
        if (Array.isArray(bridge.data) && bridge.data.length > 0) {
          conversationContext.lastDisplayedItems = bridge.data;
          conversationContext.catalogOffset = Math.min(5, bridge.data.length);
        }
      }
      const res = await inferLocalAgentResponse(userText, bridge, conversationHistory, conversationContext);
      const reply = typeof res === 'object' && res !== null ? res.reply : String(res || '');
      conversationContext.lastReply = reply;
      conversationContext.turnCount++;
      conversationHistory.push({ role: 'assistant', content: reply });
      return { reply, bridge, context: { ...conversationContext } };
    }

    return { sendTurn, conversationContext, isCatalogListQuery, isGeneralPriceOrOverviewQuery, isPolicyOrProcessQuery, isAffirmationOrMoreQuery, resolveOrdinalFromList };
  `);

  return factory(initialAgentConfig);
}

console.log('=== UNIVERSAL ANTI-STUCK CONVERSATION SUITE (ALL WEBSITE TYPES & AGENTS) ===\n');

// 1. Academic Website (Exact screenshot scenario + every suggested follow-up)
{
  const academic = createWidgetEngine({
    name: 'test',
    role: 'Academic Admissions Assistant',
    knowledgeBase: [
      { q: 'What is the campus timing?', a: 'Campus hours are Monday to Saturday, 8:00 AM to 5:00 PM.' }
    ],
    databaseRecords: [
      { name: 'Std 11th - 12th Science', price: '₹25,000 / year', stock: 120, unit: 'seats', description: 'PCB & PCM streams with physics, chemistry, biology, and computer labs.' },
      { name: 'MHT-CET Integrated', price: '₹35,000 / year', stock: 60, unit: 'seats', description: 'Focused Maharashtra CET engineering & pharmacy entrance coaching.' },
      { name: 'Std 11th - 12th Commerce', price: '₹20,000 / year', stock: 80, unit: 'seats', description: 'Accountancy, Economics, Business Studies, and Secretarial Practice.' },
      { name: 'Std 11th - 12th Arts', price: '₹15,000 / year', stock: 60, unit: 'seats', description: 'History, Geography, Political Science, and Languages.' },
      { name: 'NEET Foundation', price: '₹40,000 / year', stock: 50, unit: 'seats', description: 'Medical entrance coaching with weekly mock tests.' },
      { name: 'JEE Foundation', price: '₹42,000 / year', stock: 50, unit: 'seats', description: 'IIT/NIT engineering entrance track.' }
    ]
  });

  const t1 = await academic.sendTurn('can you give me details of courses');
  console.log('[Academic T1] "can you give me details of courses" ->', t1.reply);
  assert(t1.reply.includes('Std 11th - 12th Science') && !t1.reply.startsWith('I am here to assist you'), 'T1 must list courses directly');

  const t2 = await academic.sendTurn('fee structure');
  console.log('[Academic T2] "fee structure" ->', t2.reply);
  assert(t2.reply.includes('₹25,000') && !t2.reply.includes('not available right now'), 'T2 must return fee structure overview, NEVER ITEM_NOT_FOUND');

  const t3 = await academic.sendTurn('eligibility criteria');
  console.log('[Academic T3] "eligibility criteria" ->', t3.reply);
  assert(/qualifying|board|marks|merit/i.test(t3.reply) && !t3.reply.startsWith('I am here to assist you'), 'T3 must answer eligibility even with activeItem=null');

  const t4 = await academic.sendTurn('admission procedure');
  console.log('[Academic T4] "admission procedure" ->', t4.reply);
  assert(/admission form|documents|portal/i.test(t4.reply), 'T4 must explain admission procedure directly');

  const t5 = await academic.sendTurn('show more');
  console.log('[Academic T5] "show more" ->', t5.reply);
  assert(t5.reply.includes('JEE Foundation'), 'T5 must paginate remaining courses');

  const t6 = await academic.sendTurn('tell me about the first one');
  console.log('[Academic T6] "tell me about the first one" ->', t6.reply);
  assert(t6.reply.includes('Std 11th - 12th Science'), 'T6 must resolve ordinal "first one"');

  const t7 = await academic.sendTurn('yes');
  console.log('[Academic T7] "yes" ->', t7.reply);
  assert(t7.reply.includes('Std 11th - 12th Science') && t7.reply.includes('PCB'), 'T7 affirmation must expand activeItem details');

  // Anti-loop check: two random vague turns must NEVER repeat identical fallback
  const t8 = await academic.sendTurn('xyzzy random query one');
  const t9 = await academic.sendTurn('xyzzy random query two');
  console.log('[Academic Anti-Loop T8] ->', t8.reply);
  console.log('[Academic Anti-Loop T9] ->', t9.reply);
  assert.notStrictEqual(t8.reply, t9.reply, 'Anti-loop guard MUST break out of repeating identical fallback!');
  assert(t9.reply.includes('Std 11th - 12th Science'), 'Anti-loop recovery should offer concrete options from catalog');
  console.log('✓ Academic multi-turn + anti-loop verified!\n');
}

// 2. E-Commerce Store (Sneakers & Electronics)
{
  const ecom = createWidgetEngine({
    name: 'KicksHub',
    role: 'Online Store Assistant',
    knowledgeBase: [],
    databaseRecords: [
      { name: 'Nike Air Max 90', price: '₹8,999', stock: 15, unit: 'pairs', description: 'Air cushioning and waffle outsole.' },
      { name: 'Adidas Ultraboost Light', price: '₹14,999', stock: 10, unit: 'pairs', description: 'Boost midsole for daily runners.' }
    ]
  });

  const t1 = await ecom.sendTurn('hey i want know about the products');
  assert(t1.reply.includes('Nike Air Max 90'), 'E-Commerce T1 must list products');
  const t2 = await ecom.sendTurn('pricing');
  assert(t2.reply.includes('₹8,999') && t2.reply.includes('₹14,999'), 'E-Commerce T2 must show pricing overview');
  const t3 = await ecom.sendTurn('return policy');
  assert(/return|warranty|shipping/i.test(t3.reply), 'E-Commerce T3 must answer return policy without activeItem');
  const t4 = await ecom.sendTurn('tell me about the 2nd one');
  assert(t4.reply.includes('Adidas Ultraboost Light'), 'E-Commerce T4 must resolve 2nd one');
  console.log('✓ E-Commerce multi-turn verified!');
}

// 3. Restaurant / Food
{
  const food = createWidgetEngine({
    name: 'Spice Garden',
    role: 'Restaurant Concierge',
    knowledgeBase: [],
    databaseRecords: [
      { name: 'Paneer Butter Masala', price: '₹280', stock: 25, unit: 'portions', description: 'Rich tomato & cashew gravy.' },
      { name: 'Garlic Butter Naan', price: '₹65', stock: 40, unit: 'portions', description: 'Tandoor-baked flatbread.' }
    ]
  });
  const t1 = await food.sendTurn('which dishes do you serve');
  assert(t1.reply.includes('Paneer Butter Masala'), 'Food T1 must list dishes');
  const t2 = await food.sendTurn('table reservations');
  assert(/menu|reserve|table/i.test(t2.reply), 'Food T2 must answer table reservation directly');
  const t3 = await food.sendTurn('menu prices');
  assert(t3.reply.includes('₹280'), 'Food T3 must return menu prices');
  console.log('✓ Restaurant / Food multi-turn verified!');
}

// 4. SaaS / Software Platform
{
  const saas = createWidgetEngine({
    name: 'CloudPulse',
    role: 'SaaS Product Assistant',
    knowledgeBase: [],
    databaseRecords: [
      { name: 'Starter Plan', price: '$19 / month', stock: 999, unit: 'licenses', description: '10k API calls and email support.' },
      { name: 'Pro Plan', price: '$79 / month', stock: 999, unit: 'licenses', description: 'Unlimited workflows and priority SLA.' }
    ]
  });
  const t1 = await saas.sendTurn('plan details');
  assert(t1.reply.includes('Starter Plan') && t1.reply.includes('Pro Plan'), 'SaaS T1 must list plans');
  const t2 = await saas.sendTurn('billing options');
  assert(/billing|monthly|annual/i.test(t2.reply), 'SaaS T2 must answer billing options without looping');
  const t3 = await saas.sendTurn('getting started');
  assert(/pricing|subscription|trial/i.test(t3.reply), 'SaaS T3 must answer getting started');
  console.log('✓ SaaS multi-turn verified!');
}

// 5. Hospitality / Hotel
{
  const hotel = createWidgetEngine({
    name: 'Royal Palm Resort',
    role: 'Hotel Concierge',
    knowledgeBase: [],
    databaseRecords: [
      { name: 'Deluxe Sea View Room', price: '₹6,500 / night', stock: 8, unit: 'rooms', description: 'Balcony, king bed, complimentary breakfast.' },
      { name: 'Executive Suite', price: '₹11,000 / night', stock: 3, unit: 'rooms', description: 'Living area, jacuzzi, airport transfer.' }
    ]
  });
  const t1 = await hotel.sendTurn('room details');
  assert(t1.reply.includes('Deluxe Sea View Room'), 'Hotel T1 must list rooms');
  const t2 = await hotel.sendTurn('room rates');
  assert(t2.reply.includes('₹6,500'), 'Hotel T2 must list room rates');
  const t3 = await hotel.sendTurn('check-in timings');
  assert(/check-in|ID|reservation/i.test(t3.reply), 'Hotel T3 must answer check-in policy without looping');
  console.log('✓ Hospitality / Hotel multi-turn verified!');
}

// 6. Healthcare / Pharmacy
{
  const pharma = createWidgetEngine({
    name: 'MediCare Pharmacy',
    role: 'Pharmacy Customer Assistant',
    knowledgeBase: [],
    databaseRecords: [
      { name: 'Dolo 650 Tablet', price: '₹32', stock: 120, unit: 'strips', description: 'Paracetamol 650mg for fever and pain relief.' },
      { name: 'Augmentin 625 Duo', price: '₹185', stock: 40, unit: 'strips', rx: true, description: 'Amoxycillin & Clavulanic Acid antibiotic.' }
    ]
  });
  const t1 = await pharma.sendTurn('hi which medicines do you have');
  assert(t1.reply.includes('Dolo 650 Tablet'), 'Pharmacy T1 must list medicines');
  const t2 = await pharma.sendTurn('prescription required');
  assert(/prescription/i.test(t2.reply), 'Pharmacy T2 must answer prescription policy directly');
  console.log('✓ Healthcare / Pharmacy multi-turn verified!');
}

// 7. Automotive Dealership
{
  const auto = createWidgetEngine({
    name: 'Apex Motors',
    role: 'Showroom Concierge',
    knowledgeBase: [],
    databaseRecords: [
      { name: 'Apex EV SUV', price: '₹18,50,000', stock: 5, unit: 'vehicles', description: '480 km range, ADAS Level 2.' }
    ]
  });
  const t1 = await auto.sendTurn('which vehicles do you have');
  assert(t1.reply.includes('Apex EV SUV'), 'Auto T1 must list vehicles');
  const t2 = await auto.sendTurn('test drive');
  assert(/test drive|showroom/i.test(t2.reply), 'Auto T2 must answer test drive directly');
  console.log('✓ Automotive multi-turn verified!');
}

// 8. Studio / VoiceTestModal Offline AI Service (aiCompletionService.js)
{
  const db = [
    { name: 'Std 11th - 12th Science', price: '₹25,000 / year', stock: 120, unit: 'seats', description: 'PCB & PCM labs' },
    { name: 'Std 11th - 12th Commerce', price: '₹20,000 / year', stock: 80, unit: 'seats', description: 'Accountancy & Economics' }
  ];
  const s1 = await generateAIResponse('can you give me details of courses', 'Academic Admissions Assistant', [], '', { agentName: 'test', databaseRecords: db });
  assert(s1.includes('Std 11th - 12th Science'), 'Studio S1 must list courses');
  const s2 = await generateAIResponse('fee structure', 'Academic Admissions Assistant', [], '', { agentName: 'test', databaseRecords: db });
  assert(s2.includes('₹25,000'), 'Studio S2 must list fee structure');
  const s3 = await generateAIResponse('eligibility criteria', 'Academic Admissions Assistant', [], '', { agentName: 'test', databaseRecords: db });
  assert(/qualifying|board|merit/i.test(s3), 'Studio S3 must answer eligibility');
  const s4 = await generateAIResponse('the first one', 'Academic Admissions Assistant', [], '', { agentName: 'test', databaseRecords: db });
  assert(s4.includes('Std 11th - 12th Science'), 'Studio S4 must resolve ordinal first one');
  console.log('✓ Studio aiCompletionService offline multi-turn verified!');
}

console.log('\n🎉 ALL UNIVERSAL ANTI-STUCK CONVERSATION TESTS PASSED ACROSS ALL WEBSITE TYPES & AGENTS!');
