import assert from 'node:assert';
import fs from 'node:fs';

console.log('=== DEPLOYMENT-READY UNIVERSAL DATABASE ENGINE TEST (ALL DOMAINS) ===\n');

// 1. Read widget.js to evaluate functions in isolation
const widgetSource = fs.readFileSync('public/widget.js', 'utf8');

// Extract functions
const scriptContext = new Function(`
  ${widgetSource.substring(widgetSource.indexOf('function isCatalogListQuery('), widgetSource.indexOf('function isSectionNavigationQuery('))}
  ${widgetSource.substring(widgetSource.indexOf('const UNIVERSAL_STOPWORDS = new Set(['), widgetSource.indexOf('// --- REAL-TIME LIVE WEBSITE DATABASE BRIDGE ---'))}
  return { isCatalogListQuery, UNIVERSAL_STOPWORDS, matchInInventory, formatRealtimeStockResponse, extractTargetItem };
`)();

const { isCatalogListQuery, matchInInventory, formatRealtimeStockResponse, extractTargetItem } = scriptContext;

// Comprehensive Universal Database across multiple domains:
// 1. Pharmacy / Health
// 2. Electronics / Retail
// 3. Footwear / Fashion
// 4. Restaurant / Food
// 5. SaaS / Software Plans
const testDatabase = [
  {
    name: "Dolo 650 Tablet",
    dosage: "Paracetamol (650mg)",
    manufacturer: "Micro Labs Ltd",
    price: "₹30.00",
    stock: 15,
    unit: "Strip"
  },
  {
    name: "Augmentin 625 Duo Tablet",
    dosage: "Amoxicillin (500mg) + Clavulanic Acid (125mg)",
    manufacturer: "GlaxoSmithKline",
    price: "₹185.50",
    stock: 42,
    unit: "Strip"
  },
  {
    name: "iPhone 15 Pro 256GB",
    category: "Smartphones",
    brand: "Apple",
    price: "$1,199.00",
    stock: 8,
    unit: "units"
  },
  {
    name: "Nike Air Max 90 Running Shoes",
    category: "Footwear",
    brand: "Nike",
    price: "$120.00",
    stock: 25,
    unit: "pairs"
  },
  {
    name: "Margherita Pizza (Large 12-inch)",
    category: "Pizzas",
    price: "$14.99",
    stock: 50,
    unit: "pizzas"
  },
  {
    name: "Pro Tier Subscription Plan",
    category: "SaaS Plans",
    price: "$49/month",
    stock: null,
    unit: "license"
  }
];

// Test 1: User asks "price of Augmentin 625 Duo Tablet" (Pharmacy Domain)
console.log('Test 1: Querying "price of Augmentin 625 Duo Tablet" (Pharmacy)...');
const q1 = "price of Augmentin 625 Duo Tablet";
const target1 = extractTargetItem(q1);
assert.strictEqual(target1, "Augmentin 625 Duo Tablet", "Target extraction must strip 'price of'");

const match1 = matchInInventory(testDatabase, target1);
assert(match1 !== null, "Must find Augmentin in database");
assert.strictEqual(match1.name, "Augmentin 625 Duo Tablet", "MUST match Augmentin and NEVER Dolo 650!");
assert.notStrictEqual(match1.name, "Dolo 650 Tablet", "CRITICAL: Must NEVER match Dolo 650!");

const res1 = formatRealtimeStockResponse(match1, 'en-US', q1);
console.log('-> Response:', res1);
assert(res1.includes('₹185.50'), "Response MUST include the price of Augmentin");
assert(res1.includes('The price of Augmentin 625 Duo Tablet is ₹185.50'), "Response MUST answer the price first");
assert(!res1.includes('Dolo'), "Response must not contain Dolo");
console.log('✓ Test 1 Passed: Exact Augmentin price returned without false positive.\n');

// Test 2: User asks "stock of Dolo 650"
console.log('Test 2: Querying "stock of Dolo 650"...');
const q2 = "stock of Dolo 650";
const target2 = extractTargetItem(q2);
const match2 = matchInInventory(testDatabase, target2);
assert(match2 !== null, "Must find Dolo 650");
assert.strictEqual(match2.name, "Dolo 650 Tablet");

const res2 = formatRealtimeStockResponse(match2, 'en-US', q2);
console.log('-> Response:', res2);
assert(res2.includes('15 Strip available'), "Response must state 15 Strip stock");
assert(!res2.includes('Augmentin'), "Response must not contain Augmentin");
console.log('✓ Test 2 Passed: Exact Dolo 650 stock returned.\n');

// Test 3: Electronics Query on Non-Pharma Item ("price of iPhone 15 Pro")
console.log('Test 3: Querying "price of iPhone 15 Pro" (Electronics domain)...');
const q3 = "price of iPhone 15 Pro";
const target3 = extractTargetItem(q3);
const match3 = matchInInventory(testDatabase, target3);
assert(match3 !== null, "Must find iPhone in database");
assert.strictEqual(match3.name, "iPhone 15 Pro 256GB");

