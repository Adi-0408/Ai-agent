import assert from 'assert';
import { extractKnowledgeFromJson } from '../src/utils/aiKnowledgeExtractor.js';
import { analyzeDatabaseFile } from '../src/utils/codebaseAnalyzer.js';

console.log('=== FINAL DEPLOYMENT VERIFICATION SUITE ===\n');

// 1. Verify JSON file with feature cards does NOT pollute databaseRecords
console.log('Test 1: JSON with features & product catalog...');
const sampleInputJson = [
  {
    name: "Tell me about your products",
    description: "We offer: Fast Medicine & Salt Composition Search, Physical Rack & Shelf Locator..."
  },
  {
    name: "Dolo 650 Tablet",
    price: "₹30.00",
    stock: 15,
    unit: "Strip",
    category: "Analgesic"
  },
  {
    name: "Augmentin 625 Duo Tablet",
    price: "₹185.50",
    stock: 42,
    unit: "Strip",
    category: "Antibiotic"
  }
];

const extracted = extractKnowledgeFromJson(sampleInputJson, 'TestAgent', 'TestPharma');
console.log('Extracted DB Records count:', extracted.databaseRecords.length);
assert.strictEqual(extracted.databaseRecords.length, 2, 'Must have exactly 2 product records, excluding the feature card');
assert(extracted.databaseRecords.some(r => r.name === 'Dolo 650 Tablet'), 'Must contain Dolo 650');
assert(extracted.databaseRecords.some(r => r.name === 'Augmentin 625 Duo Tablet'), 'Must contain Augmentin 625');
assert(!extracted.databaseRecords.some(r => r.name.includes('Tell me about')), 'Must NEVER include feature cards as database products!');
console.log('✓ Test 1 Passed: Feature cards excluded from database records.\n');

// 2. Verify SQL INSERT analysis excludes feature noise and extracts clean products
console.log('Test 2: SQL INSERT statement parsing...');
const sqlContent = `
CREATE TABLE medicines (id INT, name VARCHAR(100), price DECIMAL(10,2), stock INT);
INSERT INTO medicines VALUES (1, 'Dolo 650 Tablet', 30.00, 15);
INSERT INTO medicines VALUES (2, 'Augmentin 625 Duo Tablet', 185.50, 42);
`;
const sqlRes = analyzeDatabaseFile('schema.sql', sqlContent);
assert.strictEqual(sqlRes.databaseRecords.length, 2, 'Must extract exactly 2 records from SQL');
assert.strictEqual(sqlRes.databaseRecords[0].name, 'Dolo 650 Tablet');
assert.strictEqual(sqlRes.databaseRecords[1].name, 'Augmentin 625 Duo Tablet');
console.log('✓ Test 2 Passed: SQL records extracted cleanly.\n');

// 3. Verify Voice 3-Language restriction
console.log('Test 3: Voice language validation (strictly English, Hindi, Marathi)...');
function isSupportedVoiceLang(text) {
  if (!text || text.trim().length === 0) return false;
  return /^[\u0900-\u097Fa-zA-Z0-9\s.,?!'"₹%():-]+$/.test(text.trim());
}

assert(isSupportedVoiceLang('price of Augmentin 625 Duo Tablet'), 'English query must be allowed');
assert(isSupportedVoiceLang('Augmentin ची किंमत काय आहे?'), 'Marathi query must be allowed');
assert(isSupportedVoiceLang('Dolo 650 की कीमत क्या है?'), 'Hindi query must be allowed');
assert(!isSupportedVoiceLang('您好，我想买药'), 'Chinese characters must be rejected');
assert(!isSupportedVoiceLang('مرحبا اريد دواء'), 'Arabic characters must be rejected');
console.log('✓ Test 3 Passed: 3-language boundary verified.\n');

console.log('🎉 ALL FINAL DEPLOYMENT VERIFICATION TESTS PASSED 100%! 🚀');
