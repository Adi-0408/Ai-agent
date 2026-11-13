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