const res3 = formatRealtimeStockResponse(match3, 'en-US', q3);
console.log('-> Response:', res3);
assert(res3.includes('$1,199.00'), "Response must include iPhone price $1,199.00");
console.log('✓ Test 3 Passed: Universal electronics query works flawlessly.\n');

// Test 4: Footwear Query ("do you have Nike Air Max")
console.log('Test 4: Querying "do you have Nike Air Max" (Footwear domain)...');
const q4 = "do you have Nike Air Max";
const target4 = extractTargetItem(q4);
const match4 = matchInInventory(testDatabase, target4);
assert(match4 !== null, "Must find Nike Air Max");
assert.strictEqual(match4.name, "Nike Air Max 90 Running Shoes");

const res4 = formatRealtimeStockResponse(match4, 'en-US', q4);
console.log('-> Response:', res4);
assert(res4.includes('25 pairs available'), "Response must state 25 pairs stock");
console.log('✓ Test 4 Passed: Footwear query matched correctly.\n');

// Test 5: Restaurant / Food Query ("price of Margherita Pizza")
console.log('Test 5: Querying "price of Margherita Pizza" (Restaurant domain)...');
const q5 = "price of Margherita Pizza";
const target5 = extractTargetItem(q5);
const match5 = matchInInventory(testDatabase, target5);
assert(match5 !== null, "Must find Margherita Pizza");
assert.strictEqual(match5.name, "Margherita Pizza (Large 12-inch)");

const res5 = formatRealtimeStockResponse(match5, 'en-US', q5);
console.log('-> Response:', res5);
assert(res5.includes('$14.99'), "Response must state $14.99 price");
console.log('✓ Test 5 Passed: Restaurant domain works flawlessly.\n');

// Test 6: SaaS Plan Query ("pricing of Pro Plan")
console.log('Test 6: Querying "pricing of Pro Plan" (SaaS domain)...');
const q6 = "pricing of Pro Plan";
const target6 = extractTargetItem(q6);
const match6 = matchInInventory(testDatabase, target6);
assert(match6 !== null, "Must find Pro Tier Subscription Plan");
assert.strictEqual(match6.name, "Pro Tier Subscription Plan");

const res6 = formatRealtimeStockResponse(match6, 'en-US', q6);
console.log('-> Response:', res6);
assert(res6.includes('$49/month'), "Response must state $49/month price");
console.log('✓ Test 6 Passed: SaaS subscription plan query works flawlessly.\n');

// Test 7: Query for items NOT in database (Metformin, Pixel 9)
console.log('Test 7: Querying items NOT in database (Zero False Positives)...');
const q7a = "price of Metformin 500mg";
assert.strictEqual(matchInInventory(testDatabase, extractTargetItem(q7a)), null, "Unknown medicine must return null");

const q7b = "price of Google Pixel 9";
assert.strictEqual(matchInInventory(testDatabase, extractTargetItem(q7b)), null, "Unknown phone must return null");
console.log('✓ Test 7 Passed: Unknown items correctly return null without hallucination.\n');

// Test 8: Catalog Listing Query Intent Across Domains
console.log('Test 8: Catalog Listing Queries across all phrasing...');
const listQueries = [
  "give list of all meds",
  "give me list of meds on the website",
  "list of all products",
  "what products do you sell",
  "show menu",
  "what do you have in stock",
  "what plans do you have",
  "all items list",
  "सर्व औषधांची यादी",
  "दवाइयों की लिस्ट"
];

for (const lq of listQueries) {
  assert(isCatalogListQuery(lq), `Query "${lq}" MUST be recognized as a catalog list query`);
}
console.log(`✓ Test 8 Passed: All ${listQueries.length} catalog list intents recognized universally.\n`);

// Test 9: Marathi & Hindi Responses
console.log('Test 9: Multilingual price responses...');
const mrRes = formatRealtimeStockResponse(match1, 'mr-IN', 'Augmentin ची किंमत काय आहे?');
console.log('-> Marathi:', mrRes);
assert(mrRes.includes('₹185.50') && mrRes.includes('किंमत'), "Marathi response must state price");

const hiRes = formatRealtimeStockResponse(match1, 'hi-IN', 'Augmentin की कीमत क्या है?');
console.log('-> Hindi:', hiRes);
assert(hiRes.includes('₹185.50') && hiRes.includes('कीमत'), "Hindi response must state price");
console.log('✓ Test 9 Passed: Multilingual price responses verified.\n');

console.log('🎉 ALL 9 DEPLOYMENT-READY TESTS PASSED WITH 100% ACCURACY ACROSS ALL DOMAINS! 🚀');
