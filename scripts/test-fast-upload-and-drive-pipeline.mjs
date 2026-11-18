/**
 * Automated Performance & Reliability Verification Suite:
 * 1. Smart ZIP filtering & parallel batch extraction (zipHandler.js)
 * 2. Concurrent Google Drive batch uploads & timeout fault isolation (googleDriveService.js)
 * 3. Non-blocking background Drive sync + batched Firestore patching
 * 4. Parallel 11-collection + RTDB external database probing (databaseKeyExtractor.js)
 */

import JSZip from 'jszip';
import { extractFilesFromZip } from '../src/utils/zipHandler.js';
import { fetchExternalDatabaseRecords } from '../src/utils/databaseKeyExtractor.js';

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

// Standalone mirror test of bounded-concurrency worker pool matching googleDriveService.js
async function runBoundedPool(tasks, concurrency, uploadFn) {
  const results = new Array(tasks.length);
  let nextIdx = 0;
  async function worker() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= tasks.length) break;
      const task = tasks[idx];
      try {
        const driveMeta = await uploadFn(task);
        results[idx] = { id: task.id, fileName: task.fileName, ok: true, driveMeta };
      } catch (err) {
        results[idx] = { id: task.id, fileName: task.fileName, ok: false, driveMeta: { storageStatus: 'drive_failed', storageError: err.message } };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return results;
}

