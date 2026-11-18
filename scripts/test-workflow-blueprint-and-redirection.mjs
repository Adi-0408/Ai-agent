/**
 * Comprehensive Verification Suite:
 * 1. Stage-1 Website Workflow & Structure Analyzer (`extractWebsiteBlueprint` + `analyzeFullStackFiles`)
 *    across Academic, E-Commerce React, Restaurant, and SaaS websites.
 * 2. Exact Form, Section & Route Redirection in `public/widget.js`
 *    (`resolveExactRedirectTarget`, `resolveDatabaseBridge`, `inferLocalAgentResponse`, `buildCustomerSystemPrompt`),
 *    including spelling mistakes and workflow-grounded guidance.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractWebsiteBlueprint } from '../src/utils/websiteWorkflowAnalyzer.js';
import { analyzeFullStackFiles } from '../src/utils/codebaseAnalyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const widgetPath = path.resolve(__dirname, '../public/widget.js');
const widgetSrc = fs.readFileSync(widgetPath, 'utf8');

// Extract real widget runtime functions
const archStart = widgetSrc.indexOf('const ARCHETYPE_PROFILES =');
const archEnd = widgetSrc.indexOf('let lastConfigFetchAt =');
const engineStart = widgetSrc.indexOf('function isCustomerSafeFaq(');
const engineEnd = widgetSrc.indexOf('// Maintain multi-turn conversation memory');

if (archStart === -1 || archEnd === -1 || engineStart === -1 || engineEnd === -1) {
  console.error('❌ Could not locate extraction markers in public/widget.js');
  process.exit(1);
}

const runtimeSlice = `
  let agentConfig = __AGENT_CONFIG__;
  const conversationHistory = [];
  function getWidgetScript() { return null; }
  function detectTextLanguage(t) {
    if (/[\\u0900-\\u097F]/.test(t || '')) return 'mr-IN';
    return 'en-US';
  }
  ${widgetSrc.slice(archStart, archEnd)}
  ${widgetSrc.slice(engineStart, engineEnd)}
  return {
    isSectionNavigationQuery,
    resolveExactRedirectTarget,
    executeRedirectAction,
    resolveDatabaseBridge,
    inferLocalAgentResponse,
    buildCustomerSystemPrompt
  };
`;

function createWidgetHarness(config) {
  const fn = new Function('__AGENT_CONFIG__', runtimeSlice);
  return fn(config);
}

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
  console.log(' STAGE-1 WORKFLOW BLUEPRINT & EXACT REDIRECTION TEST SUITE');
  console.log('==============================================================\n');

  // --- SITE 1: Academic Multi-Page Portal ---
  const academicFiles = [
    {
      name: 'index.html',
      content: `<!DOCTYPE html><html><head><title>Sangli Junior College</title></head><body>
        <nav><a href="/index.html">Home</a><a href="#courses-section">Courses</a><a href="/apply.html">Apply Now</a></nav>
        <section id="courses-section"><h2>Courses & Streams</h2><p>Std 11th Science, Std 11th Commerce</p></section>
        <section id="fees-section"><h2>Fee Structure</h2><p>Annual fee ₹25,000</p></section>
        <section id="contact-section"><h2>Contact Campus</h2><p>Phone: 9876543210</p></section>
      </body></html>`
    },
    {
      name: 'apply.html',
      content: `<!DOCTYPE html><html><head><title>Online Admission - Sangli Junior College</title></head><body>
        <section id="admission-section">
          <h2>Online Admission Form</h2>
          <form id="admission-form" action="/api/admissions" method="POST">
            <label for="sname">Full Student Name</label><input id="sname" name="studentName" required />
            <label for="scourse">Select Course</label><select id="scourse" name="course"><option>Std 11th Science</option><option>Std 11th Commerce</option></select>
            <label for="smarks">10th Board Percentage</label><input id="smarks" name="percentage" type="number" required />
            <label for="sphone">Parent Mobile Number</label><input id="sphone" name="phone" required />
            <button type="submit">Submit Admission Application</button>
          </form>
        </section>
      </body></html>`
    }
  ];

  console.log('1) Academic Multi-Page Portal (index.html + apply.html)');
  const academicAnalysis = analyzeFullStackFiles(academicFiles);
  const academicBp = academicAnalysis.siteBlueprint;
  assert(Boolean(academicBp), 'analyzeFullStackFiles produced siteBlueprint');
  assert(academicBp.archetype === 'academic', `Detected archetype is academic (got ${academicBp.archetype})`);
  assert(academicBp.forms.length >= 1, `Mapped Admission Form (${academicBp.forms.length} found)`);
  assert(academicBp.forms[0].fields.length >= 4, `Extracted exact form fields (${academicBp.forms[0].fields.join(', ')})`);
  assert(academicBp.routes.some(r => r.path.includes('apply.html')), 'Mapped /apply.html route');
  assert(academicBp.sections.some(s => s.id === 'fees-section'), 'Mapped #fees-section anchor');
  assert(academicBp.workflows.length >= 1, 'Synthesized ordered customer workflow');

  const academicWidget = createWidgetHarness({
    name: 'Sangli Junior College',
    archetype: 'academic',
    siteBlueprint: academicBp,
    knowledgeBase: academicAnalysis.knowledgeBase,
    databaseRecords: [{ name: 'Std 11th Science', price: '₹25,000', stock: 120, unit: 'seats' }]
  });

  const navRes1 = await academicWidget.resolveDatabaseBridge('take me to admisison form', { name: 'Sangli Junior College', archetype: 'academic', siteBlueprint: academicBp }, {});
  assert(navRes1?.status === 'NAVIGATE_SECTION', `Typo query "take me to admisison form" triggers NAVIGATE_SECTION (got ${navRes1?.status})`);
  assert(navRes1?.data?.targetType === 'form', `Resolved targetType === "form" (got ${navRes1?.data?.targetType})`);
  assert(navRes1?.data?.isCrossPage === true && String(navRes1?.data?.redirectUrl || '').includes('apply.html'), `Cross-page redirectUrl points to apply.html (got ${navRes1?.data?.redirectUrl})`);

  const localNav1 = await academicWidget.inferLocalAgentResponse('take me to admisison form', navRes1, [], {});
  assert(typeof localNav1 === 'object' && localNav1.navAction?.isCrossPage === true, 'inferLocalAgentResponse returns clickable cross-page navAction pill');
  assert(/Full Student Name|Select Course/i.test(localNav1.reply), `Reply mentions exact form fields ("${localNav1.reply}")`);

  const procRes1 = await academicWidget.inferLocalAgentResponse('how do i apply for admission?', null, [], {});
  assert(typeof procRes1 === 'object' && procRes1.navAction?.targetType === 'form', `Procedure query attaches exact form redirect pill (reply: "${procRes1?.reply || procRes1}")`);

  const feeNav = await academicWidget.resolveDatabaseBridge('scroll to fee structure', { name: 'Sangli Junior College', archetype: 'academic', siteBlueprint: academicBp }, {});
  assert(feeNav?.status === 'NAVIGATE_SECTION' && feeNav?.data?.sectionId === 'fees-section', `Section query resolves #fees-section (got ${feeNav?.data?.sectionId})`);

  const sysPrompt = academicWidget.buildCustomerSystemPrompt({ name: 'Sangli Junior College', archetype: 'academic', siteBlueprint: academicBp, knowledgeBase: [] }, navRes1, 'en-US', {});
  assert(sysPrompt.includes('[WEBSITE_WORKFLOW_AND_NAVIGATION_BLUEPRINT]'), 'buildCustomerSystemPrompt injects [WEBSITE_WORKFLOW_AND_NAVIGATION_BLUEPRINT]');
  assert(sysPrompt.includes('Online Admission Form'), 'System prompt includes exact form name & fields');

  // --- SITE 2: E-Commerce React App ---
  console.log('\n2) E-Commerce React App (App.jsx + CheckoutPage.jsx)');
  const ecomFiles = [
    {
      name: 'src/App.jsx',
      content: `import React from 'react';
        export default function App() {
          return (
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/products" element={<Catalog />} />
              <Route path="/checkout" element={<CheckoutPage />} />
            </Routes>
          );
        }`
    },
    {
      name: 'src/pages/CheckoutPage.jsx',
      content: `export default function CheckoutPage() {
        return (
          <section id="checkout-section">
            <h2>Express Checkout Form</h2>
            <form id="checkout-form" onSubmit={handleCheckout}>
              <input name="shippingAddress" placeholder="Shipping Address" required />
              <input name="city" placeholder="City & Postal Code" required />
              <select name="paymentMethod"><option>UPI</option><option>Credit Card</option></select>
              <button type="submit">Place Order Now</button>
            </form>
          </section>
        );
      }`
    }
  ];
  const ecomBp = extractWebsiteBlueprint(ecomFiles, 'ecommerce', 'Velocity Sneakers');
  assert(ecomBp.routes.some(r => r.path === '/checkout'), 'Extracted React <Route path="/checkout" />');
  assert(ecomBp.forms.some(f => f.formId === 'checkout-form'), 'Extracted JSX <form id="checkout-form">');

  const ecomWidget = createWidgetHarness({
    name: 'Velocity Sneakers',
    archetype: 'ecommerce',
    siteBlueprint: ecomBp,
    knowledgeBase: [],
    databaseRecords: [{ name: 'Nike Air Max', price: '₹7,999', stock: 18 }]
  });
  const ecomNav = await ecomWidget.resolveDatabaseBridge('open chekout', { name: 'Velocity Sneakers', archetype: 'ecommerce', siteBlueprint: ecomBp }, {});
  assert(ecomNav?.status === 'NAVIGATE_SECTION', `Typo "open chekout" triggers NAVIGATE_SECTION (got ${ecomNav?.status})`);
  assert(ecomNav?.data?.formId === 'checkout-form' || String(ecomNav?.data?.path || '').includes('checkout'), `Resolved exact Checkout form/route (got ${ecomNav?.data?.label} @ ${ecomNav?.data?.href})`);

  // --- SITE 3: Restaurant Single-Page Site ---
  console.log('\n3) Restaurant Single-Page Site (index.html with Table Reservation Form)');
  const foodFiles = [
    {
      name: 'index.html',
      content: `<!DOCTYPE html><html><head><title>Spice Garden Restaurant</title></head><body>
        <section id="menu-section"><h2>Signature Dinner Menu</h2><p>Paneer Tikka, Dum Biryani</p></section>
        <section id="reservation-section">
          <h2>Table Reservation Form</h2>
          <form id="table-booking-form" action="/api/reserve" method="POST">
            <label for="gname">Guest Name</label><input id="gname" name="guestName" />
            <label for="gsize">Party Size</label><input id="gsize" name="guests" type="number" />
            <label for="gdate">Reservation Date</label><input id="gdate" name="date" type="date" />
            <button type="submit">Reserve Table</button>
          </form>
        </section>
      </body></html>`
    }
  ];
  const foodBp = extractWebsiteBlueprint(foodFiles, 'food', 'Spice Garden');
  assert(foodBp.forms.length === 1 && foodBp.forms[0].formId === 'table-booking-form', 'Extracted #table-booking-form');
  const foodWidget = createWidgetHarness({
    name: 'Spice Garden',
    archetype: 'food',
    siteBlueprint: foodBp,
    knowledgeBase: [],
    databaseRecords: [{ name: 'Paneer Tikka', price: '₹340', stock: 25 }]
  });
  const foodNav = await foodWidget.resolveDatabaseBridge('take me to reservaton form', { name: 'Spice Garden', archetype: 'food', siteBlueprint: foodBp }, {});
  assert(foodNav?.status === 'NAVIGATE_SECTION' && foodNav?.data?.formId === 'table-booking-form', `Typo "take me to reservaton form" resolves #table-booking-form (got ${foodNav?.data?.formId})`);
  assert(foodNav?.data?.isCrossPage === false, 'Same-page form has isCrossPage === false (smooth scroll + focus)');

  // --- SITE 4: SaaS Pricing & Free Trial Form ---
  console.log('\n4) SaaS Website (pricing.html with Free Trial Form)');
  const saasFiles = [
    {
      name: 'pricing.html',
      content: `<!DOCTYPE html><html><head><title>CloudPulse SaaS</title></head><body>
        <section id="pricing-plans"><h2>Pricing Plans</h2><p>Starter $19, Pro $49</p></section>
        <section id="trial-section">
          <h2>Start Free Trial Form</h2>
          <form id="free-trial-form" action="/api/signup">
            <label for="wemail">Work Email</label><input id="wemail" name="email" type="email" />
            <label for="cname">Company Name</label><input id="cname" name="company" />
            <button type="submit">Start 14-Day Free Trial</button>
          </form>
        </section>
      </body></html>`
    }
  ];
  const saasBp = extractWebsiteBlueprint(saasFiles, 'saas', 'CloudPulse');
  const saasWidget = createWidgetHarness({
    name: 'CloudPulse',
    archetype: 'saas',
    siteBlueprint: saasBp,
    knowledgeBase: [],
    databaseRecords: [{ name: 'Pro Plan', price: '$49/mo', stock: 999 }]
  });
  const saasNav = await saasWidget.resolveDatabaseBridge('open free trial form', { name: 'CloudPulse', archetype: 'saas', siteBlueprint: saasBp }, {});
  assert(saasNav?.status === 'NAVIGATE_SECTION' && saasNav?.data?.formId === 'free-trial-form', `Resolves #free-trial-form (got ${saasNav?.data?.formId})`);

  console.log('\n==============================================================');
  console.log(` RESULT: ${passed} passed, ${failed} failed`);
  console.log('==============================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
