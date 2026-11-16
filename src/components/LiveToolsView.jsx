import React, { useState } from 'react';
import {
  Wrench,
  Plus,
  Play,
  Trash2,
  CheckCircle2,
  Code2,
  ExternalLink,
  Search,
  Sparkles,
  Server
} from 'lucide-react';

export default function LiveToolsView({
  tools: externalTools,
  setTools: setExternalTools,
  currentAssistant,
  assistantsList = [],
  onSelectAssistant
}) {
  const [internalTools, setInternalTools] = useState([]);

  const tools = externalTools || internalTools;
  const setTools = setExternalTools || setInternalTools;

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newToolName, setNewToolName] = useState('');
  const [newToolDesc, setNewToolDesc] = useState('');
  const [newToolType, setNewToolType] = useState('API Request Tool');
  const [newToolEndpoint, setNewToolEndpoint] = useState('');
  const [activeTestTool, setActiveTestTool] = useState(null);
  const [testResult, setTestResult] = useState('');
  const [search, setSearch] = useState('');

  const handleCreate = () => {
    if (!newToolName.trim()) return;
    const newTool = {
      id: `tool_${Date.now()}`,
      name: newToolName.trim().replace(/\s+/g, ''),
      type: newToolType,
      description: newToolDesc.trim() || 'Custom automated function tool.',
      endpoint: newToolEndpoint.trim() || 'https://api.example.com/action',
      method: 'POST',
      runs: 0
    };
    setTools(prev => [newTool, ...(prev || [])]);
    setIsCreateOpen(false);
    setNewToolName('');
    setNewToolDesc('');
    setNewToolEndpoint('');
  };

  const handleTestRun = (tool) => {
    setActiveTestTool(tool);
    setTestResult('Running simulation...');
    setTimeout(() => {
      const lower = tool.name.toLowerCase();
      if (lower.includes('stock') || lower.includes('inventory')) {
        setTestResult(JSON.stringify({
          status: "success",
          product: "Augmentin 625 Duo Tablet",
          inStock: true,
          currentStock: 42,
          unit: "strips",
          price: "₹185.50",
          rxRequired: true,
          liveStoreLocation: "Apollo & Wellness Pharmacy (Shelf B-12)"
        }, null, 2));
      } else if (lower.includes('order')) {
        setTestResult(JSON.stringify({ status: "success", orderId: "ORD-9921", deliveryStatus: "Out for delivery", estDelivery: "Today by 5:00 PM" }, null, 2));
      } else if (lower.includes('ticket')) {
        setTestResult(JSON.stringify({ status: "success", ticketId: "TCK-88124", assignedTo: "Tier-2 Human Escalation Queue" }, null, 2));
      } else {
        setTestResult(JSON.stringify({ status: "success", executed: tool.name, clientActionDispatched: true, timestamp: new Date().toISOString() }, null, 2));
      }
    }, 600);
  };

  const handleDelete = (id) => {
    setTools(prev => (prev || []).filter(t => t.id !== id));
  };

  const filteredTools = (tools || []).filter(t => 
    t.name.toLowerCase().includes(search.toLowerCase()) || 
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#F8FAFC]">
      {/* Top Header */}
      <div className="h-[56px] px-6 flex items-center justify-between border-b border-slate-200 bg-white shrink-0 shadow-2xs">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-900">Custom Tools & Actions</span>
          {currentAssistant ? (
            <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full font-semibold flex items-center gap-1.5">
              <span>Configured for:</span>
              <strong className="text-slate-900 font-bold">{currentAssistant.name}</strong>
              <span className="text-[10px] text-amber-600 font-mono">({tools.length} tools)</span>
            </span>
          ) : (
            <span className="text-xs text-slate-500 font-medium ml-2">({tools.length} active tools)</span>
          )}

          {assistantsList.length > 1 && onSelectAssistant && (
            <select
              value={currentAssistant?.id || ''}
              onChange={(e) => onSelectAssistant(e.target.value)}
              className="h-8 px-2.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 cursor-pointer"
              title="Switch assistant to configure tools"
            >
              {assistantsList.map(a => (
                <option key={a.id} value={a.id}>
                  Assistant: {a.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const stockTool = {
                id: `tool_${Date.now()}`,
                name: 'checkLiveStock',
                type: 'API Request Tool',
                description: 'Queries the live website database to fetch real-time available stock count, price, and prescription requirements for medicines/products.',
                endpoint: '/api/inventory/stock',
                method: 'POST',
                runs: 0
              };
              setTools(prev => [stockTool, ...(prev || [])]);
            }}
            className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            title="Add pre-configured real-time stock lookup tool"
          >
            <Server size={13} className="text-sky-600" />
            <span>+ Live Stock Tool</span>
          </button>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
          >
            <Plus size={14} />
            <span>Create Tool</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="px-6 py-3 border-b border-slate-200 flex items-center gap-3 shrink-0 bg-white">
        <div className="flex-1 h-[36px] px-3 rounded-lg bg-slate-50 border border-slate-300 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/10 flex items-center gap-2 text-xs">
          <Search size={14} className="text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools by function name or description..."
            className="w-full bg-transparent text-slate-800 placeholder-slate-400 focus:outline-none text-xs"
          />
        </div>
      </div>

      {/* Tools Grid */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3.5">
        {filteredTools.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500 border-2 border-dashed border-slate-200 bg-white rounded-2xl p-6 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 mb-3">
              <Wrench size={24} />
            </div>
            <p className="text-sm font-bold text-slate-800">No Custom Tools Configured</p>
            <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
              Upload backend API files in Composer to automatically extract endpoints, or click "+ Create Tool" to configure a custom webhook or action.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {filteredTools.map((t) => {
              const isApi = t.type === 'API Request Tool';
              const isWebhook = t.type === 'Webhook Tool';
              const typeBadge = isApi
                ? 'bg-sky-50 text-sky-700 border-sky-200'
                : isWebhook
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-violet-50 text-violet-700 border-violet-200';

              return (
                <div
                  key={t.id}
                  className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-sm font-bold text-indigo-700">
                        {t.name}()
                      </span>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-mono font-semibold ${typeBadge}`}>
                        {t.type}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono font-semibold bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {t.method}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{t.description}</p>
                    <code className="text-[11px] text-slate-500 font-mono block truncate bg-slate-50 border border-slate-200 px-2 py-1 rounded max-w-xl">
                      {t.endpoint}
                    </code>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button
                      onClick={() => handleTestRun(t)}
                      className="h-8 px-3 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                    >
                      <Play size={11} fill="currentColor" />
                      <span>Test Run</span>
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="h-8 w-8 rounded-lg bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-300 flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                      title="Delete tool"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Tool Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 space-y-4 text-slate-900">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Wrench size={16} className="text-indigo-600" />
                <span>Create New Function Tool</span>
              </h3>
              <button onClick={() => setIsCreateOpen(false)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer">✕</button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Function Name</label>
              <input
                type="text"
                value={newToolName}
                onChange={(e) => setNewToolName(e.target.value)}
                placeholder="e.g. checkSubscription, refundOrder"
                className="w-full h-9 px-3 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 font-mono shadow-2xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Tool Type</label>
              <select
                value={newToolType}
                onChange={(e) => setNewToolType(e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-white border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 shadow-2xs cursor-pointer"
              >
                <option>API Request Tool</option>
                <option>Webhook Tool</option>
                <option>Client-Side Action</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Endpoint URL</label>
              <input
                type="text"
                value={newToolEndpoint}
                onChange={(e) => setNewToolEndpoint(e.target.value)}
                placeholder="https://api.yourwebsite.com/action"
                className="w-full h-9 px-3 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 font-mono shadow-2xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Description</label>
              <textarea
                rows={2}
                value={newToolDesc}
                onChange={(e) => setNewToolDesc(e.target.value)}
                placeholder="Explain what this tool does so the AI knows when to execute it..."
                className="w-full p-2.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 shadow-2xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsCreateOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-xs font-semibold shadow-sm shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
              >
                Save Tool
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Tool Result Modal (High-Contrast Developer Console) */}
      {activeTestTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fadeIn">
          <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-900 font-mono flex items-center gap-1.5">
                <Code2 size={14} className="text-indigo-600" />
                Executing {activeTestTool.name}()
              </span>
              <button onClick={() => setActiveTestTool(null)} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer">✕</button>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 shadow-inner">
              <pre className="text-xs font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed">
                {testResult}
              </pre>
            </div>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setActiveTestTool(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                Close Output
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