async function runTests() {
  console.log('\n==============================================================');
  console.log(' FAST DRIVE UPLOAD & AGENT CREATION PIPELINE TEST SUITE');
  console.log('==============================================================\n');

  // --- TEST 1: Smart ZIP Filtering & Parallel Extraction ---
  console.log('1) Smart ZIP Filtering & Parallel Unpacking (zipHandler.js)');
  const zip = new JSZip();
  zip.file('website/index.html', '<html><body><section id="courses"><h2>Courses</h2></section></body></html>');
  zip.file('website/apply.html', '<html><body><form id="apply"><input name="student" /></form></body></html>');
  zip.file('website/src/App.jsx', 'export default function App() { return <div />; }');
  zip.file('website/data/catalog.json', JSON.stringify([{ name: 'Std 11 Science', price: 25000 }]));
  zip.file('website/db/schema.sql', 'CREATE TABLE courses (id INT, name TEXT);');
  // Bloat / non-knowledge files that MUST be ignored
  zip.file('website/package-lock.json', '{"lockfileVersion": 3}');
  zip.file('website/yarn.lock', '# yarn lockfile');
  zip.file('website/assets/hero.png', new Uint8Array([137, 80, 78, 71]));
  zip.file('website/assets/banner.jpg', new Uint8Array([255, 216, 255]));
  zip.file('website/assets/fonts/inter.woff2', new Uint8Array([119, 79, 70, 50]));
  zip.file('website/static/app.bundle.min.js', 'var a=1;');
  zip.file('website/static/app.js.map', '{"version":3}');
  zip.file('website/node_modules/pkg/index.js', 'module.exports = {};');

  const zipBlob = await zip.generateAsync({ type: 'uint8array' });
  const unpacked = await extractFilesFromZip(zipBlob);
  const unpackedNames = unpacked.map(f => f.name).sort();

  assert(unpacked.length === 5, `Filtered 13 ZIP entries down to 5 clean code/data files (got ${unpacked.length}: ${unpackedNames.join(', ')})`);
  assert(unpackedNames.includes('index.html') && unpackedNames.includes('apply.html'), 'Preserved HTML pages');
  assert(unpackedNames.includes('App.jsx') && unpackedNames.includes('catalog.json') && unpackedNames.includes('schema.sql'), 'Preserved JSX, JSON & SQL files');
  assert(!unpackedNames.some(n => /lock|png|jpg|woff2|min\.js|\.map/i.test(n)), 'Skipped lockfiles, images, fonts, minified JS & sourcemaps');

  // --- TEST 2: Concurrent Drive Batch Upload Speed & Fault Isolation ---
  console.log('\n2) Concurrent Drive Batch Upload Pool & Fault Isolation');
  const { uploadFilesBatchToDrive, syncAgentFilesToDriveInBackground } = await import('../src/services/googleDriveService.js');

  const tasks = Array.from({ length: 8 }, (_, i) => ({
    id: `f_${i + 1}`,
    fileName: `file_${i + 1}.html`,
    tier: 'frontend',
    assistantName: 'SpeedTestBot',
    content: `<h1>Page ${i + 1}</h1>`
  }));

  let inFlight = 0;
  let maxObservedConcurrency = 0;
  const t0 = Date.now();
  const batchRes = await uploadFilesBatchToDrive(tasks, {
    concurrency: 4,
    uploadFn: async (task) => {
      inFlight++;
      if (inFlight > maxObservedConcurrency) maxObservedConcurrency = inFlight;
      await new Promise((r) => setTimeout(r, 180));
      inFlight--;
      if (task.fileName === 'file_3.html') {
        throw new Error('Simulated Apps Script timeout');
      }
      return { driveFileId: `drv_${task.id}`, storageStatus: 'synced' };
    }
  });
  const batchElapsed = Date.now() - t0;

  assert(maxObservedConcurrency === 4, `Worker pool ran 4 concurrent uploads in parallel (observed max=${maxObservedConcurrency})`);
  assert(batchElapsed < 900, `8 × 180ms uploads finished in ${batchElapsed}ms (< 900ms vs ~1440ms sequential)`);
  assert(batchRes.filter(r => r.ok).length === 7, `7 healthy files succeeded despite 1 failure (${batchRes.filter(r => r.ok).length}/8)`);
  assert(batchRes[2].driveMeta.storageStatus === 'drive_failed', 'Failed file cleanly marked drive_failed without blocking others');

  // --- TEST 3: Non-Blocking Background Sync + Firestore Patch ---
  console.log('\n3) Non-Blocking Background Drive Sync & Live Firestore Patch');
  const patchedMap = {};
  const bgStart = Date.now();
  const bgPromise = syncAgentFilesToDriveInBackground({
    agentId: 'SpeedTestBot',
    files: tasks.slice(0, 4).map(t => ({ id: t.id, name: t.fileName, type: 'frontend', content: t.content })),
    concurrency: 4,
    uploadFn: async (task) => {
      await new Promise((r) => setTimeout(r, 120));
      return { driveFileId: `bg_${task.id}`, storageStatus: 'synced' };
    },
    patchFn: async (_agentId, updates) => {
      Object.assign(patchedMap, updates);
      return true;
    }
  });
  const immediateReturnMs = Date.now() - bgStart;
  assert(immediateReturnMs < 40, `syncAgentFilesToDriveInBackground returned immediately in ${immediateReturnMs}ms (non-blocking UI!)`);
  await bgPromise;
  assert(Object.keys(patchedMap).length === 4, `Background sync patched all 4 files into Firestore (${Object.keys(patchedMap).length}/4)`);
  assert(patchedMap.f_1?.storageStatus === 'synced' && patchedMap.f_4?.driveFileId === 'bg_f_4', 'Patched metadata contains driveFileId & synced status');

  // --- TEST 4: Parallel External Database Probing ---
  console.log('\n4) Parallel 11-Collection Firestore + RTDB Probing (databaseKeyExtractor.js)');
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  let activeFetches = 0;
  let maxConcurrentFetches = 0;

  globalThis.fetch = async (url) => {
    fetchCalls++;
    activeFetches++;
    if (activeFetches > maxConcurrentFetches) maxConcurrentFetches = activeFetches;
    await new Promise((r) => setTimeout(r, 140));
    activeFetches--;
    if (String(url).includes('/documents/products')) {
      return {
        ok: true,
        json: async () => ({
          documents: [
            {
              name: 'projects/demo/databases/(default)/documents/products/p1',
              fields: { name: { stringValue: 'Pro Widget' }, price: { integerValue: '499' }, stock: { integerValue: '20' } }
            }
          ]
        })
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const dbStart = Date.now();
  const dbRes = await fetchExternalDatabaseRecords({ type: 'firebase', projectId: 'demo-proj', apiKey: 'AIzaTestKey1234567890123456789012345678' });
  const dbElapsed = Date.now() - dbStart;
  globalThis.fetch = originalFetch;

  assert(fetchCalls === 12, `Probed all 11 Firestore collections + RTDB (${fetchCalls} calls)`);
  assert(maxConcurrentFetches >= 10, `All collections probed in parallel (maxConcurrent=${maxConcurrentFetches})`);
  assert(dbElapsed < 500, `12 × 140ms probes finished in ${dbElapsed}ms (< 500ms vs ~1680ms+ sequential!)`);
  assert(dbRes.success && dbRes.records.length === 1 && dbRes.records[0].name === 'Pro Widget', 'Extracted live record accurately from parallel probe');

  console.log('\n==============================================================');
  console.log(` RESULT: ${passed} passed, ${failed} failed`);
  console.log('==============================================================\n');
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
