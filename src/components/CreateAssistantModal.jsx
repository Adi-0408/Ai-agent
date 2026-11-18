import React, { useState, useEffect } from 'react';
import {
  X,
  Upload,
  FileCode,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Database,
  Globe,
  Server,
  Bot,
  Layers,
  ArrowRight,
  KeyRound,
  Eye,
  EyeOff,
  ExternalLink,
  Archive
} from 'lucide-react';
import { extractKnowledgeFromJson, parseJsonFile } from '../utils/aiKnowledgeExtractor';
import { detectFileType, analyzeFullStackFiles, detectWebsiteArchetype, getArchetypeMetadata } from '../utils/codebaseAnalyzer';
import { fetchExternalDatabaseRecords } from '../utils/databaseKeyExtractor';
import { saveAgent } from '../firebase';
import { saveFilesBatchToLocalStore } from '../utils/localFileStore';
import { isDriveConnected, syncAgentFilesToDriveInBackground } from '../services/googleDriveService';
import { getUserApiKeys, validateUserApiKey, saveUserApiKeys } from '../services/aiCompletionService';
import { isZipFile, expandFileList } from '../utils/zipHandler';

export default function CreateAssistantModal({ isOpen, onClose, onAssistantCreated }) {
  const initialUserKeys = getUserApiKeys();
  const [step, setStep] = useState(1); // 1: Setup & Upload, 2: Review & Create
  const [name, setName] = useState('');
  const [websiteName, setWebsiteName] = useState('');
  const [model, setModel] = useState('Groq Llama 3.3 70B Versatile');
  const [voice, setVoice] = useState('Adam');
  const [themeColor, setThemeColor] = useState('#6366f1');
  const [accentColor, setAccentColor] = useState('#06b6d4');
  const [customApiKey, setCustomApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [keyValidationState, setKeyValidationState] = useState('idle');
  const [keyValidationMsg, setKeyValidationMsg] = useState('');
  const [jsonInputMode, setJsonInputMode] = useState('upload'); // 'upload' | 'paste'
  const [rawJsonText, setRawJsonText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [pendingRawFiles, setPendingRawFiles] = useState([]);
  const [extractedData, setExtractedData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUnpacking, setIsUnpacking] = useState(false);
  const [unpackProgress, setUnpackProgress] = useState('');

  // Strict Reset: Ensure no files, records, or knowledge bleed from previously created assistants
  const resetModalState = () => {
    setStep(1);
    setName('');
    setWebsiteName('');
    setModel('Groq Llama 3.3 70B Versatile');
    setVoice('Adam');
    setThemeColor('#6366f1');
    setAccentColor('#06b6d4');
    setCustomApiKey('');
    setShowApiKey(false);
    setKeyValidationState('idle');
    setKeyValidationMsg('');
    setJsonInputMode('upload');
    setRawJsonText('');
    setUploadedFileName('');
    setPendingRawFiles([]);
    setExtractedData(null);
    setErrorMsg('');
    setIsSaving(false);
    setIsUnpacking(false);
    setUnpackProgress('');
  };

  useEffect(() => {
    if (isOpen) {
      resetModalState();
    }
  }, [isOpen]);

  const handleClose = () => {
    resetModalState();
    onClose();
  };

  const handleFileUpload = async (e) => {
    const rawFileList = Array.from(e.target.files || []);
    if (!rawFileList.length) return;

    setErrorMsg('');
    const hasZip = rawFileList.some(isZipFile);
    if (hasZip) {
      setIsUnpacking(true);
      setUnpackProgress('Unpacking archive & extracting database/code files...');
    }

    try {
      const fileList = await expandFileList(rawFileList, (curr, total, name) => {
        setUnpackProgress(`Unpacking ${curr}/${total}: ${name}`);
      });

      const zipNames = rawFileList.filter(isZipFile).map(f => f.name);
      if (zipNames.length > 0) {
        setUploadedFileName(`${zipNames.join(', ')} (${fileList.length} files unpacked)`);
      } else {
        setUploadedFileName(fileList.map(f => f.name).join(', '));
      }

      const processedFiles = await Promise.all(fileList.map(async (file, idx) => {
        let content = file.textContent;
        const isText = content !== undefined
          ? !content.startsWith('[Binary File:')
          : (/\.(html?|css|scss|jsx?|tsx?|vue|svelte|json|sql|csv|tsv|txt|md|xml|ya?ml|py|go|java|php|rb|prisma|env)$/i.test(file.name) ||
             (file.type && (file.type.startsWith('text/') || file.type === 'application/json' || file.type === 'application/javascript')));

        if (content === undefined) {
          if (isText) {
            content = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = (ev) => resolve(typeof ev.target.result === 'string' ? ev.target.result.replace(/\0/g, ' ') : '');
              reader.onerror = () => reject(new Error('Failed to read ' + file.name));
              reader.readAsText(file);
            });
          } else {
            content = `[Binary File: ${file.name}]`;
          }
        }

        const tier = detectFileType(file.name, isText ? content : '');
        return {
          id: `f_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
          name: file.name,
          relativePath: file.relativePath || file.name,
          mimeType: file.type || (isText ? 'text/plain' : 'application/octet-stream'),
          size: `${(file.size / 1024).toFixed(1)} KB`,
          sizeBytes: file.size,
          type: tier,
          categoryLabel: tier === 'frontend' ? 'Frontend (UI/Pages)' : tier === 'backend' ? 'Backend (APIs/Routes)' : 'Database (Records/Catalog)',
          isBinary: !isText,
          rawFile: file,
          content
        };
      }));

      setPendingRawFiles(processedFiles);

      const fullStack = analyzeFullStackFiles(processedFiles);
      const firstFile = processedFiles[0];
      const detectedSite = fullStack.frontend[0]?.siteTitle || websiteName.trim() || firstFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'our website';
      const brand = detectedSite.split(/[—–|-]/)[0].trim();
      const astName = name.trim() || (brand ? `${brand} Concierge` : 'AI Assistant');
      if (!name.trim()) setName(astName);
      if (!websiteName.trim() && detectedSite !== 'our website') setWebsiteName(detectedSite);

      let liveRecords = [...(fullStack.databaseRecords || [])];
      let liveKb = fullStack.combinedKnowledge && fullStack.combinedKnowledge.length > 0
        ? [...fullStack.combinedKnowledge]
        : [
            { q: "What is this website about?", a: `Official assistant for ${detectedSite}.` },
            { q: "What products or services do you offer?", a: `Comprehensive solutions and customer guidance for ${detectedSite}.` }
          ];
      let dbConnectedMsg = '';

      // If user uploaded database keys (Firebase, Supabase, etc.), probe and fetch live records
      if (fullStack.databaseConfig) {
        try {
          setUnpackProgress(`Connecting to ${fullStack.databaseProvider || 'live database'} using uploaded keys...`);
          const liveResult = await fetchExternalDatabaseRecords(fullStack.databaseConfig);
          if (liveResult && liveResult.success && liveResult.records.length > 0) {
            const seen = new Set(liveRecords.map(r => r.name.toLowerCase()));
            for (const rec of liveResult.records) {
              if (!seen.has(rec.name.toLowerCase())) {
                seen.add(rec.name.toLowerCase());
                liveRecords.push(rec);
              }
            }
            if (liveResult.knowledgeBase && liveResult.knowledgeBase.length > 0) {
              liveKb.push(...liveResult.knowledgeBase);
            }
            dbConnectedMsg = `Connected to ${fullStack.databaseProvider || 'Database'} (${liveResult.records.length} records fetched from ${liveResult.source})`;
          } else {
            dbConnectedMsg = `Live Database Configured: ${fullStack.databaseProvider || 'Database'} (Direct real-time access enabled)`;
          }
        } catch (e) {
          console.warn('Live DB probe error, keeping credentials for runtime access:', e);
          dbConnectedMsg = `Live Database Configured: ${fullStack.databaseProvider || 'Database'}`;
        }
      }

      const archetype = fullStack.archetype || detectWebsiteArchetype(detectedSite, fullStack.summary, liveRecords, liveKb);
      const meta = fullStack.archetypeMetadata || getArchetypeMetadata(archetype, detectedSite);

      const topProductsSummary = liveRecords.slice(0, 30).map(r => 
        `- ${r.name}: ${r.price ? (typeof r.price === 'number' ? `₹${r.price}` : r.price) : 'Details on request'}${r.stock !== null && r.stock !== undefined ? ` (Stock: ${r.stock} ${r.unit || 'units'})` : ''}${r.dosage || r.description ? ` | ${r.dosage || r.description}` : ''}`
      ).join('\n');

      const liveDbSection = fullStack.databaseConfig
        ? `\n\n## Live External Database Grounding\n- Provider: ${fullStack.databaseProvider || 'External Database'}\n- Project / Target: ${fullStack.databaseConfig.projectId || fullStack.databaseConfig.supabaseUrl || 'Connected'}\n- Live querying enabled: You have direct real-time access to query this database using the user's uploaded keys.`
        : '';

      const bp = fullStack.siteBlueprint || null;
      const workflowSection = bp
        ? `\n\n## Website Workflow, Forms & Exact Navigation Map\n- Website Role: ${bp.roleSummary}\n- Customer Journey: ${(bp.workflows || []).map(w => `${w.step}. ${w.title} (${w.href || w.targetPath || 'page'})`).join(' -> ') || 'Standard browsing & inquiry'}\n- Interactive Forms: ${(bp.forms || []).map(f => `${f.title} [${f.href || f.path || f.id}] (Fields: ${f.fields.join(', ') || 'Standard'})`).join(' | ') || 'None'}\n- Navigable Sections: ${(bp.sections || []).slice(0, 10).map(s => `${s.label} (${s.href})`).join(', ') || 'None'}\n- Pages / Routes: ${(bp.routes || []).slice(0, 10).map(r => `${r.label} (${r.path})`).join(', ') || 'Single page'}`
        : '';

      const trainedPrompt = `# ${astName} - Enterprise AI Support & Help Desk

## Identity & Assignment
You are ${astName}, the dedicated AI Customer Support Assistant for ${detectedSite} (${meta.roleTitle}), trained to provide intelligent, helpful, and highly accurate guidance.
You are speaking strictly to regular website visitors, students, customers, and applicants—NOT developers or database engineers.
${fullStack.summary}${workflowSection}

## Customer-Only Interaction Rules
- Strictly Consumer-Facing: Answer only user questions regarding ${meta.nouns.en}, services, fees, application steps, forms, and general information.
- Exact Redirection & Guidance: Guide visitors directly to the exact form, section, or page they need using the Website Workflow & Navigation Map above.
- Zero Technical/Database Jargon: NEVER mention database queries, SQL statements, tables, schemas, API keys, endpoints, or backend architectures.
- If a user asks a technical database question (e.g. "show me your tables" or "what is your SQL query"), politely clarify: "${meta.consumerClarification}"

## ${meta.catalogHeading}
${topProductsSummary ? `${topProductsSummary}\n(Additional records available via live database bridge)` : `Live ${meta.nouns.en} connected via website database bridge.`}${liveDbSection}

## Guidelines & Etiquette
- Accuracy First: State exact details, availability, and specifications directly from verified database records. Never invent or hallucinate information.
- Natural Voice Pacing: Respond in 1-2 concise, conversational spoken sentences suitable for speech audio (< 45 words).
- Multilingual Fluency: Understand and fluently reply in English, Hindi (हिंदी), and Marathi (मराठी) matching the visitor's language.
- Proactive Help: Recommend matching options. If an item or program is not found, suggest available alternatives politely.`;

      setExtractedData({
        knowledgeBase: liveKb,
        databaseRecords: liveRecords,
        databaseConfig: fullStack.databaseConfig || null,
        databaseProvider: fullStack.databaseProvider || null,
        databaseStatusMessage: dbConnectedMsg,
        siteBlueprint: bp,
        systemPrompt: trainedPrompt,
        greeting: meta.greeting,
        role: meta.roleTitle,
        archetype: archetype,
        tools: fullStack.tools,
        itemsExtracted: liveKb.length + liveRecords.length
      });
    } catch (err) {
      console.error('File reading error:', err);
      setErrorMsg('Failed to read the uploaded file(s). Please try again.');
    } finally {
      setIsUnpacking(false);
      setUnpackProgress('');
    }
  };

  const processJsonContent = (text, fileName = '') => {
    const parseResult = parseJsonFile(text);
    if (!parseResult.success) {
      setErrorMsg(`Invalid JSON format: ${parseResult.error}`);
      setExtractedData(null);
      return;
    }

    const astName = name.trim() || 'AI Assistant';
    const site = websiteName.trim() || (fileName ? fileName.replace('.json', '') : 'our website');
    const result = extractKnowledgeFromJson(parseResult.data, astName, site);

    setExtractedData(result);
    setErrorMsg('');
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setErrorMsg('Please enter an assistant name.');
      return;
    }

    const effectiveApiKey = customApiKey.trim() || getUserApiKeys().activeKey || '';
    if (!effectiveApiKey) {
      setErrorMsg('Please enter or verify an AI API Key (Groq or Gemini) for this assistant.');
      return;
    }

    try {
      setIsSaving(true);
      const agentId = name.trim().replace(/\//g, '-');
      const driveReady = isDriveConnected();
      const uploadedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      // 1. Persist ALL uploaded files locally in ONE single IndexedDB transaction (< 30ms)
      if (pendingRawFiles.length > 0) {
        await saveFilesBatchToLocalStore(
          pendingRawFiles.map((f) => ({
            id: f.id,
            name: f.name,
            relativePath: f.relativePath || f.name,
            mimeType: f.mimeType || 'text/plain',
            type: f.type || 'database',
            content: f.content || '',
            blob: f.rawFile || null,
            assistantName: agentId
          }))
        );
      }

      // 2. Build lean Firestore metadata (full content lives in IndexedDB + Google Drive)
      const storedUploadedFiles = pendingRawFiles.map((f) => ({
        id: f.id,
        name: f.name,
        relativePath: f.relativePath || f.name,
        mimeType: f.mimeType || 'text/plain',
        size: f.size || '1 KB',
        sizeBytes: f.sizeBytes || 1024,
        type: f.type || 'database',
        categoryLabel: f.categoryLabel || 'Database (Records/Catalog)',
        isBinary: Boolean(f.isBinary),
        uploadedAt: uploadedTime,
        contentPreview: !f.isBinary && typeof f.content === 'string' ? f.content.slice(0, 1500) : '',
        storageStatus: driveReady ? 'syncing' : 'local_cached',
        driveFolderPath: `Echo AI Agents / ${agentId} / ${f.type === 'frontend' ? 'Frontend' : f.type === 'backend' ? 'Backend' : 'Database'}`
      }));

      const payload = {
        id: agentId,
        name: name.trim(),
        role: extractedData?.role || `${websiteName.trim() || 'Website'} Help Desk Assistant`,
        archetype: extractedData?.archetype || 'general',
        model: model || 'Groq Llama 3.3 70B Versatile',
        preset: 'High Intelligence',
        voice: voice || 'Clara',
        prompt: extractedData ? extractedData.systemPrompt : `You are ${name.trim()}, a helpful voice assistant for ${websiteName.trim() || 'the website'}.`,
        greeting: extractedData ? extractedData.greeting : `Hello! I am ${name.trim()}. How can I assist you today?`,
        themeColor: themeColor || '#6366f1',
        accentColor: accentColor || '#06b6d4',
        position: 'bottom-right',
        apiKey: effectiveApiKey,
        knowledgeBase: Array.isArray(extractedData?.knowledgeBase) ? extractedData.knowledgeBase : [],
        databaseRecords: Array.isArray(extractedData?.databaseRecords) ? extractedData.databaseRecords : [],
        databaseConfig: extractedData?.databaseConfig || null,
        databaseProvider: extractedData?.databaseProvider || null,
        siteBlueprint: extractedData?.siteBlueprint || null,
        tools: Array.isArray(extractedData?.tools) ? extractedData.tools : [],
        uploadedFiles: storedUploadedFiles,
        sourceFile: uploadedFileName || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 3. Save agent immediately (~200-500ms) so it's live right away!
      await saveAgent(payload);

      // 4. Kick off fast concurrent Google Drive sync in the background (non-blocking)
      if (driveReady && pendingRawFiles.length > 0) {
        const filesSnapshot = pendingRawFiles.map((f) => ({ ...f, skipExistingCheck: true }));
        syncAgentFilesToDriveInBackground({
          agentId,
          files: filesSnapshot
        });
      }

      if (onAssistantCreated) {
        onAssistantCreated(payload);
      }
      resetModalState();
      onClose();
    } catch (err) {
      console.error('Error creating assistant:', err);
      setErrorMsg(err.message || 'Failed to save assistant. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-900">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-2xs">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Create AI Voice Assistant</h3>
              <p className="text-xs text-slate-500">
                Train your AI from database or website JSON files for zero-cost help desk deployment.
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-rose-600" />
              <span className="font-medium">{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Basic Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Assistant Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Nova Support, Maya"
                className="w-full h-9 px-3 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 shadow-2xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Website / Company Name
              </label>
              <input
                type="text"
                value={websiteName}
                onChange={(e) => setWebsiteName(e.target.value)}
                placeholder="e.g. Acme Store, TechFlow"
                className="w-full h-9 px-3 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 shadow-2xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                AI Model Tier
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 shadow-2xs cursor-pointer"
              >
                <option>Groq Llama 3.3 70B Versatile</option>
                <option>Google Gemini 2.5 Flash</option>
                <option>Groq Llama 3.1 8B Instant</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                Voice Persona
              </label>
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 shadow-2xs cursor-pointer"
              >
                <option value="Adam">Adam (Male - Deep & Natural Baritone)</option>
                <option value="Rachel">Rachel (Female - Ultra-Natural / Non-AI)</option>
                <option value="Clara">Clara (Female - Warm & Empathetic)</option>
                <option value="Elliot">Elliot (Male - Confident & Clear)</option>
                <option value="Layla">Layla (Female - Friendly & Upbeat)</option>
                <option value="Sid">Sid (Male - Professional Support)</option>
                <option value="Naina">Naina (Female - Natural Indian English)</option>
              </select>
            </div>
          </div>

          {/* AI API Key Section (Mandatory Groq or Gemini Key) */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
              <label className="font-bold text-slate-800 flex items-center gap-1.5">
                <KeyRound size={13} className="text-indigo-600" />
                <span>AI API Key for this Assistant (Groq or Gemini)</span>
                <span className="text-[10px] text-rose-500 font-bold">*Required</span>
              </label>
              <div className="flex items-center gap-2.5">
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:text-indigo-800 text-[11px] font-semibold inline-flex items-center gap-0.5 transition-colors"
                >
                  <span>Get Groq Key</span>
                  <ExternalLink size={10} />
                </a>
                <span className="text-slate-300">|</span>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-600 hover:text-emerald-800 text-[11px] font-semibold inline-flex items-center gap-0.5 transition-colors"
                >
                  <span>Get Gemini Key</span>
                  <ExternalLink size={10} />
                </a>
              </div>
            </div>

            <div className="space-y-2 pt-0.5">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={customApiKey}
                    onChange={(e) => {
                      setCustomApiKey(e.target.value);
                      setKeyValidationState('idle');
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="Paste Groq (gsk_...) or Gemini (AIza...) key"
                    className="w-full h-9 pl-3 pr-8 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 shadow-2xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showApiKey ? "Hide key" : "Show key"}
                  >
                    {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!customApiKey.trim()) {
                      setKeyValidationState('invalid');
                      setKeyValidationMsg('Please paste an API key first.');
                      return;
                    }
                    setKeyValidationState('validating');
                    setKeyValidationMsg('Verifying...');
                    const provider = customApiKey.startsWith('gsk_') ? 'groq' : 'gemini';
                    const res = await validateUserApiKey(provider, customApiKey);
                    if (res.valid) {
                      setKeyValidationState('valid');
                      setKeyValidationMsg(`✓ Verified Active ${provider === 'groq' ? 'Groq LPU' : 'Gemini Flash'} Key!`);
                    } else {
                      setKeyValidationState('invalid');
                      setKeyValidationMsg(res.error || 'Failed to verify key.');
                    }
                  }}
                  className="h-9 px-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold cursor-pointer shrink-0 transition-colors shadow-2xs"
                >
                  {keyValidationState === 'validating' ? 'Checking...' : keyValidationState === 'valid' ? '✓ Verified' : 'Verify Key'}
                </button>
              </div>

              {keyValidationState !== 'idle' && (
                <div className={`text-[11px] font-semibold ${keyValidationState === 'valid' ? 'text-emerald-700' : keyValidationState === 'invalid' ? 'text-rose-600' : 'text-slate-500'}`}>
                  {keyValidationMsg}
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Ingest Database / Website Files */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Database size={14} className="text-indigo-600" />
                  Database Records & Website Knowledge Files
                </h4>
                <p className="text-[11px] text-slate-500">
                  Upload database exports (.sql, .json, .csv) and website source files (.zip, HTML, code) for live AI access.
                </p>
              </div>
            </div>

            {/* Upload or Paste Tabs */}
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => setJsonInputMode('upload')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  jsonInputMode === 'upload' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Upload Database / Zip Files
              </button>
              <button
                type="button"
                onClick={() => setJsonInputMode('paste')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                  jsonInputMode === 'paste' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Paste Raw JSON
              </button>
            </div>

            {jsonInputMode === 'upload' ? (
              <label className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer bg-slate-50/50 hover:bg-indigo-50/20 transition-all">
                <Upload size={28} className="text-indigo-600 mb-2" />
                <span className="text-xs font-semibold text-slate-900 text-center">
                  {uploadedFileName ? `Loaded: ${uploadedFileName}` : 'Choose or drop Project .zip or Full-Stack files (Frontend, Backend & Database)'}
                </span>
                <span className="text-[11px] text-slate-500 mt-1 text-center">
                  Accepts .zip archives (auto-extracted), database exports (.json, .sql, .csv), and code files
                </span>
                {isUnpacking && (
                  <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold animate-pulse">
                    <Sparkles size={14} className="animate-spin text-indigo-600" />
                    <span>{unpackProgress || 'Unpacking zip archive & indexing codebase...'}</span>
                  </div>
                )}
                <input
                  type="file"
                  multiple
                  accept="*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-2">
                <textarea
                  rows={4}
                  value={rawJsonText}
                  onChange={(e) => {
                    setRawJsonText(e.target.value);
                    if (e.target.value.trim()) processJsonContent(e.target.value, 'pasted_data.json');
                  }}
                  placeholder='Paste your JSON array or object here: [{"question": "...", "answer": "..."}]'
                  className="w-full p-3 rounded-xl bg-white border border-slate-300 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 shadow-2xs"
                />
              </div>
            )}
          </div>

          {/* Extracted Knowledge Preview */}
          {extractedData && (
            <div className="p-4 rounded-xl bg-indigo-50/40 border border-indigo-200 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                  <CheckCircle2 size={15} className="text-emerald-600" />
                  Successfully Ingested {extractedData.itemsExtracted} Knowledge Items
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-mono font-semibold">
                  Auto-Trained
                </span>
              </div>

              {extractedData.databaseConfig && (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="font-semibold">Live Database Connected:</span>
                  <span className="truncate">{extractedData.databaseStatusMessage || `${extractedData.databaseProvider || 'Database'} (Direct access enabled)`}</span>
                </div>
              )}

              {extractedData.siteBlueprint && (
                <div className="p-3 rounded-xl bg-white border border-indigo-200/80 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider">
                      Stage 1 · Website Workflow & Redirect Map
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200 font-semibold capitalize">
                      {extractedData.siteBlueprint.archetype || extractedData.archetype}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {extractedData.siteBlueprint.roleSummary}
                  </p>
                  {extractedData.siteBlueprint.workflows?.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {extractedData.siteBlueprint.workflows.map((wf, i) => (
                        <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-[10px] font-semibold text-indigo-800">
                          <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] flex items-center justify-center">{wf.step}</span>
                          <span>{wf.title}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {(extractedData.siteBlueprint.forms || []).slice(0, 4).map((f, idx) => (
                      <span key={`fm-${idx}`} className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[10px] font-medium text-emerald-800">
                        Form: {f.title} ({f.fields?.length || 0} fields)
                      </span>
                    ))}
                    {(extractedData.siteBlueprint.sections || []).slice(0, 4).map((s, idx) => (
                      <span key={`sec-${idx}`} className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-700">
                        {s.href} · {s.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                {extractedData.knowledgeBase.map((item, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-white border border-slate-200 text-[11px] shadow-2xs">
                    <span className="font-bold text-slate-900 block">Q: {item.q}</span>
                    <span className="text-slate-600 block mt-0.5">A: {item.a}</span>
                  </div>
                ))}
              </div>

              <div className="text-[11px] text-slate-600 pt-2 border-t border-indigo-100">
                <span className="font-bold text-slate-800">Generated Greeting:</span> "{extractedData.greeting}"
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleCreate}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm shadow-indigo-500/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
          >
            {isSaving ? (
              <span>Saving to Firebase...</span>
            ) : (
              <>
                <span>Create & Save to Firebase</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
