/**
 * Verification Suite: Whole Website Analysis & Frontend Data Understanding
 * Tests multi-page ingestion, live frontend KPI/stat/chart/report-table extraction,
 * dynamic DOM cache invalidation, cross-page synthesis, zero false ITEM_NOT_FOUND errors,
 * unified Database + Frontend prompting, and Studio aiCompletionService.js parity.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  extractFrontendMetricsFromSource,
  extractFrontendChartsFromSource,
  extractReportTablesFromSource,
  buildCrossPageFrontendIndex,
  resolveFrontendDataQuery
} from '../src/utils/frontendIntelligenceExtractor.js';
import { analyzeFullStackFiles } from '../src/utils/codebaseAnalyzer.js';
import { generateAIResponse } from '../src/services/aiCompletionService.js';

const widgetCode = fs.readFileSync(path.resolve('public/widget.js'), 'utf-8');

function extractSlice(src, startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  const e = src.indexOf(endMarker, s);
  if (s === -1 || e === -1) throw new Error(`Failed to extract between "${startMarker}" and "${endMarker}"`);
  return src.substring(s, e);
}

// Build a live widget harness supporting mock window/document/sessionStorage for dynamic frontend testing
function createFrontendWidgetHarness(initialConfig, mockEnv = {}) {
  const archSrc = extractSlice(widgetCode, 'const ARCHETYPE_PROFILES =', 'let lastConfigFetchAt =');
  const engineSrc = extractSlice(widgetCode, 'function isCustomerSafeFaq(', '// Maintain multi-turn conversation memory');

  const store = new Map();
  const mockSessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };

  const factory = new Function('initialConfig', 'window', 'document', 'sessionStorage', `
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
        if (/(आहे|नाही|काय|कसे|तुम्ही|आपण|सारांश|आढावा|डॅशबोर्ड)/.test(text)) return 'mr-IN';
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
      extractLiveFrontendSnapshot,
      invalidateFrontendCaches,
      buildCustomerSystemPrompt,
      resolveDatabaseBridge,
      getCrossPageFrontendIndex
    };
  `);

  return factory(initialConfig, mockEnv.window, mockEnv.document, mockSessionStorage);
}

// Lightweight mock DOM builder for dynamic KPI/chart/filter testing
function createMockDom(state) {
  const makeEl = (text, attrs = {}, children = []) => ({
    textContent: text,
    children,
    closest: () => null,
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    querySelector: () => null,
    querySelectorAll: () => []
  });

  return {
    title: state.title || 'Executive Dashboard | Acme Portal',
    body: {},
    querySelector: (sel) => {
      if (sel.includes('h1')) return makeEl(state.h1 || 'Executive Dashboard');
      return null;
    },
    querySelectorAll: (sel) => {
      if (sel.includes('[aria-selected="true"]')) {
        return state.activeFilter ? [makeEl(state.activeFilter, { 'data-active-filter': state.activeFilter })] : [];
      }
      if (sel.includes('[data-kpi]')) {
        return (state.kpis || []).map(k => makeEl(k.value, { 'data-kpi': k.label, 'data-value': k.value, 'data-delta': k.delta || '' }));
      }
      if (sel.includes('progress')) {
        return (state.progressBars || []).map(p => makeEl('', { 'aria-label': p.label, 'aria-valuenow': String(p.value), 'aria-valuemax': '100' }));
      }
      if (sel.includes('canvas')) {
        return (state.charts || []).map(c => makeEl('', { 'data-chart': JSON.stringify(c) }));
      }
      return [];
    }
  };
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

console.log('=== WHOLE WEBSITE ANALYSIS & FRONTEND DATA UNDERSTANDING SUITE ===\n');

// Sample Multi-Page Website Files
const sampleFiles = [
  {
    name: 'index.html',
    content: `
      <html><head><title>Apex Academy</title></head>
      <body>
        <h1>Apex Academy Home</h1>
        <p>Welcome to Apex Academy, preparing students for board exams, JEE, and NEET with proven academic excellence.</p>
        <a href="/dashboard.html">Dashboard</a>
        <a href="/reports.html">Reports</a>
        <a href="/courses.html">Courses</a>
      </body></html>
    `
  },
  {
    name: 'dashboard.html',
    content: `
      <html><head><title>Academic Dashboard - Apex Academy</title></head>
      <body>
        <h1>Academic Dashboard</h1>
        <div class="kpi-card">
          <span>Total Revenue</span>
          <h3>₹12.4 Lakhs</h3>
          <small>+18% vs last quarter</small>
        </div>
        <div class="stat-card">
          <span>Active Students</span>
          <h3>1,450</h3>
          <small>+12% growth</small>
        </div>
        <div role="progressbar" aria-label="Board Pass Percentage" aria-valuenow="98.5" aria-valuemax="100"></div>
        <script>
          new Chart(ctx, {
            type: 'line',
            data: {
              labels: ['Jan', 'Feb', 'Mar', 'Apr'],
              datasets: [{ label: 'Monthly Revenue (₹)', data: [210000, 280000, 340000, 410000] }]
            }
          });
        </script>
      </body></html>
    `
  },
  {
    name: 'reports.html',
    content: `
      <html><head><title>Regional Reports - Apex Academy</title></head>
      <body>
        <h1>Regional Performance Report</h1>
        <table>
          <caption>Regional Performance Report</caption>
          <tr><th>Region</th><th>Enrollments</th><th>Revenue</th><th>Pass Rate</th></tr>
          <tr><td>North</td><td>480</td><td>₹4.8 Lakhs</td><td>96%</td></tr>
          <tr><td>South</td><td>520</td><td>₹5.2 Lakhs</td><td>99%</td></tr>
          <tr><td>West</td><td>450</td><td>₹2.4 Lakhs</td><td>98%</td></tr>
        </table>
      </body></html>
    `
  },
  {
    name: 'Analytics.jsx',
    content: `
      export default function Analytics() {
        const monthlyEnrollmentData = [
          { month: 'Jan', enrollments: 120 },
          { month: 'Feb', enrollments: 165 },
          { month: 'Mar', enrollments: 210 },
          { month: 'Apr', enrollments: 260 }
        ];
        return (
          <section>
            <h1>Enrollment Analytics</h1>
            <figure>
              <svg aria-label="Enrollment Growth Chart showing steady rise from 120 to 260 students"></svg>
              <figcaption>Monthly Enrollment Trend increased from 120 in Jan to 260 in Apr</figcaption>
            </figure>
          </section>
        );
      }
    `
  },
  {
    name: 'courses.html',
    content: `
      <html><head><title>Courses - Apex Academy</title></head>
      <body>
        <h1>Courses &amp; Programs</h1>
        <table>
          <tr><th>Course Name</th><th>Annual Fee</th><th>Seats</th></tr>
          <tr><td>Class 11 Science</td><td>₹25,000</td><td>120 seats</td></tr>
          <tr><td>Class 11 Commerce</td><td>₹20,000</td><td>80 seats</td></tr>
        </table>
      </body></html>
    `
  }
];

// 1. Complete Multi-Page Website Ingestion
console.log('1. Complete Multi-Page Website Ingestion (KPIs, Charts, Report Tables, Cross-Page Graph):');
const fullAnalysis = analyzeFullStackFiles(sampleFiles);

check('Extracts KPI cards & progress bars from uploaded dashboard HTML', () => {
  const fi = fullAnalysis.siteBlueprint.frontendIndex;
  assert(fi.metrics.some(m => /Total Revenue/i.test(m.label) && m.value.includes('12.4 Lakhs')), 'Must extract Total Revenue KPI');
  assert(fi.metrics.some(m => /Active Students/i.test(m.label) && m.value.includes('1,450')), 'Must extract Active Students KPI');
  assert(fi.metrics.some(m => /Board Pass Percentage/i.test(m.label) && m.value.includes('98.5%')), 'Must extract progress bar percentage');
});

check('Extracts Chart.js AND Recharts/JSX inline chart arrays with computed min, max & trend', () => {
  const fi = fullAnalysis.siteBlueprint.frontendIndex;
  const revChart = fi.charts.find(c => /Monthly Revenue/i.test(c.title));
  assert(revChart, 'Must extract Chart.js Monthly Revenue chart');
  assert.strictEqual(revChart.max.label, 'Apr');
  assert.strictEqual(revChart.max.value, 410000);
  assert.strictEqual(revChart.trend, 'increasing');

  const enrChart = fi.charts.find(c => /Monthly Enrollment/i.test(c.title));
  assert(enrChart, 'Must extract React JSX monthlyEnrollmentData array');
  assert.strictEqual(enrChart.max.label, 'Apr');
  assert.strictEqual(enrChart.max.value, 260);
});

check('Extracts non-catalog Regional Performance report table AND catalog courses simultaneously', () => {
  const fi = fullAnalysis.siteBlueprint.frontendIndex;
  assert(fi.reportTables.some(t => /Regional Performance/i.test(t.title) && t.rowCount === 3), 'Must extract Regional Performance report table');
  assert(fullAnalysis.databaseRecords.some(r => /Class 11 Science/i.test(r.name)), 'Must still extract catalog courses');
  assert(fi.pages.length >= 4, `Expected >=4 indexed pages, got ${fi.pages.length}`);
});

// 2. Frontend-Only Data Answering & Zero False ITEM_NOT_FOUND Errors
console.log('\n2. Frontend-Only Data (Zero False Database ITEM_NOT_FOUND Errors):');
const domState = {
  title: 'Executive Dashboard | Apex Academy',
  h1: 'Executive Dashboard',
  activeFilter: 'Q1 2026',
  kpis: [
    { label: 'Total Revenue', value: '₹12.4 Lakhs', delta: '+18%' },
    { label: 'Conversion Rate', value: '34.2%', delta: '+4.1%' }
  ],
  progressBars: [
    { label: 'Board Pass Percentage', value: 98.5 }
  ],
  charts: [
    { title: 'Monthly Revenue (₹)', labels: ['Jan', 'Feb', 'Mar'], values: [210000, 280000, 340000], unit: '₹' }
  ]
};
const mockWin = { location: { pathname: '/dashboard.html', origin: 'https://apex.example' } };
const mockDoc = createMockDom(domState);

const liveWidget = createFrontendWidgetHarness({
  name: 'Apex Assistant',
  role: 'Academic & Analytics Guide',
  knowledgeBase: [],
  databaseRecords: [], // EMPTY DATABASE — 100% frontend data!
  siteBlueprint: fullAnalysis.siteBlueprint
}, { window: mockWin, document: mockDoc });

await checkAsync('Answers KPI & stat queries directly from live frontend without ITEM_NOT_FOUND', async () => {
  const r1 = await liveWidget.sendTurn('check the total revenue');
  assert.strictEqual(r1.bridge.status, 'FOUND_IN_FRONTEND', `Must resolve from frontend, not ITEM_NOT_FOUND! Got: ${r1.bridge.status}`);
  assert(r1.reply.includes('₹12.4 Lakhs') && r1.reply.includes('+18%'), `Expected ₹12.4 Lakhs, got: ${r1.reply}`);

  const r2 = await liveWidget.sendTurn('what is our board pass percentage?');
  assert.strictEqual(r2.bridge.status, 'FOUND_IN_FRONTEND');
  assert(r2.reply.includes('98.5%'), `Expected 98.5%, got: ${r2.reply}`);
});

await checkAsync('Analyzes live frontend charts (overview, peak month, and trend direction)', async () => {
  const c1 = await liveWidget.sendTurn('what does the monthly revenue chart show?');
  assert.strictEqual(c1.bridge.status, 'FOUND_IN_FRONTEND');
  assert(c1.reply.includes('Mar') && c1.reply.includes('increasing'), `Expected chart summary with Mar & increasing, got: ${c1.reply}`);

  const c2 = await liveWidget.sendTurn('which month had the highest revenue in the chart?');
  assert(c2.reply.includes('Mar') && /3,40,000|340,000/.test(c2.reply), `Expected peak Mar 3,40,000, got: ${c2.reply}`);
});

await checkAsync('Summarizes current dashboard with active filter, KPIs & chart', async () => {
  const sum = await liveWidget.sendTurn('summarize this dashboard');
  assert.strictEqual(sum.bridge.status, 'FOUND_IN_FRONTEND');
  assert(sum.reply.includes('Q1 2026') && sum.reply.includes('₹12.4 Lakhs'), `Expected dashboard summary, got: ${sum.reply}`);
});

// 3. Dynamic Content Understanding (Live Updates After Filter/DOM Change)
console.log('\n3. Dynamic Frontend Content Updates (Cache Invalidation on Mutation):');
await checkAsync('Reflects updated frontend KPIs and active filter immediately after DOM update', async () => {
  // Simulate user switching filter from Q1 -> Q2 and dashboard updating Total Revenue
  domState.activeFilter = 'Q2 2026';
  domState.kpis[0].value = '₹15.8 Lakhs';
  domState.kpis[0].delta = '+27%';
  liveWidget.invalidateFrontendCaches(); // triggered automatically by MutationObserver in real browser

  const updated = await liveWidget.sendTurn('what is the total revenue now?');
  assert(updated.reply.includes('₹15.8 Lakhs') && updated.reply.includes('Q2 2026'), `Must reflect updated live DOM ₹15.8 Lakhs & Q2 2026, got: ${updated.reply}`);
  assert(!updated.reply.includes('₹12.4 Lakhs'), 'Must NOT return stale pre-update metric!');
});

// 4. Cross-Page Analysis + Unified Database & Frontend Reasoning
console.log('\n4. Cross-Page Synthesis & Unified Database + Frontend Reasoning:');
const unifiedWidget = createFrontendWidgetHarness({
  name: 'Apex Assistant',
  role: 'Academic Admissions & Analytics Guide',
  knowledgeBase: fullAnalysis.combinedKnowledge,
  databaseRecords: fullAnalysis.databaseRecords,
  siteBlueprint: fullAnalysis.siteBlueprint
}, { window: mockWin, document: mockDoc });

await checkAsync('Answers report table queries from another page (/reports.html) while user is on /dashboard.html', async () => {
  const reg = await unifiedWidget.sendTurn('what is the performance for the North region in the report?');
  assert.strictEqual(reg.bridge.status, 'FOUND_IN_FRONTEND');
  assert(reg.reply.includes('North') && reg.reply.includes('₹4.8 Lakhs') && reg.reply.includes('96%'), `Expected North region report row, got: ${reg.reply}`);
});

await checkAsync('Connects cross-page insights AND answers database catalog queries in the same session', async () => {
  const cross = await unifiedWidget.sendTurn('give me an overview across all pages of the website');
  assert.strictEqual(cross.bridge.status, 'FOUND_IN_FRONTEND');
  assert(cross.reply.includes('Executive Dashboard') || cross.reply.includes('Regional Performance'), `Expected cross-page overview, got: ${cross.reply}`);

  const dbAns = await unifiedWidget.sendTurn('what is the fee for Class 11 Science?');
  assert(dbAns.reply.includes('Class 11 Science') && dbAns.reply.includes('₹25,000'), `Database catalog query must still work seamlessly, got: ${dbAns.reply}`);
});

check('buildCustomerSystemPrompt injects live frontend data, cross-page insights & unified DB+Frontend rules', () => {
  const feHit = resolveFrontendDataQuery('what is the total revenue?', unifiedWidget.extractLiveFrontendSnapshot(), unifiedWidget.getCrossPageFrontendIndex({ siteBlueprint: fullAnalysis.siteBlueprint }));
  const prompt = unifiedWidget.buildCustomerSystemPrompt(
    { name: 'Apex Assistant', role: 'Academic Guide', knowledgeBase: fullAnalysis.combinedKnowledge, databaseRecords: fullAnalysis.databaseRecords, siteBlueprint: fullAnalysis.siteBlueprint },
    { status: 'FOUND_IN_FRONTEND', data: feHit },
    'en-US',
    null,
    'what is the total revenue?'
  );
  assert(prompt.includes('[LIVE_FRONTEND_DASHBOARD_AND_PAGE_DATA]'), 'Prompt must include live frontend block');
  assert(prompt.includes('[CROSS_PAGE_WEBSITE_INSIGHTS]'), 'Prompt must include cross-page insights block');
  assert(prompt.includes('STATUS: FOUND_IN_FRONTEND'), 'Prompt must include FOUND_IN_FRONTEND status');
  assert(prompt.includes('DATABASE + FRONTEND UNIFIED REASONING'), 'Prompt must enforce unified DB+Frontend reasoning');
});

// 5. Studio aiCompletionService.js Parity
console.log('\n5. Studio aiCompletionService.js Parity:');
await checkAsync('Studio generateAIResponse answers KPI, chart, and report queries without database rows', async () => {
  const kpiReply = await generateAIResponse('what is the total revenue?', 'You are Apex Assistant.', [], '', {
    databaseRecords: [],
    siteBlueprint: fullAnalysis.siteBlueprint
  });
  assert(kpiReply.includes('₹12.4 Lakhs'), `Studio must answer KPI from frontendIndex, got: ${kpiReply}`);

  const chartReply = await generateAIResponse('which month had the highest revenue in the chart?', 'You are Apex Assistant.', [], '', {
    databaseRecords: [],
    siteBlueprint: fullAnalysis.siteBlueprint
  });
  assert(chartReply.includes('Apr') && /4,10,000|410,000/.test(chartReply), `Studio must answer chart peak from frontendIndex, got: ${chartReply}`);

  const tblReply = await generateAIResponse('what is the South region revenue in the report?', 'You are Apex Assistant.', [], '', {
    databaseRecords: [],
    siteBlueprint: fullAnalysis.siteBlueprint
  });
  assert(tblReply.includes('South') && tblReply.includes('₹5.2 Lakhs'), `Studio must answer report table row, got: ${tblReply}`);
});

console.log(`\n🎉 ALL ${passed}/${passed} WHOLE-WEBSITE & FRONTEND DATA UNDERSTANDING TESTS PASSED!`);
