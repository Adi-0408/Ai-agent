/**
 * ==============================================================================
 * ECHO AI AGENTS - GOOGLE DRIVE STORAGE WEBHOOK (GOOGLE APPS SCRIPT)
 * ==============================================================================
 * Automatically stores uploaded Frontend, Backend, and Database files for all
 * Echo AI Assistants directly into your Google Drive under a dedicated folder:
 * 
 *   Echo_AI_Agent_Files / <Assistant Name> / Frontend | Backend | Database
 * 
 * WHY THIS APPROACH (Same as Sushant Bhishi):
 * - ZERO Google Cloud Console / OAuth 2.0 Web Client ID complexity.
 * - ZERO token expirations — the Web App URL works permanently for your Drive.
 * - ZERO login friction for any team member or client uploading code or data.
 * - 100% centralized: all files are automatically saved into your Google Drive.
 * 
 * DEPLOYMENT INSTRUCTIONS (Takes 60 seconds):
 * 1. Open Google Drive (https://drive.google.com).
 * 2. Click "+ New" -> "More" -> "Google Apps Script" (or visit https://script.google.com/home/start).
 * 3. Delete any default code in the editor, and paste this ENTIRE file.
 * 4. Click the blue "Deploy" button (top right) -> "New deployment".
 * 5. Click the Gear icon next to "Select type" -> choose "Web app".
 * 6. Set Description: "Echo AI Agent Drive Storage Webhook".
 * 7. Set Execute as: "Me (your Google account)".
 * 8. Set Who has access: "Anyone". (CRITICAL so the web app can upload files).
 * 9. Click "Deploy" -> Click "Authorize access" (choose your Google account, click "Advanced" -> "Go to Untitled project (unsafe)").
 * 10. Copy the generated "Web app URL" (looks like https://script.google.com/macros/s/AKfycb.../exec).
 * 11. In Echo AI -> AI & Storage Integrations -> Google Drive Setup, paste your Web App URL and click "Save & Connect"!
 * ==============================================================================
 */

var ROOT_FOLDER_NAME = 'Echo_AI_Agent_Files';

