import assert from 'node:assert';
import { analyzeDatabaseFile, analyzeFullStackFiles } from '../src/utils/codebaseAnalyzer.js';

console.log('--- TEST 1: Database Ingestion & Structured Record Extraction ---');

// Sample JSON database
const jsonDb = JSON.stringify([
  { name: "Dolo 650", price: "₹32.00", stock: 150, unit: "strips", category: "Antipyretic", dosage: "Paracetamol 650mg" },
  { name: "Augmentin 625 Duo", price: "₹185.50", stock: 42, unit: "strips", category: "Antibiotic", dosage: "Amoxicillin 500mg" },
  { name: "Cetirizine 10mg", price: "₹18.00", stock: 80, unit: "strips", category: "Antihistamine" }
]);

const resJson = analyzeDatabaseFile('inventory.json', jsonDb);
assert(Array.isArray(resJson.databaseRecords), 'Should have databaseRecords array');
assert.strictEqual(resJson.databaseRecords.length, 3, 'Should extract 3 structured records');
assert.strictEqual(resJson.databaseRecords[0].name, 'Dolo 650');
assert.strictEqual(resJson.databaseRecords[0].stock, 150);
console.log('✓ JSON Database extraction passed:', resJson.databaseRecords.length, 'records extracted.');

// Sample SQL database
const sqlDb = `
CREATE TABLE medicines (id INT, name VARCHAR(100), price DECIMAL, stock INT);
INSERT INTO medicines VALUES (1, 'Azithromycin 500mg', 120.00, 18);
INSERT INTO medicines VALUES (2, 'Pan D Capsule', 195.00, 65);
`;

const resSql = analyzeDatabaseFile('medicines.sql', sqlDb);
assert(Array.isArray(resSql.databaseRecords), 'Should have databaseRecords array');
assert.strictEqual(resSql.databaseRecords.length, 2, 'Should extract 2 structured records from SQL');
assert.strictEqual(resSql.databaseRecords[0].name, 'Azithromycin 500mg');
console.log('✓ SQL Database extraction passed:', resSql.databaseRecords.length, 'records extracted.');

// Sample CSV database
const csvDb = `Name,Price,Stock,Category
Metformin 500mg,45.00,200,Antidiabetic
Telmisartan 40mg,75.00,110,Cardiovascular
`;

const resCsv = analyzeDatabaseFile('pharmacy.csv', csvDb);
assert.strictEqual(resCsv.databaseRecords.length, 2, 'Should extract 2 structured records from CSV');
assert.strictEqual(resCsv.databaseRecords[0].name, 'Metformin 500mg');
console.log('✓ CSV Database extraction passed:', resCsv.databaseRecords.length, 'records extracted.');

// Full Stack Aggregation Test
const fullResult = analyzeFullStackFiles([
  { name: 'inventory.json', content: jsonDb },
  { name: 'medicines.sql', content: sqlDb },
  { name: 'pharmacy.csv', content: csvDb }
]);

assert.strictEqual(fullResult.databaseRecords.length, 7, 'Should aggregate 7 records across full-stack files');
console.log('✓ Full-Stack aggregation passed:', fullResult.databaseRecords.length, 'total records aggregated.');

console.log('--- TEST 2: Guarantee ZERO Conversational FAQ Coercion ---');
// Verify that questions like "Tell me about your products" are NOT in databaseRecords
const bogusDoc = `
# Pharmacy Management System
- Fast Medicine & Salt Composition Search
- Physical Rack & Shelf Locator
- Automatic Batch FEFO (First Expiring First Out)
`;
const docRes = analyzeDatabaseFile('README.md', bogusDoc);
assert.strictEqual(docRes.databaseRecords.length, 0, 'Document overview must NEVER be treated as a database record');
console.log('✓ Document FAQs successfully isolated from database records.');

console.log('\n ALL TESTS PASSED SUCCESSFULLY! 🚀');
