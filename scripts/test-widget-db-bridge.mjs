import assert from 'node:assert';
import fs from 'node:fs';

const widgetCode = fs.readFileSync('public/widget.js', 'utf8');

console.log('--- TEST 3: Verifying widget.js Database Engine Safeguards ---');

// 1. Ensure the old buggy FAQ-as-product coercion loop is completely gone
assert(!widgetCode.includes('if (items.length === 0 && agentConfig?.knowledgeBase)'), 'Must NOT have FAQ-as-product fallback loop in getAllCatalogItems');
assert(!widgetCode.includes("addItem({ name: cleanQ, price: kb.a })"), 'Must NOT add FAQs as items with price: kb.a');
console.log('✓ Old FAQ-to-product coercion loop confirmed permanently removed.');

// 2. Published widget must delegate all answer and data work to the secure API.
assert(widgetCode.includes('/api/agent/query'), 'Widget must call the central secure backend');
assert(!widgetCode.includes('databaseRecords'), 'Widget must not receive or retain database records');
assert(!widgetCode.includes('supabaseKey') && !widgetCode.includes('firestore.googleapis.com'), 'Widget must not contain direct database access or credentials');
console.log('✓ Thin widget API bridge verified; client database access is absent.');

// 3. Legacy database bridge must be inert; only the backend may retrieve live data.
assert(widgetCode.includes('async function resolveDatabaseBridge() { return null; }'), 'Legacy in-browser database bridge must be disabled');
console.log('✓ Legacy in-browser database bridge is disabled.');

// 4. Empty or unavailable server data must be reported as a temporary failure, not guessed client-side.
assert(widgetCode.includes('The assistant is temporarily unavailable'), 'Widget must fail closed when the secure backend cannot return an answer');
console.log('✓ Backend failure produces a factual, non-speculative response.');

console.log('\n ALL WIDGET SAFEGUARD TESTS PASSED! 🛡️');