/**
 * Handles incoming GET requests (Used for health-check / live verification).
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) || {};
    var action = params.action || 'ping';

    if (action === 'get_catalog' || action === 'query' || action === 'list') {
      return handleDatabaseQuery(params);
    }

    var folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
    var rootFolderExists = folders.hasNext();
    
    return respondJson({
      status: 'online',
      success: true,
      service: 'Echo AI Agent - Google Drive Webhook',
      rootFolder: ROOT_FOLDER_NAME,
      rootFolderExists: rootFolderExists,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return respondJson({
      status: 'online',
      success: true,
      service: 'Echo AI Agent - Google Drive Webhook',
      rootFolder: ROOT_FOLDER_NAME,
      notice: err.toString()
    });
  }
}

/**
 * Handles incoming POST requests to upload files or query folders.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respondJson({
        status: 'error',
        success: false,
        message: 'No payload received in request body.'
      });
    }

    var payload = {};
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return respondJson({
        status: 'error',
        success: false,
        message: 'Invalid JSON body: ' + parseErr.toString()
      });
    }

    var action = payload.action || 'upload';

    // ── ACTION: Ping / Verify ──
    if (action === 'ping') {
      return respondJson({
        status: 'success',
        success: true,
        message: 'Google Drive Webhook is connected and ready.',
        rootFolder: ROOT_FOLDER_NAME
      });
    }

    // ── ACTION: Query Database / Get Catalog ──
    if (action === 'get_catalog' || action === 'query' || action === 'list') {
      return handleDatabaseQuery(payload);
    }

    // ── ACTION: Delete Agent Folder & Files ──
    if (action === 'delete_agent' || action === 'delete_agent_files') {
      var agentNameToDelete = sanitizeName(payload.assistantName || payload.name || '');
      if (!agentNameToDelete) {
        return respondJson({ status: 'error', success: false, message: 'assistantName is required for deletion.' });
      }
      var rootFolders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
      var deletedCount = 0;
      while (rootFolders.hasNext()) {
        var rFolder = rootFolders.next();
        var targetAgentFolders = rFolder.getFoldersByName(agentNameToDelete);
        while (targetAgentFolders.hasNext()) {
          var af = targetAgentFolders.next();
          try {
            af.setTrashed(true);
            deletedCount++;
          } catch (tErr) {}
        }
      }
      return respondJson({
        status: 'success',
        success: true,
        message: 'Agent folder "' + agentNameToDelete + '" and all its files have been deleted from Google Drive.',
        deletedFolders: deletedCount,
        assistantName: agentNameToDelete
      });
    }

    // ── ACTION: Delete Single File ──
    if (action === 'delete_file' || (action === 'delete' && payload.fileId)) {
      var fileIdToDelete = payload.fileId || payload.driveFileId || '';
      if (!fileIdToDelete) {
        return respondJson({ status: 'error', success: false, message: 'fileId is required for deletion.' });
      }
      try {
        var targetFile = DriveApp.getFileById(fileIdToDelete);
        targetFile.setTrashed(true);
        return respondJson({
          status: 'success',
          success: true,
          message: 'File deleted from Google Drive.',
          fileId: fileIdToDelete
        });
      } catch (fErr) {
        return respondJson({
          status: 'success',
          success: true,
          message: 'File not found or already deleted: ' + fErr.toString(),
          fileId: fileIdToDelete
        });
      }
    }

    // ── ACTION: Upload File ──
    var fileName = payload.fileName || payload.filename || ('file_' + new Date().getTime() + '.txt');
    var rawContent = payload.content !== undefined ? payload.content : (payload.data !== undefined ? payload.data : '');
    var assistantName = sanitizeName(payload.assistantName || 'Shared Workspace');
    var tier = (payload.tier || 'database').toString().toLowerCase();
    var tierLabel = getTierLabel(tier);

    // 1. Locate or create root folder: "Echo_AI_Agent_Files"
    var rootFolders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
    var rootFolder = rootFolders.hasNext() ? rootFolders.next() : DriveApp.createFolder(ROOT_FOLDER_NAME);

    // 2. Locate or create assistant subfolder: "Echo_AI_Agent_Files / <Assistant Name>"
    var agentFolder = getOrCreateSubFolder(rootFolder, assistantName);

    // 3. Locate or create tier subfolder: "Echo_AI_Agent_Files / <Assistant Name> / <Frontend|Backend|Database>"
    var tierFolder = getOrCreateSubFolder(agentFolder, tierLabel);

    // 4. Check if file with same name exists and replace/update it cleanly
    var existingFiles = tierFolder.getFilesByName(fileName);
    while (existingFiles.hasNext()) {
      var oldFile = existingFiles.next();
      try {
        oldFile.setTrashed(true);
      } catch (trashErr) {}
    }

    // 5. Create new file with formatted content
    var contentString = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent, null, 2);
    var mimeType = resolveMimeType(fileName, payload.mimeType);
    var newFile = tierFolder.createFile(fileName, contentString, mimeType);

    var folderPath = ROOT_FOLDER_NAME + ' / ' + assistantName + ' / ' + tierLabel;

    return respondJson({
      status: 'success',
      success: true,
      message: 'File uploaded successfully to Google Drive.',
      fileId: newFile.getId(),
      fileName: fileName,
      tier: tierLabel,
      assistantName: assistantName,
      folderName: tierLabel,
      folderPath: folderPath,
      webViewLink: newFile.getUrl(),
      downloadUrl: newFile.getDownloadUrl ? newFile.getDownloadUrl() : newFile.getUrl(),
      size: newFile.getSize(),
      lastUpdated: new Date().toISOString()
    });

  } catch (err) {
    return respondJson({
      status: 'error',
      success: false,
      message: err.toString()
    });
  }
}

/**
 * Helper to locate or create a subfolder inside a parent folder
 */
function getOrCreateSubFolder(parentFolder, name) {
  var subFolders = parentFolder.getFoldersByName(name);
  if (subFolders.hasNext()) {
    return subFolders.next();
  }
  return parentFolder.createFolder(name);
}

/**
 * Maps tier string to standard folder name
 */
function getTierLabel(tier) {
  if (tier === 'frontend') return 'Frontend';
  if (tier === 'backend') return 'Backend';
  return 'Database';
}

/**
 * Sanitizes names to avoid invalid folder characters
 */
