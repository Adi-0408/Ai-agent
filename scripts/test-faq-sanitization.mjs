import { isCustomerSafeFaq, analyzeDatabaseFile, analyzeFullStackFiles } from '../src/utils/codebaseAnalyzer.js';
import { extractKnowledgeFromJson } from '../src/utils/aiKnowledgeExtractor.js';

console.log('--- Testing FAQ Sanitization & Customer Safety ---');

// 1. Test individual FAQ validation
const badExamples = [
  { q: 'What is minStockAlert?', a: 'minStockAlert: number; // e.g. 15' },
  { q: 'What is the minstockalert?', a: 'minStockAlert: number; // e.g. 15' },
  { q: 'What tables are in the database?', a: 'Database includes table users.' },
  { q: 'Database records for users', a: "('1', 'admin', 'password_hash')" },
  { q: 'Information from schema.sql', a: 'CREATE TABLE medicines (id INT PRIMARY KEY);' },
  { q: 'What is Record supplier invoices?', a: '- Record supplier invoices from pharmaceutical distributors. - Automatically increments batch stock counts.' }
];

for (const ex of badExamples) {
  const isSafe = isCustomerSafeFaq(ex.q, ex.a);
  if (isSafe) {
    throw new Error(`Failed to reject developer/database junk FAQ: Q: "${ex.q}", A: "${ex.a}"`);
  }
}
console.log('✓ All 6 developer code / database junk examples were successfully rejected!');

// 2. Test good customer examples
const goodExamples = [
  { q: 'What is Augmentin 625 Duo Tablet?', a: 'Augmentin 625 Duo Tablet is an antibiotic used for bacterial infections. Price: ₹185.50.' },
  { q: 'What are your business hours?', a: 'We are open Monday through Saturday from 9:00 AM to 9:00 PM.' },
  { q: 'Do you offer home delivery for medicines?', a: 'Yes, we provide same-day home delivery for orders above ₹500.' },
  { q: 'What products do you offer?', a: 'We offer: Augmentin 625, Paracetamol, Azithromycin, Pan D. Ask me for details!' }
];

for (const ex of goodExamples) {
  const isSafe = isCustomerSafeFaq(ex.q, ex.a);
  if (!isSafe) {
    throw new Error(`Accidentally rejected valid customer FAQ: Q: "${ex.q}", A: "${ex.a}"`);
  }
}
console.log('✓ All 4 valid customer FAQs were successfully accepted!');

// 3. Test analyzeDatabaseFile with SQL and TypeScript content
const sqlContent = `
CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100), password VARCHAR(255));
CREATE TABLE medicines (id INT PRIMARY KEY, name VARCHAR(100), price DECIMAL);
INSERT INTO medicines (name, price) VALUES ('Augmentin 625 Duo Tablet', 185.50);
INSERT INTO users (name, password) VALUES ('admin', 'secret_hash');
`;

const sqlAnalysis = analyzeDatabaseFile('pharmacy_schema.sql', sqlContent);
console.log('SQL Analysis Knowledge Base:', sqlAnalysis.knowledgeBase);

const hasTableQuestion = sqlAnalysis.knowledgeBase.some(k => k.q.toLowerCase().includes('what tables are in the database'));
if (hasTableQuestion) {
  throw new Error('Database schema question "What tables are in the database?" was unexpectedly found in knowledgeBase!');
}

const hasUserHash = sqlAnalysis.knowledgeBase.some(k => k.a.includes('secret_hash'));
if (hasUserHash) {
  throw new Error('Internal user password hash was leaked into knowledgeBase!');
}

const hasAugmentin = sqlAnalysis.knowledgeBase.some(k => k.q.includes('Augmentin 625 Duo Tablet'));
if (!hasAugmentin) {
  throw new Error('Expected Augmentin 625 Duo Tablet to be extracted as a customer product FAQ from INSERT INTO statement!');
}
console.log('✓ SQL parsing correctly extracted customer medicine row without leaking schema DDL or admin credentials!');

// 4. Test TypeScript types / developer notes
const codeContent = `
// Developer pharmacy inventory controller
interface PharmacyStock {
  medicineId: string;
  minStockAlert: number; // e.g. 15
  batchCount: number;
}
- Record supplier invoices from pharmaceutical distributors.
- Automatically increments batch stock counts and updates purchase prices.
- Purchase history register.
`;

const codeAnalysis = analyzeDatabaseFile('inventory.ts', codeContent);
console.log('Code Analysis Knowledge Base:', codeAnalysis.knowledgeBase);

const hasMinStock = codeAnalysis.knowledgeBase.some(k => k.a.includes('minStockAlert: number') || k.q.toLowerCase().includes('minstockalert'));
if (hasMinStock) {
  throw new Error('minStockAlert: number was not filtered out of knowledgeBase!');
}

const hasDevBullet = codeAnalysis.knowledgeBase.some(k => k.a.includes('Record supplier invoices'));
if (hasDevBullet) {
  throw new Error('Developer backlog bullet point was not filtered out!');
}

console.log('✓ TypeScript code and developer notes were 100% sanitized!');

// 5. Test JSON extraction
const jsonPayload = [
  { question: "What is your refund policy?", answer: "We offer a 30-day money-back guarantee." },
  { name: "Augmentin 625 Duo Tablet", price: "₹185.50", category: "Antibiotic", description: "Prescription antibiotic medication." }
];

const jsonResult = extractKnowledgeFromJson(jsonPayload, "Pharma Help", "Apollo Pharmacy");
if (jsonResult.knowledgeBase.length < 2) {
  throw new Error('Failed to extract customer knowledge from JSON');
}
console.log('✓ JSON knowledge extraction succeeded with', jsonResult.knowledgeBase.length, 'items!');

console.log('\n🎉 ALL FAQ SANITIZATION & CUSTOMER SAFETY TESTS PASSED!');
