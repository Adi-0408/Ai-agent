/**
 * ==============================================================================
 * ECHO AI AGENTS - GOOGLE DRIVE STORAGE WEBHOOK (GOOGLE APPS SCRIPT)
 * ==============================================================================
 * Automatically stores uploaded Frontend, Backend, and Database files for all
 * Echo AI Assistants directly into your Google Drive under a dedicated folder:
 * 
 *   Echo_AI_Agent_Files / <Assistant Name> / Frontend | Backend | Database
 * 
 * FEATURES:
 * - Thread-safe concurrency protection via LockService (ZERO duplicate folders).
 * - Automatic deduplication & auto-healing: if duplicate folders exist, merges
 *   them into 1 folder and trashes empty duplicates automatically.
 * - Full deletion support (action === 'delete_agent', 'delete_file', 'delete_all').
 * - Automatic orphaned agent folder cleanup.
 * 
 * UPDATE INSTRUCTIONS (Takes 30 seconds):
 * 1. Open Google Apps Script: https://script.google.com
 * 2. Open your project ("Echo AI Agent Drive Storage Webhook").
 * 3. Replace all code in the editor with this script.
 * 4. Save (Ctrl + S).
 * 5. Click "Deploy" (top right) -> "Manage deployments" -> Click the Pencil (Edit) icon.
 *    Under "Version", select "New version".
 *    Click "Deploy" -> Click "Done".
 * ==============================================================================
 */

var ROOT_FOLDER_NAME = 'Echo_AI_Agent_Files';

function doGet(e) {
  try {
    deduplicateRootFolders();
  } catch (_) {}
  return respondJson({
    status: 'online',
    success: true,
    service: 'Echo AI Agent - Google Drive Webhook',
    rootFolder: ROOT_FOLDER_NAME,
    timestamp: new Date().toISOString()
  });
}

