import React, { useState } from 'react';
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
import { detectFileType, analyzeFullStackFiles } from '../utils/codebaseAnalyzer';
import { saveAgent } from '../firebase';
import { saveFileToLocalStore } from '../utils/localFileStore';
import { isDriveConnected, uploadFileToDrive } from '../services/googleDriveService';
import { getUserApiKeys, validateUserApiKey, saveUserApiKeys } from '../services/aiCompletionService';
import { isZipFile, expandFileList } from '../utils/zipHandler';

export default function CreateAssistantModal({ isOpen, onClose, onAssistantCreated }) {
  const initialUserKeys = getUserApiKeys();
  const [step, setStep] = useState(1); // 1: Setup & Upload, 2: Review & Create
  const [name, setName] = useState('');
  const [websiteName, setWebsiteName] = useState('');
  const [model, setModel] = useState('Groq Qwen 27B (<200ms Free)');
  const [voice, setVoice] = useState('Adam');
  const [themeColor, setThemeColor] = useState('#6366f1');
  const [accentColor, setAccentColor] = useState('#06b6d4');
  const [customApiKey, setCustomApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [keyValidationState, setKeyValidationState] = useState('idle');
  const [keyValidationMsg, setKeyValidationMsg] = useState('');
  const [isKeylessMode, setIsKeylessMode] = useState(false);
  const [jsonInputMode, setJsonInputMode] = useState('upload'); // 'upload' | 'paste'
  const [rawJsonText, setRawJsonText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [pendingRawFiles, setPendingRawFiles] = useState([]);
  const [extractedData, setExtractedData] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUnpacking, setIsUnpacking] = useState(false);
  const [unpackProgress, setUnpackProgress] = useState('');

  // Sample JSON for instant testing
  const sampleJson = [
    {
      "question": "What is your return and refund policy?",
      "answer": "We offer a 30-day no-questions-asked refund guarantee on all products and services."
    },
    {
      "question": "How much does shipping cost and how long does it take?",
      "answer": "Standard shipping is free on orders over $50 and typically arrives in 2-4 business days."
    },
    {
      "question": "What are your business hours?",
      "answer": "Our automated AI support is available 24/7. Human support representatives are available Monday through Friday from 9 AM to 6 PM EST."
    },
    {
      "question": "How do I cancel or upgrade my subscription?",
      "answer": "You can change or cancel your subscription anytime from your Account Settings > Billing page."
    }
  ];

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

      const processedFiles = [];
      for (const file of fileList) {
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
        processedFiles.push({
          id: `f_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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
        });
      }

      setPendingRawFiles(processedFiles);

      const fullStack = analyzeFullStackFiles(processedFiles);
      const firstFile = processedFiles[0];
      const detectedSite = fullStack.frontend[0]?.siteTitle || websiteName.trim() || firstFile.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'our website';
      const brand = detectedSite.split(/[—–|-]/)[0].trim();
      const astName = name.trim() || (brand ? `${brand} Concierge` : 'AI Assistant');
      if (!name.trim()) setName(astName);
      if (!websiteName.trim() && detectedSite !== 'our website') setWebsiteName(detectedSite);

      const kbList = fullStack.combinedKnowledge && fullStack.combinedKnowledge.length > 0
        ? fullStack.combinedKnowledge
        : [
            { q: "What is this website about?", a: `Official assistant for ${detectedSite}.` },
            { q: "What products or services do you offer?", a: `Comprehensive solutions and customer guidance for ${detectedSite}.` }
          ];

      setExtractedData({
        knowledgeBase: kbList,
        databaseRecords: fullStack.databaseRecords || [],
        systemPrompt: `# ${astName} - ${firstFile.type === 'backend' ? 'API Action Assistant' : 'Website & Product Advisor'}

## Identity & Purpose
You are ${astName}, the official AI conversational guide for ${detectedSite}.
${fullStack.summary}

## Guidelines
- Respond in 1-2 concise, natural spoken sentences suitable for voice.
- Explain products, specifications, and website features with accuracy.
- Be polite, helpful, and direct.`,
        greeting: `Hello! Welcome to ${detectedSite}. I am ${astName}. How can I assist you with our products or inquiries today?`,
        tools: fullStack.tools,
        itemsExtracted: kbList.length
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

  const loadSampleData = () => {
    setName('Nova Support');
    setWebsiteName('Acme Cloud');
    const jsonStr = JSON.stringify(sampleJson, null, 2);
    setUploadedFileName('sample_helpdesk_db.json');
    processJsonContent(jsonStr, 'sample_helpdesk_db.json');
    setPendingRawFiles([
      {
        id: `f_sample_${Date.now()}`,
        name: 'sample_helpdesk_db.json',
        mimeType: 'application/json',
        size: `${(new Blob([jsonStr]).size / 1024).toFixed(1)} KB`,
        sizeBytes: new Blob([jsonStr]).size,
        type: 'database',
        categoryLabel: 'Database (Records/Catalog)',
        isBinary: false,
        rawFile: new Blob([jsonStr], { type: 'application/json' }),
        content: jsonStr
      }
    ]);
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setErrorMsg('Please enter an assistant name.');
      return;
    }

    try {
      setIsSaving(true);
      const agentId = name.trim().replace(/\//g, '-');
      const driveReady = isDriveConnected();
      const storedUploadedFiles = [];

      for (const f of pendingRawFiles) {
        await saveFileToLocalStore({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType || 'text/plain',
          type: f.type || 'database',
          content: f.content || '',
          blob: f.rawFile || null,
          assistantName: agentId
        });

        let driveMeta = {
          storageStatus: 'local_pending',
          driveFolderPath: `Echo AI Agents / ${agentId} / ${f.type === 'frontend' ? 'Frontend' : f.type === 'backend' ? 'Backend' : 'Database'}`
        };

        if (driveReady) {
          try {
            driveMeta = await uploadFileToDrive({
              fileBlob: f.rawFile || null,
              fileName: f.name,
              mimeType: f.mimeType || 'text/plain',
              assistantName: agentId,
              tier: f.type || 'database',
              content: f.content || ''
            });
          } catch (err) {
            console.warn('Drive upload error during create:', f.name, err);
          }
        }

        storedUploadedFiles.push({
          id: f.id,
          name: f.name,
          relativePath: f.relativePath || f.name,
          mimeType: f.mimeType || 'text/plain',
          size: f.size || '1 KB',
          sizeBytes: f.sizeBytes || 1024,
          type: f.type || 'database',
          categoryLabel: f.categoryLabel || 'Database (Records/Catalog)',
          isBinary: Boolean(f.isBinary),
          uploadedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          contentPreview: !f.isBinary && typeof f.content === 'string' ? f.content.slice(0, 5000) : '',
          ...driveMeta
        });
      }

      const payload = {
        id: agentId,
        name: name.trim(),
        role: `${websiteName.trim() || 'Website'} Help Desk Assistant`,
        model: model || 'Groq Qwen 27B (<200ms Free)',
        voice: voice || 'Clara',
        prompt: extractedData ? extractedData.systemPrompt : `You are ${name.trim()}, a helpful voice assistant for ${websiteName.trim() || 'the website'}.`,
        greeting: extractedData ? extractedData.greeting : `Hello! I am ${name.trim()}. How can I assist you today?`,
        themeColor: themeColor || '#6366f1',
        accentColor: accentColor || '#06b6d4',
        position: 'bottom-right',
        apiKey: isKeylessMode ? '' : customApiKey.trim(),
        knowledgeBase: Array.isArray(extractedData?.knowledgeBase) ? extractedData.knowledgeBase : [],
        databaseRecords: Array.isArray(extractedData?.databaseRecords) ? extractedData.databaseRecords : [],
        tools: Array.isArray(extractedData?.tools) ? extractedData.tools : [],
        uploadedFiles: storedUploadedFiles,
        sourceFile: uploadedFileName || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await saveAgent(payload);
      if (onAssistantCreated) {
        onAssistantCreated(payload);
      }
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
            onClick={onClose}
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
                <option>Groq Qwen 27B (&lt;200ms Free)</option>
                <option>Google Gemini 3.8 Flash (Free)</option>
                <option>Groq GPT-OSS 20B (Free)</option>
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

          {/* Dedicated Single API Key Block */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-bold text-slate-800 flex items-center gap-1.5">
                <KeyRound size={13} className="text-indigo-600" />
                <span>AI API Key for this Assistant (Single Key)</span>
              </label>
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setIsKeylessMode(false)}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
                    !isKeylessMode
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Dedicated Key
                </button>
                <button
                  type="button"
                  onClick={() => setIsKeylessMode(true)}
                  className={`px-2 py-0.5 rounded-md font-semibold transition-colors cursor-pointer ${
                    isKeylessMode
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  100% Offline (Keyless)
                </button>
              </div>
            </div>

            {!isKeylessMode ? (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-600">
                    Paste a single <strong>Groq Cloud</strong> (<code className="text-indigo-600">gsk_...</code>) or <strong>Gemini</strong> (<code className="text-indigo-600">AIza...</code>) key for this AI:
                  </span>
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-0.5"
                  >
                    <span>Get Free Key</span>
                    <ExternalLink size={10} />
                  </a>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={customApiKey}
                      onChange={(e) => {
                        setCustomApiKey(e.target.value);
                        setKeyValidationState('idle');
                      }}
                      placeholder="gsk_... or AIza... (Dedicated key for this AI)"
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
            ) : (
              <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200/80 text-[11px] text-emerald-800 leading-relaxed">
                ✓ <strong>Offline Rule-Based Mode:</strong> This assistant will answer visitor inquiries exclusively using the compiled Knowledge Base and Web Speech API without making any external LLM calls or requiring API keys.
              </div>
            )}
          </div>

          {/* Section 2: Ingest Database / Website JSON */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Database size={14} className="text-indigo-600" />
                  Database / Website Knowledge File (JSON)
                </h4>
                <p className="text-[11px] text-slate-500">
                  Upload database exports, products, or website FAQs to train the assistant.
                </p>
              </div>
              <button
                type="button"
                onClick={loadSampleData}
                className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold underline flex items-center gap-1 cursor-pointer"
              >
                <Sparkles size={11} />
                Load Sample JSON
              </button>
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
                Upload .json File
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
            onClick={onClose}
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
