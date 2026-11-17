import assert from 'assert';
import fs from 'fs';
import path from 'path';

const widgetCode = fs.readFileSync(path.resolve('public/widget.js'), 'utf-8');

// Extract REAL production functions directly from public/widget.js (no mocks of core logic)
function extractFn(source, startMarker, endMarker) {
  const s = source.indexOf(startMarker);
  const e = source.indexOf(endMarker, s);
  if (s === -1 || e === -1) throw new Error(`Could not extract between "${startMarker}" and "${endMarker}"`);
  return source.substring(s, e);
}

const isCatalogListSrc = extractFn(widgetCode, 'function isCatalogListQuery(', 'function isSectionNavigationQuery(');
const greetingAndTargetSrc = extractFn(widgetCode, 'function stripLeadingGreeting(', 'function matchInInventory(');

const { isCatalogListQuery, stripLeadingGreeting, isGreetingOrConversational } = new Function(`
  ${isCatalogListSrc}
  ${greetingAndTargetSrc}
  return { isCatalogListQuery, stripLeadingGreeting, isGreetingOrConversational };
`)();

console.log('=== REGRESSION TEST: GREETING HIJACKING & UNIVERSAL CATALOG LIST QUERIES ===\n');

// 1. Standalone greetings MUST still be detected as greetings
const standaloneGreetings = [
  'hi', 'Hi!', 'hey', 'Hey!', 'hello', 'Hello there!', 'good morning', 'good evening',
  'namaste', 'namaskar', 'नमस्कार', 'नमस्ते', 'हाय', 'हॅलो', 'thanks', 'thank you', 'bye', 'goodbye'
];
for (const g of standaloneGreetings) {
  assert.strictEqual(isGreetingOrConversational(g), true, `Standalone "${g}" MUST be treated as conversational greeting`);
}
console.log('✓ All standalone greetings, thanks, and farewells (EN/HI/MR) recognized cleanly.');

// 2. Real customer questions starting with "hey" / "hi" / "hello" MUST NEVER be hijacked as greetings!
const greetingPlusQuestions = [
  ['hey i want know about the courses', 'i want know about the courses'],
  ['hi which courses do you provide', 'which courses do you provide'],
  ['hello what is the price of 11th std', 'what is the price of 11th std'],
  ['hey, tell me about your products', 'tell me about your products'],
  ['hi! show me the menu', 'show me the menu'],
  ['namaste course ke bare me batao', 'course ke bare me batao'],
  ['नमस्कार मला अभ्यासक्रमांची माहिती हवी आहे', 'मला अभ्यासक्रमांची माहिती हवी आहे']
];
for (const [input, expectedStripped] of greetingPlusQuestions) {
  assert.strictEqual(isGreetingOrConversational(input), false, `"${input}" MUST NOT be hijacked as a greeting!`);
  assert.strictEqual(stripLeadingGreeting(input), expectedStripped, `stripLeadingGreeting("${input}") mismatch`);
}
console.log('✓ Greeting-prefixed questions NEVER hijacked; leading greeting stripped cleanly.');

// 3. Universal Catalog List Queries across ALL website archetypes (including user's exact screenshot prompts)
const catalogQueries = [
  'hey i want know about the courses',
  'which courses do you provide',
  'what courses do you offer',
  'tell me about the courses',
  'list of all courses',
  'hey i want know about the products',
  'which products do you sell',
  'what dishes do you serve',
  'show me the menu',
  'hello which plans do you offer',
  'what rooms are available',
  'which vehicles do you have',
  'what properties are available',
  'give list of all meds',
  'कोणते अभ्यासक्रम आहेत',
  'कौन से कोर्स हैं'
];
for (const q of catalogQueries) {
  assert.strictEqual(isCatalogListQuery(q), true, `Catalog list query "${q}" MUST be detected!`);
}
console.log('✓ All universal catalog/course/product/dish/plan/room/vehicle/property list queries detected.');

// 4. Follow-up & specific-item queries MUST NOT be falsely treated as full catalog list queries
const nonCatalogQueries = [
  'give me details of 11th std',
  'what do you provide in that',
  'what subjects are in that',
  'what features are in this',
  'what is the price of dolo 650',
  'how to apply for it'
];
for (const q of nonCatalogQueries) {
  assert.strictEqual(isCatalogListQuery(q), false, `Specific/follow-up query "${q}" MUST NOT be treated as a full catalog list!`);
}
console.log('✓ Specific-item and pronoun follow-up queries stay locked on active item context.');

// 5. Verify full end-to-end offline reasoning in aiCompletionService.js as well
import { generateAIResponse } from '../src/services/aiCompletionService.js';

const mockAcademicCourses = [
  { name: 'Std 11th - 12th Science', price: '₹25,000 / year', stock: 120, unit: 'seats', description: 'PCB/PCM with labs' },
  { name: 'Std 11th - 12th Commerce', price: '₹20,000 / year', stock: 80, unit: 'seats', description: 'Accountancy, Economics' },
  { name: 'Std 11th - 12th Arts', price: '₹15,000 / year', stock: 60, unit: 'seats', description: 'History, Political Science' }
];
const mockAcademicKb = [
  { q: 'What courses do you provide?', a: 'We provide Std 11th-12th Science, Commerce, and Arts streams.' }
];

const r1 = await generateAIResponse('hey i want know about the courses', 'Academic Admissions Assistant', mockAcademicKb, '', {
  agentName: 'test',
  databaseRecords: mockAcademicCourses
});
console.log('\n[Studio/Offline Turn 1] "hey i want know about the courses" ->', r1);
assert(r1.includes('Std 11th - 12th Science') && !/^Hello! I am your AI assistant/i.test(r1), 'Turn 1 must list courses, not greet!');

const r2 = await generateAIResponse('which courses do you provide', 'Academic Admissions Assistant', mockAcademicKb, '', {
  agentName: 'test',
  databaseRecords: mockAcademicCourses
});
console.log('[Studio/Offline Turn 2] "which courses do you provide" ->', r2);
assert(r2.includes('Std 11th - 12th Science') && r2.includes('Commerce'), 'Turn 2 must list available courses!');

// Also test when databaseRecords is empty and ONLY knowledgeBase has courses
const r3 = await generateAIResponse('hey i want know about the courses', 'Academic Admissions Assistant', mockAcademicKb, '', {
  agentName: 'test',
  databaseRecords: []
});
console.log('[Studio/Offline KB-Only] "hey i want know about the courses" ->', r3);
assert(r3.includes('Science') && r3.includes('Commerce'), 'KB-only mode must answer from verified KB!');

console.log('\n🎉 ALL REGRESSION TESTS PASSED 100%!');
