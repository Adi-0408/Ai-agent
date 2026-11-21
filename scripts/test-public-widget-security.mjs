import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizePublicRecords } from '../src/utils/publicDataSanitizer.js';

const widget = fs.readFileSync('public/widget.js', 'utf8');
const packager = fs.readFileSync('src/utils/agentPackager.js', 'utf8');
const api = fs.readFileSync('api/agent/query.js', 'utf8');
const engine = fs.readFileSync('src/services/centralAiEngine.js', 'utf8');

assert(widget.includes('/api/agent/query'), 'Published widget must call the secure API');
for (const forbidden of ['supabaseKey', 'supabaseUrl', 'databaseRecords', 'databaseConfig', 'firestore.googleapis.com', 'api.groq.com', 'api.openai.com']) {
  assert(!widget.includes(forbidden), `Public widget must not contain ${forbidden}`);
}
assert(!/database:\s*agent\.(?:database|databaseConfig|dbRecords|databaseRecords)/.test(packager), 'Standalone package must not serialize database content or config');
assert(api.includes("readAgent('public_agents'") && api.includes("readAgent('private_agents'"), 'API must resolve separated public and private configs');
assert(api.includes('publicFieldAllowlist') && api.includes('sanitizePublicRecords'), 'API must use explicit field allowlists');
const sampleRecord = {
  name: 'Demo Widget', price: 500, stock: 3, email: 'person@example.invalid', phone: '555-0100',
  address: 'private address', supplierCost: 25, internalNotes: 'not public', customerId: 'c-1',
  tenantId: 'tenant-a', passwordHash: 'hash', apiKey: 'secret'
};
assert.deepEqual(sanitizePublicRecords([sampleRecord], { products: ['name', 'price', 'stock', 'email', 'tenantId', 'apiKey'] }), [{ name: 'Demo Widget', price: 500, stock: 3 }]);
assert.deepEqual(sanitizePublicRecords([sampleRecord], {}), []);
assert(api.includes('tenantId') && api.includes('agentId'), 'API must require tenant and agent identity');
assert(!engine.includes('databaseToolResult: dbResult'), 'Central response must not return internal DB tool output');
assert(api.includes('optionalPublicSources') && api.includes('optionalNavigationAction'), 'API response must use public response fields');

console.log('PASS public widget and API security contract');
