import React, { useState, useEffect } from 'react';
import {
  Upload,
  Trash2,
  Eye,
  Sparkles,
  Bot,
  Database,
  Globe,
  Server,
  FileCode,
  Search,
  HardDrive,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  CloudUpload,
  Settings,
  AlertCircle,
  FolderOpen,
  Layers,
  ChevronRight,
  Plus
} from 'lucide-react';
import { extractKnowledgeFromJson, parseJsonFile } from '../utils/aiKnowledgeExtractor';
import { detectFileType, analyzeDatabaseFile } from '../utils/codebaseAnalyzer';
import { extractDatabaseCredentials, fetchExternalDatabaseRecords } from '../utils/databaseKeyExtractor';
import { isZipFile, expandFileList } from '../utils/zipHandler';
import {
  saveFileToLocalStore,
  saveFilesBatchToLocalStore,
  getFileFromLocalStore,
  deleteFileFromLocalStore
} from '../utils/localFileStore';
import {
  getDriveConnectionStatus,
  connectGoogleDrive,
  disconnectDrive,
  uploadFileToDrive,
  syncAgentFilesToDriveInBackground,
  listAssistantDriveFiles,
  fetchDriveFileContent,
  deleteDriveFile,
  isDriveConnected,
  initDeveloperDriveSync,
  checkDriveWebhookCapabilities,
  cleanupOrphanedDriveFolders
} from '../services/googleDriveService';
import GoogleDriveSetupModal from './GoogleDriveSetupModal';

const TEXT_EXT_REGEX = /\.(html?|css|scss|sass|less|jsx?|tsx?|mjs|cjs|vue|svelte|json|sql|csv|tsv|txt|md|markdown|xml|ya?ml|py|go|java|php|rb|rs|prisma|env|sh|bat|ini|toml|graphql|gql|log)$/i;

function isTextFile(file) {
  if (!file) return true;
  if (file.type && (file.type.startsWith('text/') || file.type === 'application/json' || file.type === 'application/javascript' || file.type === 'application/xml')) {
    return true;
  }
  return TEXT_EXT_REGEX.test(file.name || '');
}