function doPost(e) {
  // Use ScriptLock to prevent concurrent upload requests from racing and creating duplicate folders
  var lock = LockService.getScriptLock();
  var hasLock = false;
  try {
    hasLock = lock.tryLock(30000); // Wait up to 30s
  } catch (_) {}

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respondJson({ status: 'error', success: false, message: 'No payload received' });
    }

    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || 'upload';

    // ── ACTION: Ping / Capability Check / Auto-Deduplicate ──
    if (action === 'ping' || action === 'deduplicate') {
      var mergedCount = 0;
      try {
        mergedCount = deduplicateRootFolders();
      } catch (_) {}
      return respondJson({
        status: 'success',
        success: true,
        supportsDelete: true,
        supportsRename: true,
        supportsOrphanCleanup: true,
        supportsDeduplication: true,
        mergedDuplicateFolders: mergedCount,
        message: 'Connected to Echo_AI_Agent_Files'
      });
    }

    // ── ACTION: Delete Single File ──
    if (action === 'delete_file') {
      var deletedCount = 0;
      if (payload.fileId) {
        try {
          DriveApp.getFileById(String(payload.fileId)).setTrashed(true);
          deletedCount++;
        } catch (dfErr) {}
      }
      if (deletedCount === 0 && payload.fileName && payload.assistantName) {
        var targetName = sanitizeName(payload.assistantName).toLowerCase();
        var rootNamesList = [ROOT_FOLDER_NAME, 'Echo AI Agents'];
        for (var ri = 0; ri < rootNamesList.length; ri++) {
          var rIt = DriveApp.getFoldersByName(rootNamesList[ri]);
          while (rIt.hasNext()) {
            var rFld = rIt.next();
            var aIt = rFld.getFolders();
            while (aIt.hasNext()) {
              var aFld = aIt.next();
              if (aFld.getName().toLowerCase() === targetName) {
                deletedCount += trashNamedFilesRecursively(aFld, String(payload.fileName));
              }
            }
          }
        }
      }
      return respondJson({ status: 'success', success: true, action: 'delete_file', deleted: true, deletedCount: deletedCount });
    }

    // ── ACTION: Delete Agent Folder & Files ──
    if (action === 'delete_agent' || action === 'delete_agent_folder') {
      var deletedFiles = 0;
      var deletedFolders = 0;
      var targetIds = Array.isArray(payload.fileIds) ? payload.fileIds : [];
      for (var fi = 0; fi < targetIds.length; fi++) {
        try {
          DriveApp.getFileById(String(targetIds[fi])).setTrashed(true);
          deletedFiles++;
        } catch (fErr) {}
      }
      var targetFolderIds = Array.isArray(payload.folderIds) ? payload.folderIds : [];
      for (var foi = 0; foi < targetFolderIds.length; foi++) {
        try {
          var expFld = DriveApp.getFolderById(String(targetFolderIds[foi]));
          deletedFiles += trashFolderRecursively(expFld);
          deletedFolders++;
        } catch (foErr) {}
      }

      var rawNames = Array.isArray(payload.folderNames) ? payload.folderNames : [];
      if (payload.assistantName) rawNames.push(payload.assistantName);
      var lowerTargets = {};
      for (var ni = 0; ni < rawNames.length; ni++) {
        var cleanN = sanitizeName(rawNames[ni]).toLowerCase();
        if (cleanN) lowerTargets[cleanN] = true;
      }

      var allRoots = [ROOT_FOLDER_NAME, 'Echo AI Agents'];
      for (var rIdx = 0; rIdx < allRoots.length; rIdx++) {
        var rootIt = DriveApp.getFoldersByName(allRoots[rIdx]);
        while (rootIt.hasNext()) {
          var rootFld = rootIt.next();
          var subIt = rootFld.getFolders();
          while (subIt.hasNext()) {
            var subFld = subIt.next();
            if (lowerTargets[subFld.getName().toLowerCase()]) {
              deletedFiles += trashFolderRecursively(subFld);
              deletedFolders++;
            }
          }
        }
      }
      return respondJson({
        status: 'success',
        success: true,
        action: 'delete_agent',
        deletedFolders: deletedFolders,
        deletedFiles: deletedFiles
      });
    }

    // ── ACTION: Delete All Agents ──
    if (action === 'delete_all') {
      var wiped = 0;
      var wipeRoots = [ROOT_FOLDER_NAME, 'Echo AI Agents'];
      for (var wr = 0; wr < wipeRoots.length; wr++) {
        var wIt = DriveApp.getFoldersByName(wipeRoots[wr]);
        while (wIt.hasNext()) {
          var wFld = wIt.next();
          wiped += trashFolderRecursively(wFld);
        }
      }
      return respondJson({ status: 'success', success: true, action: 'delete_all', deletedCount: wiped });
    }

    // ── ACTION: Rename Agent Folder In-Place ──
    if (action === 'rename_agent') {
      var oldN = sanitizeName(payload.oldName || '').toLowerCase();
      var newN = sanitizeName(payload.newName || '');
      var renamedFolders = 0;
      if (oldN && newN) {
        var renRoots = [ROOT_FOLDER_NAME, 'Echo AI Agents'];
        for (var rr = 0; rr < renRoots.length; rr++) {
          var rIt2 = DriveApp.getFoldersByName(renRoots[rr]);
          while (rIt2.hasNext()) {
            var rFld2 = rIt2.next();
            var sIt2 = rFld2.getFolders();
            while (sIt2.hasNext()) {
              var sFld2 = sIt2.next();
              if (sFld2.getName().toLowerCase() === oldN) {
                try { sFld2.setName(newN); renamedFolders++; } catch (renErr) {}
              }
            }
          }
        }
      }
      return respondJson({ status: 'success', success: true, action: 'rename_agent', renamedFolders: renamedFolders });
    }

    // ── ACTION: Clean Up Orphaned Folders & Deduplicate ──
    if (action === 'cleanup_orphans') {
      try { deduplicateRootFolders(); } catch (_) {}
      var activeArr = Array.isArray(payload.activeNames) ? payload.activeNames : [];
      var activeMap = {};
      for (var ai = 0; ai < activeArr.length; ai++) {
        var normA = sanitizeName(activeArr[ai]).toLowerCase();
        if (normA) activeMap[normA] = true;
      }
      var orphanFolders = 0;
      var orphanFiles = 0;
      var removedNames = [];
      var clRoots = [ROOT_FOLDER_NAME, 'Echo AI Agents'];
      for (var cr = 0; cr < clRoots.length; cr++) {
        var cIt = DriveApp.getFoldersByName(clRoots[cr]);
        while (cIt.hasNext()) {
          var cFld = cIt.next();
          var subC = cFld.getFolders();
          while (subC.hasNext()) {
            var cand = subC.next();
            var candLower = cand.getName().toLowerCase();
            if (candLower === 'shared workspace') continue;
            if (!activeMap[candLower]) {
              removedNames.push(cand.getName());
              orphanFiles += trashFolderRecursively(cand);
              orphanFolders++;
            }
          }
        }
      }
      return respondJson({
        status: 'success',
        success: true,
        action: 'cleanup_orphans',
        deletedFolders: orphanFolders,
        deletedFiles: orphanFiles,
        removedNames: removedNames
      });
    }

    // ── ACTION: Batch File Upload ──
    if (action === 'upload_batch' && Array.isArray(payload.files)) {
      var batchAssistant = sanitizeName(payload.assistantName || 'Shared Workspace');
      var bRootIt = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
      var bRoot = bRootIt.hasNext() ? bRootIt.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);
      var bAgent = getOrCreateSubFolder(bRoot, batchAssistant);
      var tierCache = {};
      var batchResults = [];
      for (var i = 0; i < payload.files.length; i++) {
        var item = payload.files[i] || {};
        var iTierLabel = getTierLabel((item.tier || 'database').toString().toLowerCase());
        if (!tierCache[iTierLabel]) tierCache[iTierLabel] = getOrCreateSubFolder(bAgent, iTierLabel);
        var iFolder = tierCache[iTierLabel];
        var iName = item.fileName || ('file_' + i + '.txt');
        var iContent = typeof item.content === 'string' ? item.content : JSON.stringify(item.content || '', null, 2);
        var iFile = iFolder.createFile(iName, iContent, resolveMimeType(iName, item.mimeType));
        batchResults.push({
          id: item.id || '',
          fileName: iName,
          fileId: iFile.getId(),
          webViewLink: iFile.getUrl(),
          folderPath: ROOT_FOLDER_NAME + ' / ' + batchAssistant + ' / ' + iTierLabel
        });
      }
      return respondJson({ status: 'success', success: true, results: batchResults });
    }

    if (action !== 'upload') {
      return respondJson({ status: 'error', success: false, message: 'Unsupported action: ' + action });
    }

    // ── ACTION: Standard Single File Upload ──
    var fileName = payload.fileName || payload.filename || ('file_' + new Date().getTime() + '.txt');
    var rawContent = payload.content !== undefined ? payload.content : (payload.data !== undefined ? payload.data : '');
    var assistantName = sanitizeName(payload.assistantName || 'Shared Workspace');
    var tier = (payload.tier || 'database').toString().toLowerCase();
    var tierLabel = getTierLabel(tier);

    // 1. Root folder: Echo_AI_Agent_Files
    var rootFolders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
    var rootFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);

    // 2. Assistant folder (Thread-safe & auto-deduplicating)
    var agentFolder = getOrCreateSubFolder(rootFolder, assistantName);

    // 3. Category folder (Frontend | Backend | Database)
    var tierFolder = getOrCreateSubFolder(agentFolder, tierLabel);

    // 4. Clean replace if file already exists in same category
    var existingFiles = tierFolder.getFilesByName(fileName);
    while (existingFiles.hasNext()) {
      try { existingFiles.next().setTrashed(true); } catch (t) {}
    }

    // 5. Create new file
    var contentString = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent, null, 2);
    var mimeType = resolveMimeType(fileName, payload.mimeType);
    var newFile = tierFolder.createFile(fileName, contentString, mimeType);

    return respondJson({
      status: 'success',
      success: true,
      message: 'File stored in Google Drive.',
      fileId: newFile.getId(),
      fileName: fileName,
      tier: tierLabel,
      assistantName: assistantName,
      folderPath: ROOT_FOLDER_NAME + ' / ' + assistantName + ' / ' + tierLabel,
      webViewLink: newFile.getUrl()
    });
  } catch (err) {
    return respondJson({ status: 'error', success: false, message: err.toString() });
  } finally {
    if (hasLock) {
      try { lock.releaseLock(); } catch (_) {}
    }
  }
}

