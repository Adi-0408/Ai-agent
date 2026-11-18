/**
 * Automated Verification Suite:
 * 1. Animated Typing Bubble & Progressive Late-Answer Messages (English, Hindi, Marathi)
 * 2. 0ms Synchronous User Bubble + Typing Indicator BEFORE network awaits in handleUserMessage()
 * 3. Parallelized 9-collection external Firebase probe inside resolveDatabaseBridge() Tier 3.5
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const widgetSrc = fs.readFileSync(path.resolve(__dirname, '../public/widget.js'), 'utf8');

let passed = 0;
let failed = 0;
function assert(cond, label, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// Minimal DOM mock for testing showTypingIndicator & handleUserMessage directly
function createMockElement(tag = 'div') {
  const el = {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    children: [],
    parentNode: null,
    scrollTop: 0,
    scrollHeight: 100,
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
    }
  };
  return el;
}

async function runTests() {
  console.log('\n==============================================================');
  console.log(' INSTANT QUERY UX, TYPING INDICATOR & PARALLEL BRIDGE TESTS');
  console.log('==============================================================\n');

  // Extract showTypingIndicator directly from public/widget.js
  const tiStart = widgetSrc.indexOf('function showTypingIndicator(');
  const tiEnd = widgetSrc.indexOf('// --- REAL-TIME LIVE WEBSITE DATABASE & INVENTORY BRIDGE ---');
  assert(tiStart > 0 && tiEnd > tiStart, 'Located showTypingIndicator() in public/widget.js');

  const bodyMock = createMockElement('div');
  const voiceLabelMock = { textContent: '' };
  const docMock = { createElement: createMockElement };
  const buildTypingFn = new Function('document', 'body', 'voiceLabel', `${widgetSrc.slice(tiStart, tiEnd)}\nreturn showTypingIndicator;`);
  const showTypingIndicator = buildTypingFn(docMock, bodyMock, voiceLabelMock);

  // --- TEST 1: Animated Typing Bubble + Progressive Stage Transitions ---
  console.log('1) Animated Typing Indicator & Progressive Late-Answer Copy');
  const loaderEn = showTypingIndicator('en-US', { stage1Ms: 60, stage2Ms: 130 });
  const statusNode = loaderEn.element.children[0].children[1];
  const dotsNode = loaderEn.element.children[0].children[0];

  assert(bodyMock.children.length === 1 && loaderEn.element.className === 'vhd-typing-bubble', 'Appends .vhd-typing-bubble synchronously at 0ms');
  assert(dotsNode.children.length === 3, 'Renders 3 animated bouncing dots');
  assert(statusNode.textContent === 'Thinking…', `Initial stage 0 caption is "Thinking…" (got "${statusNode.textContent}")`);

  await new Promise(r => setTimeout(r, 85));
  assert(/please wait a moment/i.test(statusNode.textContent), `Stage 1 progressive delay copy updated ("${statusNode.textContent}")`);

  await new Promise(r => setTimeout(r, 85));
  assert(/longer than usual/i.test(statusNode.textContent), `Stage 2 progressive delay copy updated ("${statusNode.textContent}")`);

  loaderEn.remove();
  assert(bodyMock.children.length === 0, 'remove() cleanly removes typing bubble from chat feed');

  // Verify Hindi & Marathi copy
  const loaderHi = showTypingIndicator('hi-IN', { stage1Ms: 30, stage2Ms: 70 });
  assert(loaderHi.element.children[0].children[1].textContent.includes('सोच'), 'Hindi initial caption renders');
  await new Promise(r => setTimeout(r, 90));
  assert(loaderHi.element.children[0].children[1].textContent.includes('लगभग तैयार'), 'Hindi late-answer caption renders');
  loaderHi.remove();

  const loaderMr = showTypingIndicator('mr-IN', { stage1Ms: 30, stage2Ms: 70 });
  assert(loaderMr.element.children[0].children[1].textContent.includes('विचार'), 'Marathi initial caption renders');
  await new Promise(r => setTimeout(r, 90));
  assert(loaderMr.element.children[0].children[1].textContent.includes('जवळजवळ तयार'), 'Marathi late-answer caption renders');
  loaderMr.remove();

  // --- TEST 2: Static + Runtime Verification of 0ms Optimistic Order in handleUserMessage ---
  console.log('\n2) 0ms Optimistic UI Order in handleUserMessage()');
  const hStart = widgetSrc.indexOf('async function handleUserMessage(');
  const hEnd = widgetSrc.indexOf('// Deterministic Persona Voice Profiles');
  const hSrc = widgetSrc.slice(hStart, hEnd);

  const idxAppendUser = hSrc.indexOf("appendMsg(cleanInput, 'user')");
  const idxShowTyping = hSrc.indexOf('showTypingIndicator(detectedQueryLang)');
  const idxFirstAwait = hSrc.indexOf('await ');

  assert(idxAppendUser > 0 && idxShowTyping > idxAppendUser, 'handleUserMessage appends user bubble then typing bubble');
  assert(idxShowTyping < idxFirstAwait, 'Both user bubble and typing bubble render SYNCHRONOUSLY before the first await!');
  assert(!hSrc.includes('await fetchAgentConfig()'), 'fetchAgentConfig() is no longer awaited on the critical path of every query');
  assert(hSrc.includes('finally {') && hSrc.includes('typingLoader.remove()') && hSrc.includes('sendBtn.disabled = false'), 'finally block always cleans up typingLoader and re-enables sendBtn');

  // --- TEST 3: Parallelized Tier 3.5 External Firebase Probe inside resolveDatabaseBridge ---
  console.log('\n3) Parallelized 9-Collection External Firebase Probe in resolveDatabaseBridge()');
  const archStart = widgetSrc.indexOf('const ARCHETYPE_PROFILES =');
  const archEnd = widgetSrc.indexOf('let lastConfigFetchAt =');
  const engStart = widgetSrc.indexOf('function isCustomerSafeFaq(');
  const engEnd = widgetSrc.indexOf('// Maintain multi-turn conversation memory');

  const runtimeFn = new Function('__AGENT_CONFIG__', `
    let agentConfig = __AGENT_CONFIG__;
    const conversationHistory = [];
    function getWidgetScript() { return null; }
    function detectTextLanguage() { return 'en-US'; }
    ${widgetSrc.slice(archStart, archEnd)}
    ${widgetSrc.slice(engStart, engEnd)}
    return { resolveDatabaseBridge };
  `);

  const originalFetch = globalThis.fetch;
  let active = 0;
  let maxActive = 0;
  let totalCalls = 0;
  globalThis.fetch = async (url) => {
    totalCalls++;
    active++;
    if (active > maxActive) maxActive = active;
    await new Promise(r => setTimeout(r, 130));
    active--;
    if (String(url).includes('/documents/catalog')) {
      return {
        ok: true,
        json: async () => ({
          documents: [{ fields: { name: { stringValue: 'Quantum Widget' }, price: { stringValue: '₹999' }, stock: { integerValue: '15' } } }]
        })
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const testCfg = {
    name: 'Test Store',
    databaseRecords: [],
    knowledgeBase: [],
    databaseConfig: { type: 'firebase', projectId: 'demo-proj', apiKey: 'AIzaTestKey1234567890123456789012345678' }
  };
  const { resolveDatabaseBridge } = runtimeFn(testCfg);
  const t0 = Date.now();
  const bridgeRes = await resolveDatabaseBridge('price of Quantum Widget', testCfg, {});
  const elapsed = Date.now() - t0;
  globalThis.fetch = originalFetch;

  assert(totalCalls === 9, `Probed all 9 external Firebase collections (${totalCalls} calls)`);
  assert(maxActive >= 8, `Probed external collections in parallel (maxConcurrent=${maxActive})`);
  assert(elapsed < 450, `9 × 130ms external probes completed in ${elapsed}ms (< 450ms vs ~1170ms+ sequential!)`);
  assert(bridgeRes?.status === 'FOUND_IN_LIVE_API' && bridgeRes?.data?.name === 'Quantum Widget', 'Accurately resolved matching item from parallel live probe');

  console.log('\n==============================================================');
  console.log(` RESULT: ${passed} passed, ${failed} failed`);
  console.log('==============================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
