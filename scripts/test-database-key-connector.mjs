/**
 * Automated Verification: Database Key Extraction, Live Access & Firestore/Supabase Integration
 */
import assert from 'node:assert';
import fs from 'node:fs';
import {
  extractDatabaseCredentials,
  parseFirestoreFields
} from '../src/utils/databaseKeyExtractor.js';
import { analyzeFullStackFiles, analyzeDatabaseFile } from '../src/utils/codebaseAnalyzer.js';

console.log('🧪 Starting Database Key Extraction & Live Access Verification Tests...\n');

// Test 1: Firebase Web Config JSON Detection
console.log('Test 1: Firebase Web Config JSON Detection...');
const firebaseWebJson = JSON.stringify({
  apiKey: "AIzaSyDummyKeyForTestingPurposes12345678",
  authDomain: "my-store-123.firebaseapp.com",
  projectId: "my-store-123",
  storageBucket: "my-store-123.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456",
  databaseURL: "https://my-store-123-default-rtdb.firebaseio.com"
}, null, 2);

const fbWebResult = extractDatabaseCredentials('firebaseConfig.json', firebaseWebJson);
assert(fbWebResult.detected === true, 'Failed to detect Firebase Web Config');
assert(fbWebResult.type === 'firebase', 'Provider type must be firebase');
assert(fbWebResult.config.projectId === 'my-store-123', 'Project ID mismatch');
assert(fbWebResult.config.apiKey.startsWith('AIzaSy'), 'API key mismatch');
console.log('✓ Test 1 Passed: Firebase Web Config detected accurately.');

// Test 2: Firebase Service Account JSON Detection
console.log('\nTest 2: Firebase Service Account JSON Detection...');
const serviceAccountJson = JSON.stringify({
  type: "service_account",
  project_id: "enterprise-pharma-db",
  private_key_id: "123456789",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASC...",
  client_email: "firebase-adminsdk-xyz@enterprise-pharma-db.iam.gserviceaccount.com",
  client_id: "987654321"
}, null, 2);

const saResult = extractDatabaseCredentials('serviceAccountKey.json', serviceAccountJson);
assert(saResult.detected === true, 'Failed to detect Service Account');
assert(saResult.type === 'firebase', 'Service account provider must be firebase');
assert(saResult.config.projectId === 'enterprise-pharma-db', 'Service account project_id mismatch');
assert(saResult.config.isServiceAccount === true, 'isServiceAccount flag must be true');
console.log('✓ Test 2 Passed: Firebase Service Account detected accurately.');

// Test 3: .env File Database Credentials Detection (Supabase + Firebase)
console.log('\nTest 3: .env File Database Credentials Detection...');
const envContent = `
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/mydb
SUPABASE_URL=https://myclientproject.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSJ9.signature
`;

const supaResult = extractDatabaseCredentials('.env.production', envContent);
assert(supaResult.detected === true, 'Failed to detect Supabase in .env');
assert(supaResult.type === 'supabase', 'Provider must be supabase');
assert(supaResult.config.supabaseUrl === 'https://myclientproject.supabase.co', 'Supabase URL mismatch');
assert(supaResult.config.supabaseKey.startsWith('eyJ'), 'Supabase Key mismatch');
console.log('✓ Test 3 Passed: Supabase .env credentials detected accurately.');

// Test 4: Parse Firestore REST API Document Format to Clean JavaScript Object
console.log('\nTest 4: Parsing Firestore REST Document Fields...');
const firestoreRawFields = {
  name: { stringValue: "Augmentin 625 Duo Tablet" },
  price: { stringValue: "₹185.50" },
  stock: { integerValue: "42" },
  unit: { stringValue: "Strip" },
  dosage: { stringValue: "Amoxycillin (500mg) + Clavulanic Acid (125mg)" },
  rx: { booleanValue: true },
  details: {
    mapValue: {
      fields: {
        manufacturer: { stringValue: "GlaxoSmithKline" },
        category: { stringValue: "Antibiotic" }
      }
    }
  },
  tags: {
    arrayValue: {
      values: [
        { stringValue: "antibiotic" },
        { stringValue: "prescription" }
      ]
    }
  }
};

const parsedDoc = parseFirestoreFields(firestoreRawFields);
assert.strictEqual(parsedDoc.name, "Augmentin 625 Duo Tablet");
assert.strictEqual(parsedDoc.price, "₹185.50");
assert.strictEqual(parsedDoc.stock, 42);
assert.strictEqual(parsedDoc.unit, "Strip");
assert.strictEqual(parsedDoc.rx, true);
assert.strictEqual(parsedDoc.details.manufacturer, "GlaxoSmithKline");
assert.deepStrictEqual(parsedDoc.tags, ["antibiotic", "prescription"]);
console.log('✓ Test 4 Passed: Firestore document parsed into standard JS object.');

// Test 5: FullStack Analysis Integration with Database Credentials
console.log('\nTest 5: FullStack Analysis Integration...');
const mockFiles = [
  {
    name: 'index.html',
    content: '<title>Zenith Pharmacy</title><meta name="description" content="Online certified medicine portal">'
  },
  {
    name: 'firebaseConfig.json',
    content: firebaseWebJson
  },
  {
    name: 'inventory.json',
    content: JSON.stringify([
      { name: "Dolo 650 Tablet", price: "₹30.00", stock: 15, unit: "Strip" }
    ])
  }
];

const fullStackResult = analyzeFullStackFiles(mockFiles);
assert(fullStackResult.databaseConfig !== null, 'fullStackResult must contain databaseConfig');
assert(fullStackResult.databaseConfig.projectId === 'my-store-123', 'fullStackResult projectId mismatch');
assert(fullStackResult.databaseRecords.length >= 1, 'fullStackResult must have database records');
assert(fullStackResult.databaseRecords[0].name === 'Dolo 650 Tablet', 'Record name mismatch');
console.log('✓ Test 5 Passed: FullStack analyzer seamlessly captures database credentials.');

// Test 6: Verify widget.js Contains Live Database Bridge & Firestore Parser
console.log('\nTest 6: Verifying public/widget.js Live Database Bridge...');
const widgetSrc = fs.readFileSync('public/widget.js', 'utf-8');
assert(widgetSrc.includes('function parseFirestoreFields(fields)'), 'widget.js must have parseFirestoreFields helper');
assert(widgetSrc.includes('agentConfig.databaseConfig'), 'widget.js must check agentConfig.databaseConfig');
assert(widgetSrc.includes('firestore.googleapis.com/v1/projects/'), 'widget.js must have Firestore REST API integration');
assert(widgetSrc.includes('LIVE_DATABASE_INTEGRATION'), 'widget.js prompt must have LIVE_DATABASE_INTEGRATION block');
console.log('✓ Test 6 Passed: widget.js live database integration verified.');

console.log('\n🎉 ALL DATABASE KEY EXTRACTION & LIVE ACCESS TESTS PASSED 100%! 🚀');
