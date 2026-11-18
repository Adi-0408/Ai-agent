/**
 * Comprehensive Verification Suite:
 * Permanently eliminates JavaScript / SQL / Config code leakage into databaseRecords & customer answers
 * across BOTH newly uploaded websites AND already-deployed legacy Firestore agents.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  detectFileType,
  analyzeFullStackFiles,
  isValidCustomerCatalogName
} from '../src/utils/codebaseAnalyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const widgetSrc = fs.readFileSync(path.resolve(__dirname, '../public/widget.js'), 'utf8');

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
  return {
    isValidCustomerCatalogName,
    getAllCatalogItems,
    resolveDatabaseBridge,
    inferLocalAgentResponse,
    buildCustomerSystemPrompt
  };
`);

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

async function runTests() {
  console.log('\n==============================================================');
  console.log(' ZERO CODE LEAKAGE IN CATALOG & ANSWERS TEST SUITE');
  console.log('==============================================================\n');

  // --- TEST 1: Ingestion of JS Firebase/DB files + HTML Website ---
  console.log('1) Full-Stack Upload with firebase-database.js, script.js & index.html');
  const uploadedFiles = [
    {
      name: 'firebase-database.js',
      content: `
        import { initializeApp } from 'firebase/app';
        export async function submitAdmission(data, firstName) {
          // If document already exists, update the record
          const payload = {
            ...data,
            firstName: firstName,
            createdAt: new Date().toISOString()
          };
          const res = await fetch('/api/admissions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          await sdkDb.collection('admissions').doc(firstName).set(payload);
          return res.json();
        }
      `
    },
    {
      name: 'script.js',
      content: `
        document.getElementById('apply-btn')?.addEventListener('click', (e) => {
          e.preventDefault();
          const user_id = localStorage.getItem('uid');
          console.log('Applying...', user_id);
        });
      `
    },
    {
      name: 'index.html',
      content: `<!DOCTYPE html><html><head><title>Sangli Junior College</title></head><body>
        <section id="courses">
          <h2>Our Academic Courses</h2>
          <div class="course-card"><h3>Std 11th - 12th Science</h3><p>Physics, Chemistry, Biology & Maths</p><span>₹25,000 / year</span><span>120 seats</span></div>
          <div class="course-card"><h3>Std 11th - 12th Commerce</h3><p>Accounts, Economics & Secretarial Practice</p><span>₹20,000 / year</span><span>80 seats</span></div>
          <div class="course-card"><h3>MHT-CET Integrated</h3><p>Board + Engineering/Pharmacy Entrance Prep</p><span>₹35,000 / year</span><span>60 seats</span></div>
        </section>
      </body></html>`
    }
  ];

  assert(detectFileType(uploadedFiles[0].name, uploadedFiles[0].content) === 'backend', 'firebase-database.js classified as backend (NOT database CSV!)');
  assert(detectFileType(uploadedFiles[1].name, uploadedFiles[1].content) === 'frontend', 'script.js classified as frontend (NOT database CSV!)');

  const analysis = analyzeFullStackFiles(uploadedFiles);
  const recordNames = analysis.databaseRecords.map(r => r.name);
  assert(recordNames.length === 3, `Extracted exactly 3 clean real courses (${recordNames.join(', ')})`);
  assert(recordNames.includes('Std 11th - 12th Science') && recordNames.includes('MHT-CET Integrated'), 'Extracted real HTML course cards into databaseRecords');
  assert(!recordNames.some(n => /\.\.\.data|first\s*Name|method:|sdk\s*Db|\/\//i.test(n)), 'ZERO JS code lines leaked into databaseRecords');

  // --- TEST 2: Legacy Pre-Poisoned Firestore Agent Self-Healing in public/widget.js ---
  console.log('\n2) Self-Healing of Legacy Poisoned Firestore Agents in public/widget.js');
  const poisonedAgentConfig = {
    name: 'Sangli Junior College',
    archetype: 'academic',
    knowledgeBase: [
      { q: 'What courses do you offer?', a: 'We offer Std 11th - 12th Science, Commerce, and Arts.' }
    ],
    databaseRecords: [
      { name: '...data', price: '', stock: null },
      { name: 'firstName: firstName', price: '', stock: null },
      { name: 'first Name: first Name', price: '', stock: null },
      { name: 'method: POST', price: '', stock: null },
      { name: 'sdkDb.collection', price: '', stock: null },
      { name: 'sdk Db.collection', price: '', stock: null },
      { name: '// If document already exists', price: '', stock: null },
      { name: 'headers: application/json', price: '', stock: null },
      { name: 'res.json', price: '', stock: null },
      { name: 'user_id', price: '', stock: null },
      { name: 'isSubmitting', price: '', stock: null },
      { name: 'Std 11th - 12th Science', price: '₹25,000 / year', stock: 120, unit: 'seats' },
      { name: 'Std 11th - 12th Commerce', price: '₹20,000 / year', stock: 80, unit: 'seats' }
    ]
  };

  const widget = runtimeFn(poisonedAgentConfig);
  const cleanedItems = widget.getAllCatalogItems(poisonedAgentConfig, true);
  assert(cleanedItems.length === 2, `Widget filtered 13 poisoned Firestore records down to 2 real courses (got ${cleanedItems.length}: ${cleanedItems.map(i => i.name).join(', ')})`);

  const bridge = await widget.resolveDatabaseBridge('which courses do you provide', poisonedAgentConfig, {});
  const localAns = await widget.inferLocalAgentResponse('which courses do you provide', bridge, [], {});
  const replyStr = typeof localAns === 'object' ? localAns.reply : localAns;
  assert(replyStr.includes('Std 11th - 12th Science') && replyStr.includes('Std 11th - 12th Commerce'), `Customer reply lists real courses ("${replyStr}")`);
  assert(!/\.\.\.data|first\s*Name|method:|sdk\s*Db|\/\/|res\.json|user_id/i.test(replyStr), 'Customer reply contains ZERO code tokens');

  const sysPrompt = widget.buildCustomerSystemPrompt(poisonedAgentConfig, bridge, 'en-US', {});
  assert(!/\.\.\.data|method: POST|sdkDb\.collection|\/\/ If document/i.test(sysPrompt), 'LLM system prompt contains ZERO poisoned code tokens');

  // --- TEST 3: Zero False Rejections Across All 10 Website Archetypes ---
  console.log('\n3) Zero False Rejections for Legitimate Offerings Across All Industries');
  const legitimateNames = [
    'Std 11th - 12th Science',
    'B.Sc Computer Science',
    'B.Tech AI & Data Science',
    'M.Com Accounting',
    "Dr. Reddy's Omez 20mg Capsule",
    'Dolo 650mg Tablet',
    'Pro Plan v2.0',
    '2.5L Hybrid SUV',
    'Paneer Tikka Masala',
    '2BHK Sea-View Flat',
    'iPhone 16 Pro',
    'OnePlus 13R',
    'Nike Air Max 90',
    'Deluxe Ocean Suite',
    'GST & ITR Filing Package'
  ];
  for (const goodName of legitimateNames) {
    assert(isValidCustomerCatalogName(goodName) && widget.isValidCustomerCatalogName(goodName), `Allowed legitimate item: "${goodName}"`);
  }

  // --- TEST 4: Explicit Code Token Rejection Matrix ---
  console.log('\n4) Strict Code Token Rejection Matrix');
  const garbageNames = [
    '...data',
    '...props',
    'firstName: firstName',
    'first Name: first Name',
    'method: POST',
    'sdkDb.collection',
    'sdk Db.collection',
    '// If document already exists',
    '/* multi-line comment */',
    'res.json',
    'err.message',
    'e.preventDefault',
    'POST',
    'application/json',
    'user_id',
    'isSubmitting'
  ];
  for (const badName of garbageNames) {
    assert(!isValidCustomerCatalogName(badName) && !widget.isValidCustomerCatalogName(badName), `Blocked code artifact: "${badName}"`);
  }

  console.log('\n==============================================================');
  console.log(` RESULT: ${passed} passed, ${failed} failed`);
  console.log('==============================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
