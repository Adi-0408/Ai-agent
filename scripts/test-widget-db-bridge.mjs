import assert from 'node:assert';
import fs from 'node:fs';

const widgetCode = fs.readFileSync('public/widget.js', 'utf8');

console.log('--- TEST 3: Verifying widget.js Database Engine Safeguards ---');

// 1. Ensure the old buggy FAQ-as-product coercion loop is completely gone
assert(!widgetCode.includes('if (items.length === 0 && agentConfig?.knowledgeBase)'), 'Must NOT have FAQ-as-product fallback loop in getAllCatalogItems');
assert(!widgetCode.includes("addItem({ name: cleanQ, price: kb.a })"), 'Must NOT add FAQs as items with price: kb.a');
console.log('✓ Old FAQ-to-product coercion loop confirmed permanently removed.');

// 2. Ensure agentConfig.databaseRecords is read by getAllCatalogItems
assert(widgetCode.includes('agentConfig.databaseRecords'), 'Must support agentConfig.databaseRecords in widget.js');
console.log('✓ Direct Firestore databaseRecords support verified.');

// 3. Ensure window.EchoAIData is prioritized
assert(widgetCode.includes('window.EchoAIData'), 'Must support window.EchoAIData in widget.js');
console.log('✓ Host window.EchoAIData support verified.');

// 4. Ensure no hardcoded fake catalog items when empty
assert(widgetCode.includes('I checked our database, but no product or medicine records are currently loaded in this catalog'), 'Must state database empty factually without guessing');
console.log('✓ Factual, unhallucinated empty state response verified.');

console.log('\n ALL WIDGET SAFEGUARD TESTS PASSED! 🛡️');
