import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Check,
  CheckCircle2,
  X,
  ExternalLink,
  ShieldCheck,
  Zap,
  Lock,
  Play,
  Volume2,
  KeyRound,
  Eye,
  EyeOff,
  Pencil,
  AlertTriangle,
  Layers
} from 'lucide-react';
import { getUserApiKeys, saveUserApiKeys, validateUserApiKey } from '../services/aiCompletionService';

export default function EmbedWidgetModal({ isOpen, onClose, agent }) {
  const [copied, setCopied] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [activePlatform, setActivePlatform] = useState('html');
  const [showApiKey, setShowApiKey] = useState(false);
  const [testMode, setTestMode] = useState(false);

  const storedKeys = getUserApiKeys();
  const [currentApiKey, setCurrentApiKey] = useState(() => agent?.apiKey || storedKeys.activeKey || '');
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  const agentName = (agent?.name || agent?.title || 'Zenith Concierge').trim();
  const agentId = agentName.replace(/\//g, '-');
  const widgetUrl = `${window.location.origin}/widget.js`;

  const scriptSnippet = `<script src="${widgetUrl}" data-agent-id="${agentId}"${currentApiKey ? ` data-api-key="${currentApiKey}"` : ''} defer></script>`;

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(currentApiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const platforms = [
    { id: 'html', label: 'HTML / Vanilla JS' },
    { id: 'realtime', label: '⚡ Realtime Live Data & Stock' },
    { id: 'react', label: 'React / Next.js' },
    { id: 'curl', label: 'cURL / REST API' },
    { id: 'wordpress', label: 'WordPress' },
    { id: 'webflow', label: 'Webflow' },
  ];

  const getPlatformCode = () => {
    const keyAttr = currentApiKey ? `\n          data-api-key="${currentApiKey}"` : '';
    const keyInline = currentApiKey ? ` data-api-key="${currentApiKey}"` : '';

    switch (activePlatform) {
      case 'realtime':
        return `<!-- REAL-TIME LIVE DATABASE & STOCK INTEGRATION -->
<!-- Option 1: In-Page JavaScript Bridge (Zero-Backend, Instant Setup) -->
<script>
  window.EchoAIData = {
    // 1. Live Inventory Map: Updated in real-time by your store / warehouse
    liveInventory: {
      "augmentin 625 duo tablet": {
        name: "Augmentin 625 Duo Tablet",
        stock: 42,
        unit: "strips",
        price: "₹185.50",
        available: true,
        rx: true
      },
      "azithromycin 500mg": { stock: 18, price: "₹120.00", available: true },
      "paracetamol 650mg": { stock: 150, price: "₹32.00", available: true }
    },

    // 2. OR Dynamic Query Hook: Automatically queries your backend on each visitor question
    queryDatabase: async (productQuery, action) => {
      // E.g. query your real-time database or inventory API:
      const res = await fetch('/api/inventory/search?q=' + encodeURIComponent(productQuery));
      return await res.json(); // returns { name: "...", stock: 42, price: "₹185.50" }
    }
  };
</script>

<!-- The Voice Assistant Script (Reads live database state automatically!) -->
<script src="${widgetUrl}" data-agent-id="${agentId}"${keyInline} defer></script>

<!-- Option 2: Live Backend REST Webhook Endpoint (Node.js / Python / PHP) -->
<!-- Pass data-api-endpoint on the script tag to delegate live stock lookups: -->
<!-- <script src="${widgetUrl}" data-agent-id="${agentId}" data-api-endpoint="/api/echo-live-stock" defer></script> -->`;
      case 'react':
        return `// Next.js (App Router or Pages Router)
import Script from 'next/script';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Real-time Voice Help Desk Agent (Live AI Key & Database Connected) */}
        <Script 
          src="${widgetUrl}" 
          data-agent-id="${agentId}"${keyAttr}
          strategy="lazyOnload" 
        />
      </body>
    </html>
  );
}`;
      case 'curl':
        return `# Directly test the Agent inference API using your personal AI API Key:
curl -X POST "https://api.groq.com/openai/v1/chat/completions" \\
  -H "Authorization: Bearer ${currentApiKey || 'YOUR_GROQ_API_KEY'}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen/qwen3.8-27b",
    "messages": [
      {
        "role": "system",
        "content": "You are ${agentName}, an intelligent AI voice assistant for our website."
      },
      {
        "role": "user",
        "content": "What products or services do you offer?"
      }
    ],
    "temperature": 0.5,
    "max_tokens": 150
  }'`;
      case 'wordpress':
        return `<!-- WordPress: Add this to footer.php right before </body>, or use a Header/Footer Scripts plugin -->
<script src="${widgetUrl}" data-agent-id="${agentId}"${keyInline} defer></script>`;
      case 'webflow':
        return `<!-- Webflow: Go to Project Settings > Custom Code > Footer Code and paste: -->
<script src="${widgetUrl}" data-agent-id="${agentId}"${keyInline} defer></script>`;
      case 'html':
      default:
        return `<!-- Paste this 1-line script tag right before the closing </body> tag on any page: -->
<script 
  src="${widgetUrl}" 
  data-agent-id="${agentId}"${keyAttr} 
  defer>
</script>`;
    }
  };

  const launchTestWidget = () => {
    const existing = document.querySelector(`script[data-agent-id="${agentId}"]`);
    if (existing) existing.remove();

    const script = document.createElement('script');
    script.src = '/widget.js';
    script.setAttribute('data-agent-id', agentId);
    if (currentApiKey) {
      script.setAttribute('data-api-key', currentApiKey);
    }
    script.defer = true;
    document.body.appendChild(script);
    setTestMode(true);
  };

  const openDemoPage = () => {
    const keyParam = currentApiKey ? `&key=${encodeURIComponent(currentApiKey)}` : '';
    const voiceParam = agent?.voice ? `&voice=${encodeURIComponent(agent.voice)}` : '';
    window.open(`/demo-client-site.html?agent=${agentId}${keyParam}${voiceParam}`, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-900">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shadow-2xs">
              <KeyRound size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Agent Embed &amp; Deployment Security
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-bold">
                  Production Ready
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Agent: <span className="text-indigo-600 font-bold">{agentName}</span> · Voice: <span className="text-violet-600 font-semibold">{agent?.voice || 'Clara'}</span>
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
          
          {/* 1. Production AI Key Configuration Card */}
          <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                <Zap size={15} className="text-indigo-600" />
                <span>AI API Key Configuration (Groq or Gemini)</span>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold font-mono">
                REAL-TIME LLM
              </span>
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              This assistant runs with your dedicated <strong>Groq</strong> or <strong>Gemini</strong> API key for real-time generative reasoning, voice answers, and direct live database access.
            </p>

            {/* Key display / editing */}
            <div className="pt-1">
              {isEditingKey ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="Paste your personal Groq (gsk_...) or Gemini Key"
                    className="flex-1 h-9 px-3 rounded-xl bg-white border border-indigo-400 text-xs font-mono text-slate-900 focus:outline-none shadow-2xs"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = keyInput.trim();
                      if (trimmed) {
                        setCurrentApiKey(trimmed);
                        saveUserApiKeys({ groqKey: trimmed });
                        setIsEditingKey(false);
                      }
                    }}
                    className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs flex items-center gap-1 shadow-sm cursor-pointer"
                  >
                    <Check size={13} />
                    <span>Save Key</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingKey(false)}
                    className="h-9 px-2.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-9 px-3 rounded-xl bg-white border border-slate-300 flex items-center justify-between text-xs font-mono text-slate-800">
                    <span>
                      {currentApiKey
                        ? showApiKey
                          ? currentApiKey
                          : currentApiKey.substring(0, 10) + '••••••••••••••••••••••••'
                        : 'No API key set. Click "Add Key"'}
                    </span>
                    {currentApiKey && (
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="p-1 rounded text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setKeyInput(currentApiKey);
                      setIsEditingKey(true);
                    }}
                    className="h-9 px-3 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs"
                  >
                    <Pencil size={12} />
                    <span>{currentApiKey ? 'Change Key' : 'Add Key'}</span>
                  </button>
                  {currentApiKey && (
                    <button
                      type="button"
                      onClick={handleCopyKey}
                      className="h-9 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold text-xs flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      {copiedKey ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 1-Line Embed Script Tag Card */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <Code2 size={15} className="text-indigo-600" />
                <span>1-Line Website Embed Tag (Live AI Key &amp; Database Connected)</span>
              </div>
              <span className="text-[10px] text-slate-500 font-medium">Direct drop-in · Zero dependencies</span>
            </div>
            <div className="relative group">
              <pre className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-cyan-300 text-xs overflow-x-auto select-all shadow-inner">
{scriptSnippet}
              </pre>
              <button
                onClick={() => handleCopy(scriptSnippet)}
                className="absolute right-2 top-2 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-xs"
                title="Copy script tag"
              >
                {copied ? <Check size={13} className="text-white" /> : <Copy size={13} />}
              </button>
            </div>
            <div className="flex items-center justify-between pt-1">
              <div className="text-[11px] text-slate-600 flex items-center gap-1.5 font-medium">
                <ShieldCheck size={13} className="text-emerald-600" />
                <span>Paste this tag before <code className="text-indigo-600 font-mono font-semibold bg-indigo-50 px-1 py-0.5 rounded">&lt;/body&gt;</code> in your website code.</span>
              </div>
              <button
                type="button"
                onClick={openDemoPage}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>Open Live Demo Page</span>
                <ExternalLink size={12} />
              </button>
            </div>
          </div>

          {/* Platform Specific Snippets */}
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-900">Framework &amp; Platform Code:</span>
              <div className="flex items-center gap-1 overflow-x-auto">
                {platforms.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setActivePlatform(p.id)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap shadow-2xs ${
                      activePlatform === p.id
                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-300'
                        : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative group">
              <pre className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 font-mono text-slate-200 text-xs overflow-x-auto max-h-48 select-all shadow-inner">
{getPlatformCode()}
              </pre>
              <button
                onClick={() => handleCopy(getPlatformCode())}
                className="absolute right-2 top-2 p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all cursor-pointer shadow-xs"
                title="Copy code"
              >
                {copied ? <Check size={13} className="text-white" /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          {/* Live Browser Test Bar */}
          <div className="p-4 rounded-xl bg-white border border-slate-200 flex items-center justify-between shadow-sm">
            <div>
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Volume2 size={14} className="text-indigo-600" />
                Test Voice Widget On This Workspace
              </h4>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Launch the floating help desk button on this page to test speech and responses right now.
              </p>
            </div>
            <button
              onClick={launchTestWidget}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
            >
              <Play size={12} fill="currentColor" />
              <span>{testMode ? 'Widget Active (Look Bottom-Right)' : 'Launch Live Test'}</span>
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span>Agent Active &amp; Ready for Web Integration</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
}