function readFileAsTextSafe(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = typeof e.target.result === 'string' ? e.target.result.replace(/\0/g, ' ') : '';
      resolve(text);
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

export default function LiveFilesView({
  currentAssistant,
  assistantsList = [],
  onSelectAssistant,
  onUpdateAssistantFiles,
  onTrainAssistantFromFile,
  onSendFilesToComposer,
  onOpenGoogleDriveSetup
}) {

  // View Mode: 'focused' (focus on current selected assistant) vs 'all' (show all assistants stacked)
  const [viewMode, setViewMode] = useState('focused'); // 'focused' | 'all'
  const [selectedAssistantTabId, setSelectedAssistantTabId] = useState(
    currentAssistant?.id || (assistantsList[0]?.id || 'workspace')
  );

  useEffect(() => {
    if (currentAssistant?.id) {
      setSelectedAssistantTabId(currentAssistant.id);
    }
  }, [currentAssistant?.id]);

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('all'); // 'all' | 'frontend' | 'backend' | 'database'
  const [previewFile, setPreviewFile] = useState(null);
  const [previewContent, setPreviewContent] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [driveStatus, setDriveStatus] = useState(() => getDriveConnectionStatus());
  const [driveNotice, setDriveNotice] = useState(null);
  const [webhookCaps, setWebhookCaps] = useState(null);
  const [isCleaningOrphans, setIsCleaningOrphans] = useState(false);

  useEffect(() => {
    const initial = getDriveConnectionStatus();
    setDriveStatus(initial);
    if (initial.connected) {
      checkDriveWebhookCapabilities().then(setWebhookCaps).catch(() => {});
    }
    const unsub = initDeveloperDriveSync((status) => {
      setDriveStatus(status);
      if (status?.connected) {
        checkDriveWebhookCapabilities().then(setWebhookCaps).catch(() => {});
      }
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const showNotice = (type, text) => {
    setDriveNotice({ type, text });
    setTimeout(() => setDriveNotice(null), 5000);
  };

  const handleCleanupOrphanedDriveFiles = async () => {
    if (isCleaningOrphans) return;
    setIsCleaningOrphans(true);
    try {
      const activeNames = (assistantsList || []).flatMap(a => [a?.name, a?.id].filter(Boolean));
      const res = await cleanupOrphanedDriveFolders(activeNames);
      if (res?.webhookNeedsUpdate) {
        setWebhookCaps(prev => ({ ...(prev || {}), needsUpdate: true, supportsDelete: false }));
        showNotice('warning', 'Update your deployed Google Apps Script in Drive Setup first to enable deleting leftover Drive folders.');
        if (onOpenGoogleDriveSetup) onOpenGoogleDriveSetup();
        else setIsSetupModalOpen(true);
      } else if (res?.deletedFolders > 0 || res?.deletedFiles > 0) {
        showNotice('success', `Cleaned up ${res.deletedFolders} deleted assistant folder(s) from Google Drive${res.removedNames?.length ? ` (${res.removedNames.join(', ')})` : ''}.`);
      } else {
        showNotice('success', 'Google Drive is already clean — no leftover folders from deleted assistants found.');
      }
    } catch (err) {
      showNotice('error', `Drive cleanup failed: ${err.message || String(err)}`);
    } finally {
      setIsCleaningOrphans(false);
    }
  };

  const handleConnectDriveClick = async () => {
    try {
      const next = await connectGoogleDrive();
      setDriveStatus(next);
      showNotice('success', `Google Drive connected${next.email ? ` (${next.email})` : ''}!`);
    } catch (err) {
      if (err.code === 'DRIVE_CLIENT_ID_MISSING') {
        if (onOpenGoogleDriveSetup) onOpenGoogleDriveSetup();
        else setIsSetupModalOpen(true);
      } else {
        showNotice('error', err.message || 'Google Drive authorization failed.');
      }
    }
  };

  const handleDisconnectDrive = () => {
    disconnectDrive();
    setDriveStatus(getDriveConnectionStatus());
    showNotice('info', 'Google Drive disconnected. Uploads will remain in local cache.');
  };

  // Helper: Retrieve the list of files uploaded strictly for a given assistant (no shared bleed)
  const getAssistantFiles = (ast) => {
    if (!ast) return [];
    return Array.isArray(ast.uploadedFiles) ? ast.uploadedFiles : [];
  };

  // Upload files specifically targeting an assistant
  const handleFileUploadForAssistant = async (e, targetAssistant) => {
    const rawFileList = Array.from(e.target.files || []);
    if (!rawFileList.length) return;

    setIsUploading(true);
    const driveReady = isDriveConnected();
    const targetName = targetAssistant?.name || targetAssistant?.id || 'Shared Workspace';
    const targetId = targetAssistant?.id || targetName;
    const currentFiles = getAssistantFiles(targetAssistant);
    const newRecords = [];
    const newExtractedKb = [];
    let detectedDbConfig = null;
    let detectedDbProvider = null;
    let newDbRecords = [];

    const hasZip = rawFileList.some(isZipFile);
    if (hasZip) {
      showNotice('info', 'Unpacking .zip archive and extracting database & project files...');
    }

    let fileList = rawFileList;
    try {
      fileList = await expandFileList(rawFileList);
    } catch (zipErr) {
      console.warn('Failed to expand archive:', zipErr);
      showNotice('error', 'Failed to unpack .zip archive: ' + zipErr.message);
    }

    const uploadedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Read & analyze all files concurrently via Promise.all
    const preparedItems = (await Promise.all(fileList.map(async (file, idx) => {
      try {
        const isText = file.textContent !== undefined
          ? !file.textContent.startsWith('[Binary File:')
          : isTextFile(file);

        let content = file.textContent !== undefined ? file.textContent : '';

        if (content === '' && isText) {
          try {
            content = await readFileAsTextSafe(file);
          } catch (err) {
            content = `[Text read failed: ${err.message}]`;
          }
        } else if (!isText && !content) {
          content = `[Binary file: ${file.name}, type: ${file.type || 'unknown'}, size: ${(file.size / 1024).toFixed(1)} KB]`;
        }

        const tier = detectFileType(file.name, isText ? content : '');
        const fileId = `f_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`;

        let itemsCount = 0;
        const fileKb = [];
        const fileDbRecs = [];
        let fileDbCreds = null;

        if (isText && (file.name.endsWith('.json') || file.type === 'application/json')) {
          const parsed = parseJsonFile(content);
          if (parsed.success) {
            const extracted = extractKnowledgeFromJson(parsed.data, targetName, 'Website');
            itemsCount = extracted?.itemsExtracted || 0;
            if (extracted?.knowledgeBase && extracted.knowledgeBase.length > 0) {
              fileKb.push(...extracted.knowledgeBase);
            }
          }
        } else if (tier === 'database' && isText) {
          const dbAnalysis = analyzeDatabaseFile(file.name, content);
          itemsCount = dbAnalysis?.knowledgeBase?.length || 0;
          if (dbAnalysis?.knowledgeBase && dbAnalysis.knowledgeBase.length > 0) {
            fileKb.push(...dbAnalysis.knowledgeBase);
          }
          if (dbAnalysis?.databaseRecords && dbAnalysis.databaseRecords.length > 0) {
            fileDbRecs.push(...dbAnalysis.databaseRecords);
          }
        }

        if (isText) {
          const dbCreds = extractDatabaseCredentials(file.name, content);
          if (dbCreds.detected && dbCreds.config) {
            fileDbCreds = dbCreds;
          }
        }

        return {
          fileId,
          file,
          isText,
          content,
          tier,
          itemsCount,
          fileKb,
          fileDbRecs,
          fileDbCreds
        };
      } catch (err) {
        console.error('Error processing file upload:', file.name, err);
        return null;
      }
    }))).filter(Boolean);

    // 2. Persist ALL files locally in ONE single batched IndexedDB transaction (< 30ms)
    await saveFilesBatchToLocalStore(
      preparedItems.map((it) => ({
        id: it.fileId,
        name: it.file.name,
        relativePath: it.file.relativePath || it.file.name,
        mimeType: it.file.type || (it.isText ? 'text/plain' : 'application/octet-stream'),
        type: it.tier,
        content: it.content,
        blob: it.file,
        assistantName: targetName
      }))
    );

    const driveSyncQueue = [];
    for (const it of preparedItems) {
      if (it.fileKb.length > 0) newExtractedKb.push(...it.fileKb);
      if (it.fileDbRecs.length > 0) newDbRecords.push(...it.fileDbRecs);
      if (it.fileDbCreds) {
        detectedDbConfig = it.fileDbCreds.config;
        detectedDbProvider = it.fileDbCreds.providerName;
      }

      const driveMeta = {
        storageStatus: driveReady ? 'syncing' : 'local_cached',
        driveFolderPath: `Echo AI Agents / ${targetName} / ${it.tier === 'frontend' ? 'Frontend' : it.tier === 'backend' ? 'Backend' : 'Database'}`
      };

      newRecords.push({
        id: it.fileId,
        name: it.file.name,
        relativePath: it.file.relativePath || it.file.name,
        size: `${(it.file.size / 1024).toFixed(1)} KB`,
        sizeBytes: it.file.size,
        mimeType: it.file.type || (it.isText ? 'text/plain' : 'application/octet-stream'),
        type: it.tier,
        categoryLabel: it.tier === 'frontend' ? 'Frontend (UI/Pages)' : it.tier === 'backend' ? 'Backend (APIs/Routes)' : 'Database (Records/Catalog)',
        uploadedAt: uploadedTime,
        itemsCount: it.itemsCount,
        isBinary: !it.isText,
        contentPreview: it.isText ? it.content.slice(0, 1500) : '',
        ...driveMeta
      });

      driveSyncQueue.push({
        id: it.fileId,
        name: it.file.name,
        mimeType: it.file.type || (it.isText ? 'text/plain' : 'application/octet-stream'),
        type: it.tier,
        content: it.content,
        rawFile: it.file
      });
    }

    if (hasZip) {
      showNotice('success', `Unpacked & indexed ${newRecords.length} files from archive into Knowledge Base!`);
    }

    // If database credentials were discovered, probe live database concurrently (~0.5-2.5s max)
    if (detectedDbConfig) {
      try {
        const liveResult = await fetchExternalDatabaseRecords(detectedDbConfig);
        if (liveResult && liveResult.success && liveResult.records.length > 0) {
          newDbRecords.push(...liveResult.records);
          if (liveResult.knowledgeBase && liveResult.knowledgeBase.length > 0) {
            newExtractedKb.push(...liveResult.knowledgeBase);
          }
          showNotice('success', `🔥 Live Database Connected: ${detectedDbProvider} (${liveResult.records.length} records fetched from ${liveResult.source})!`);
        } else {
          showNotice('info', `🔥 Live Database Configured: ${detectedDbProvider} (Direct real-time access enabled)`);
        }
      } catch (liveErr) {
        console.warn('Live DB probe error:', liveErr);
      }
    }

    const updatedFileList = [...newRecords, ...currentFiles];

    if (targetAssistant && onUpdateAssistantFiles) {
      let updatedKb = null;
      if (newExtractedKb.length > 0) {
        const existingKb = Array.isArray(targetAssistant.knowledgeBase) ? targetAssistant.knowledgeBase : [];
        updatedKb = [...existingKb, ...newExtractedKb];
      }
      let updatedDbRecords = null;
      if (newDbRecords.length > 0) {
        const existingRecords = Array.isArray(targetAssistant.databaseRecords) ? targetAssistant.databaseRecords : [];
        const seen = new Set(existingRecords.map(r => r.name.toLowerCase()));
        updatedDbRecords = [...existingRecords];
        for (const rec of newDbRecords) {
          if (!seen.has(rec.name.toLowerCase())) {
            seen.add(rec.name.toLowerCase());
            updatedDbRecords.push(rec);
          }
        }
      }
      await onUpdateAssistantFiles(targetId, updatedFileList, updatedKb, updatedDbRecords, detectedDbConfig);
    }

    setIsUploading(false);
    if (e.target) e.target.value = '';

    // 3. Kick off concurrent background Google Drive sync (non-blocking)
    if (driveReady && driveSyncQueue.length > 0) {
      syncAgentFilesToDriveInBackground({
        agentId: targetName,
        files: driveSyncQueue,
        onComplete: (results) => {
          const syncedCount = (results || []).filter(r => r?.ok).length;
          if (syncedCount > 0) {
            showNotice('success', `Synced ${syncedCount}/${driveSyncQueue.length} file(s) to Google Drive for "${targetName}"!`);
          }
        }
      });
    }

    const kbCountMsg = newExtractedKb.length > 0 ? ` and indexed ${newExtractedKb.length} Q&A facts` : '';
    const driveHint = driveReady ? ' (syncing to Google Drive in background...)' : '';
    showNotice('success', `Saved ${newRecords.length} file(s) inside "${targetName}"${kbCountMsg}${driveHint}`);
  };

  // Delete file from a specific assistant
  const handleDeleteFileForAssistant = async (fileObj, targetAssistant) => {
    const currentFiles = getAssistantFiles(targetAssistant);
    const remainingFiles = currentFiles.filter((f) => f.id !== fileObj.id);

    if (targetAssistant && onUpdateAssistantFiles) {
      onUpdateAssistantFiles(targetAssistant.id, remainingFiles);
    }

    if (previewFile && previewFile.id === fileObj.id) setPreviewFile(null);
    await deleteFileFromLocalStore(fileObj.id);
    if ((fileObj.driveFileId || fileObj.name) && isDriveConnected()) {
      await deleteDriveFile(fileObj.driveFileId || `name_${fileObj.name}`, {
        fileName: fileObj.name,
        assistantName: targetAssistant?.name || ''
      });
    }
    showNotice('info', `Removed "${fileObj.name}" from ${targetAssistant?.name || 'workspace'}.`);
  };

  const hydrateFilesWithContent = async (fileList) => {
    const hydrated = [];
    for (const f of fileList) {
      let fullContent = f.content || '';
      if (!fullContent) {
        const localRec = await getFileFromLocalStore(f.id);
        if (localRec?.content) fullContent = localRec.content;
      }
      if (!fullContent && f.driveFileId && isDriveConnected() && !f.isBinary) {
        try {
          fullContent = await fetchDriveFileContent(f.driveFileId);
        } catch (e) {}
      }
      if (!fullContent) fullContent = f.contentPreview || '';
      hydrated.push({ ...f, content: fullContent });
    }
    return hydrated;
  };

  const handleOpenPreview = async (fileObj) => {
    setPreviewFile(fileObj);
    setPreviewContent('');
    setIsLoadingPreview(true);
    try {
      const [hydrated] = await hydrateFilesWithContent([fileObj]);
      setPreviewContent(hydrated.content || '[No preview text available. Open in Google Drive to inspect.]');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleSendToComposer = async (selected) => {
    if (!onSendFilesToComposer) return;
    const hydrated = await hydrateFilesWithContent(selected);
    onSendFilesToComposer(hydrated);
  };

  // Determine active assistant in focused mode
  const activeAssistant = assistantsList.find(a => a.id === selectedAssistantTabId || a.name === selectedAssistantTabId)
    || currentAssistant
    || assistantsList[0]
    || null;

  // Render an individual Assistant Card containing its uploaded files
  const renderAssistantFileSection = (ast, isSolo = false) => {
    const astName = ast?.name || ast?.id || 'Shared Workspace';
    const astFiles = getAssistantFiles(ast);

    const counts = {
      all: astFiles.length,
      frontend: astFiles.filter((f) => f.type === 'frontend').length,
      backend: astFiles.filter((f) => f.type === 'backend').length,
      database: astFiles.filter((f) => f.type === 'database').length
    };

    const filteredFiles = astFiles.filter((f) => {
      const matchesTier = tierFilter === 'all' || f.type === tierFilter;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (f.name || '').toLowerCase().includes(q) ||
        (f.categoryLabel || '').toLowerCase().includes(q) ||
        (f.type || '').toLowerCase().includes(q);
      return matchesTier && matchesSearch;
    });

    const isCurrentActive = currentAssistant && (currentAssistant.id === ast?.id || currentAssistant.name === ast?.name);

    return (
      <div
        key={ast?.id || 'workspace'}
        className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-all duration-200 ${
          isCurrentActive ? 'border-indigo-300 ring-2 ring-indigo-500/10' : 'border-slate-200'
        } ${isSolo ? '' : 'mb-6'}`}
      >
        {/* Assistant Header Card */}
        <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <Bot size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-slate-900 tracking-tight truncate">
                  {astName}
                </h3>
                {isCurrentActive && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                    Active Assistant
                  </span>
                )}
                <span className="text-[11px] font-semibold text-slate-500">
                  • {ast?.role || 'Voice Help Desk'}
                </span>
              </div>

              {/* Persona Metadata Badges */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-medium flex items-center gap-1">
                  🎙️ Voice: <strong>{ast?.voice || 'Clara'}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-medium flex items-center gap-1">
                  ⚡ Model: <strong>{ast?.model || 'Groq Llama 3.3 70B Versatile'}</strong>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-medium flex items-center gap-1">
                  🧠 <strong>{ast?.knowledgeBase?.length || 0}</strong> Facts Indexed
                </span>
                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-medium flex items-center gap-1">
                  📁 <strong>{astFiles.length}</strong> Files Stored
                </span>
                {ast?.databaseConfig && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300 text-[11px] font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                    🔥 Live DB: {ast.databaseConfig.type === 'firebase' ? 'Firebase' : 'Supabase'} ({ast.databaseConfig.projectId || 'Connected'})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons for this Specific Assistant */}
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <label className="h-8 px-3.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm shadow-indigo-500/20 active:scale-95 transition-all">
              {isUploading ? <RefreshCw size={13} className="animate-spin" /> : <Upload size={13} />}
              <span>+ Upload Files to "{astName}"</span>
              <input
                type="file"
                multiple
                accept="*"
                onChange={(e) => handleFileUploadForAssistant(e, ast)}
                disabled={isUploading}
                className="hidden"
              />
            </label>

            {astFiles.length > 0 && onSendFilesToComposer && (
              <button
                type="button"
                onClick={() => handleSendToComposer(astFiles)}
                className="h-8 px-3 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                title={`Synthesize or re-compose "${astName}" using these files in Composer`}
              >
                <Sparkles size={13} className="text-indigo-600" />
                <span>Composer</span>
              </button>
            )}
          </div>
        </div>

        {/* Inside the Assistant: "Files Uploaded to Make This Assistant" */}
        <div className="p-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <FolderOpen size={15} className="text-indigo-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Files Uploaded to Make "{astName}"
              </span>
              <span className="px-2 py-0.2 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold">
                {astFiles.length}
              </span>
            </div>

            {/* In-Card Tier Filter Pills */}
            <div className="flex items-center gap-1.5 text-xs flex-wrap">
              {[
                { id: 'all', label: `All (${counts.all})` },
                { id: 'database', label: `Database/JSON (${counts.database})` },
                { id: 'frontend', label: `Frontend (${counts.frontend})` },
                { id: 'backend', label: `Backend (${counts.backend})` }
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setTierFilter(tab.id)}
                  className={`h-6 px-2.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                    tierFilter === tab.id
                      ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Files List / Grid for this Assistant */}
          {filteredFiles.length === 0 ? (
            <div className="py-10 px-6 border-2 border-dashed border-slate-200 bg-slate-50/50 rounded-xl text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto">
                <FileCode size={22} />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-800">
                  {astFiles.length === 0
                    ? `No Files Uploaded for "${astName}" Yet`
                    : 'No files match your search filter'}
                </h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                  Upload database exports (.json, .sql, .csv), full-stack .zip project archives, frontend HTML/JSX pages, or backend API routes used to create and ground <strong>"{astName}"</strong>.
                </p>
              </div>

              <div className="pt-2 flex items-center justify-center gap-2.5 flex-wrap">
                <label className="h-8 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 transition-all">
                  <Upload size={13} />
                  <span>Upload Files to "{astName}"</span>
                  <input
                    type="file"
                    multiple
                    accept="*"
                    onChange={(e) => handleFileUploadForAssistant(e, ast)}
                    disabled={isUploading}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredFiles.map((f) => {
                const isFrontend = f.type === 'frontend';
                const isBackend = f.type === 'backend';
                const isDatabase = f.type === 'database';
                const isSyncedToDrive = f.storageStatus === 'synced' && Boolean(f.driveFileId);

                const tierStyles = isFrontend
                  ? {
                      iconBg: 'bg-indigo-50 border-indigo-200 text-indigo-600',
                      badge: 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    }
                  : isBackend
                  ? {
                      iconBg: 'bg-emerald-50 border-emerald-200 text-emerald-600',
                      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }
                  : {
                      iconBg: 'bg-sky-50 border-sky-200 text-sky-600',
                      badge: 'bg-sky-50 text-sky-700 border-sky-200'
                    };

                return (
                  <div
                    key={f.id}
                    className="p-3.5 rounded-xl bg-white border border-slate-200/90 hover:border-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all shadow-2xs group"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${tierStyles.iconBg}`}>
                        {isFrontend ? <Globe size={16} /> : isBackend ? <Server size={16} /> : <Database size={16} />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {f.name}
                          </span>
                          <span className={`text-[10px] px-2 py-0.2 rounded-full border font-mono font-semibold ${tierStyles.badge}`}>
                            {f.categoryLabel || f.type}
                          </span>
                          {f.itemsCount > 0 && (
                            <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold flex items-center gap-1">
                              <CheckCircle2 size={10} />
                              {f.itemsCount} Facts Extracted
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                          <span>{f.size}</span>
                          <span>•</span>
                          <span>Uploaded {f.uploadedAt || 'recently'}</span>
                          {isSyncedToDrive ? (
                            <>
                              <span>•</span>
                              <span className="text-emerald-700 flex items-center gap-1 font-medium">
                                <HardDrive size={10} /> Stored in Drive
                              </span>
                            </>
                          ) : f.storageStatus === 'syncing' ? (
                            <>
                              <span>•</span>
                              <span className="text-indigo-600 flex items-center gap-1 font-medium animate-pulse">
                                <HardDrive size={10} /> Syncing to Drive…
                              </span>
                            </>
                          ) : (
                            <>
                              <span>•</span>
                              <span className="text-amber-700 font-medium">Local Cache</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto flex-wrap">
                      {onTrainAssistantFromFile && (f.name.endsWith('.json') || isDatabase) && (
                        <button
                          type="button"
                          onClick={() => onTrainAssistantFromFile(f, ast)}
                          className="h-7 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-xs font-semibold text-emerald-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          title={`Index Q&A facts from this file into "${astName}"`}
                        >
                          <Database size={12} className="text-emerald-600" />
                          <span>Index to "{astName}"</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleOpenPreview(f)}
                        className="h-7 px-2.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-xs font-medium text-slate-700 flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      >
                        <Eye size={12} className="text-slate-500" />
                        <span>Preview</span>
                      </button>

                      {onSendFilesToComposer && (
                        <button
                          type="button"
                          onClick={() => handleSendToComposer([f])}
                          className="h-7 px-2.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                          title="Attach this file to Composer"
                        >
                          <Sparkles size={11} className="text-indigo-600" />
                          <span>Composer</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteFileForAssistant(f, ast)}
                        className="h-7 w-7 rounded-lg bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-300 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                        title={`Remove file from "${astName}"`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#F8FAFC]">
      {/* Top Main Navigation Header */}
      <div className="min-h-[58px] px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white shrink-0 shadow-2xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <HardDrive size={16} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 leading-tight">
              Knowledge Base &amp; Codebase Files
            </h2>
            <p className="text-[11px] text-slate-500">
              Files uploaded to make and train your AI voice assistants.
            </p>
          </div>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setViewMode('focused')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === 'focused' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Focus Assistant
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                viewMode === 'all' ? 'bg-white text-indigo-700 shadow-2xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              View All Assistants ({assistantsList.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onOpenGoogleDriveSetup) onOpenGoogleDriveSetup();
              else setIsSetupModalOpen(true);
            }}
            className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 text-xs font-medium flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Google Drive Storage Settings"
          >
            <Settings size={12} className="text-slate-500" />
            <span>Drive Setup</span>
          </button>
        </div>
      </div>

      {/* Google Drive Status Bar */}
      <div className="px-6 py-2.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 text-xs">
          <span className={`w-2.5 h-2.5 rounded-full ${driveStatus.connected ? 'bg-emerald-500' : 'bg-amber-400'}`} />
          <span className="font-semibold text-slate-800">
            {driveStatus.connected ? `Developer Google Drive Connected (${driveStatus.email || 'Ready'})` : 'Developer Google Drive Disconnected'}
          </span>
          <span className="text-slate-400">•</span>
          <span className="text-[11px] text-slate-500">
            {driveStatus.connected
              ? 'Central storage active — all uploaded files across all users are automatically stored in the developer\'s Google Drive.'
              : 'Files stored locally in browser cache. Developer can connect Google Drive once to back up all user files.'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {driveStatus.connected && (
            <button
              type="button"
              onClick={handleCleanupOrphanedDriveFiles}
              disabled={isCleaningOrphans}
              className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-800 hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
              title="Remove leftover Google Drive folders belonging to previously deleted assistants"
            >
              {isCleaningOrphans ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={11} />}
              <span>{isCleaningOrphans ? 'Cleaning Drive...' : 'Clean Up Deleted Agents in Drive'}</span>
            </button>
          )}
          {driveStatus.connected ? (
            <button
              type="button"
              onClick={handleDisconnectDrive}
              className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline cursor-pointer"
            >
              Disconnect Drive
            </button>
          ) : (
            <button
              type="button"
              onClick={handleConnectDriveClick}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 hover:underline cursor-pointer flex items-center gap-1"
            >
              <HardDrive size={11} /> Connect Developer Drive
            </button>
          )}
        </div>
      </div>

      {driveStatus.connected && webhookCaps?.needsUpdate && (
        <div className="px-6 py-2.5 border-b border-amber-200 bg-amber-50 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle size={15} className="text-amber-600 shrink-0" />
            <span>
              <strong>Google Drive Auto-Delete Needs Script Update:</strong> Your deployed Apps Script is an older upload-only version, so deleted assistants&apos; files stay in Drive until you re-deploy the updated script.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onOpenGoogleDriveSetup) onOpenGoogleDriveSetup();
              else setIsSetupModalOpen(true);
            }}
            className="h-7 px-3 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer shrink-0 transition-colors"
          >
            Update Drive Script
          </button>
        </div>
      )}

      {/* Inline Notice Toast */}
      {driveNotice && (
        <div
          className={`mx-6 mt-3 px-4 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 shrink-0 ${
            driveNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
              : driveNotice.type === 'error'
              ? 'bg-rose-50 border-rose-300 text-rose-800'
              : 'bg-sky-50 border-sky-300 text-sky-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {driveNotice.type === 'error' ? <AlertCircle size={14} className="text-rose-600" /> : <CheckCircle2 size={14} className="text-emerald-600" />}
            <span className="font-medium">{driveNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setDriveNotice(null)}
            className="text-[11px] opacity-70 hover:opacity-100 font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Assistant Selection Ribbon (in Focused Mode) */}
      {viewMode === 'focused' && assistantsList.length > 0 && (
        <div className="px-6 py-2.5 border-b border-slate-200 bg-white flex items-center justify-between gap-3 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-2 flex-nowrap">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap mr-1">
              Select Assistant:
            </span>
            {assistantsList.map((ast) => {
              const isSelected = (activeAssistant?.id === ast.id || activeAssistant?.name === ast.name);
              const astFiles = getAssistantFiles(ast);
              return (
                <button
                  key={ast.id}
                  type="button"
                  onClick={() => {
                    setSelectedAssistantTabId(ast.id);
                    if (onSelectAssistant) onSelectAssistant(ast.id);
                  }}
                  className={`h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shadow-2xs ${
                    isSelected
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Bot size={13} className={isSelected ? 'text-indigo-600' : 'text-slate-400'} />
                  <span>{ast.name}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isSelected ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {astFiles.length} files
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Search */}
          <div className="h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-300 focus-within:border-indigo-500 flex items-center gap-2 text-xs shrink-0 max-w-xs">
            <Search size={12} className="text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files..."
              className="w-36 bg-transparent text-slate-800 placeholder-slate-400 focus:outline-none text-xs"
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {viewMode === 'all' ? (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  All Workspace Assistants &amp; Their Uploaded Files
                </h3>
                <p className="text-xs text-slate-500">
                  Each assistant is grounded with its own dedicated uploaded files and database JSON records.
                </p>
              </div>
            </div>

            {assistantsList.length === 0 ? (
              <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center space-y-3">
                <Bot size={32} className="mx-auto text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-900">No Assistants Created Yet</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Create an assistant in the Voice Assistants builder or synthesize one in Composer.
                </p>
              </div>
            ) : (
              assistantsList.map((ast) => renderAssistantFileSection(ast, false))
            )}
          </div>
        ) : (
          <div>
            {activeAssistant ? (
              renderAssistantFileSection(activeAssistant, true)
            ) : (
              <div className="p-8 bg-white border border-slate-200 rounded-2xl text-center space-y-3">
                <Bot size={32} className="mx-auto text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-900">No Assistant Selected</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Please create or select an assistant from the top bar to inspect its uploaded files.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Preview File Modal */}
      {previewFile && (
        <div
          onClick={() => setPreviewFile(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 flex flex-col max-h-[85vh]"
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>{previewFile.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 font-mono font-semibold">
                    {previewFile.categoryLabel || previewFile.type}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {previewFile.size} • {previewFile.uploadedAt || 'Uploaded file'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
              {isLoadingPreview ? (
                <div className="h-40 flex items-center justify-center gap-2 text-xs text-slate-500">
                  <RefreshCw size={14} className="animate-spin text-indigo-600" />
                  <span>Loading file content...</span>
                </div>
              ) : (
                <pre className="text-xs text-slate-800 font-mono whitespace-pre-wrap leading-relaxed">
                  {previewContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Setup Wizard Modal */}
      <GoogleDriveSetupModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        onConnected={(status) => {
          setDriveStatus(status);
          showNotice('success', `Google Drive connected${status.email ? ` (${status.email})` : ''}!`);
        }}
      />
    </div>
  );
}
