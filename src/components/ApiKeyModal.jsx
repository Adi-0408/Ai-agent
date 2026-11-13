import React, { useState, useEffect } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Zap,
  ExternalLink,
  Check,
  X,
  Eye,
  EyeOff,
  RefreshCw,
  Trash2,
  Lock,
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import {
  getUserApiKeys,
  saveUserApiKeys,
  clearUserApiKeys,
  validateUserApiKey
} from '../services/aiCompletionService';

/**
 * ApiKeyModal & BYOK Gatekeeper Component
 * Supports both modal dialog mode and embedded dashboard tab mode.
 */
export default function ApiKeyModal({
  isOpen = true,
  onClose,
  onSaveSuccess,
  isEmbedded = false,
  title = "AI Inference Engine & API Keys",
  subtitle = "Bring Your Own Key (BYOK) — Powered directly by your personal Groq or Gemini account."
}) {
  const [activeProvider, setActiveProvider] = useState('groq');
  const [groqKeyInput, setGroqKeyInput] = useState('');
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [storageMode, setStorageMode] = useState('local');

  // Verification state: 'idle' | 'validating' | 'success' | 'error'
  const [validationState, setValidationState] = useState('idle');
  const [validationMessage, setValidationMessage] = useState('');
  const [verifiedModels, setVerifiedModels] = useState([]);

  // Load stored keys on mount or when modal opens
  useEffect(() => {
    const keys = getUserApiKeys();
    setGroqKeyInput(keys.groqKey || '');
    setGeminiKeyInput(keys.geminiKey || '');
    setActiveProvider(keys.preferredProvider || (keys.groqKey ? 'groq' : 'gemini'));
    setStorageMode(keys.storageMode || 'local');
    setValidationState('idle');
    setValidationMessage('');
  }, [isOpen]);

  if (!isOpen && !isEmbedded) return null;

  const currentInputValue = activeProvider === 'groq' ? groqKeyInput : geminiKeyInput;
  const isGroqFormatValid = Boolean(groqKeyInput && groqKeyInput.startsWith('gsk_') && groqKeyInput.length > 25);
  const isGeminiFormatValid = Boolean(geminiKeyInput && geminiKeyInput.length > 20);
  const isCurrentFormatValid = activeProvider === 'groq' ? isGroqFormatValid : isGeminiFormatValid;

  const handleVerifyAndSave = async () => {
    const keyToValidate = activeProvider === 'groq' ? groqKeyInput.trim() : geminiKeyInput.trim();

    if (!keyToValidate) {
      setValidationState('error');
      setValidationMessage('Please paste an API key before verifying.');
      return;
    }

    setValidationState('validating');
    setValidationMessage('Testing connection to AI provider...');

    const result = await validateUserApiKey(activeProvider, keyToValidate);

    if (result.valid) {
      setValidationState('success');
      setValidationMessage(
        activeProvider === 'groq'
          ? `✓ Groq LPU API Key Verified! <200ms ultra-low latency enabled.`
          : `✓ Google Gemini API Key Verified! Multimodal reasoning active.`
      );
      setVerifiedModels(result.models || []);

      // Persist to user storage
      saveUserApiKeys({
        groqKey: activeProvider === 'groq' ? keyToValidate : groqKeyInput,
        geminiKey: activeProvider === 'gemini' ? keyToValidate : geminiKeyInput,
        preferredProvider: activeProvider,
        storageMode: storageMode
      });

      if (onSaveSuccess) {
        onSaveSuccess({
          provider: activeProvider,
          key: keyToValidate,
          models: result.models
        });
      }
    } else {
      setValidationState('error');
      setValidationMessage(result.error || 'Verification failed. Please check your key.');
      setVerifiedModels([]);
    }
  };

  const handleClearKeys = () => {
    if (window.confirm('Are you sure you want to revoke and clear all stored API keys from this browser?')) {
      clearUserApiKeys();
      setGroqKeyInput('');
      setGeminiKeyInput('');
      setValidationState('idle');
      setValidationMessage('');
      setVerifiedModels([]);
    }
  };

  const modalBody = (
    <div className={`space-y-5 ${isEmbedded ? '' : 'p-6'}`}>
      {/* Header Banner */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0 shadow-2xs">
              <KeyRound size={16} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {title}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {subtitle}
              </p>
            </div>
          </div>
        </div>

        {!isEmbedded && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Provider Selector Tabs */}
      <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80">
        <button
          type="button"
          onClick={() => {
            setActiveProvider('groq');
            setValidationState('idle');
            setValidationMessage('');
          }}
          className={`h-11 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeProvider === 'groq'
              ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/90'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="w-5 h-5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px] flex items-center justify-center shrink-0">
            G
          </div>
          <div className="text-left leading-tight">
            <div>Groq Cloud LPU</div>
            <div className="text-[10px] text-emerald-600 font-normal">Recommended &lt;200ms</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveProvider('gemini');
            setValidationState('idle');
            setValidationMessage('');
          }}
          className={`h-11 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeProvider === 'gemini'
              ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/90'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center shrink-0">
            ✦
          </div>
          <div className="text-left leading-tight">
            <div>Google Gemini Flash</div>
            <div className="text-[10px] text-indigo-600 font-normal">Free Google AI Studio</div>
          </div>
        </button>
      </div>

      {/* Active Provider Card */}
      <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200 space-y-3.5">
        <div className="flex items-center justify-between text-xs">
          <label className="font-bold text-slate-800 flex items-center gap-1.5">
            <span>{activeProvider === 'groq' ? 'Your Groq API Key' : 'Your Google Gemini API Key'}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-slate-200/80 text-slate-700">
              {activeProvider === 'groq' ? 'gsk_...' : 'AIza...'}
            </span>
          </label>

          <a
            href={activeProvider === 'groq' ? "https://console.groq.com/keys" : "https://aistudio.google.com/app/apikey"}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
          >
            <span>Get Free Key in 10s</span>
            <ExternalLink size={11} />
          </a>
        </div>

        {/* Input with Show/Hide and Clear */}
        <div className="relative flex items-center">
          <input
            type={showKey ? 'text' : 'password'}
            value={activeProvider === 'groq' ? groqKeyInput : geminiKeyInput}
            onChange={(e) => {
              if (activeProvider === 'groq') {
                setGroqKeyInput(e.target.value);
              } else {
                setGeminiKeyInput(e.target.value);
              }
              setValidationState('idle');
              setValidationMessage('');
            }}
            placeholder={
              activeProvider === 'groq'
                ? 'gsk_PasteYourGroqKeyHere...'
                : 'AIzaSy_PasteYourGeminiKeyHere...'
            }
            className={`w-full h-10 pl-3 pr-20 bg-white border rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none transition-all shadow-2xs ${
              validationState === 'error'
                ? 'border-rose-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                : validationState === 'success'
                ? 'border-emerald-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                : 'border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'
            }`}
          />

          <div className="absolute right-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="p-1 rounded text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title={showKey ? "Hide key" : "Show key"}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
            {currentInputValue && (
              <button
                type="button"
                onClick={() => {
                  if (activeProvider === 'groq') setGroqKeyInput('');
                  else setGeminiKeyInput('');
                  setValidationState('idle');
                }}
                className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                title="Clear input"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Validation Feedback Banner */}
        {validationState !== 'idle' && (
          <div
            className={`p-3 rounded-lg text-xs flex items-start gap-2.5 transition-all animate-fadeIn ${
              validationState === 'validating'
                ? 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                : validationState === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {validationState === 'validating' && (
              <RefreshCw size={15} className="animate-spin text-indigo-600 shrink-0 mt-0.5" />
            )}
            {validationState === 'success' && (
              <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" />
            )}
            {validationState === 'error' && (
              <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <div className="font-semibold">{validationMessage}</div>
              {verifiedModels.length > 0 && (
                <div className="text-[11px] text-emerald-700 mt-1 flex flex-wrap gap-1 font-mono">
                  <span>Available:</span>
                  {verifiedModels.slice(0, 4).map(m => (
                    <span key={m} className="px-1.5 py-0.2 rounded bg-emerald-100/80 text-[10px]">
                      {m}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Verification Action Bar */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <ShieldCheck size={14} className={isCurrentFormatValid ? "text-emerald-600" : "text-slate-400"} />
            <span>Format: {isCurrentFormatValid ? 'Valid Format' : 'Requires key prefix'}</span>
          </div>

          <button
            type="button"
            onClick={handleVerifyAndSave}
            disabled={validationState === 'validating' || !currentInputValue}
            className={`h-9 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95 ${
              validationState === 'validating'
                ? 'bg-indigo-400 text-white cursor-wait'
                : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white'
            }`}
          >
            {validationState === 'validating' ? (
              <>
                <RefreshCw size={13} className="animate-spin" />
                <span>Testing Key...</span>
              </>
            ) : validationState === 'success' ? (
              <>
                <Check size={13} />
                <span>Verified & Saved!</span>
              </>
            ) : (
              <>
                <Zap size={13} />
                <span>Verify & Save Key</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Storage Mode Selector */}
      <div className="p-3.5 rounded-xl bg-slate-50/70 border border-slate-200 space-y-2">
        <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Lock size={13} className="text-slate-500" />
            Key Storage Preference
          </span>
          <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            Zero Server Exposure
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <label
            onClick={() => {
              setStorageMode('local');
              saveUserApiKeys({ storageMode: 'local' });
            }}
            className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-start gap-2 ${
              storageMode === 'local'
                ? 'bg-white border-indigo-400 shadow-2xs'
                : 'bg-white/60 border-slate-200 hover:bg-white text-slate-600'
            }`}
          >
            <input
              type="radio"
              name="storageMode"
              checked={storageMode === 'local'}
              onChange={() => {}}
              className="mt-0.5 text-indigo-600"
            />
            <div className="min-w-0">
              <div className="font-semibold text-slate-800 text-[11.5px]">Browser LocalStorage Only</div>
              <div className="text-[10.5px] text-slate-500 leading-normal mt-0.5">
                Saved solely on this machine. Never synced to cloud database.
              </div>
            </div>
          </label>

          <label
            onClick={() => {
              setStorageMode('synced');
              saveUserApiKeys({ storageMode: 'synced' });
            }}
            className={`p-2.5 rounded-lg border cursor-pointer transition-all flex items-start gap-2 ${
              storageMode === 'synced'
                ? 'bg-white border-indigo-400 shadow-2xs'
                : 'bg-white/60 border-slate-200 hover:bg-white text-slate-600'
            }`}
          >
            <input
              type="radio"
              name="storageMode"
              checked={storageMode === 'synced'}
              onChange={() => {}}
              className="mt-0.5 text-indigo-600"
            />
            <div className="min-w-0">
              <div className="font-semibold text-slate-800 text-[11.5px]">Workspace Synced (Firestore)</div>
              <div className="text-[10.5px] text-slate-500 leading-normal mt-0.5">
                Encrypted and synced across your workspace devices.
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Revoke / Clear Action */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <Info size={13} className="text-slate-400" />
          <span>Your key is called directly from your browser to Groq / Gemini APIs.</span>
        </div>

        <button
          type="button"
          onClick={handleClearKeys}
          className="text-xs font-semibold text-slate-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer transition-colors p-1"
          title="Remove all saved API keys"
        >
          <Trash2 size={12} />
          <span>Clear Keys</span>
        </button>
      </div>
    </div>
  );

  if (isEmbedded) {
    return (
      <div className="w-full bg-white border border-slate-200 rounded-2xl shadow-sm p-6 max-w-2xl mx-auto">
        {modalBody}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {modalBody}
      </div>
    </div>
  );
}
