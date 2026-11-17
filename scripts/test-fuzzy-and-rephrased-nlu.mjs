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
      return { reply, bridge };
    }

    return { sendTurn, normalizeUserQuery };
  `);

  return factory(initialAgentConfig);
}

console.log('=== UNIVERSAL FUZZY (TYPO-TOLERANT) & ORDER-INDEPENDENT NLU SUITE ===\n');

// 1. Academic Website: Typos + Scrambled Order + Paraphrasing
{
  const academic = createWidgetEngine({
    name: 'Sangli Academy',
    role: 'Academic Admissions Assistant',
    knowledgeBase: [
      { q: 'What are the campus timings?', a: 'Campus hours are Monday to Saturday, 8:00 AM to 5:00 PM.' }
    ],
    databaseRecords: [
      { name: 'Std 11th - 12th Science', price: '₹25,000 / year', stock: 120, unit: 'seats', description: 'PCB & PCM streams with physics, chemistry, and biology labs.' },
      { name: 'Std 11th - 12th Commerce', price: '₹20,000 / year', stock: 80, unit: 'seats', description: 'Accountancy, Economics, and Business Studies.' },
      { name: 'Std 11th - 12th Arts', price: '₹15,000 / year', stock: 60, unit: 'seats', description: 'History, Geography, and Languages.' }
    ]
  });

  // Heavy spelling mistakes
  const t1 = await academic.sendTurn('wat cources u prvide');
  console.log('[Typo] "wat cources u prvide" ->', t1.reply);
  assert(t1.reply.includes('Std 11th - 12th Science'), 'Must understand "wat cources u prvide"');

  const t2 = await academic.sendTurn('fess structre');
  console.log('[Typo] "fess structre" ->', t2.reply);
  assert(t2.reply.includes('₹25,000') && t2.reply.includes('₹20,000'), 'Must understand "fess structre"');

  const t3 = await academic.sendTurn('elgibility critria');
  console.log('[Typo] "elgibility critria" ->', t3.reply);
  assert(/qualifying|board|merit/i.test(t3.reply), 'Must understand "elgibility critria"');

  const t4 = await academic.sendTurn('admisison procedre');
  console.log('[Typo] "admisison procedre" ->', t4.reply);
  assert(/admission form|documents|portal/i.test(t4.reply), 'Must understand "admisison procedre"');

  const t5 = await academic.sendTurn('documnts reqired');
  console.log('[Typo] "documnts reqired" ->', t5.reply);
  assert(/marksheet|Leaving Certificate/i.test(t5.reply), 'Must understand "documnts reqired"');

  // Specific item with typo + reversed word order
  const t6 = await academic.sendTurn('fess for scince 11th');
  console.log('[Typo+Order] "fess for scince 11th" ->', t6.reply);
  assert(t6.reply.includes('Std 11th - 12th Science') && t6.reply.includes('₹25,000'), 'Must match 11th Science fee from "fess for scince 11th"');

  // Scrambled word order
  const t7 = await academic.sendTurn('courses provide which');
  console.log('[Order] "courses provide which" ->', t7.reply);
  assert(t7.reply.includes('Std 11th - 12th Science') && t7.reply.includes('Commerce'), 'Must understand scrambled "courses provide which"');

  const t8 = await academic.sendTurn('details give me courses');
  console.log('[Order] "details give me courses" ->', t8.reply);
  assert(t8.reply.includes('Std 11th - 12th Science'), 'Must understand scrambled "details give me courses"');

  const t9 = await academic.sendTurn('apply how can i');
  console.log('[Order] "apply how can i" ->', t9.reply);
  assert(/admission form|portal|documents/i.test(t9.reply), 'Must understand scrambled "apply how can i"');

  const t10 = await academic.sendTurn('needed documents what');
  console.log('[Order] "needed documents what" ->', t10.reply);
  assert(/marksheet|Leaving Certificate/i.test(t10.reply), 'Must understand scrambled "needed documents what"');

  // Completely different phrasing approaches (paraphrasing)
  const p1 = await academic.sendTurn('what do you teach here?');
  console.log('[Paraphrase] "what do you teach here?" ->', p1.reply);
  assert(p1.reply.includes('Std 11th - 12th Science'), 'Must understand "what do you teach here?"');

  const p2 = await academic.sendTurn('how much will i have to pay?');
  console.log('[Paraphrase] "how much will i have to pay?" ->', p2.reply);
  assert(p2.reply.includes('₹25,000'), 'Must understand "how much will i have to pay?"');

  const p3 = await academic.sendTurn('i want to join this college');
  console.log('[Paraphrase] "i want to join this college" ->', p3.reply);
  assert(/admission form|portal|documents/i.test(p3.reply), 'Must understand "i want to join this college"');

  const p4 = await academic.sendTurn('who can apply?');
  console.log('[Paraphrase] "who can apply?" ->', p4.reply);
  assert(/qualifying|board|merit/i.test(p4.reply), 'Must understand "who can apply?"');

  const p5 = await academic.sendTurn('what do i need to bring?');
  console.log('[Paraphrase] "what do i need to bring?" ->', p5.reply);
  assert(/marksheet|Leaving Certificate/i.test(p5.reply), 'Must understand "what do i need to bring?"');

  const p6 = await academic.sendTurn('camups timngs wat?');
  console.log('[Fuzzy KB] "camups timngs wat?" ->', p6.reply);
  assert(p6.reply.includes('8:00 AM to 5:00 PM'), 'Fuzzy KB lookup must match campus timings even with typos!');

  console.log('✓ Academic typos, scrambled order & paraphrasing verified!\n');
}

// 2. E-Commerce Store: Typos + Order + Paraphrasing
{
  const ecom = createWidgetEngine({
    name: 'KicksHub',
    role: 'Online Store Assistant',
    knowledgeBase: [],
    databaseRecords: [
      { name: 'Nike Air Max 90', price: '₹8,999', stock: 15, unit: 'pairs', description: 'Air cushioning and waffle outsole.' },
      { name: 'Adidas Ultraboost Light', price: '₹14,999', stock: 10, unit: 'pairs', description: 'Boost midsole for runners.' }
    ]
  });

  const e1 = await ecom.sendTurn('available shoes what');
  assert(e1.reply.includes('Nike Air Max 90'), 'Must understand scrambled "available shoes what"');

  const e2 = await ecom.sendTurn('can i send it back if it doesnt fit?');
  console.log('[E-Com Paraphrase] "can i send it back if it doesnt fit?" ->', e2.reply);
  assert(/return|warranty|shipping/i.test(e2.reply), 'Must understand return paraphrase "send it back"');

  const e3 = await ecom.sendTurn('how long does shiping take?');
  assert(/shipping|warranty|return/i.test(e3.reply), 'Must understand misspelled "shiping"');

  const e4 = await ecom.sendTurn('ultraboost adids cost how much');
  console.log('[E-Com Typo+Order] "ultraboost adids cost how much" ->', e4.reply);
  assert(e4.reply.includes('Adidas Ultraboost Light') && e4.reply.includes('₹14,999'), 'Must fuzzy-match Adidas Ultraboost Light');

  console.log('✓ E-Commerce typos, scrambled order & paraphrasing verified!');
}

// 3. Healthcare / Pharmacy: Typos + Ingredient Match + Paraphrasing + Zero False Positives!
{
  const pharma = createWidgetEngine({
    name: 'MediCare Pharmacy',
    role: 'Pharmacy Customer Assistant',
    knowledgeBase: [],
    databaseRecords: [
      { name: 'Dolo 650 Tablet', price: '₹32', stock: 120, unit: 'strips', description: 'Paracetamol 650mg for fever and pain relief.' }
    ]
  });

  const m1 = await pharma.sendTurn('paracetmol avilable?');
  console.log('[Pharma Typo] "paracetmol avilable?" ->', m1.reply);
  assert(m1.reply.includes('Dolo 650'), 'Must fuzzy-match Dolo 650 from misspelled "paracetmol"');

  const m2 = await pharma.sendTurn('is a doctor note needed?');
  console.log('[Pharma Paraphrase] "is a doctor note needed?" ->', m2.reply);
  assert(/prescription/i.test(m2.reply), 'Must understand "doctor note needed" as prescription policy');

  // Strict Zero False-Positive Safety Guard!
  const m3 = await pharma.sendTurn('do you have augmentin?');
  console.log('[Pharma Safety] "do you have augmentin?" ->', m3.reply);
  assert(/not available/i.test(m3.reply) && !m3.reply.includes('Augmentin is currently'), 'Unknown medicine "Augmentin" MUST NOT false-match Dolo 650!');

  console.log('✓ Healthcare typos, paraphrasing & zero false-positives verified!');
}

// 4. Restaurant / Food: Typos + Paraphrasing + Zero False Positives!
{
  const food = createWidgetEngine({
    name: 'Spice Garden',
    role: 'Restaurant Concierge',
    knowledgeBase: [],
    databaseRecords: [
      { name: 'Paneer Butter Masala', price: '₹280', stock: 25, unit: 'portions', description: 'Rich tomato and cashew gravy.' },
      { name: 'Margherita Pizza', price: '₹320', stock: 15, unit: 'portions', description: 'Fresh mozzarella and basil.' }
    ]
  });

  const f1 = await food.sendTurn('what can i eat here?');
  assert(f1.reply.includes('Paneer Butter Masala'), 'Must understand "what can i eat here?"');

  const f2 = await food.sendTurn('menue plz');
  assert(f2.reply.includes('Paneer Butter Masala'), 'Must understand "menue plz"');

  const f3 = await food.sendTurn('masala paner price');
  assert(f3.reply.includes('Paneer Butter Masala') && f3.reply.includes('₹280'), 'Must fuzzy-match scrambled+misspelled "masala paner"');

  // Strict Zero False-Positive Guard!
  const f4 = await food.sendTurn('do you have pepperoni pizza?');
  assert(/not available/i.test(f4.reply), 'Unknown "pepperoni pizza" MUST NOT false-match Margherita Pizza!');

  console.log('✓ Restaurant typos, paraphrasing & zero false-positives verified!');
}

// 5. SaaS & Hospitality: Typos + Scrambled Order
{
  const saas = createWidgetEngine({
    name: 'CloudPulse',
    role: 'SaaS Product Assistant',
    knowledgeBase: [],
    databaseRecords: [
      { name: 'Starter Plan', price: '$19 / month', stock: 999, unit: 'licenses', description: '10k API calls.' },
      { name: 'Pro Plan', price: '$79 / month', stock: 999, unit: 'licenses', description: 'Unlimited workflows.' }
    ]
  });
  const s1 = await saas.sendTurn('cost pro plan how much');
  assert(s1.reply.includes('Pro Plan') && s1.reply.includes('$79'), 'Must understand scrambled "cost pro plan how much"');

  const hotel = createWidgetEngine({
    name: 'Royal Palm Resort',
    role: 'Hotel Concierge',
    knowledgeBase: [],
    databaseRecords: [
      { name: 'Deluxe Sea View Room', price: '₹6,500 / night', stock: 8, unit: 'rooms', description: 'Balcony and breakfast.' }
    ]
  });
  const h1 = await hotel.sendTurn('hotl roms rates');
  assert(h1.reply.includes('₹6,500'), 'Must understand misspelled "hotl roms rates"');

  console.log('✓ SaaS & Hospitality typos & scrambled order verified!');
}

// 6. Studio aiCompletionService.js: Typos + Order + Paraphrasing
{
  const db = [
    { name: 'Std 11th - 12th Science', price: '₹25,000 / year', stock: 120, unit: 'seats', description: 'PCB & PCM labs' },
    { name: 'Std 11th - 12th Commerce', price: '₹20,000 / year', stock: 80, unit: 'seats', description: 'Accountancy & Economics' }
  ];
  const r1 = await generateAIResponse('wat cources u prvide', 'Academic Admissions Assistant', [], '', { agentName: 'test', databaseRecords: db });
  assert(r1.includes('Std 11th - 12th Science'), 'Studio must understand "wat cources u prvide"');

  const r2 = await generateAIResponse('fess for scince 11th', 'Academic Admissions Assistant', [], '', { agentName: 'test', databaseRecords: db });
  assert(r2.includes('Std 11th - 12th Science') && r2.includes('₹25,000'), 'Studio must understand "fess for scince 11th"');

  const r3 = await generateAIResponse('i want to join this college', 'Academic Admissions Assistant', [], '', { agentName: 'test', databaseRecords: db });
  assert(/admission form|portal|documents/i.test(r3), 'Studio must understand "i want to join this college"');

  const r4 = await generateAIResponse('what do i need to bring?', 'Academic Admissions Assistant', [], '', { agentName: 'test', databaseRecords: db });
  assert(/marksheet|Leaving Certificate/i.test(r4), 'Studio must understand "what do i need to bring?"');

  console.log('✓ Studio aiCompletionService fuzzy & order-independent NLU verified!');
}

console.log('\n🎉 ALL UNIVERSAL TYPO-TOLERANT & ORDER-INDEPENDENT NLU TESTS PASSED 100%!');