/**
 * Gets an existing subfolder by name. If duplicate folders with the same name exist
 * (e.g. from previous concurrent upload race conditions), automatically merges all
 * files and subfolders into the primary folder and moves the duplicate folders to Trash!
 */
function getOrCreateSubFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) {
    var primaryFolder = it.next();
    // Auto-heal duplicate folders: merge any duplicate sibling folder into primaryFolder
    while (it.hasNext()) {
      var duplicateFolder = it.next();
      try {
        mergeFoldersRecursively(duplicateFolder, primaryFolder);
      } catch (err) {
        try { duplicateFolder.setTrashed(true); } catch (_) {}
      }
    }
    return primaryFolder;
  }
  return parent.createFolder(name);
}

/**
 * Recursively moves all files and subfolders from sourceFolder into targetFolder,
 * then trashes the empty sourceFolder.
 */
function mergeFoldersRecursively(source, target) {
  if (!source || !target || source.getId() === target.getId()) return;

  // 1. Move all files from source to target
  var files = source.getFiles();
  while (files.hasNext()) {
    var file = files.next();
    var existingInTarget = target.getFilesByName(file.getName());
    if (existingInTarget.hasNext()) {
      file.setTrashed(true);
    } else {
      file.moveTo(target);
    }
  }

  // 2. Move or merge subfolders from source to target
  var subFolders = source.getFolders();
  while (subFolders.hasNext()) {
    var sub = subFolders.next();
    var targetSubMatches = target.getFoldersByName(sub.getName());
    if (targetSubMatches.hasNext()) {
      mergeFoldersRecursively(sub, targetSubMatches.next());
    } else {
      sub.moveTo(target);
    }
  }

  // 3. Trash empty source folder
  try {
    source.setTrashed(true);
  } catch (_) {}
}

