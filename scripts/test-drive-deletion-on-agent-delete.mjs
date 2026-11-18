/**
 * Verification Suite: Complete Google Drive Deletion When Deleting an Agent
 * Tests:
 * 1. Aborting in-flight background Drive uploads upon agent deletion (no zombie files recreated)
 * 2. Webhook delete_agent sends fileIds, folderIds & folderNames and detects outdated Apps Script
 * 3. Direct Drive API delete executes real DELETE calls even when DEFAULT_DRIVE_WEBHOOK_URL exists
 * 4. Apps Script source in GoogleDriveSetupModal.jsx includes delete_file, delete_agent, delete_all & upload guard
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  syncAgentFilesToDriveInBackground,
  deleteAgentFolderAndFilesFromDrive,
  cancelAgentDriveSync,
  isAgentDriveSyncCancelled
} from '../src/services/googleDriveService.js';

let passed = 0;
function check(name, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}
async function checkAsync(name, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

console.log('=== GOOGLE DRIVE DELETION ON AGENT DELETE VERIFICATION ===\n');

// 1. Apps Script Webhook Source Verification
console.log('1. Apps Script Webhook Source Integrity:');
const modalSrc = fs.readFileSync(path.resolve('src/components/GoogleDriveSetupModal.jsx'), 'utf-8');
check('APPS_SCRIPT_SOURCE implements delete_file, delete_agent, delete_all & recursive folder trashing', () => {
  assert(modalSrc.includes("if (action === 'delete_file')"), 'Must handle delete_file');
  assert(modalSrc.includes("if (action === 'delete_agent' || action === 'delete_agent_folder')"), 'Must handle delete_agent');
  assert(modalSrc.includes("if (action === 'delete_all')"), 'Must handle delete_all');
  assert(modalSrc.includes('function trashFolderRecursively('), 'Must trash nested subfolders & files recursively');
  assert(modalSrc.includes("if (action !== 'upload')"), 'Must guard upload so unknown actions never create dummy files');
});

// 2. Abort In-Flight Background Sync on Agent Delete
console.log('\n2. In-Flight Background Upload Cancellation on Delete:');
await checkAsync('Cancels queued background uploads immediately when agent is deleted mid-sync', async () => {
  const uploaded = [];
  const files = Array.from({ length: 6 }, (_, i) => ({
    id: `f_${i}`,
    name: `doc_${i}.html`,
    type: 'frontend',
    content: '<html></html>'
  }));

  const syncPromise = syncAgentFilesToDriveInBackground({
    agentId: 'Temp Delete Agent',
    files,
    concurrency: 1,
    uploadFn: async (task) => {
      await new Promise((r) => setTimeout(r, 40));
      uploaded.push(task.fileName);
      return { driveFileId: `drv_${task.id}`, storageStatus: 'synced' };
    },
    patchFn: async () => {}
  });

  // Delete agent after first upload begins
  await new Promise((r) => setTimeout(r, 25));
  cancelAgentDriveSync(['Temp Delete Agent']);
  assert.strictEqual(isAgentDriveSyncCancelled('Temp Delete Agent'), true);

  const results = await syncPromise;
  assert(uploaded.length <= 2, `Expected remaining uploads aborted immediately, got ${uploaded.length} uploaded`);
  assert(results.some((r) => !r || r.cancelled), 'Remaining tasks must be cancelled');
});

// 3. Webhook Mode Delete Verification + Outdated Webhook Detection
console.log('\n3. Webhook Mode Delete & Outdated Script Detection:');
const origFetch = globalThis.fetch;
const origLocalStorage = globalThis.localStorage;

const memStorage = new Map();
globalThis.localStorage = {
  getItem: (k) => (memStorage.has(k) ? memStorage.get(k) : null),
  setItem: (k, v) => memStorage.set(k, String(v)),
  removeItem: (k) => memStorage.delete(k)
};

await checkAsync('Sends action=delete_agent with fileIds, folderIds & folderNames to updated webhook', async () => {
  const capturedPayloads = [];
  globalThis.fetch = async (url, init) => {
    capturedPayloads.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      json: async () => ({ status: 'success', success: true, action: 'delete_agent', deletedFolders: 1, deletedFiles: 3 })
    };
  };

  const res = await deleteAgentFolderAndFilesFromDrive(
    'Academic Help',
    [
      { id: '1', name: 'index.html', driveFileId: '1abcFileId', driveAgentFolderId: '1xyzFolderId', driveFolderPath: 'Echo_AI_Agent_Files / Academic Help / Frontend' },
      { id: '2', name: 'db.json', driveFileId: '2defFileId', driveFolderPath: 'Echo_AI_Agent_Files / Academic Help / Database' }
    ],
    { agentId: 'academic_help' }
  );

  assert.strictEqual(res.deleted, true);
  assert.strictEqual(res.webhookDeleted, true);
  assert.strictEqual(res.webhookNeedsUpdate, false);
  assert.strictEqual(capturedPayloads.length, 1);
  assert.strictEqual(capturedPayloads[0].body.action, 'delete_agent');
  assert(capturedPayloads[0].body.fileIds.includes('1abcFileId') && capturedPayloads[0].body.fileIds.includes('2defFileId'), 'Must pass all real Drive fileIds');
  assert(capturedPayloads[0].body.folderIds.includes('1xyzFolderId'), 'Must pass driveAgentFolderId');
  assert(capturedPayloads[0].body.folderNames.includes('Academic Help') && capturedPayloads[0].body.folderNames.includes('academic_help'), 'Must pass folder name aliases');
});

await checkAsync('Detects outdated Apps Script webhook that accidentally replies "File stored in Google Drive."', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ status: 'success', success: true, message: 'File stored in Google Drive.', fileId: 'dummy123' })
  });

  const res = await deleteAgentFolderAndFilesFromDrive('Old Webhook Agent', [{ id: '1', driveFileId: 'realFile1' }]);
  assert.strictEqual(res.webhookDeleted, false, 'Must NOT treat accidental dummy upload as successful delete');
  assert.strictEqual(res.webhookNeedsUpdate, true, 'Must flag webhookNeedsUpdate so user is alerted');
});

// 4. Direct Drive API v3 Mode (Even When DEFAULT_DRIVE_WEBHOOK_URL Is Present!)
console.log('\n4. Direct Drive API v3 Deletion (Bypassing Webhook Loopback Bug):');
await checkAsync('Executes direct DELETE /drive/v3/files/{id} for files & case-insensitive agent folders', async () => {
  memStorage.set('google_drive_access_token', 'ya29.mock_access_token');
  memStorage.set('google_drive_token_expiry', String(Date.now() + 3600 * 1000));

  const deletedDirectIds = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('script.google.com')) {
      return { ok: true, status: 200, json: async () => ({ status: 'success', message: 'File stored in Google Drive.' }) };
    }
    if (u.includes('googleapis.com/drive/v3/files') && init.method === 'DELETE') {
      const fid = u.split('/files/')[1].split('?')[0];
      deletedDirectIds.push(fid);
      return { ok: true, status: 204, json: async () => ({}) };
    }
    if (u.includes('googleapis.com/drive/v3/files?q=')) {
      const dec = decodeURIComponent(u);
      if (dec.includes("name = 'Echo AI Agents'")) {
        return { ok: true, status: 200, json: async () => ({ files: [{ id: 'root_echo_1', name: 'Echo AI Agents' }] }) };
      }
      if (dec.includes("'root_echo_1' in parents")) {
        return { ok: true, status: 200, json: async () => ({ files: [{ id: 'agent_folder_99', name: 'academic help' }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ files: [] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };

  const res = await deleteAgentFolderAndFilesFromDrive('Academic Help', [
    { id: 'f1', driveFileId: 'drive_file_101', driveAgentFolderId: 'drive_folder_202' }
  ]);

  assert.strictEqual(res.directApiDeleted, true, 'Direct Drive API must succeed');
  assert.strictEqual(res.deleted, true);
  assert(deletedDirectIds.includes('drive_file_101'), 'Must directly DELETE recorded fileId');
  assert(deletedDirectIds.includes('drive_folder_202'), 'Must directly DELETE recorded agentFolderId');
  assert(deletedDirectIds.includes('agent_folder_99'), 'Must directly DELETE case-insensitive matching folder under Echo AI Agents');
});

globalThis.fetch = origFetch;
globalThis.localStorage = origLocalStorage;

console.log(`\n🎉 ALL ${passed}/${passed} GOOGLE DRIVE DELETION TESTS PASSED!`);
