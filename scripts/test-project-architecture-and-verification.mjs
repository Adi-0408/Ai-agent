/**
 * Verification Suite: Advanced AI Training, Complete Project Architecture Analysis,
 * Frontend <-> Backend Data Flows, Code-Level Diagnostics, Multi-Step Contextual Reasoning
 * & Pre-Response Answer Verification.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  analyzeProjectArchitecture,
  resolveProjectArchitectureQuery,
  splitMultiStepQuestion,
  verifyAndPolishAnswer
} from '../src/utils/projectArchitectureAnalyzer.js';
import { analyzeFullStackFiles } from '../src/utils/codebaseAnalyzer.js';
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
    function detectTextLanguage() { return 'en-US'; }
    ${engineSrc}

    async function sendTurn(userText) {
      conversationHistory.push({ role: 'user', content: userText });
      const bridge = await resolveDatabaseBridge(userText, agentConfig, conversationContext);
      const res = await inferLocalAgentResponse(userText, bridge, conversationHistory, conversationContext);
      const reply = typeof res === 'object' && res !== null ? res.reply : String(res || '');
      conversationContext.lastReply = reply;
      conversationHistory.push({ role: 'assistant', content: reply });
      return { reply, bridge };
    }

    return { sendTurn, verifyWidgetReply, splitMultiStepQuestion };
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

console.log('=== COMPLETE PROJECT ARCHITECTURE, DATA FLOW & ANSWER VERIFICATION SUITE ===\n');

const fullStackProjectFiles = [
  {
    name: 'package.json',
    content: JSON.stringify({
      name: 'apex-academy-portal',
      dependencies: { react: '^19.0.0', express: '^4.19.0', firebase: '^11.0.0', recharts: '^2.12.0' },
      devDependencies: { vite: '^6.0.0', tailwindcss: '^4.0.0' },
      scripts: { dev: 'vite', build: 'vite build', start: 'node server.js' }
    })
  },
  {
    name: '.env.example',
    content: 'VITE_API_URL=http://localhost:4000\nDATABASE_URL=postgres://localhost/apex\n'
  },
  {
    name: 'AdmissionForm.jsx',
    content: `
      import React from 'react';
      import { saveStudent } from './firebaseClient';
      export default function AdmissionForm() {
        async function submitAdmission(payload) {
          await fetch('/api/admissions', { method: 'POST', body: JSON.stringify(payload) });
          await fetch('/api/missing-stats', { method: 'GET' });
          await saveStudent(payload);
        }
        return <form id="admission-form" action="/api/admissions" method="POST"><input name="studentName" /><button type="submit">Apply Now</button></form>;
      }
    `
  },
  {
    name: 'firebaseClient.js',
    content: `
      import { getFirestore, collection, addDoc } from 'firebase/firestore';
      export async function saveStudent(data) {
        const db = getFirestore();
        return addDoc(collection(db, 'students'), data);
      }
    `
  },
  {
    name: 'server.js',
    content: `
      import express from 'express';
      const app = express();
      const smtpHost = process.env.SMTP_HOST;
      app.post('/api/admissions', async (req, res) => {
        try {
          await db.query('INSERT INTO admissions (name) VALUES ($1)', [req.body.name]);
          res.json({ ok: true });
        } catch (err) {
          res.status(500).json({ error: err.message });
        }
      });
      app.post('/api/unprotected-note', async (req, res) => {
        const note = req.body.note;
        await db.query('INSERT INTO notes (body) VALUES ($1)', [note]);
        res.json({ saved: true, host: smtpHost });
      });
      app.delete('/api/legacy-cleanup', async (req, res) => {
        try { res.json({ ok: true }); } catch (e) {}
      });
    `
  },
  {
    name: 'dashboard.html',
    content: `
      <html><head><title>Apex Academy Dashboard</title></head>
      <body>
        <h1>Apex Academy Dashboard</h1>
        <div class="kpi-card"><span>Total Revenue</span><h3>₹12.4 Lakhs</h3><small>+18%</small></div>
        <table>
          <tr><th>Course Name</th><th>Annual Fee</th><th>Seats</th></tr>
          <tr><td>Class 11 Science</td><td>₹25,000</td><td>120 seats</td></tr>
          <tr><td>Class 11 Arts</td><td>₹15,000</td><td>60 seats</td></tr>
        </table>
      </body></html>
    `
  }
];

// 1. Complete Project Architecture & Diagnostics Extraction
console.log('1. Complete Project Architecture, Data Flows & Code-Level Diagnostics:');
const fullAnalysis = analyzeFullStackFiles(fullStackProjectFiles);
const arch = fullAnalysis.projectArchitecture;

check('Extracts frameworks, dependencies, config files & referenced env var names (no secret values)', () => {
  assert(arch.frameworks.includes('React') && arch.frameworks.includes('Express.js') && arch.frameworks.includes('Vite'));
  assert(arch.dependencies.some(d => d.startsWith('react@')) && arch.dependencies.some(d => d.startsWith('express@')));
  assert(arch.referencedEnvVars.includes('SMTP_HOST'));
  assert(fullAnalysis.siteBlueprint.projectArchitecture, 'Compact projectArchitecture must be attached to siteBlueprint');
});

check('Maps Frontend -> Backend API -> Database AND Direct Frontend -> Firestore data flows', () => {
  assert(arch.dataFlows.some(f => f.fromFile === 'AdmissionForm.jsx' && f.endpoint === '/api/admissions' && f.toHandler === 'server.js' && f.dbTables.includes('admissions')), 'Must map AdmissionForm -> /api/admissions -> server.js -> admissions table');
  assert(arch.dataFlows.some(f => f.fromFile === 'firebaseClient.js' && f.dbTables.includes('students')), 'Must map firebaseClient.js -> Firestore students collection');
});

check('Detects missing backend endpoints, undocumented env vars, missing try/catch & orphan routes', () => {
  assert(arch.diagnostics.missingBackendEndpoints.some(e => e.endpoint === '/api/missing-stats'), 'Must detect missing /api/missing-stats endpoint');
  assert(arch.diagnostics.missingEnvVars.some(e => e.detail.includes('SMTP_HOST')), 'Must detect SMTP_HOST missing from .env.example');
  assert(arch.diagnostics.potentialIssues.some(e => e.detail.includes('/api/unprotected-note')), 'Must detect missing try/catch on POST /api/unprotected-note');
  assert(arch.diagnostics.orphanRoutes.some(e => e.endpoint.includes('/api/legacy-cleanup')), 'Must detect unused DELETE /api/legacy-cleanup route');
});

// 2. Studio Project Architecture Q&A + Customer Privacy Isolation
console.log('\n2. Studio Project Architecture Q&A & Customer Mode Isolation:');
await checkAsync('Studio answers Frontend-Backend communication, Tech Stack & Diagnostics accurately', async () => {
  const flowAns = await generateAIResponse('how does the frontend communicate with the backend in this project?', 'You are Apex Studio Assistant.', [], '', {
    projectArchitecture: arch,
    siteBlueprint: fullAnalysis.siteBlueprint,
    databaseRecords: fullAnalysis.databaseRecords
  });
  assert(flowAns.includes('AdmissionForm.jsx') && flowAns.includes('/api/admissions') && flowAns.includes('server.js'), `Expected exact data flow, got: ${flowAns}`);

  const stackAns = await generateAIResponse('what tech stack and dependencies does this project use?', 'You are Apex Studio Assistant.', [], '', {
    projectArchitecture: arch,
    siteBlueprint: fullAnalysis.siteBlueprint
  });
  assert(stackAns.includes('React') && stackAns.includes('Express.js') && stackAns.includes('Vite'), `Expected stack summary, got: ${stackAns}`);

  const diagAns = await generateAIResponse('are there any missing endpoints or potential issues in this project?', 'You are Apex Studio Assistant.', [], '', {
    projectArchitecture: arch,
    siteBlueprint: fullAnalysis.siteBlueprint
  });
  assert(diagAns.includes('/api/missing-stats') && diagAns.includes('SMTP_HOST'), `Expected real code diagnostics, got: ${diagAns}`);
});

check('Customer mode NEVER exposes internal code diagnostics or backend route internals', () => {
  const custRes = resolveProjectArchitectureQuery('are there any missing endpoints in server.js?', arch, { isCustomerMode: true });
  assert.strictEqual(custRes, null, 'Customer mode must strictly hide code-level architecture internals');
});

// 3. Multi-Step Compound Question Understanding (Studio + Live Widget)
console.log('\n3. Multi-Step Compound Question Synthesis:');
check('Splits genuine 2-part questions while preserving "compare X and Y" intact', () => {
  const cmp = splitMultiStepQuestion('compare Class 11 Science and Class 11 Arts');
  assert.strictEqual(cmp.length, 1, 'Must NOT split comparisons on "and"');

  const multi = splitMultiStepQuestion('Which course is the cheapest? And how do I apply?');
  assert.strictEqual(multi.length, 2, 'Must split 2-part question into 2 clauses');
});

await checkAsync('Studio answers compound Frontend KPI + Project Architecture question completely', async () => {
  const multiReply = await generateAIResponse(
    'What is the total revenue? And what tech stack does this project use?',
    'You are Apex Studio Assistant.',
    [],
    '',
    {
      siteBlueprint: fullAnalysis.siteBlueprint,
      projectArchitecture: arch,
      databaseRecords: fullAnalysis.databaseRecords
    }
  );
  assert(multiReply.includes('₹12.4 Lakhs') && multiReply.includes('React') && multiReply.includes('Express.js'), `Expected BOTH revenue & tech stack, got: ${multiReply}`);
});

await checkAsync('Live widget answers compound Customer Analytics + Workflow question completely', async () => {
  const widget = createWidgetHarness({
    name: 'Apex Academy',
    role: 'Academic Admissions Assistant',
    knowledgeBase: [],
    databaseRecords: fullAnalysis.databaseRecords,
    siteBlueprint: fullAnalysis.siteBlueprint
  });
  const res = await widget.sendTurn('Which course is the cheapest? And how do I apply?');
  assert(res.reply.includes('Class 11 Arts') && res.reply.includes('₹15,000'), `Must answer Part 1 (cheapest course), got: ${res.reply}`);
  assert(/apply|admission|form/i.test(res.reply), `Must answer Part 2 (how to apply), got: ${res.reply}`);
});

// 4. Pre-Response Answer Verification Gate
console.log('\n4. Pre-Response Answer Verification Gate:');
check('Overrides false "not available" errors when verified data exists & completes dangling sentences', () => {
  const fixed = verifyAndPolishAnswer('Sorry, I cannot find that information right now.', {
    verifiedFallback: 'Based on the live website data, Total Revenue is ₹12.4 Lakhs (+18%).',
    isCustomerMode: true
  });
  assert(fixed.includes('₹12.4 Lakhs'), `Must override false error with verified data, got: ${fixed}`);

  const completed = verifyAndPolishAnswer('Specialized batches for Class 11 Science. Strictly capped at 18 students with', {
    isCustomerMode: true
  });
  assert(completed.endsWith('.') && !/\bwith\.$/.test(completed), `Must repair dangling incomplete sentence, got: ${completed}`);
});

console.log(`\n🎉 ALL ${passed}/${passed} PROJECT ARCHITECTURE, DATA FLOW & VERIFICATION TESTS PASSED!`);
