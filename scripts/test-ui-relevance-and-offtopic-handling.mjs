/**
 * Comprehensive Verification Suite:
 * Pillar 5 — UI Improvement (Zero Blue Box on Section Transitions),
 * Question-Specific Relevant Answers, Off-Topic / General Knowledge Handling,
 * Unclear Question Clarification & Polite Unknown-Answer Handling.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  isUnclearOrAmbiguousQuery,
  buildClarificationReply,
  isGeneralOffTopicQuery,
  tryAnswerGeneralKnowledgeLocally
} from '../src/utils/questionRelevanceRouter.js';
import { generateAIResponse } from '../src/services/aiCompletionService.js';

const widgetSrc = fs.readFileSync(path.resolve('public/widget.js'), 'utf-8');

const archStart = widgetSrc.indexOf('const ARCHETYPE_PROFILES =');
const archEnd = widgetSrc.indexOf('let lastConfigFetchAt =');
const engStart = widgetSrc.indexOf('function isCustomerSafeFaq(');
const engEnd = widgetSrc.indexOf('// Maintain multi-turn conversation memory');

const createWidgetRuntime = new Function('__AGENT_CONFIG__', `
  let agentConfig = __AGENT_CONFIG__;
  const conversationHistory = [];
  function getWidgetScript() { return null; }
  function detectTextLanguage(text) {
    if (/[\\u0900-\\u097F]/.test(String(text || ''))) {
      if (/(आहे|काय|नाही|माहिती|कृपया|सांगा|तुमचे)/.test(text)) return 'mr-IN';
      return 'hi-IN';
    }
    return 'en-US';
  }
  ${widgetSrc.slice(archStart, archEnd)}
  ${widgetSrc.slice(engStart, engEnd)}
  return {
    scrollToHostSection,
    resolveDatabaseBridge,
    inferLocalAgentResponse,
    buildCustomerSystemPrompt,
    isUnclearOrAmbiguousQuery,
    isGeneralOffTopicQuery,
    tryAnswerGeneralKnowledgeLocally
  };
`);

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}
async function checkAsync(label, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('=== UI IMPROVEMENT, RELEVANT ANSWERS & OFF-TOPIC HANDLING SUITE ===\n');

const sampleCatalog = [
  { id: 'c1', name: 'Class 11 Science', price: '₹25,000 / year', stock: 30, unit: 'seats', description: 'Physics, Chemistry, Mathematics & Biology with weekly mock tests' },
  { id: 'c2', name: 'Class 12 Commerce', price: '₹20,000 / year', stock: 25, unit: 'seats', description: 'Accountancy, Economics & Business Studies' }
];
const widget = createWidgetRuntime({
  name: 'Sangli Academy',
  archetype: 'academic',
  databaseRecords: sampleCatalog,
  knowledgeBase: [
    { q: 'What are the campus timings?', a: 'Our campus is open Monday to Saturday from 8 AM to 5 PM.' }
  ]
});

// 1. Blue Box Removal & Clean Section Transitions
console.log('1. Clean UI — Zero Blue Box / Highlight After Section Transitions:');
check('scrollToHostSection performs smooth scroll with ZERO boxShadow/outline/border/background mutations', () => {
  const scrollStart = widgetSrc.indexOf('function scrollToHostSection(');
  const scrollEnd = widgetSrc.indexOf('// --- EXACT FORM, SECTION & ROUTE REDIRECTION ENGINE');
  const scrollFnSrc = widgetSrc.slice(scrollStart, scrollEnd);
  assert(!scrollFnSrc.includes('#38bdf8'), 'Blue color #38bdf8 must be completely removed from scrollToHostSection');
  assert(!scrollFnSrc.includes('boxShadow'), 'boxShadow mutation must be completely removed from scrollToHostSection');
  assert(!scrollFnSrc.includes('outline'), 'outline mutation must be completely removed from scrollToHostSection');

  let scrolledOpts = null;
  const mockEl = {
    style: { boxShadow: '', outline: '', border: '', background: '', transition: '' },
    scrollIntoView(opts) { scrolledOpts = opts; }
  };

  // Call twice rapidly (previously caused permanent stuck blue box!)
  assert.strictEqual(widget.scrollToHostSection({ element: mockEl, label: 'Admissions' }), true);
  assert.strictEqual(widget.scrollToHostSection({ element: mockEl, label: 'Admissions' }), true);
  assert.deepStrictEqual(scrolledOpts, { behavior: 'smooth', block: 'center' });
  assert.strictEqual(mockEl.style.boxShadow, '', 'boxShadow must remain untouched');
  assert.strictEqual(mockEl.style.outline, '', 'outline must remain untouched');
  assert.strictEqual(mockEl.style.border, '', 'border must remain untouched');
  assert.strictEqual(mockEl.style.background, '', 'background must remain untouched');
});

// 2. Unclear / Ambiguous Question Clarification
console.log('\n2. Unclear Question Clarification (No Guessing):');
await checkAsync('Vague/unclear inputs politely ask for clarification in EN/HI/MR while valid follow-ups stay intact', async () => {
  for (const vague of ['?', 'hmm', 'tell me', 'this', 'info', 'काय?']) {
    assert.strictEqual(isUnclearOrAmbiguousQuery(vague, null), true, `Must classify "${vague}" as unclear`);
  }
  // Valid follow-up with activeItem MUST NOT be flagged as unclear
  assert.strictEqual(isUnclearOrAmbiguousQuery('details', { activeItem: sampleCatalog[0] }), false, '"details" with activeItem is a valid follow-up');
  assert.strictEqual(isUnclearOrAmbiguousQuery('yes', { activeTopic: 'catalog_list' }), false, '"yes" with activeTopic is a valid follow-up');

  const unclearRes = await widget.inferLocalAgentResponse('hmm', null, [], {});
  const unclearText = typeof unclearRes === 'object' ? unclearRes.reply : unclearRes;
  assert(/clarify|asking about/i.test(unclearText), `Widget must ask for clarification on "hmm", got: "${unclearText}"`);

  const studioUnclear = await generateAIResponse('tell me', 'Assistant', [], '', { databaseRecords: sampleCatalog, throwOnMissingKey: false });
  assert(/clarify|asking about/i.test(studioUnclear), `Studio must ask for clarification on "tell me", got: "${studioUnclear}"`);

  const mrClarify = buildClarificationReply('काय?', { queryLang: 'mr-IN' });
  assert(/स्पष्ट/.test(mrClarify), `Marathi clarification must politely ask to clarify: "${mrClarify}"`);
});

// 3. Off-Topic & General Knowledge Handling
console.log('\n3. Intelligent Off-Topic & General Knowledge Handling:');
await checkAsync('General knowledge & off-topic questions are answered helpfully without false ITEM_NOT_FOUND errors', async () => {
  assert.strictEqual(isGeneralOffTopicQuery('What is 15% of 400?', { catalogItems: sampleCatalog }), true);
  assert.strictEqual(isGeneralOffTopicQuery('What is the capital of Japan?', { catalogItems: sampleCatalog }), true);
  assert.strictEqual(isGeneralOffTopicQuery('What is the fee for Class 11 Science?', { catalogItems: sampleCatalog }), false);

  const bridgeJapan = await widget.resolveDatabaseBridge('What is the capital of Japan?', { name: 'Sangli Academy', databaseRecords: sampleCatalog }, {});
  assert.notStrictEqual(bridgeJapan?.status, 'ITEM_NOT_FOUND', 'Off-topic question must NEVER return ITEM_NOT_FOUND');
  assert.strictEqual(bridgeJapan?.status, 'GENERAL_KNOWLEDGE_QUERY');

  const mathRes = await widget.inferLocalAgentResponse('What is 15% of 400?', null, [], {});
  const mathText = typeof mathRes === 'object' ? mathRes.reply : mathRes;
  assert(/60/.test(mathText), `Expected 15% of 400 = 60, got: "${mathText}"`);

  const photoRes = await widget.inferLocalAgentResponse('Explain photosynthesis', null, [], {});
  const photoText = typeof photoRes === 'object' ? photoRes.reply : photoRes;
  assert(/sunlight|oxygen|glucose|plants/i.test(photoText), `Expected accurate photosynthesis answer, got: "${photoText}"`);

  const studioCalc = await generateAIResponse('24 * 18', 'Assistant', [], '', { databaseRecords: sampleCatalog, throwOnMissingKey: false });
  assert(/432/.test(studioCalc), `Studio must answer arithmetic 24 * 18 = 432, got: "${studioCalc}"`);

  const studioCapital = await generateAIResponse('What is the capital of Japan?', 'Assistant', [], '', { databaseRecords: sampleCatalog, throwOnMissingKey: false });
  assert(/Tokyo/i.test(studioCapital), `Studio must answer general knowledge accurately, got: "${studioCapital}"`);

  // Verify LLM prompts explicitly support intelligent off-topic + question-specific answers
  const prompt = widget.buildCustomerSystemPrompt({ name: 'Sangli Academy', databaseRecords: sampleCatalog }, bridgeJapan, 'en-US', {}, 'What is the capital of Japan?');
  assert(/QUESTION-SPECIFIC & ON-TOPIC FOCUS/i.test(prompt), 'Widget prompt must enforce question-specific on-topic focus');
  assert(/General knowledge or off-topic question/i.test(prompt), 'Widget prompt must allow accurate general/off-topic answers');
});

// 4. Polite Unknown Handling (Apology + Limitation + Try Another Question, Zero Fabrication)
console.log('\n4. Polite Unknown-Question Handling (No Fabrication):');
await checkAsync('Unknown private/obscure questions politely apologize & invite another question without fabricating', async () => {
  const unkEn = await widget.inferLocalAgentResponse('Do you accept Mars cryptocurrency coins?', null, [], {});
  const unkEnText = typeof unkEn === 'object' ? unkEn.reply : unkEn;
  assert(/apologize/i.test(unkEnText) && /try another question/i.test(unkEnText), `English unknown reply must apologize and invite another question: "${unkEnText}"`);

  const unkMr = await widget.inferLocalAgentResponse('कॉलेजचे प्रिन्सिपल कोण आहेत?', null, [], {});
  const unkMrText = typeof unkMr === 'object' ? unkMr.reply : unkMr;
  assert(/माफ करा/.test(unkMrText) && /अचूक माहिती उपलब्ध नाही/.test(unkMrText) && /दुसरा प्रश्न/.test(unkMrText), `Marathi unknown reply must apologize & invite another question: "${unkMrText}"`);
});

// 5. Project-Specific & Website-Specific Accuracy Still Intact
console.log('\n5. Specific On-Topic Website Answers Remain Accurate:');
await checkAsync('Specific course fee question returns exact verified fee politely without unrelated filler', async () => {
  const feeRes = await widget.inferLocalAgentResponse('What is the fee for Class 11 Science?', null, [], {});
  const feeText = typeof feeRes === 'object' ? feeRes.reply : feeRes;
  assert(/Class 11 Science/i.test(feeText) && /₹25,000/.test(feeText), `Expected specific Class 11 Science fee answer, got: "${feeText}"`);
});

console.log(`\n🎉 ALL ${passed}/${passed} UI, RELEVANCE & OFF-TOPIC HANDLING TESTS PASSED!`);
