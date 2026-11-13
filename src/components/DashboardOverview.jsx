import React from 'react';
import {
  Sparkles,
  Bot,
  AudioWaveform,
  Code2,
  HardDrive,
  FolderArchive,
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe,
  Server,
  Database,
  CheckCircle2,
  Volume2,
  Wrench,
  Clock,
  ExternalLink,
  Layers,
  ChevronRight,
  Activity,
  UserCheck,
  KeyRound
} from 'lucide-react';
import { getAgentStorageInfo } from '../firebase';
import { getUserApiKeys } from '../services/aiCompletionService';

export default function DashboardOverview({
  user,
  assistants,
  currentAssistant,
  toolsList,
  onNavigateTab,
  onOpenEmbedModal,
  onOpenApiKeyModal,
  onDownloadAgent,
  onLaunchTestWidget
}) {
  const userName = user?.displayName || 'Workspace Creator';
  const userRole = user?.role || 'Admin';
  const totalAssistants = assistants?.length || 0;
  const totalTools = toolsList?.length || 0;
  const totalFacts = currentAssistant?.knowledgeBase?.length || 0;
  const storageInfo = getAgentStorageInfo(currentAssistant);

  const userKeys = getUserApiKeys();
  const hasInferenceKey = Boolean(userKeys.hasKey || currentAssistant?.apiKey);
  const activeEngineName = userKeys.preferredProvider === 'gemini' ? 'Gemini Flash' : 'Groq LPU';

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-[1200px] mx-auto text-slate-900 animate-fadeIn">
      
      {/* 1. Welcome & Workspace Status Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Subtle decorative gradient glow */}
        <div className="absolute right-0 top-0 bottom-0 w-1/2 bg-gradient-to-l from-indigo-100/50 via-cyan-50/30 to-transparent pointer-events-none" />

        <div className="space-y-2 z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 text-cyan-800 border border-cyan-200 font-medium text-xs">
            <UserCheck size={13} className="text-cyan-600" />
            <span>Workspace Active · Logged in as {userName} ({userRole})</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            AI Voice Help Desk <span className="bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-500 bg-clip-text text-transparent">Command Center</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-xl leading-relaxed">
            Manage your autonomous voice assistants, test deterministic locked voices, and export standalone packages that run anywhere with <strong className="text-slate-900 font-semibold">zero external API keys</strong>.
          </p>
        </div>

        {/* Quick Top Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 z-10 shrink-0">
          <button
            type="button"
            onClick={() => onNavigateTab('composer')}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
          >
            <Sparkles size={14} />
            <span>Open Composer</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigateTab('assistants')}
            className="h-10 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs flex items-center justify-center gap-2 shadow-2xs transition-all cursor-pointer"
          >
            <Bot size={14} className="text-indigo-600" />
            <span>Manage Assistants</span>
          </button>
        </div>
      </div>

      {/* 2. Top 4 Metric Bento Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Metric 1: Active Assistants */}
        <div className="bg-white border border-slate-200 border-t-4 border-t-emerald-500 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-3 hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>Voice Assistants</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Bot size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{totalAssistants}</div>
            <div className="text-[11px] text-emerald-700 font-medium mt-0.5 truncate">
              {currentAssistant ? `${currentAssistant.name} (Active)` : '0 Active Assistants'}
            </div>
          </div>
          <div className="text-[10px] text-slate-500 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span>Voice: <strong className="text-slate-800">{currentAssistant?.voice || 'None'}</strong></span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${currentAssistant ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {currentAssistant ? '100% Locked' : 'No Agent'}
            </span>
          </div>
        </div>

        {/* Metric 2: Backend Tools */}
        <div className="bg-white border border-slate-200 border-t-4 border-t-amber-500 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-3 hover:shadow-md transition-all">
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>Action Tools</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Wrench size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{totalTools}</div>
            <div className="text-[11px] text-amber-700 font-medium mt-0.5">
              {totalTools === 0 ? '0 Tools Configured' : 'REST & Webhooks Bound'}
            </div>
          </div>
          <div className="text-[10px] text-slate-500 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span>Executable in Browser</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${totalTools > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
              {totalTools > 0 ? 'Ready' : 'None'}
            </span>
          </div>
        </div>

        {/* Metric 3: Indexed Knowledge */}
        <div
          onClick={() => onNavigateTab && onNavigateTab('files')}
          className="bg-white border border-slate-200 border-t-4 border-t-sky-500 rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-3 hover:shadow-md transition-all cursor-pointer group"
          title="Click to view Knowledge Base & JSON Files"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>Indexed Facts</span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Database size={16} />
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold text-slate-900">{totalFacts}</div>
            <div className="text-[11px] text-sky-700 font-medium mt-0.5">
              {totalFacts === 0 ? '0 Facts Indexed' : 'Database & UI Grounded'}
            </div>
          </div>
          <div className="text-[10px] text-slate-500 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-sky-700 font-medium group-hover:underline">Open Knowledge Base →</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
              $0 Free
            </span>
          </div>
        </div>

        {/* Metric 4: Real-Time Inference Key */}
        <div
          onClick={() => {
            if (!hasInferenceKey) {
              if (onOpenApiKeyModal) onOpenApiKeyModal();
              else if (onNavigateTab) onNavigateTab('api-keys');
            }
          }}
          className={`bg-white border rounded-2xl p-5 shadow-sm flex flex-col justify-between space-y-3 hover:shadow-md transition-all ${
            hasInferenceKey
              ? 'border-slate-200 border-t-4 border-t-rose-500'
              : 'border-amber-300 border-t-4 border-t-amber-500 cursor-pointer bg-amber-50/20'
          }`}
          title={!hasInferenceKey ? "Click to configure your personal API key" : "Inference Engine Active"}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold uppercase tracking-wider">
            <span>Inference Engine</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${hasInferenceKey ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
              <Zap size={16} />
            </div>
          </div>
          <div>
            <div className={`text-2xl font-bold ${hasInferenceKey ? 'text-rose-600' : 'text-amber-600'}`}>
              {hasInferenceKey ? activeEngineName : 'No API Key Set'}
            </div>
            <div className="text-[11px] text-slate-600 font-medium mt-0.5">
              {hasInferenceKey ? 'Verified User Key · <200ms' : 'Click to Configure BYOK'}
            </div>
          </div>
          <div className="text-[10px] text-slate-500 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span>{hasInferenceKey ? 'Client Embed' : 'Action Required'}</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                hasInferenceKey
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              {hasInferenceKey ? 'Connected' : 'Setup BYOK →'}
            </span>
          </div>
        </div>

      </div>

      {/* 3. Active Assistant Spotlight Card or Clean Empty State */}
      {currentAssistant ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shadow-xs">
                <Bot size={24} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-slate-900">{currentAssistant.name}</h3>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold font-mono">
                    ACTIVE AGENT
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {currentAssistant.role || 'AI Help Desk Assistant'} · Locked Voice: <strong className="text-indigo-600 font-semibold">{currentAssistant.voice || 'Clara'}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenEmbedModal}
                className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-600 hover:to-indigo-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                title="Get 1-line client embed script tag"
              >
                <Code2 size={13} />
                <span>Embed Code</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const key = currentAssistant?.apiKey || userKeys.activeKey || '';
                  const activeVoice = encodeURIComponent(currentAssistant?.voice || 'Adam');
                  window.open(`/demo-client-site.html?agent=${currentAssistant?.id}${key ? `&key=${encodeURIComponent(key)}` : ''}&voice=${activeVoice}`, '_blank');
                }}
                className="h-9 px-3.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                title="Test on Demo Website"
              >
                <ExternalLink size={13} className="text-slate-500" />
                <span>Test Demo Page</span>
              </button>
            </div>
          </div>

          {/* Agent Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
            <div className="bg-indigo-50/40 border border-indigo-100 rounded-xl p-4 space-y-1">
              <div className="text-indigo-900 font-semibold text-[11px] uppercase tracking-wider">System Prompt & Persona</div>
              <div className="text-slate-700 line-clamp-2 text-[11px] leading-relaxed">
                {currentAssistant.prompt || 'You are a helpful voice assistant.'}
              </div>
            </div>
            <div className="bg-emerald-50/40 border border-emerald-100 rounded-xl p-4 space-y-1">
              <div className="text-emerald-900 font-semibold text-[11px] uppercase tracking-wider">Autonomous Speech Architecture</div>
              <div className="text-emerald-700 font-semibold text-[11px]">
                Browser Web Speech STT + SpeechSynthesis TTS
              </div>
              <div className="text-slate-500 text-[10px]">$0.00 / Free tier · Zero API keys for clients</div>
            </div>
            <div className="bg-sky-50/40 border border-sky-100 rounded-xl p-4 space-y-1">
              <div className="text-sky-900 font-semibold text-[11px] uppercase tracking-wider">Deployment Architecture</div>
              <div className="text-sky-700 font-semibold text-[11px]">
                Standalone Embed Script Tag
              </div>
              <div className="text-slate-500 text-[10px]">Embedded client widget with local STT/TTS</div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 mt-5 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigateTab('assistants')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer transition-colors"
            >
              <span>Open in Assistant Builder</span>
              <ChevronRight size={13} />
            </button>
            <button
              type="button"
              onClick={onLaunchTestWidget}
              className="px-3 py-1.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <AudioWaveform size={13} />
              <span>Launch Floating Voice Orb</span>
            </button>
          </div>
        </div>
      ) : (
        /* Empty State Card when 0 Assistants Exist */
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 mx-auto shadow-xs">
            <Bot size={28} />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">No Voice Assistants Created Yet</h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              Your workspace is completely clean. You can create your first custom AI voice agent using the Composer (upload your frontend, backend, or database files) or design one in the Assistant Builder.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => onNavigateTab('composer')}
              className="h-9 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Sparkles size={13} />
              <span>Synthesize with AI Composer</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateTab('assistants')}
              className="h-9 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-semibold text-xs flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <Bot size={13} />
              <span>Open Assistant Builder</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. Quick Workflow Navigation Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-slate-500 tracking-wider uppercase">
          Workspace Navigation
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          
          <div
            onClick={() => onNavigateTab('composer')}
            className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer space-y-2 group shadow-sm"
          >
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Sparkles size={16} />
            </div>
            <div className="text-sm font-semibold text-slate-900">AI Composer</div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Upload files and prompt the AI to synthesize custom voice agents.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab('assistants')}
            className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-violet-300 hover:shadow-md transition-all cursor-pointer space-y-2 group shadow-sm"
          >
            <div className="w-8 h-8 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Bot size={16} />
            </div>
            <div className="text-sm font-semibold text-slate-900">Assistant Builder</div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Fine-tune system prompts, model presets, and persona voices.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab('files')}
            className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-sky-300 hover:shadow-md transition-all cursor-pointer space-y-2 group shadow-sm"
          >
            <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <HardDrive size={16} />
            </div>
            <div className="text-sm font-semibold text-slate-900">Knowledge Base (JSON)</div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Upload JSON databases, FAQs, and files to index grounding facts.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab('voice-library')}
            className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer space-y-2 group shadow-sm"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Volume2 size={16} />
            </div>
            <div className="text-sm font-semibold text-slate-900">Voice Library</div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Audition and configure deterministic locked voice profiles.
            </p>
          </div>

          <div
            onClick={() => onNavigateTab('tools')}
            className="p-4 rounded-2xl bg-white border border-slate-200 hover:border-amber-300 hover:shadow-md transition-all cursor-pointer space-y-2 group shadow-sm"
          >
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Wrench size={16} />
            </div>
            <div className="text-sm font-semibold text-slate-900">Custom Tools</div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Inspect backend API routes, webhooks, and client actions.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}