function sanitizeName(name) {
  return String(name).replace(/[\/\\:*?"<>|]/g, '-').trim() || 'Shared Workspace';
}

/**
 * Determines MIME type from file extension
 */
function resolveMimeType(fileName, explicitMime) {
  if (explicitMime && explicitMime !== 'application/octet-stream') {
    return explicitMime;
  }
  var lower = String(fileName).toLowerCase();
  if (lower.endsWith('.json')) return MimeType.PLAIN_TEXT;
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.ts') || lower.endsWith('.tsx')) return MimeType.PLAIN_TEXT;
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return MimeType.HTML;
  if (lower.endsWith('.css')) return MimeType.CSS;
  if (lower.endsWith('.csv')) return MimeType.CSV;
  if (lower.endsWith('.pdf')) return MimeType.PDF;
  return MimeType.PLAIN_TEXT;
}

/**
 * Output JSON response with CORS headers
 */
function respondJson(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Reads database files in Google Drive folder and returns structured records
 */
function handleDatabaseQuery(params) {
  try {
    var assistantName = sanitizeName(params.assistantName || '');
    var query = (params.q || params.query || '').toString().toLowerCase().trim();
    var records = [];

    var rootFolders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
    if (!rootFolders.hasNext()) {
      return respondJson({ status: 'success', success: true, records: [], count: 0, message: 'No root folder found.' });
    }
    var rootFolder = rootFolders.next();

    var targetFolders = [];
    if (assistantName) {
      var agentFolders = rootFolder.getFoldersByName(assistantName);
      if (agentFolders.hasNext()) {
        var agentFolder = agentFolders.next();
        var dbFolders = agentFolder.getFoldersByName('Database');
        if (dbFolders.hasNext()) targetFolders.push(dbFolders.next());
      }
    }

    if (targetFolders.length === 0) {
      // Search all Database subfolders
      var allAgentFolders = rootFolder.getFolders();
      while (allAgentFolders.hasNext()) {
        var aFolder = allAgentFolders.next();
        var dbF = aFolder.getFoldersByName('Database');
        while (dbF.hasNext()) targetFolders.push(dbF.next());
      }
    }

    for (var fIdx = 0; fIdx < targetFolders.length; fIdx++) {
      var folder = targetFolders[fIdx];
      var files = folder.getFiles();
      while (files.hasNext()) {
        var file = files.next();
        var fName = file.getName().toLowerCase();
        if (fName.endsWith('.json')) {
          try {
            var content = file.getBlob().getDataAsString();
            var parsed = JSON.parse(content);
            var items = Array.isArray(parsed) ? parsed : (parsed.liveInventory || parsed.inventory || parsed.products || parsed.items || []);
            if (Array.isArray(items)) {
              for (var i = 0; i < items.length; i++) {
                var it = items[i];
                if (it && typeof it === 'object') {
                  var itName = it.name || it.product || it.title || '';
                  if (itName && (!query || itName.toLowerCase().indexOf(query) !== -1 || (it.category && it.category.toLowerCase().indexOf(query) !== -1))) {
                    records.push(it);
                  }
                }
              }
            } else if (typeof items === 'object') {
              for (var k in items) {
                var val = items[k];
                if (val && typeof val === 'object') {
                  var itName = val.name || k;
                  if (!query || itName.toLowerCase().indexOf(query) !== -1) {
                    records.push({ name: itName, ...val });
                  }
                }
              }
            }
          } catch (e) {}
        } else if (fName.endsWith('.csv')) {
          try {
            var csvStr = file.getBlob().getDataAsString();
            var lines = csvStr.split('\n');
            if (lines.length > 1) {
              var headers = lines[0].split(',').map(function(h) { return h.trim().toLowerCase(); });
              var nameIdx = headers.indexOf('name') !== -1 ? headers.indexOf('name') : 0;
              var priceIdx = headers.indexOf('price');
              var stockIdx = headers.indexOf('stock');
              for (var l = 1; l < lines.length; l++) {
                var row = lines[l].split(',').map(function(c) { return c.trim(); });
                if (row.length > 1 && row[nameIdx]) {
                  var rName = row[nameIdx];
                  if (!query || rName.toLowerCase().indexOf(query) !== -1) {
                    records.push({
                      name: rName,
                      price: priceIdx !== -1 ? row[priceIdx] : '',
                      stock: stockIdx !== -1 ? parseInt(row[stockIdx], 10) : null
                    });
                  }
                }
              }
            }
          } catch (e) {}
        }
      }
    }

    return respondJson({
      status: 'success',
      success: true,
      records: records,
      count: records.length,
      query: query
    });
  } catch (err) {
    return respondJson({
      status: 'error',
      success: false,
      message: err.toString()
    });
  }
}
