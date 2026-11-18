/**
 * Verification Suite: Universal AI Answer Accuracy, Deterministic Data Analysis,
 * Precision-Gated RAG, Semantic Anti-Repetition & Honest Uncertainty Protocol
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  parseNumericPrice,
  parseBudgetThreshold,
  analyzeCatalogQuery,
  rankGroundedContext,
  isSemanticallyRepeated,
  buildHonestUncertaintyReply
} from '../src/utils/dataAnalyticsEngine.js';
import { analyzeFrontendFile, analyzeFullStackFiles } from '../src/utils/codebaseAnalyzer.js';
import { generateAIResponse } from '../src/services/aiCompletionService.js';

const widgetCode = fs.readFileSync(path.resolve('public/widget.js'), 'utf-8');

function extractSlice(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  const e = src.indexOf(endMarker, s);
  if (s === -1 || e === -1) throw new Error(`Failed to extract between "${startMarker}" and "${endMarker}"`);
  return src.substring(s, e);
}

function createWidgetHarness(initialConfig) {
  const archSrc = extractSlice(widgetCode, 'const ARCHETYPE_PROFILES =', 'let lastConfigFetchAt =');
  const engineSrc = extractSlice(widgetCode, 'function isCustomerSafeFaq(', '// Maintain multi-turn conversation memory');

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
      recentReplies: [],
      fallbackCount: 0,
      turnCount: 0
    };
    const getWidgetScript = () => null;
    ${archSrc}
    function detectTextLanguage(text) {
      if (/[\\u0900-\\u097F]/.test(String(text || ''))) {
        if (/(आहे|नाही|काय|कसे|तुम्ही|आपण|अभ्यासक्रम|किंमत|साठा|द्या|सांगा|प्रिन्सिपल|कोण)/.test(text)) return 'mr-IN';
        return 'hi-IN';
      }
      return 'en-US';
    }
    ${engineSrc}

    async function sendTurn(userText) {
      conversationHistory.push({ role: 'user', content: userText });
      const bridge = await resolveDatabaseBridge(userText, agentConfig, conversationContext);
      const res = await inferLocalAgentResponse(userText, bridge, conversationHistory, conversationContext);
      const reply = typeof res === 'object' && res !== null ? res.reply : String(res || '');
      conversationContext.lastReply = reply;
      conversationContext.recentReplies = [...(conversationContext.recentReplies || []).slice(-2), reply];
      conversationContext.turnCount++;
      conversationHistory.push({ role: 'assistant', content: reply });
      return { reply, bridge, context: { ...conversationContext } };
    }

    return {
      sendTurn,
      buildCustomerSystemPrompt,
      resolveDatabaseBridge,
      analyzeCatalogQuery,
      rankGroundedContext,
      isSemanticallyRepeated,
      conversationContext
    };
  `);
  return factory(initialConfig);
}

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
async function checkAsync(name, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('=== AI ANSWER ACCURACY, DATA ANALYSIS & RELIABILITY VERIFICATION ===\n');

// 1. Numeric Price & Budget Parsing
console.log('1. Numeric Price & Budget Threshold Parsing:');
check('Parses Indian Rupees with period', () => {
  const p = parseNumericPrice('₹25,000 / year');
  assert.strictEqual(p.value, 25000);
  assert.strictEqual(p.currency, '₹');
});
check('Parses USD monthly subscription & shorthand multipliers', () => {
  assert.strictEqual(parseNumericPrice('$49.99/mo').value, 49.99);
  assert.strictEqual(parseNumericPrice('25k').value, 25000);
  assert.strictEqual(parseNumericPrice('1.5 lakh').value, 150000);
  assert.strictEqual(parseNumericPrice('Free').value, 0);
});
check('Parses budget thresholds (under, above, between, Hindi/Marathi)', () => {
  const b1 = parseBudgetThreshold('courses under ₹20,000');
  assert.strictEqual(b1.op, 'lte');
  assert.strictEqual(b1.max, 20000);
  const b2 = parseBudgetThreshold('plans between $20 and $100');
  assert.strictEqual(b2.op, 'between');
  assert.strictEqual(b2.min, 20);
  assert.strictEqual(b2.max, 100);
  const b3 = parseBudgetThreshold('products above ₹5,000');
  assert.strictEqual(b3.op, 'gte');
  assert.strictEqual(b3.min, 5000);
  const b4 = parseBudgetThreshold('20000 के अंदर कोर्स');
  assert.strictEqual(b4.op, 'lte');
  assert.strictEqual(b4.max, 20000);
});

// 2. Widget Deterministic Data Analysis (Academic, SaaS, Healthcare)
console.log('\n2. Widget Deterministic Data Analysis (Comparisons, Rankings, Budget/Stock Filters, Counts):');
const academicCatalog = [
  { name: 'Std 11th - 12th Science', price: '₹25,000 / year', stock: 120, unit: 'seats', description: 'PCB & PCM streams with modern labs.' },
  { name: 'Std 11th - 12th Commerce', price: '₹20,000 / year', stock: 80, unit: 'seats', description: 'Accountancy, Economics, and Business Studies.' },
  { name: 'Std 11th - 12th Arts', price: '₹15,000 / year', stock: 60, unit: 'seats', description: 'History, Geography, and Political Science.' },
  { name: 'JEE Integrated Track', price: '₹42,000 / year', stock: 40, unit: 'seats', description: 'IIT/NIT entrance preparation with mock tests.' }
];

const academicWidget = createWidgetHarness({
  name: 'Sangli Academy',
  role: 'Academic Admissions Assistant',
  knowledgeBase: [
    { q: 'What are the campus timings?', a: 'Campus hours are Monday to Saturday, 8:00 AM to 5:00 PM.' },
    { q: 'What courses are offered?', a: 'We offer Science, Commerce, Arts, and JEE Integrated programs.' }
  ],
  databaseRecords: academicCatalog
});

await checkAsync('Compares two courses accurately even after an activeItem is set', async () => {
  await academicWidget.sendTurn('tell me about 11th Science'); // sets activeItem
  const cmp = await academicWidget.sendTurn('compare 11th Science and 11th Commerce');
  assert.strictEqual(cmp.bridge.status, 'ANALYTICAL_RESULT');
  assert(cmp.reply.includes('Std 11th - 12th Science') && cmp.reply.includes('Std 11th - 12th Commerce'), 'Must mention both compared courses');
  assert(cmp.reply.includes('₹25,000') && cmp.reply.includes('₹20,000') && cmp.reply.includes('₹5,000'), 'Must compute exact ₹5,000 price difference');
});

await checkAsync('Finds cheapest and most expensive courses deterministically', async () => {
  const cheap = await academicWidget.sendTurn('which course is the cheapest?');
  assert(cheap.reply.includes('Std 11th - 12th Arts') && cheap.reply.includes('₹15,000'), `Expected Arts ₹15,000, got: ${cheap.reply}`);
  const exp = await academicWidget.sendTurn('what is the most expensive course?');
  assert(exp.reply.includes('JEE Integrated Track') && exp.reply.includes('₹42,000'), `Expected JEE ₹42,000, got: ${exp.reply}`);
});

await checkAsync('Filters courses under budget and honestly reports empty budget matches with closest option', async () => {
  const under20k = await academicWidget.sendTurn('show courses under ₹20,000');
  assert(under20k.reply.includes('Std 11th - 12th Arts') && under20k.reply.includes('Std 11th - 12th Commerce'), `Expected Arts & Commerce under 20k, got: ${under20k.reply}`);
  assert(!under20k.reply.includes('JEE Integrated'), 'Must exclude courses over ₹20,000');

  const under5k = await academicWidget.sendTurn('courses under ₹5,000');
  assert(/do not currently have/i.test(under5k.reply) && under5k.reply.includes('Std 11th - 12th Arts'), `Expected honest zero-match + closest Arts option, got: ${under5k.reply}`);
});

await checkAsync('Counts total offerings and computes price range accurately', async () => {
  const cnt = await academicWidget.sendTurn('how many courses do you offer?');
  assert(cnt.reply.includes('4') && cnt.reply.includes('₹15,000') && cnt.reply.includes('₹42,000'), `Expected count 4 + range, got: ${cnt.reply}`);
  const rng = await academicWidget.sendTurn('what is the average fee and fee range?');
  assert(rng.reply.includes('₹15,000') && rng.reply.includes('₹42,000') && rng.reply.includes('₹25,500'), `Expected exact average ₹25,500, got: ${rng.reply}`);
});

await checkAsync('Filters out-of-stock medicines accurately on Healthcare website', async () => {
  const pharmaWidget = createWidgetHarness({
    name: 'Apollo Care Pharmacy',
    role: 'Pharmacy Assistant',
    knowledgeBase: [],
    databaseRecords: [
      { name: 'Dolo 650 Tablet', price: '₹30', stock: 50, unit: 'strips' },
      { name: 'Augmentin 625', price: '₹220', stock: 0, unit: 'strips' },
      { name: 'Cetirizine 10mg', price: '₹18', stock: 0, unit: 'strips' }
    ]
  });
  const oos = await pharmaWidget.sendTurn('which medicines are out of stock?');
  assert(oos.reply.includes('Augmentin 625') && oos.reply.includes('Cetirizine 10mg') && !oos.reply.includes('Dolo 650'), `Unexpected OOS reply: ${oos.reply}`);
});

// 3. Precision-Gated RAG & Honest Uncertainty (NO False-Positive FAQ Collisions!)
console.log('\n3. Precision-Gated RAG, Honest Uncertainty & Anti-Repetition:');
await checkAsync('Rejects irrelevant FAQ collisions and gives polite Honest Uncertainty (EN, HI, MR)', async () => {
  const w = createWidgetHarness({
    name: 'Sangli Academy',
    role: 'Academic Admissions Assistant',
    knowledgeBase: [
      { q: 'What are the campus timings?', a: 'Campus hours are Monday to Saturday, 8:00 AM to 5:00 PM.' },
      { q: 'What courses are offered?', a: 'We offer Science, Commerce, and Arts.' }
    ],
    databaseRecords: academicCatalog
  });

  // Should NOT falsely match "campus timings" or "courses offered"!
  const u1 = await w.sendTurn('who is the principal of this college?');
  assert(!u1.reply.includes('8:00 AM to 5:00 PM'), 'Must NOT return irrelevant campus timings FAQ!');
  assert(/don't have exact information|honest rather than guess/i.test(u1.reply), `Must communicate honest uncertainty, got: ${u1.reply}`);

  const w2 = createWidgetHarness({
    name: 'Sangli Academy',
    role: 'Academic Admissions Assistant',
    knowledgeBase: [{ q: 'What are the campus timings?', a: '8 AM to 5 PM.' }],
    databaseRecords: academicCatalog
  });
  const u2 = await w2.sendTurn('do you accept bitcoin cryptocurrency payments?');
  assert(!u2.reply.includes('8 AM to 5 PM'), 'Must NOT trigger irrelevant FAQ on bitcoin query');
  assert(/don't have exact information/i.test(u2.reply), `Expected honest uncertainty, got: ${u2.reply}`);

  // Hindi & Marathi honest uncertainty
  const wHi = createWidgetHarness({ name: 'Sangli Academy', role: 'Academic Assistant', knowledgeBase: [], databaseRecords: academicCatalog });
  const uHi = await wHi.sendTurn('क्या आपके पास मुंबई के लिए हॉस्टल बस है?');
  assert(/सटीक जानकारी उपलब्ध नहीं/.test(uHi.reply), `Expected Hindi honest uncertainty, got: ${uHi.reply}`);

  const wMr = createWidgetHarness({ name: 'Sangli Academy', role: 'Academic Assistant', knowledgeBase: [], databaseRecords: academicCatalog });
  const uMr = await wMr.sendTurn('कॉलेजचे प्रिन्सिपल कोण आहेत?');
  assert(/अचूक माहिती उपलब्ध नाही/.test(uMr.reply), `Expected Marathi honest uncertainty, got: ${uMr.reply}`);
});

await checkAsync('Semantic Anti-Repetition Guard breaks out of consecutive repeated fallbacks', async () => {
  assert.strictEqual(
    isSemanticallyRepeated(
      'I do not have exact details about that listed right now.',
      ['I do not have exact details about that listed right now.']
    ),
    true
  );
  const w = createWidgetHarness({
    name: 'Sangli Academy',
    role: 'Academic Assistant',
    knowledgeBase: [],
    databaseRecords: academicCatalog
  });
  const r1 = await w.sendTurn('who is the college founder?');
  const r2 = await w.sendTurn('what is the hostel bus route to London?');
  assert.notStrictEqual(r1.reply, r2.reply, `Consecutive unknown queries must not repeat identical reply (r1=${r1.reply})`);
  assert(r2.reply.includes('Std 11th - 12th Science'), `Second unknown turn should proactively guide with concrete verified options, got: ${r2.reply}`);
});

// 4. Query-Aware Top-K RAG Prompt Injection (Beyond Old 25-FAQ Cap!)
console.log('\n4. Query-Aware RAG & Analytical Prompt Injection:');
check('buildCustomerSystemPrompt ranks relevant FAQ at index 28 into Top-12 & injects ANALYTICAL_RESULT + Honest Uncertainty rules', () => {
  const manyFaqs = [];
  for (let i = 1; i <= 27; i++) {
    manyFaqs.push({ q: `General Notice ${i}`, a: `Routine announcement number ${i} for visitors.` });
  }
  manyFaqs.push({ q: 'What is the scholarship deadline?', a: 'Merit scholarship applications close on July 15 every year.' });

  const w = createWidgetHarness({
    name: 'Sangli Academy',
    role: 'Academic Admissions Assistant',
    knowledgeBase: manyFaqs,
    databaseRecords: academicCatalog
  });

  const analytics = analyzeCatalogQuery('compare 11th Science and 11th Commerce', academicCatalog, { itemNounEn: 'courses', priceLabelEn: 'fee', itemUnit: 'seats' });
  const prompt = w.buildCustomerSystemPrompt(
    { name: 'Sangli Academy', role: 'Academic Admissions Assistant', knowledgeBase: manyFaqs, databaseRecords: academicCatalog },
    { status: 'ANALYTICAL_RESULT', data: analytics },
    'en-US',
    null,
    'when is the scholarship deadline?'
  );
  assert(prompt.includes('Merit scholarship applications close on July 15'), 'RAG must retrieve relevant FAQ at index 28 beyond old 25 cap!');
  assert(prompt.includes('STATUS: ANALYTICAL_RESULT'), 'Prompt must inject precomputed ANALYTICAL_RESULT');
  assert(prompt.includes('HONEST UNCERTAINTY PROTOCOL'), 'Prompt must include strict Honest Uncertainty directive');
});

// 5. Rich Structured Ingestion in codebaseAnalyzer.js
console.log('\n5. Rich Structured HTML Extraction & Catalog Analytics:');
check('Extracts heading+<ul> lists, <dl> definitions, 2-col spec tables, ₹ prices, and catalogAnalytics', () => {
  const sampleHtml = `
    <html>
      <head><title>Apex Academy</title></head>
      <body>
        <section>
          <h2>Eligibility Criteria</h2>
          <ul>
            <li>Minimum 60% in Class 10 board exams</li>
            <li>Original School Leaving Certificate required</li>
          </ul>
          <dl>
            <dt>Principal Name</dt>
            <dd>Dr. Rajesh Deshmukh</dd>
          </dl>
          <table>
            <tr><th>Campus Timings</th><td>Monday to Saturday, 8:00 AM to 2:00 PM</td></tr>
          </table>
          <table>
            <tr><th>Course Name</th><th>Annual Fee</th><th>Seats</th></tr>
            <tr><td>Class 11 Science</td><td>₹25,000</td><td>100 seats</td></tr>
            <tr><td>Class 11 Commerce</td><td>₹18,000</td><td>80 seats</td></tr>
          </table>
        </section>
      </body>
    </html>
  `;
  const fe = analyzeFrontendFile('index.html', sampleHtml);
  assert(fe.knowledgeBase.some(k => /Eligibility Criteria/i.test(k.q) && /60%/.test(k.a)), 'Must extract heading + <ul> list');
  assert(fe.knowledgeBase.some(k => /Principal Name/i.test(k.q) && /Dr\. Rajesh Deshmukh/.test(k.a)), 'Must extract <dl><dt><dd>');
  assert(fe.knowledgeBase.some(k => /Campus Timings/i.test(k.q) && /8:00 AM to 2:00 PM/.test(k.a)), 'Must extract 2-column key-value spec table');
  assert(fe.pricingOrProducts.some(p => p.includes('₹25,000')), 'Must extract ₹ multi-currency pricing');

  const full = analyzeFullStackFiles([{ name: 'index.html', content: sampleHtml }]);
  assert.strictEqual(full.catalogAnalytics.count, 2);
  assert.strictEqual(full.catalogAnalytics.minPrice.value, 18000);
  assert.strictEqual(full.catalogAnalytics.maxPrice.value, 25000);
});

// 6. Studio aiCompletionService.js Parity
console.log('\n6. Studio aiCompletionService.js Parity (Offline Analytics + Honest Uncertainty):');
await checkAsync('Handles SaaS plan comparison, budget filter, and honest uncertainty cleanly', async () => {
  const saasPlans = [
    { name: 'Starter Plan', price: '$19/mo', description: 'Up to 3 users and email support.' },
    { name: 'Pro Plan', price: '$49/mo', description: 'Up to 25 users, API access, and priority support.' },
    { name: 'Enterprise Plan', price: '$199/mo', description: 'Unlimited users, SSO, and dedicated manager.' }
  ];
  const cmp = await generateAIResponse('compare Starter Plan and Pro Plan', 'You are CloudFlow SaaS assistant.', [], '', { databaseRecords: saasPlans });
  assert(cmp.includes('Starter Plan') && cmp.includes('Pro Plan') && cmp.includes('$30'), `Expected exact $30 diff comparison, got: ${cmp}`);

  const budget = await generateAIResponse('plans under $50', 'You are CloudFlow SaaS assistant.', [], '', { databaseRecords: saasPlans });
  assert(budget.includes('Starter Plan') && budget.includes('Pro Plan') && !budget.includes('Enterprise Plan'), `Expected Starter & Pro under $50, got: ${budget}`);

  const unknown = await generateAIResponse('who is the CEO of CloudFlow?', 'You are CloudFlow SaaS assistant.', [{ q: 'What is uptime?', a: '99.9% SLA uptime.' }], '', { databaseRecords: saasPlans });
  assert(!unknown.includes('99.9%'), 'Must NOT return irrelevant uptime FAQ for CEO query!');
  assert(/don't have exact information/i.test(unknown), `Expected honest uncertainty, got: ${unknown}`);
});

console.log(`\n🎉 ALL ${passed}/${passed} AI ACCURACY, ANALYTICS & RELIABILITY TESTS PASSED!`);
