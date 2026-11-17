import React, { useState, useEffect } from 'react';
import {
  AudioWaveform,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Download,
  Play,
  FileText,
  User,
  Bot,
  Folder,
  FolderOpen,
  Trash2,
  Layers,
  ChevronRight,
  Filter,
  Volume2,
  MessageSquare,
  Users,
  Activity,
  BookOpen,
  Database,
  Cpu,
  ShieldCheck
} from 'lucide-react';
import {
  getConversations,
  saveConversationSession,
  clearAgentConversations,
  getUserInfoList,
  getAgentInfo
} from '../firebase';

export default function LiveLogsView({ assistants = [], activeAgentId, onSelectAgent }) {
  const [logs, setLogs] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [agentInfoData, setAgentInfoData] = useState(null);
  const [activeTab, setActiveTab] = useState('conversations'); // 'conversations' | 'users' | 'agent_info'
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState(activeAgentId || 'all');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'Resolved' | 'Voice Call'
  const [selectedLog, setSelectedLog] = useState(null);

  // Sync selectedFolderId with activeAgentId when it changes externally
  useEffect(() => {
    if (activeAgentId) {
      setSelectedFolderId(activeAgentId);
    }
  }, [activeAgentId]);

  // Fetch conversations, user_info, and agent_info for the selected agent folder or all folders
  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const [data, users] = await Promise.all([
        getConversations(selectedFolderId || 'all'),
        getUserInfoList()
      ]);
      setLogs(data || []);
      setUsersList(users || []);

      const targetAgentId = selectedFolderId !== 'all'
        ? selectedFolderId
        : (assistants[0]?.name || assistants[0]?.id || 'test');
      if (targetAgentId) {
        const info = await getAgentInfo(targetAgentId);
        setAgentInfoData(info);
      }
    } catch (e) {
      console.warn("Could not fetch logs or collection info:", e);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedFolderId]);

  const activeAssistant = assistants.find(a => a.id === selectedFolderId) || null;

  // Handle generating a realistic simulated conversation in the current agent folder
  const handleSimulateCall = async () => {
    const targetAgentId = selectedFolderId !== 'all' ? selectedFolderId : (assistants[0]?.name || assistants[0]?.id || 'Voice Assistant');
    const targetAgent = assistants.find(a => (a.id === targetAgentId || a.name === targetAgentId)) || { name: targetAgentId };
    const agentTitle = (targetAgent.name || targetAgentId).trim().replace(/\//g, '-');

    const sampleInquiries = [
      {
        q: `What products and models are offered?`,
        a: `We offer a full line of high-performance products including custom configurations, full warranty packages, and 24/7 dedicated support.`,
        summary: `Visitor asked about products and catalog availability`
      },
      {
        q: `How do I integrate this voice agent on my website?`,
        a: `Simply copy our 1-line script tag with your API key and paste it before the closing body tag on your website.`,
        summary: `Visitor inquired about embed script and API key setup`
      },
      {
        q: `What is the warranty and return policy?`,
        a: `All our offerings come with a comprehensive 3-year guarantee and 30-day money-back satisfaction assurance.`,
        summary: `Visitor asked about warranty terms and return policies`
      }
    ];

    const pick = sampleInquiries[Math.floor(Math.random() * sampleInquiries.length)];
    const visitorNum = Math.floor(1000 + Math.random() * 9000);

    const newSession = {
      id: `${agentTitle} Session #${Date.now().toString().slice(-4)}`,
      agentId: agentTitle,
      agentName: agentTitle,
      caller: `Website Visitor #${visitorNum}`,
      duration: `${Math.floor(25 + Math.random() * 45)}s`,
      status: 'Resolved',
      summary: pick.summary,
      timestamp: 'Just now',
      createdAt: new Date().toISOString(),
      messages: [
        { role: 'agent', text: targetAgent.greeting || `Hello! Welcome to our website. How can I help you today?`, timestamp: '00:01' },
        { role: 'user', text: pick.q, timestamp: '00:08' },
        { role: 'agent', text: pick.a, timestamp: '00:14' },
        { role: 'user', text: 'Thank you, that answers my question perfectly.', timestamp: '00:22' },
        { role: 'agent', text: 'You are very welcome! Have a fantastic day.', timestamp: '00:26' }
      ]
    };

    await saveConversationSession(newSession);
    await fetchLogs();
  };

  // Clear logs for the currently selected folder
  const handleClearFolder = async () => {
    if (!window.confirm(`Are you sure you want to clear logs for "${activeAssistant?.name || 'this folder'}"?`)) {
      return;
    }
    await clearAgentConversations(selectedFolderId);
    setLogs([]);
  };

  // Export logs in JSON format
  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `${(activeAssistant?.name || 'agent').toLowerCase().replace(/\s+/g, '_')}_logs.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
  };

  // Filter logs by search keyword and status
  const filteredLogs = logs.filter(l => {
    const matchSearch =
      (l.caller && l.caller.toLowerCase().includes(search.toLowerCase())) ||
      (l.summary && l.summary.toLowerCase().includes(search.toLowerCase())) ||
      (l.messages && l.messages.some(m => m.text?.toLowerCase().includes(search.toLowerCase())));

    const matchStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Filter user_info records by agent folder and search keyword
  const filteredUsers = usersList.filter(u => {
    const agentMatch = selectedFolderId === 'all' ||
      (u.agentId && u.agentId.toLowerCase() === selectedFolderId.toLowerCase()) ||
      (u.agentName && u.agentName.toLowerCase() === selectedFolderId.toLowerCase());
    const searchMatch = !search ||
      (u.visitorId && u.visitorId.toLowerCase().includes(search.toLowerCase())) ||
      (u.caller && u.caller.toLowerCase().includes(search.toLowerCase())) ||
      (u.name && u.name.toLowerCase().includes(search.toLowerCase())) ||
      (u.lastInquiryTopic && u.lastInquiryTopic.toLowerCase().includes(search.toLowerCase())) ||
      (u.lastUserMessage && u.lastUserMessage.toLowerCase().includes(search.toLowerCase()));
    return agentMatch && searchMatch;
  });

  return (
    <div className="flex-1 flex min-w-0 h-full overflow-hidden bg-[#F8FAFC]">
      
      {/* ========================================================
          LEFT COLUMN: AGENT FOLDERS SIDEBAR
         ======================================================== */}
      <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 select-none shadow-2xs">
        {/* Sidebar Header */}
        <div className="h-[56px] px-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Folder size={16} className="text-indigo-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Agent Folders</span>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold font-mono border border-indigo-200">
            {assistants.length} Agents
          </span>
        </div>

        {/* Folders List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {/* Global / All Agents Folder */}
          <button
            type="button"
            onClick={() => setSelectedFolderId('all')}
            className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
              selectedFolderId === 'all'
                ? 'bg-indigo-50 border border-indigo-300 text-indigo-900 shadow-2xs font-semibold'
                : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {selectedFolderId === 'all' ? (
                <FolderOpen size={16} className="text-indigo-600 shrink-0" />
              ) : (
                <Folder size={16} className="text-slate-400 shrink-0" />
              )}
              <div className="min-w-0 truncate">
                <div className="text-xs font-semibold truncate">All Conversations</div>
                <div className="text-[10px] text-slate-500">Global workspace log</div>
              </div>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono font-medium">
              {logs.length}
            </span>
          </button>

          <div className="pt-3 pb-1 px-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Specific Agent Folders
            </span>
          </div>

          {/* Individual Assistant Folders */}
          {assistants.map((ast) => {
            const isSelected = selectedFolderId === ast.id;
            return (
              <button
                key={ast.id}
                type="button"
                onClick={() => {
                  setSelectedFolderId(ast.id);
                  if (onSelectAgent) onSelectAgent(ast.id);
                }}
                className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-300 text-indigo-950 shadow-2xs font-semibold'
                    : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isSelected ? (
                    <FolderOpen size={16} className="text-indigo-600 shrink-0" />
                  ) : (
                    <Folder size={16} className="text-violet-500 shrink-0" />
                  )}
                  <div className="min-w-0 truncate">
                    <div className="text-xs font-semibold truncate flex items-center gap-1.5 text-slate-900">
                      <span>{ast.name}</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {ast.voice || 'Clara'} · {ast.model ? 'Groq LPU' : 'Free Tier'}
                    </div>
                  </div>
                </div>
                <ChevronRight size={13} className={`shrink-0 transition-transform ${isSelected ? 'rotate-90 text-indigo-600' : 'text-slate-400'}`} />
              </button>
            );
          })}
        </div>
      </aside>

      {/* ========================================================
          RIGHT COLUMN: CONVERSATION SESSIONS IN SELECTED FOLDER
         ======================================================== */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-transparent">
        
        {/* Top Header */}
        <div className="h-[56px] px-6 flex items-center justify-between border-b border-slate-200 bg-white shrink-0 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xs font-mono font-bold text-indigo-700">📁 / {activeAssistant?.name || 'All Conversations'}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-mono hidden md:inline">
              Firestore Doc: conversations/{activeAssistant?.name || 'all'}
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">
              (Single overall conversation document)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchLogs}
              disabled={isLoading}
              className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="Refresh logs from Firestore"
            >
              <RefreshCw size={12} className={`text-indigo-600 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              disabled={logs.length === 0}
              className="h-8 px-2.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-xs font-medium text-slate-700 hover:text-slate-900 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="Export folder logs as JSON"
            >
              <Download size={12} className="text-slate-500" />
              <span className="hidden sm:inline">Export</span>
            </button>

            <button
              type="button"
              onClick={handleClearFolder}
              disabled={logs.length === 0}
              className="h-8 px-2.5 rounded-lg bg-white hover:bg-rose-50 border border-slate-300 text-xs font-medium text-slate-700 hover:text-rose-700 flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              title="Clear logs in this folder"
            >
              <Trash2 size={12} />
              <span className="hidden sm:inline">Clear</span>
            </button>

            <button
              type="button"
              onClick={handleSimulateCall}
              className="h-8 px-3.5 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
              title="Generate a realistic test conversation in this agent folder"
            >
              <Play size={12} fill="currentColor" />
              <span>Simulate Conversation</span>
            </button>
          </div>
        </div>

        {/* Firestore Collection Views Tab Switcher */}
        <div className="px-6 py-2 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-1.5 bg-slate-200/70 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('conversations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'conversations'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare size={13} className={activeTab === 'conversations' ? 'text-indigo-600' : 'text-slate-400'} />
              <span>Conversations ({logs.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'users'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users size={13} className={activeTab === 'users' ? 'text-indigo-600' : 'text-slate-400'} />
              <span>Visitor Info ({filteredUsers.length})</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-600 font-mono font-semibold">user_info</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('agent_info')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'agent_info'
                  ? 'bg-white text-indigo-700 shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bot size={13} className={activeTab === 'agent_info' ? 'text-indigo-600' : 'text-slate-400'} />
              <span>Agent Profile</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-600 font-mono font-semibold">agent_info</span>
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-500 hidden sm:flex items-center gap-2">
            <span>Active Collection:</span>
            <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-800 font-bold">
              {activeTab === 'conversations' ? `conversations/${activeAssistant?.name || selectedFolderId}` : (activeTab === 'users' ? 'user_info' : `agent_info/${activeAssistant?.name || selectedFolderId}`)}
            </span>
          </div>
        </div>

        {/* Tab 1: Conversations View */}
        {activeTab === 'conversations' && (
          <>
            {/* Search & Filter Bar */}
            <div className="px-6 py-3 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0 bg-white flex-wrap">
              <div className="flex-1 min-w-[220px] max-w-md h-[36px] px-3 rounded-lg bg-slate-50 border border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/10 flex items-center gap-2 text-xs">
                <Search size={14} className="text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search conversations by visitor, inquiry, or transcript..."
                  className="w-full bg-transparent text-slate-800 placeholder-slate-400 focus:outline-none text-xs"
                />
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-500 text-[11px] mr-1 hidden sm:inline font-semibold">Filter:</span>
                {['all', 'Resolved', 'Voice Call'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                      statusFilter === st
                        ? 'bg-indigo-50 border border-indigo-300 text-indigo-700'
                        : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    {st === 'all' ? 'All' : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Logs List Container */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {filteredLogs.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500 border-2 border-dashed border-slate-200 bg-white rounded-2xl p-6 shadow-sm">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3">
                    <FolderOpen size={24} />
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    Folder is empty for "{activeAssistant?.name || 'this agent'}"
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                    When visitors chat or speak to this agent on your website or in the test desk, session logs will be stored here.
                  </p>
                  <button
                    type="button"
                    onClick={handleSimulateCall}
                    className="mt-3 px-3.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                  >
                    <Play size={12} fill="currentColor" />
                    <span>Simulate a Call for this Folder</span>
                  </button>
                </div>
              ) : (
                filteredLogs.map((log, idx) => {
                  const isOverallDoc = log.title?.includes('Overall Conversation') || !!log.overallConversation;
                  return (
                    <div
                      key={log.id || idx}
                      onClick={() => setSelectedLog(log)}
                      className={`p-4 rounded-xl border flex items-center justify-between gap-4 cursor-pointer transition-all shadow-sm group ${
                        isOverallDoc
                          ? 'bg-indigo-50/40 border-indigo-200 hover:border-indigo-400 hover:shadow-md'
                          : 'bg-white hover:bg-slate-50/80 border-slate-200 hover:border-indigo-300 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform ${
                          isOverallDoc
                            ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                            : 'bg-slate-50 border-slate-200 text-slate-600'
                        }`}>
                          <AudioWaveform size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{log.caller || log.title || 'Overall Conversation'}</span>
                            </span>
                            {isOverallDoc && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-800 font-mono font-semibold">
                                ⭐ Overall Conversation (1 Agent)
                              </span>
                            )}
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-semibold">
                              {log.status || 'Resolved'}
                            </span>
                            {log.agentName && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 font-mono font-semibold hidden md:inline">
                                {log.agentName}
                              </span>
                            )}
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-bold">
                              &lt;200ms
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 truncate mt-1">
                            {log.lastMessage || log.summary || (log.messages && log.messages[0]?.text) || 'Voice dialogue inquiry'}
                          </p>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap font-medium">
                            <span>Turns: <strong className="text-slate-700 font-mono">{log.totalMessages || log.messages?.length || 0}</strong></span>
                            <span>•</span>
                            <span className="text-slate-500 font-mono">Firestore: conversations/{log.agentName || activeAssistant?.name || log.id}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-xs font-mono text-slate-500 shrink-0">
                        <span className="px-2.5 py-1 rounded bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-semibold">
                          ⏱ {log.duration || '30s'}
                        </span>
                        <span className="text-slate-400 text-[11px] hidden sm:inline">
                          {log.timestamp || 'Today'}
                        </span>
                        <span className="text-indigo-600 group-hover:translate-x-1 transition-transform font-bold">
                          →
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* Tab 2: Visitor Info (user_info collection) */}
        {activeTab === 'users' && (
          <>
            {/* Search for users */}
            <div className="px-6 py-3 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0 bg-white flex-wrap">
              <div className="flex-1 min-w-[220px] max-w-md h-[36px] px-3 rounded-lg bg-slate-50 border border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/10 flex items-center gap-2 text-xs">
                <Search size={14} className="text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search visitors by ID, topic, question, or agent..."
                  className="w-full bg-transparent text-slate-800 placeholder-slate-400 focus:outline-none text-xs"
                />
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                <span>Showing <strong className="text-slate-800">{filteredUsers.length}</strong> visitor profiles in <span className="font-semibold text-indigo-600">user_info</span></span>
              </div>
            </div>

            {/* Users List Container */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {filteredUsers.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500 border-2 border-dashed border-slate-200 bg-white rounded-2xl p-6 shadow-sm">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-3">
                    <Users size={24} />
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    No visitor profiles found for "{selectedFolderId === 'all' ? 'All Agents' : (activeAssistant?.name || selectedFolderId)}"
                  </p>
                  <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                    As visitors interact with your embedded assistant or test desk, their profiles, questions, and inquiry topics are automatically logged into the Firestore <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-indigo-600">user_info</code> collection.
                  </p>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <div
                    key={user.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0 font-bold text-sm shadow-2xs">
                          <User size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900">
                              {user.visitorId || user.caller || user.name || 'Website Visitor'}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold font-mono">
                              {user.leadStatus || 'Active Inquiry'}
                            </span>
                            {user.agentName && (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono">
                                Agent: {user.agentName}
                              </span>
                            )}
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-mono">
                              {user.userType || 'website_visitor'}
                            </span>
                          </div>

                          {user.lastInquiryTopic && (
                            <div className="mt-1 text-xs text-slate-700 font-medium">
                              <span className="text-slate-400 font-normal">Topic: </span>
                              <span className="text-slate-800">{user.lastInquiryTopic}</span>
                            </div>
                          )}

                          {(user.lastUserMessage || user.lastAgentReply) && (
                            <div className="mt-2 text-xs text-slate-600 bg-slate-50/80 rounded-xl p-3 border border-slate-200 space-y-1">
                              {user.lastUserMessage && (
                                <div className="flex items-start gap-1.5">
                                  <span className="text-violet-600 font-semibold text-[11px] shrink-0">User:</span>
                                  <span className="text-slate-800 italic">"{user.lastUserMessage}"</span>
                                </div>
                              )}
                              {user.lastAgentReply && (
                                <div className="flex items-start gap-1.5">
                                  <span className="text-indigo-600 font-semibold text-[11px] shrink-0">Agent:</span>
                                  <span className="text-slate-700">"{user.lastAgentReply}"</span>
                                </div>
                              )}
                            </div>
                          )}

                          <div className="mt-2.5 text-[10px] text-slate-400 flex items-center gap-3 flex-wrap font-mono">
                            <span>Messages Sent: <strong className="text-slate-700">{user.totalMessagesSent || 0}</strong></span>
                            <span>•</span>
                            <span>Duration: <strong className="text-slate-700">{user.sessionDuration || 'N/A'}</strong></span>
                            <span>•</span>
                            <span className="text-indigo-500">user_info/{user.id}</span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className="text-[10px] font-mono text-slate-400 block">
                          {user.lastActiveAt ? 'Active Recently' : 'Recorded'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Tab 3: Agent Info (agent_info collection) */}
        {activeTab === 'agent_info' && (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Live Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                  <span>Operational Status</span>
                  <Activity size={14} className="text-emerald-500" />
                </div>
                <div className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>{agentInfoData?.status || 'Active'}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-1">Collection: agent_info</div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                  <span>Knowledge Base FAQs</span>
                  <BookOpen size={14} className="text-indigo-500" />
                </div>
                <div className="text-lg font-bold text-slate-900">
                  {agentInfoData?.totalKnowledgeEntries ?? (activeAssistant?.knowledgeBase?.length || 0)} Entries
                </div>
                <div className="text-[10px] text-emerald-600 font-semibold mt-1">100% Customer-Safe</div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                  <span>Live Catalog Records</span>
                  <Database size={14} className="text-violet-500" />
                </div>
                <div className="text-lg font-bold text-slate-900">
                  {agentInfoData?.totalDatabaseRecords ?? (activeAssistant?.databaseRecords?.length || 0)} Items
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-1">Grounded Bridge Ready</div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs">
                <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
                  <span>Total Dialogue Turns</span>
                  <Cpu size={14} className="text-amber-500" />
                </div>
                <div className="text-lg font-bold text-slate-900">
                  {agentInfoData?.totalMessagesHandled || logs.reduce((acc, l) => acc + (l.messages?.length || 0), 0)} Turns
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-1">Across {logs.length} sessions</div>
              </div>
            </div>

            {/* Agent Profile Details Card */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Bot size={18} className="text-indigo-600" />
                    <span>{agentInfoData?.name || activeAssistant?.name || selectedFolderId}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {agentInfoData?.title || activeAssistant?.role || 'Autonomous Live Customer Assistant'} · Voice: <strong>{agentInfoData?.voice || activeAssistant?.voice || 'Clara'}</strong> · Model: <strong>{agentInfoData?.model || activeAssistant?.model || 'Groq Qwen 27B (<200ms Free)'}</strong>
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 font-mono font-semibold border border-indigo-200">
                  agent_info/{agentInfoData?.id || activeAssistant?.id || selectedFolderId}
                </span>
              </div>

              {/* First Message Greeting */}
              <div>
                <span className="text-xs font-semibold text-slate-700 block mb-1">Default Opening Greeting</span>
                <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  "{agentInfoData?.greeting || agentInfoData?.firstMessage || activeAssistant?.firstMessage || activeAssistant?.greeting || 'Hello! Welcome to our website. How can I assist you with our catalog, services, or inquiries today?'}"
                </p>
              </div>

              {/* System Prompt */}
              <div>
                <span className="text-xs font-semibold text-slate-700 block mb-1">Customer System Prompt</span>
                <pre className="text-[11px] font-mono text-slate-700 bg-slate-50 p-4 rounded-xl border border-slate-200 max-h-56 overflow-y-auto whitespace-pre-wrap">
                  {agentInfoData?.prompt || agentInfoData?.systemPrompt || activeAssistant?.prompt || 'System prompt loaded.'}
                </pre>
              </div>

              {/* Linked Collections Map */}
              <div className="pt-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">Firestore Collections Overview</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between">
                    <span className="font-mono text-slate-600">📁 agents/{agentInfoData?.id || 'test'}</span>
                    <span className="text-[10px] text-emerald-600 font-semibold font-mono">Master Config</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between">
                    <span className="font-mono text-slate-600">📁 agent_info/{agentInfoData?.id || 'test'}</span>
                    <span className="text-[10px] text-indigo-600 font-semibold font-mono">Status & Metrics</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between">
                    <span className="font-mono text-slate-600">📁 user_info/</span>
                    <span className="text-[10px] text-violet-600 font-semibold font-mono">{usersList.length} Visitors</span>
                  </div>
                  <div className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/50 flex items-center justify-between">
                    <span className="font-mono text-slate-600">📁 conversations/{agentInfoData?.id || 'test'}</span>
                    <span className="text-[10px] text-amber-600 font-semibold font-mono">{logs.length} Sessions</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* ========================================================
          TRANSCRIPT DETAIL MODAL
         ======================================================== */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 flex flex-col max-h-[88vh] space-y-4 text-slate-900">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText size={18} className="text-indigo-600" />
                  <span>Conversation Session Transcript</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Folder: <span className="text-indigo-600 font-semibold">{selectedLog.agentName || 'Voice Agent'}</span> · {selectedLog.caller} · Duration: {selectedLog.duration}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Turn-by-Turn Chat Bubble Stream */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {(selectedLog.messages || []).map((msg, i) => (
                <div
                  key={i}
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed max-w-[90%] shadow-2xs ${
                    msg.role === 'agent'
                      ? 'bg-slate-50 text-slate-800 border border-slate-200 mr-auto'
                      : 'bg-indigo-50 text-indigo-900 border border-indigo-200 ml-auto'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1 text-[10px] font-semibold">
                    <span className={msg.role === 'agent' ? 'text-indigo-700 flex items-center gap-1 font-bold' : 'text-violet-700 flex items-center gap-1 font-bold'}>
                      {msg.role === 'agent' ? <Bot size={12} /> : <User size={12} />}
                      {msg.role === 'agent' ? (selectedLog.agentName || 'AI Concierge') : 'Website Visitor'}
                    </span>
                    <span className="text-slate-400 font-mono">{msg.timestamp || ''}</span>
                  </div>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] font-mono text-emerald-700 font-semibold flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-emerald-600" />
                <span>Session Saved in Agent Folder</span>
              </span>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Transcript
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