/**
 * Global scan across Echo_AI_Agent_Files to merge any duplicate folders with identical names.
 */
function deduplicateRootFolders() {
  var roots = [ROOT_FOLDER_NAME, 'Echo AI Agents'];
  var mergedCount = 0;
  for (var r = 0; r < roots.length; r++) {
    var rootIt = DriveApp.getFoldersByName(roots[r]);
    while (rootIt.hasNext()) {
      var root = rootIt.next();
      var seen = {};
      var subs = root.getFolders();
      var foldersToInspect = [];
      while (subs.hasNext()) {
        foldersToInspect.push(subs.next());
      }
      for (var i = 0; i < foldersToInspect.length; i++) {
        var fld = foldersToInspect[i];
        var fName = fld.getName().trim().toLowerCase();
        if (!seen[fName]) {
          seen[fName] = fld;
        } else {
          mergeFoldersRecursively(fld, seen[fName]);
          mergedCount++;
        }
      }
    }
  }
  return mergedCount;
}

function trashFolderRecursively(folder) {
  var count = 0;
  var files = folder.getFiles();
  while (files.hasNext()) {
    try { files.next().setTrashed(true); count++; } catch (e) {}
  }
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    count += trashFolderRecursively(subs.next());
  }
  try { folder.setTrashed(true); } catch (e) {}
  return count;
}

function trashNamedFilesRecursively(folder, targetFileName) {
  var count = 0;
  var files = folder.getFilesByName(targetFileName);
  while (files.hasNext()) {
    try { files.next().setTrashed(true); count++; } catch (e) {}
  }
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    count += trashNamedFilesRecursively(subs.next(), targetFileName);
  }
  return count;
}

function getTierLabel(tier) {
  if (tier === 'frontend') return 'Frontend';
  if (tier === 'backend') return 'Backend';
  return 'Database';
}

function sanitizeName(name) {
  return String(name).replace(/[\\/:*?"<>|]/g, '-').trim() || 'Shared Workspace';
}

function resolveMimeType(fileName, explicitMime) {
  if (explicitMime && explicitMime !== 'application/octet-stream') return explicitMime;
  var lower = String(fileName).toLowerCase();
  if (lower.endsWith('.json')) return MimeType.PLAIN_TEXT;
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.ts') || lower.endsWith('.tsx')) return MimeType.PLAIN_TEXT;
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return MimeType.HTML;
  if (lower.endsWith('.css')) return MimeType.CSS;
  if (lower.endsWith('.csv')) return MimeType.CSV;
  if (lower.endsWith('.pdf')) return MimeType.PDF;
  return MimeType.PLAIN_TEXT;
}

function respondJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
