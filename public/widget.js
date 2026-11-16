/**
 * Voice Help Desk Embeddable Widget
 * Zero-dependency, Shadow DOM isolated, Free-tier friendly Voice AI Assistant.
 * Embed on any website: <script src="https://your-domain/widget.js" data-agent-id="YOUR_AGENT_ID"></script>
 */
(function () {
  'use strict';

  // Find the script tag and extract the agent ID
  const currentScript = document.currentScript || (function () {
    const scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();

  const rawAgentId = currentScript ? (currentScript.getAttribute('data-agent-id') || currentScript.getAttribute('data-agent')) : (typeof window !== 'undefined' ? window.AI_VOICE_AGENT_ID : null);
  const agentId = (rawAgentId || 'Help Desk').trim();

  // Voice Persona detection from data-voice attribute, URL parameter (?voice=...), or global window
  const urlVoice = (typeof window !== 'undefined' && window.location && window.location.search)
    ? (new URLSearchParams(window.location.search).get('voice') || '')
    : '';
  const scriptVoice = currentScript ? (currentScript.getAttribute('data-voice') || currentScript.getAttribute('data-persona')) : '';
  const initialExplicitVoice = (scriptVoice || urlVoice || (typeof window !== 'undefined' ? window.AI_VOICE_NAME : '') || '').trim();

  // Extract human-readable clean agent name immediately (never keep random hash prefixes)
  let cleanInitialName = agentId;
  if (/^agent_[a-z0-9_]+$/i.test(cleanInitialName)) {
    cleanInitialName = cleanInitialName.replace(/^agent_/, '').replace(/_[a-z0-9]{4,6}$/, '').replace(/_/g, ' ')
      .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  cleanInitialName = cleanInitialName.replace(/\//g, '-').trim() || 'Help Desk';

  const FIREBASE_PROJECT_ID = 'ai-agent-11df2';
  const CACHE_KEY = `vhd_agent_${cleanInitialName.toLowerCase().replace(/\s+/g, '_')}`;
  const DELETED_KEY = `vhd_deleted_${cleanInitialName.toLowerCase().replace(/\s+/g, '_')}`;
  const CACHE_TTL_MS = 15 * 1000; // 15 second cache so edits reflect quickly
  let isAgentActive = false;

  // Default configuration initialized with the EXACT agent name
  let agentConfig = {
    name: cleanInitialName,
    role: 'Customer Support Assistant',
    voice: initialExplicitVoice || 'Adam',
    model: 'Groq Qwen 27B (<200ms Free)',
    greeting: `Hello! Welcome to our website. I am ${cleanInitialName}. How can I assist you with our services today?`,
    themeColor: '#6366f1',
    accentColor: '#06b6d4',
    position: 'bottom-right',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
    knowledgeBase: [
      { q: 'hours', a: 'Our support team is available 24/7 online.' },
      { q: 'contact', a: 'You can email us or submit an inquiry through our website anytime.' }
    ]
  };

  // Fetch Agent Config from Firestore REST API (with strict deletion check & verification)
  async function fetchAgentConfig() {
    try {
      // 0. Check deletion tombstone collection in Firestore
      try {
        const tombstoneRes = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/deleted_agents/${encodeURIComponent(cleanInitialName)}`);
        if (tombstoneRes.ok) {
          console.warn(`[Voice Help Desk] Agent "${cleanInitialName}" has been deleted. Voice widget is disabled.`);
          try {
            localStorage.removeItem(CACHE_KEY);
            localStorage.setItem(DELETED_KEY, 'true');
          } catch (e) {}
          const existingHost = document.getElementById('voice-helpdesk-root');
          if (existingHost) existingHost.remove();
          return false;
        }
        if (agentId !== cleanInitialName) {
          const tombstoneRes2 = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/deleted_agents/${encodeURIComponent(agentId)}`);
          if (tombstoneRes2.ok) {
            console.warn(`[Voice Help Desk] Agent "${agentId}" has been deleted. Voice widget is disabled.`);
            try {
              localStorage.removeItem(CACHE_KEY);
              localStorage.setItem(DELETED_KEY, 'true');
            } catch (e) {}
            const existingHost = document.getElementById('voice-helpdesk-root');
            if (existingHost) existingHost.remove();
            return false;
          }
        }
      } catch (tombErr) {}

      // 1. Try exact agentId
      let res = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agents/${encodeURIComponent(agentId)}`);
      
      // 2. Try clean human-readable name
      if (!res.ok && agentId !== cleanInitialName) {
        const retryRes = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agents/${encodeURIComponent(cleanInitialName)}`);
        if (retryRes.ok) res = retryRes;
      }

      // 3. Multi-strategy search across agents collection for exact matches
      if (!res.ok) {
        try {
          const listRes = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agents`);
          if (listRes.ok) {
            const listJson = await listRes.json();
            const docs = listJson.documents || [];
            const targetLower = cleanInitialName.toLowerCase();
            const targetIdLower = agentId.toLowerCase();
            const match = docs.find(d => {
              const dName = (d.fields?.name?.stringValue || '').toLowerCase().trim();
              const dId = (d.fields?.id?.stringValue || '').toLowerCase().trim();
              const docName = (d.name || '').toLowerCase();
              return dName === targetLower || dId === targetLower || dId === targetIdLower || docName.endsWith('/' + encodeURIComponent(cleanInitialName).toLowerCase()) || docName.endsWith('/' + encodeURIComponent(agentId).toLowerCase());
            });
            if (match) {
              res = { ok: true, json: async () => match };
            }
          }
        } catch (searchErr) {}
      }

      // If agent was not found in Firestore (e.g. 404), it does NOT exist or has been deleted
      if (!res || !res.ok) {
        console.warn(`[Voice Help Desk] Agent "${cleanInitialName}" (ID: ${agentId}) does not exist in the database or has been deleted. Voice widget is disabled.`);
        try {
          localStorage.removeItem(CACHE_KEY);
          localStorage.setItem(DELETED_KEY, 'true');
        } catch (e) {}
        const existingHost = document.getElementById('voice-helpdesk-root');
        if (existingHost) existingHost.remove();
        return false;
      }

      const json = await res.json();
      if (!json || !json.fields) {
        try {
          localStorage.removeItem(CACHE_KEY);
          localStorage.setItem(DELETED_KEY, 'true');
        } catch (e) {}
        const existingHost = document.getElementById('voice-helpdesk-root');
        if (existingHost) existingHost.remove();
        return false;
      }

      const fields = json.fields;
      // If agent document is marked as deleted or inactive
      if (fields.isDeleted?.booleanValue === true || fields.status?.stringValue === 'deleted' || fields.status?.stringValue === 'inactive') {
        console.warn(`[Voice Help Desk] Agent "${cleanInitialName}" is marked as deleted. Voice widget is disabled.`);
        try {
          localStorage.removeItem(CACHE_KEY);
          localStorage.setItem(DELETED_KEY, 'true');
        } catch (e) {}
        const existingHost = document.getElementById('voice-helpdesk-root');
        if (existingHost) existingHost.remove();
        return false;
      }

      const parsedData = {};
      if (fields.name) parsedData.name = fields.name.stringValue;
      if (fields.greeting) parsedData.greeting = fields.greeting.stringValue;
      if (fields.themeColor) parsedData.themeColor = fields.themeColor.stringValue;
      if (fields.accentColor) parsedData.accentColor = fields.accentColor.stringValue;
      if (fields.position) parsedData.position = fields.position.stringValue;
      if (fields.prompt) parsedData.prompt = fields.prompt.stringValue;
      if (fields.voice) parsedData.voice = fields.voice.stringValue;
      if (fields.role) parsedData.role = fields.role.stringValue;
      if (fields.model) parsedData.model = fields.model.stringValue;
      if (fields.apiKey) parsedData.apiKey = fields.apiKey.stringValue;

      if (fields.knowledgeBase && fields.knowledgeBase.arrayValue && fields.knowledgeBase.arrayValue.values) {
        parsedData.knowledgeBase = fields.knowledgeBase.arrayValue.values.map(v => {
          if (v.mapValue && v.mapValue.fields) {
            return {
              q: v.mapValue.fields.q?.stringValue || '',
              a: v.mapValue.fields.a?.stringValue || ''
            };
          }
          return null;
        }).filter(Boolean);
      }

      // Enforce agent name consistency: replace any residual persona names
      const finalAgentName = parsedData.name || cleanInitialName;
      parsedData.name = finalAgentName;
      if (parsedData.greeting) {
        parsedData.greeting = parsedData.greeting.replace(/I am (app Concierge|Site Sentinel|Help Desk AI|[A-Za-z0-9_\s]+?)(?=[.,!])/i, `I am ${finalAgentName}`);
      }
      if (parsedData.prompt) {
        parsedData.prompt = parsedData.prompt.replace(/You are (app Concierge|Site Sentinel|Help Desk AI|[A-Za-z0-9_\s]+?)(?=[,.\n])/i, `You are ${finalAgentName}`);
      }

      if (initialExplicitVoice) {
        parsedData.voice = initialExplicitVoice;
      }

      agentConfig = { ...agentConfig, ...parsedData };
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data: parsedData, timestamp: Date.now() }));
        localStorage.removeItem(DELETED_KEY);
      } catch (e) {}

      if (agentConfig.voice) {
        resolveAndLockVoice(agentConfig.voice, true);
      }

      return true;
    } catch (err) {
      console.warn('[Voice Help Desk] Could not verify remote agent config:', err);
      const isDeletedFlag = localStorage.getItem(DELETED_KEY) === 'true';
      if (isDeletedFlag) return false;
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < CACHE_TTL_MS && parsed.data) {
            agentConfig = { ...agentConfig, ...parsed.data };
            return true;
          }
        } catch (e) {}
      }
      return false;
    }
  }

  // Inject Shadow DOM Widget
  function initWidget() {
    if (!isAgentActive) return;
    if (document.getElementById('voice-helpdesk-root')) return;

    const hostEl = document.createElement('div');
    hostEl.id = 'voice-helpdesk-root';
    document.body.appendChild(hostEl);

    const shadow = hostEl.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        --primary: ${agentConfig.themeColor || '#6366f1'};
        --accent: ${agentConfig.accentColor || '#06b6d4'};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 14px;
        color: #f8fafc;
        z-index: 999999;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      .vhd-launcher {
        position: fixed;
        ${agentConfig.position === 'bottom-left' ? 'left: 24px;' : 'right: 24px;'}
        bottom: 24px;
        width: 60px;
        height: 60px;
        border-radius: 30px;
        background: linear-gradient(135deg, var(--primary), var(--accent));
        box-shadow: 0 10px 25px -5px rgba(99, 102, 241, 0.45), 0 0 15px rgba(6, 182, 212, 0.35);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease;
        border: 2px solid rgba(255, 255, 255, 0.2);
        z-index: 999999;
      }
      .vhd-launcher:hover {
        transform: scale(1.08);
        box-shadow: 0 15px 30px -5px rgba(99, 102, 241, 0.6);
      }
      .vhd-launcher svg {
        width: 28px;
        height: 28px;
        fill: white;
      }
      .vhd-panel {
        position: fixed;
        ${agentConfig.position === 'bottom-left' ? 'left: 24px;' : 'right: 24px;'}
        bottom: 96px;
        width: 380px;
        max-width: calc(100vw - 32px);
        height: 540px;
        max-height: calc(100vh - 120px);
        background: #0f172a;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6), 0 0 20px rgba(99, 102, 241, 0.2);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 999999;
        backdrop-filter: blur(16px);
      }
      .vhd-panel.open {
        display: flex;
        animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(16px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .vhd-header {
        padding: 16px;
        background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9));
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .vhd-header-info {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .vhd-avatar {
        width: 38px;
        height: 38px;
        border-radius: 19px;
        background: linear-gradient(135deg, var(--primary), var(--accent));
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.3);
      }
      .vhd-agent-title {
        font-weight: 600;
        font-size: 15px;
        color: #fff;
      }
      .vhd-agent-status {
        font-size: 11px;
        color: #10b981;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .vhd-agent-status::before {
        content: '';
        width: 6px;
        height: 6px;
        background: #10b981;
        border-radius: 50%;
        display: inline-block;
        box-shadow: 0 0 8px #10b981;
      }
      .vhd-close-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 4px;
        border-radius: 8px;
      }
      .vhd-close-btn:hover {
        color: white;
        background: rgba(255, 255, 255, 0.1);
      }
      .vhd-body {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .vhd-msg {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 14px;
        line-height: 1.45;
        font-size: 13px;
        word-break: break-word;
      }
      .vhd-msg-agent {
        background: #1e293b;
        color: #f1f5f9;
        align-self: flex-start;
        border-bottom-left-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.06);
      }
      .vhd-msg-user {
        background: linear-gradient(135deg, var(--primary), #4338ca);
        color: #fff;
        align-self: flex-end;
        border-bottom-right-radius: 4px;
      }
      .vhd-nav-pill-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        padding: 5px 12px;
        background: rgba(56, 189, 248, 0.18);
        border: 1px solid rgba(56, 189, 248, 0.4);
        color: #38bdf8;
        border-radius: 8px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .vhd-nav-pill-btn:hover {
        background: rgba(56, 189, 248, 0.32);
        border-color: #38bdf8;
        transform: translateY(-1px);
      }
      .vhd-voice-hero {
        background: radial-gradient(circle at center, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
        padding: 18px 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .vhd-orb-btn {
        width: 70px;
        height: 70px;
        border-radius: 35px;
        background: linear-gradient(135deg, var(--primary), var(--accent));
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        box-shadow: 0 0 20px rgba(99, 102, 241, 0.5);
        transition: all 0.2s ease;
      }
      .vhd-orb-btn.listening {
        animation: pulseOrb 1.5s infinite;
        background: linear-gradient(135deg, #ef4444, #f97316);
        box-shadow: 0 0 30px rgba(239, 68, 68, 0.7);
      }
      .vhd-orb-btn.speaking {
        animation: pulseSpeaking 1.2s infinite;
        background: linear-gradient(135deg, #10b981, #06b6d4);
        box-shadow: 0 0 30px rgba(16, 185, 129, 0.7);
      }
      @keyframes pulseOrb {
        0% { transform: scale(0.96); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
        70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
        100% { transform: scale(0.96); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
      }
      @keyframes pulseSpeaking {
        0% { transform: scale(0.96); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
        70% { transform: scale(1.05); box-shadow: 0 0 0 15px rgba(16, 185, 129, 0); }
        100% { transform: scale(0.96); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
      }
      .vhd-voice-label {
        margin-top: 8px;
        font-size: 11px;
        color: #94a3b8;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .vhd-footer {
        padding: 12px 16px;
        background: #0b1120;
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .vhd-input {
        flex: 1;
        background: #1e293b;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 8px 12px;
        color: white;
        font-size: 13px;
        outline: none;
      }
      .vhd-input:focus {
        border-color: var(--accent);
      }
      .vhd-send-btn {
        background: var(--primary);
        border: none;
        border-radius: 10px;
        padding: 8px 12px;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .vhd-lang-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 14px;
        background: rgba(15, 23, 42, 0.45);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        font-size: 11px;
      }
      .vhd-lang-title {
        color: #94a3b8;
        font-size: 11px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .vhd-lang-pills {
        display: flex;
        gap: 4px;
      }
      .vhd-lang-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.14);
        color: #cbd5e1;
        padding: 2px 8px;
        border-radius: 6px;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .vhd-lang-btn:hover {
        background: rgba(255, 255, 255, 0.18);
        color: #ffffff;
      }
      .vhd-lang-btn.active {
        background: linear-gradient(135deg, var(--primary), var(--accent));
        color: #ffffff;
        border-color: transparent;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      }
    `;

    const container = document.createElement('div');
    container.innerHTML = `
      <div class="vhd-launcher" id="vhd-launcher" title="Talk to Help Desk">
        <svg viewBox="0 0 24 24"><path d="M12 1a4 4 0 0 0-4 4v7a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4zm6 11a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.93V22h2v-2.07A8 8 0 0 0 20 12h-2z"/></svg>
      </div>
      <div class="vhd-panel" id="vhd-panel">
        <div class="vhd-header">
          <div class="vhd-header-info">
            <div class="vhd-avatar">${(agentConfig.name || 'AI').substring(0, 2).toUpperCase()}</div>
            <div>
              <div class="vhd-agent-title">${agentConfig.name}</div>
              <div class="vhd-agent-status">Online · Auto (EN | हिंदी | मराठी)</div>
            </div>
          </div>
          <button class="vhd-close-btn" id="vhd-close">✕</button>
        </div>
        <div class="vhd-lang-bar">
          <div class="vhd-lang-title">🌐 Language</div>
          <div class="vhd-lang-pills" id="vhd-lang-pills">
            <button class="vhd-lang-btn active" data-lang="auto">🌐 Auto</button>
            <button class="vhd-lang-btn" data-lang="en-IN">English</button>
            <button class="vhd-lang-btn" data-lang="hi-IN">हिंदी</button>
            <button class="vhd-lang-btn" data-lang="mr-IN">मराठी</button>
          </div>
        </div>
        <div class="vhd-body" id="vhd-body">
          <div class="vhd-msg vhd-msg-agent">${agentConfig.greeting}</div>
        </div>
        <div class="vhd-voice-hero">
          <button class="vhd-orb-btn" id="vhd-orb">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="white"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>
          </button>
          <div class="vhd-voice-label" id="vhd-voice-label">Tap to Speak (Auto-Detect)</div>
        </div>
        <div class="vhd-footer">
          <input type="text" class="vhd-input" id="vhd-input" placeholder="Speak in English, हिंदी, or मराठी..." />
          <button class="vhd-send-btn" id="vhd-send">➤</button>
        </div>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(container);

    // Event Elements
    const launcher = shadow.getElementById('vhd-launcher');
    const panel = shadow.getElementById('vhd-panel');
    const closeBtn = shadow.getElementById('vhd-close');
    const orb = shadow.getElementById('vhd-orb');
    const voiceLabel = shadow.getElementById('vhd-voice-label');
    const body = shadow.getElementById('vhd-body');
    const input = shadow.getElementById('vhd-input');
    const sendBtn = shadow.getElementById('vhd-send');

    // Multilingual State: Auto-Detect (default), English, Hindi (हिंदी), and Marathi (मराठी)
    let currentSpeechLang = 'auto';
    const langBtns = shadow.querySelectorAll('.vhd-lang-btn');
    langBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        langBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSpeechLang = btn.getAttribute('data-lang') || 'auto';
        if (recognition) {
          recognition.lang = currentSpeechLang === 'auto' ? 'hi-IN' : currentSpeechLang;
        }
        if (currentSpeechLang === 'auto') {
          input.placeholder = 'Speak in English, हिंदी, or मराठी...';
          if (!isListening && orb.className !== 'vhd-orb-btn speaking') voiceLabel.textContent = 'Tap to Speak (Auto-Detect)';
        } else if (currentSpeechLang.startsWith('hi')) {
          input.placeholder = 'हिंदी में संदेश लिखें या बोलें...';
          if (!isListening && orb.className !== 'vhd-orb-btn speaking') voiceLabel.textContent = 'बोलने के लिए टैप करें';
        } else if (currentSpeechLang.startsWith('mr')) {
          input.placeholder = 'मराठीत संदेश लिहा किंवा बोला...';
          if (!isListening && orb.className !== 'vhd-orb-btn speaking') voiceLabel.textContent = 'बोलण्यासाठी टॅप करा';
        } else {
          input.placeholder = 'Type a message or speak above...';
          if (!isListening && orb.className !== 'vhd-orb-btn speaking') voiceLabel.textContent = 'Tap to Speak';
        }
      });
    });

    // Speech Recognition setup (Browser-Native, 100% Free)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;
    let isListening = false;
    let finalRecordedTranscript = '';
    let lastCapturedSpokenText = '';

    let activeStream = null;
    let widgetMediaRecorder = null;
    let widgetAudioChunks = [];

    if (SpeechRecognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      const defaultNavLang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-US';
      recognition.lang = currentSpeechLang === 'auto' ? defaultNavLang : currentSpeechLang;

      recognition.onstart = () => {
        isListening = true;
        finalRecordedTranscript = '';
        lastCapturedSpokenText = '';
        orb.className = 'vhd-orb-btn listening';
        voiceLabel.textContent = currentSpeechLang === 'auto' ? 'Listening to your voice...' :
                                 currentSpeechLang.startsWith('hi') ? 'आपकी आवाज़ सुन रहे हैं...' :
                                 currentSpeechLang.startsWith('mr') ? 'तुमचा आवाज ऐकत आहोत...' :
                                 'Listening to your voice...';
      };

      recognition.onresult = (event) => {
        let interimText = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalRecordedTranscript += ' ' + event.results[i][0].transcript;
          } else {
            interimText += ' ' + event.results[i][0].transcript;
          }
        }
        const spoken = (finalRecordedTranscript + ' ' + interimText).trim();
        if (spoken) {
          lastCapturedSpokenText = spoken;
          voiceLabel.textContent = '"' + spoken + '"';
        }
      };

      recognition.onerror = (event) => {
        console.warn('[Voice Help Desk] Speech recognition error:', event?.error);
        isListening = false;
        orb.className = 'vhd-orb-btn';
        if (activeStream) {
          try { activeStream.getTracks().forEach(track => track.stop()); } catch (_) {}
          activeStream = null;
        }
        if (widgetMediaRecorder && widgetMediaRecorder.state !== 'inactive') {
          try { widgetMediaRecorder.stop(); } catch (_) {}
        }
        if (event?.error === 'not-allowed' || event?.error === 'permission-denied') {
          voiceLabel.textContent = 'Mic blocked! Allow in URL bar';
          appendMsg('Microphone access was denied. Please click the camera/lock icon in your address bar and allow microphone permissions.', 'agent');
        } else if (event?.error === 'no-speech') {
          voiceLabel.textContent = 'No voice heard. Tap to retry';
        } else if (event?.error === 'audio-capture') {
          voiceLabel.textContent = 'No microphone device found';
        } else {
          voiceLabel.textContent = currentSpeechLang === 'auto' ? 'Tap to Speak' : 'Tap to Speak';
        }
      };

      recognition.onend = async () => {
        isListening = false;
        if (widgetMediaRecorder && widgetMediaRecorder.state !== 'inactive') {
          try { widgetMediaRecorder.stop(); } catch (e) {}
        }
        if (activeStream) {
          activeStream.getTracks().forEach(track => track.stop());
          activeStream = null;
        }

        const apiKey = (currentScript && (currentScript.getAttribute('data-api-key') || currentScript.getAttribute('data-key'))) ||
                       agentConfig.apiKey || window.AI_AGENT_API_KEY || '';

        // 1. Acoustic Auto-Detection with Groq Whisper (Language Identification LID)
        if (widgetAudioChunks.length > 0 && apiKey && apiKey.startsWith('gsk_')) {
          const audioBlob = new Blob(widgetAudioChunks, { type: 'audio/webm' });
          if (audioBlob.size > 1500) {
            voiceLabel.textContent = 'Auto-detecting language...';
            try {
              const formData = new FormData();
              formData.append('file', audioBlob, 'audio.webm');
              formData.append('model', 'whisper-large-v3-turbo');
              formData.append('response_format', 'verbose_json');
              formData.append('temperature', '0.0');

              // Only force language if user manually selected a specific language
              if (currentSpeechLang && currentSpeechLang !== 'auto') {
                const code = currentSpeechLang.startsWith('hi') ? 'hi' :
                             currentSpeechLang.startsWith('mr') ? 'mr' :
                             currentSpeechLang.startsWith('en') ? 'en' : currentSpeechLang;
                formData.append('language', code);
              }
              // In 'auto' mode, Whisper runs acoustic Language Identification (LID)!

              const wRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${apiKey}` },
                body: formData,
                signal: AbortSignal.timeout(5000)
              });

              if (wRes.ok) {
                const wData = await wRes.json();
                const cleanWhisper = (wData?.text || '').trim();
                const detectedLID = (wData?.language || '').toLowerCase().trim();

                const isHallucination = /^(thank you|thanks for watching|thank you for watching|bye|subtitles by|you|amara\.org)[\.!]?$/i.test(cleanWhisper);
                if (cleanWhisper && !isHallucination) {
                  finalRecordedTranscript = '';
                  lastCapturedSpokenText = '';
                  if (detectedLID) {
                    const tag = detectedLID.includes('marathi') ? '🚩 मराठी' :
                                detectedLID.includes('hindi') ? '🇮🇳 हिंदी' :
                                detectedLID.includes('english') ? '🇬🇧 English' : detectedLID;
                    voiceLabel.textContent = `Detected ${tag}...`;
                  }
                  handleUserMessage(cleanWhisper);
                  return;
                }
              }
            } catch (wErr) {
              console.warn('[Whisper API] Auto-detect error:', wErr);
            }
          }
        }

        // 2. Fallback to Browser Speech Recognition if Whisper is unavailable or offline
        const directSpoken = (finalRecordedTranscript || lastCapturedSpokenText).trim();
        if (directSpoken) {
          finalRecordedTranscript = '';
          lastCapturedSpokenText = '';
          handleUserMessage(directSpoken);
          return;
        }

        if (orb.className !== 'vhd-orb-btn speaking') {
          orb.className = 'vhd-orb-btn';
          voiceLabel.textContent = currentSpeechLang === 'auto' ? 'Tap to Speak (Auto-Detect)' : 'Tap to Speak';
        }
      };
    } else {
      voiceLabel.textContent = 'Voice not supported on this browser';
    }

    // Toggle Panel
    launcher.addEventListener('click', () => {
      panel.classList.toggle('open');
    });
    closeBtn.addEventListener('click', () => {
      panel.classList.remove('open');
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (recognition && isListening) recognition.stop();
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
        activeStream = null;
      }
    });

    // Check auto-open
    if (currentScript && currentScript.getAttribute('data-auto-open') === 'true') {
      setTimeout(() => {
        panel.classList.add('open');
      }, 300);
    }

    // Voice Orb Click (Supports Instant Barge-in)
    orb.addEventListener('click', async () => {
      // Re-verify if agent has been deleted before opening mic
      const stillActive = await fetchAgentConfig();
      if (!stillActive) {
        const existing = document.getElementById('voice-helpdesk-root');
        if (existing) existing.remove();
        return;
      }

      if (!recognition) {
        alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
        return;
      }

      // If agent is speaking, cancel speech and reset state immediately (Barge-in)
      if (window.speechSynthesis && (window.speechSynthesis.speaking || orb.classList.contains('speaking'))) {
        try { window.speechSynthesis.cancel(); } catch (_) {}
        if (window.__vhdWatchdog) clearTimeout(window.__vhdWatchdog);
        if (window.__vhdHeartbeat) clearInterval(window.__vhdHeartbeat);
        window.__vhdActiveUtterance = null;
        orb.className = 'vhd-orb-btn';
      }

      if (isListening) {
        recognition.stop();
      } else {
        if (window.speechSynthesis) window.speechSynthesis.cancel();

        // Keep microphone stream open while recording
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            activeStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              }
            });
          }
        } catch (permErr) {
          voiceLabel.textContent = 'Mic blocked! Allow in URL bar';
          appendMsg('Microphone permission was denied. Please click the camera/lock icon in your address bar to allow access.', 'agent');
          return;
        }

        widgetAudioChunks = [];
        if (activeStream && typeof MediaRecorder !== 'undefined') {
          try {
            widgetMediaRecorder = new MediaRecorder(activeStream);
            widgetMediaRecorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) widgetAudioChunks.push(e.data);
            };
            widgetMediaRecorder.start(250);
          } catch (e) {}
        }

        try {
          recognition.start();
        } catch (e) {
          console.warn('Recognition start error:', e);
          try {
            recognition.abort();
            setTimeout(() => recognition.start(), 150);
          } catch (e2) {}
        }
      }
    });

    // Send text message
    function submitText() {
      const txt = input.value.trim();
      if (txt) {
        input.value = '';
        handleUserMessage(txt);
      }
    }
    sendBtn.addEventListener('click', submitText);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitText();
    });

    // Append Chat Message
    function appendMsg(text, sender, navAction = null) {
      const div = document.createElement('div');
      div.className = `vhd-msg vhd-msg-${sender}`;

      const textNode = document.createElement('div');
      textNode.textContent = text;
      div.appendChild(textNode);

      if (navAction && navAction.label && navAction.sectionInfo) {
        const navBtn = document.createElement('button');
        navBtn.type = 'button';
        navBtn.className = 'vhd-nav-pill-btn';
        navBtn.innerHTML = `📍 <span>${navAction.label}</span> &rarr;`;
        navBtn.onclick = (e) => {
          e.stopPropagation();
          scrollToHostSection(navAction.sectionInfo);
        };
        div.appendChild(navBtn);
      }

      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }

    // --- REAL-TIME LIVE WEBSITE DATABASE & INVENTORY BRIDGE ---
    function isCustomerSafeFaq(question, answer) {
      if (!question || !answer) return false;
      const qStr = String(question).trim();
      const aStr = String(answer).trim();
      if (qStr.length < 3 || aStr.length < 2) return false;

      const qLower = qStr.toLowerCase();
      const aLower = aStr.toLowerCase();

      const invalidQ = [
        /\bwhat tables are in the database\b/i,
        /\bdatabase records for\b/i,
        /\bdatabase context from\b/i,
        /\binformation from\b/i,
        /\bwhat is the minstockalert\b/i,
        /\bwhat is minstockalert\b/i,
        /\bwhat is create table\b/i,
        /\bwhat is foreign key\b/i,
        /\bwhat is primary key\b/i,
        /\bwhat is varchar\b/i,
        /\bwhat is schema\b/i
      ];
      if (invalidQ.some(pat => pat.test(qLower))) return false;

      const codePatterns = [
        /\b(number|string|boolean|any|void)\s*;\s*(\/\/.*)?$/i,
        /\b(interface|type|class|enum)\s+[A-Z0-9_]+\s*\{/i,
        /^(?:const|let|var)\s+[a-z0-9_]+\s*=/i,
        /\bcreate\s+table\b/i,
        /\binsert\s+into\b/i,
        /\bvarchar\s*\(\d+\)/i,
        /\{[\s\S]*\}\s*;?$/,
        /^\s*(\/\/|\/\*|\*)/,
        /\b(import|export)\s+.*\s+from\s+['"]/i,
        /\[Binary File:/i
      ];
      if (codePatterns.some(pat => pat.test(aStr))) return false;
      if (codePatterns.some(pat => pat.test(qStr))) return false;

      if (/^[-*•]?\s*(record supplier invoices|automatically increment|purchase history register|todo:|fixme:)/i.test(aLower)) {
        return false;
      }
      if (/^database includes table/i.test(aLower)) return false;

      return true;
    }

    function isCatalogListQuery(text) {
      const lower = String(text || '').toLowerCase().trim();
      return /\b(list of all|list all|give list|give me list|show list|all meds|all medicines|all products|all items|full list|catalog|what meds|what medicines|what products|what do you sell|what do you have|available meds|available medicines|available products|show inventory|inventory table|list inventory|see all)\b/i.test(lower) ||
             /(सर्व औषध|औषधांची यादी|सर्व प्रॉडक्ट|कॅटलॉग|काय काय उपलब्ध|सर्व वस्तू)/i.test(text) ||
             /(सभी दवा|दवाइयों की लिस्ट|सारे प्रोडक्ट्स|कैटलॉग|क्या क्या उपलब्ध|लिस्ट दो|सूची दो)/i.test(text);
    }

    function isSectionNavigationQuery(text) {
      const lower = String(text || '').toLowerCase().trim();
      return /\b(scroll to|take me to|navigate to|go to|show me the section|where is the|jump to|open section|view section)\b/i.test(lower) ||
             /\b(where is (the )?(inventory|table|pricing|contact|how it works|medicines|products|catalog|counter|doctor|appointment))\b/i.test(lower) ||
             /(विभागावर जा|दाखवा|नेऊन जा|कुठे आहे)/i.test(text) ||
             /(सेक्शन पर ले जाओ|कहाँ है|दिखाओ|स्क्रॉल करो)/i.test(text);
    }

    function isDynamicDataQuery(text) {
      const lower = String(text || '').toLowerCase();
      if (isCatalogListQuery(text) || isSectionNavigationQuery(text)) return true;
      if (/\b(stock|available|availability|in stock|out of stock|quantity|units?|count|inventory|price|cost|how much|rate|order status|track order|delivery status)\b/i.test(lower) ||
          /(साठा|स्टॉक|उपलब्ध|शिल्लक|किंमत|भाव|ऑर्डर|दर)/i.test(text)) {
        return true;
      }
      if (typeof window !== 'undefined' && window.EchoAIData) {
        const inv = window.EchoAIData.liveInventory || window.EchoAIData.inventory || window.EchoAIData.products;
        if (inv) {
          const keys = Array.isArray(inv) ? inv.map(i => i.name || i.product || i.title) : Object.keys(inv);
          for (const k of keys) {
            if (k && lower.includes(String(k).toLowerCase())) return true;
          }
        }
      }
      return false;
    }

    function findHostSection(topic) {
      if (typeof document === 'undefined') return null;
      const t = String(topic || '').toLowerCase().trim();

      const idCandidates = [];
      if (/\b(med|medicine|drug|pharmacy|pill|tablet|prescription|inventory|stock|product|catalog)\b/i.test(t)) {
        idCandidates.push('inventory-section', 'inventory', 'medicines', 'meds', 'products', 'catalog', 'inventory-table-container', 'inventory-tbody');
      }
      if (/\b(price|pricing|plan|cost|rate|subscription)\b/i.test(t)) {
        idCandidates.push('pricing-section', 'pricing', 'plans', 'costs', 'rates');
      }
      if (/\b(how it works|guide|demo|integration|setup)\b/i.test(t)) {
        idCandidates.push('how-it-works-section', 'how-it-works', 'guide', 'demo');
      }
      if (/\b(contact|support|help|call|email|reach|counter|location|address)\b/i.test(t)) {
        idCandidates.push('contact-section', 'contact', 'support', 'help', 'location', 'footer');
      }
      if (/\b(appointment|book|schedule|doctor|consult|visit)\b/i.test(t)) {
        idCandidates.push('appointment-section', 'appointment', 'booking', 'schedule');
      }

      for (const id of idCandidates) {
        const el = document.getElementById(id);
        if (el) {
          return { element: el, id, label: formatSectionLabel(id) };
        }
      }

      const headings = document.querySelectorAll('h1, h2, h3, h4');
      for (const h of headings) {
        const hText = (h.textContent || '').toLowerCase();
        if (/\b(med|medicine|inventory|stock|product|catalog)\b/i.test(t) &&
            /\b(inventory|medicine|medicines|product|products|catalog|stock)\b/i.test(hText)) {
          const container = h.closest('.card, section, article, div[class*="section"]') || h;
          return { element: container, id: container.id || '', label: h.textContent.trim().replace(/^[^\w]+/, '') };
        }
        if (/\b(how it works|integration|setup)\b/i.test(t) &&
            /\b(how|work|works|integration)\b/i.test(hText)) {
          const container = h.closest('.card, section, article, div[class*="section"]') || h;
          return { element: container, id: container.id || '', label: h.textContent.trim().replace(/^[^\w]+/, '') };
        }
        if (/\b(pricing|price|plans)\b/i.test(t) && /\b(pricing|price|plans)\b/i.test(hText)) {
          const container = h.closest('.card, section, article, div[class*="section"]') || h;
          return { element: container, id: container.id || '', label: h.textContent.trim().replace(/^[^\w]+/, '') };
        }
        if (/\b(contact|support)\b/i.test(t) && /\b(contact|support|help)\b/i.test(hText)) {
          const container = h.closest('.card, section, article, div[class*="section"]') || h;
          return { element: container, id: container.id || '', label: h.textContent.trim().replace(/^[^\w]+/, '') };
        }
      }

      if (/\b(med|medicine|inventory|stock|product|catalog)\b/i.test(t)) {
        const table = document.querySelector('#inventory-tbody, table, .inventory');
        if (table) {
          const container = table.closest('.card, section, article') || table;
          return { element: container, id: container.id || '', label: 'Live Inventory Table' };
        }
      }

      return null;
    }

    function formatSectionLabel(id) {
      if (/inventory/i.test(id)) return 'Live Inventory Table';
      if (/medicine|meds/i.test(id)) return 'Medicines Catalog';
      if (/how-it-works/i.test(id)) return 'How It Works Guide';
      if (/pricing/i.test(id)) return 'Pricing & Plans';
      if (/contact/i.test(id)) return 'Contact & Support';
      if (/appointment/i.test(id)) return 'Appointments & Booking';
      return id.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    function scrollToHostSection(sectionInfo) {
      if (!sectionInfo || !sectionInfo.element) return false;
      try {
        sectionInfo.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const el = sectionInfo.element;
        const origTransition = el.style.transition;
        const origBoxShadow = el.style.boxShadow;
        const origOutline = el.style.outline;

        el.style.transition = 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.boxShadow = '0 0 0 4px #38bdf8, 0 10px 30px -5px rgba(56, 189, 248, 0.5)';
        el.style.outline = '2px solid #38bdf8';

        setTimeout(() => {
          el.style.boxShadow = origBoxShadow;
          el.style.outline = origOutline;
          el.style.transition = origTransition;
        }, 3000);
        return true;
      } catch (err) {
        console.warn('[Echo AI Navigation] Failed smooth scroll:', err);
        return false;
      }
    }

    function getAllCatalogItems(agentConfig) {
      const items = [];
      const seen = new Set();

      function addItem(it) {
        if (!it) return;
        const name = String(it.name || it.product || it.title || it.item || '').trim();
        if (!name || name.length < 2 || name.length > 70) return;
        if (seen.has(name.toLowerCase())) return;
        if (/^(what is|tell me|how to|why|who|can you|action|sr\.?no|name|product|item|price|stock|total|status)$/i.test(name)) return;
        if (name.includes('?') || name.includes('{')) return;

        seen.add(name.toLowerCase());
        items.push({
          id: it.id || `rec_${items.length + 1}`,
          name,
          price: it.price !== undefined ? (typeof it.price === 'number' ? `₹${it.price}` : String(it.price).trim()) : '',
          stock: it.stock !== undefined ? (typeof it.stock === 'number' ? it.stock : parseInt(it.stock, 10)) : (it.quantity !== undefined ? parseInt(it.quantity, 10) : (it.qty !== undefined ? parseInt(it.qty, 10) : null)),
          unit: it.unit || 'units',
          rx: Boolean(it.rx || it.prescriptionRequired),
          category: it.category || '',
          dosage: it.dosage || it.composition || '',
          description: it.description || it.details || ''
        });
      }

      // Tier 1: Host Page JavaScript Database State (window.EchoAIData / window.echoLiveInventory / window.EchoInventory)
      if (typeof window !== 'undefined') {
        const hostObj = window.EchoAIData || window.echoLiveInventory || window.EchoInventory;
        const inv = hostObj?.liveInventory || hostObj?.inventory || hostObj?.products || hostObj?.database || hostObj?.items;
        if (inv) {
          if (Array.isArray(inv)) {
            inv.forEach(addItem);
          } else if (typeof inv === 'object') {
            for (const [key, val] of Object.entries(inv)) {
              if (val && typeof val === 'object') {
                addItem({ name: val.name || key, ...val });
              } else if (val !== undefined) {
                addItem({ name: key, stock: val });
              }
            }
          }
        }
      }

      // Tier 2: Agent's Structured Database Records from Firestore
      if (agentConfig && Array.isArray(agentConfig.databaseRecords) && agentConfig.databaseRecords.length > 0) {
        agentConfig.databaseRecords.forEach(addItem);
      }

      // Tier 3: Autonomous Live DOM Table Scraper
      if (typeof document !== 'undefined') {
        const rows = document.querySelectorAll('#inventory-tbody tr, table tbody tr, .product-card, .medicine-item, [data-product]');
        rows.forEach(row => {
          const cells = Array.from(row.querySelectorAll('td, th, .name, .title, p, span'))
            .map(c => c.textContent.trim())
            .filter(t => t.length > 0);
          if (cells.length >= 2) {
            const rawTitle = cells[0];
            if (rawTitle && rawTitle.length >= 3 && rawTitle.length < 50 &&
                !/^(name|item|product|price|stock|action|sr\.?no|total|status)$/i.test(rawTitle) &&
                !rawTitle.includes('?')) {
              const priceMatch = cells.find(t => /[₹$€£]|rs\.?/i.test(t)) || '';
              const stockMatch = cells.find(t => /^\d+\s*(strips?|units?|tablets?|boxes?|items?|pcs?)?$/i.test(t)) || '';
              addItem({
                name: rawTitle,
                price: priceMatch,
                stock: stockMatch ? parseInt(stockMatch.replace(/\D/g, ''), 10) : null,
                unit: stockMatch ? stockMatch.replace(/^\d+\s*/, '') || 'units' : 'units'
              });
            }
          }
        });
      }

      // STRICT ACCURACY: Never fabricate fake catalog items from FAQs or general text.
      return items;
    }

    function extractTargetItem(text, history = []) {
      let cleaned = String(text || '').trim()
        .replace(/\b(available stock|current stock number|stock number|avilable stock|available|avilable|stock|in stock|is there|do you have|any|what is the price of|price of|price|how much for|how much is|give me|just give me|check|tell me|show me|status of|order|current|number)\b/gi, ' ')
        .replace(/[?!.,;]/g, '')
        .trim();
      cleaned = cleaned.replace(/\s+/g, ' ');

      // If user said e.g. "just give me current stock number", resolve item from previous user messages
      if (cleaned.length < 3 && Array.isArray(history) && history.length > 0) {
        for (let i = history.length - 1; i >= 0; i--) {
          const prevMsg = history[i];
          const prevRole = prevMsg?.role;
          const prevText = prevMsg?.content || prevMsg?.text || '';
          if (prevRole === 'user' && prevText && prevText !== text) {
            const prevClean = prevText
              .replace(/\b(available stock|current stock number|stock number|avilable stock|available|avilable|stock|in stock|is there|do you have|any|what is the price of|price of|price|how much for|how much is|give me|just give me|check|tell me|show me|status of|order|current|number)\b/gi, ' ')
              .replace(/[?!.,;]/g, '')
              .trim();
            if (prevClean.length >= 3) {
              return prevClean.replace(/\s+/g, ' ');
            }
          }
        }

        // Fallback to any previous turn if no user message yielded an item
        for (let i = history.length - 1; i >= 0; i--) {
          const prevText = history[i]?.content || history[i]?.text || '';
          if (prevText && prevText !== text) {
            const prevClean = prevText
              .replace(/\b(we have|strips of|in stock at|available stock|current stock number|stock number|avilable stock|available|avilable|stock|in stock|is there|do you have|any|what is the price of|price of|price|how much for|how much is|give me|just give me|check|tell me|show me|status of|order|current|number)\b/gi, ' ')
              .replace(/[?!.,;]/g, '')
              .trim();
            if (prevClean.length >= 3) {
              return prevClean.replace(/\s+/g, ' ');
            }
          }
        }
      }

      return cleaned;
    }

    function matchInInventory(inventorySource, rawTarget) {
      if (!inventorySource) return null;
      const target = String(rawTarget || '').toLowerCase().trim();
      if (!target) return null;

      const cleanTarget = target.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const targetTokens = cleanTarget.split(' ').filter(w => w.length >= 2);

      // If array of items
      if (Array.isArray(inventorySource)) {
        for (const item of inventorySource) {
          const name = String(item.name || item.product || item.title || '').toLowerCase();
          const category = String(item.category || item.dosage || item.description || '').toLowerCase();
          if (name && (name.includes(target) || target.includes(name) || name.includes(cleanTarget) || cleanTarget.includes(name))) {
            return item;
          }
          if (category && (category.includes(target) || target.includes(category))) {
            return item;
          }
        }
        let best = null;
        let maxOverlap = 0;
        for (const item of inventorySource) {
          const name = String(item.name || item.product || item.title || '').toLowerCase();
          const category = String(item.category || item.dosage || item.description || '').toLowerCase();
          const combined = `${name} ${category}`;
          let overlap = 0;
          for (const tok of targetTokens) {
            if (combined.includes(tok)) overlap++;
          }
          if (overlap > maxOverlap && overlap >= Math.min(1, targetTokens.length)) {
            maxOverlap = overlap;
            best = item;
          }
        }
        if (best) return best;
      }

      // If object map (e.g. window.EchoAIData.liveInventory)
      if (typeof inventorySource === 'object') {
        for (const [key, val] of Object.entries(inventorySource)) {
          const keyLower = String(key || '').toLowerCase();
          const valObj = typeof val === 'object' && val !== null ? val : { stock: val };
          const valName = String(valObj.name || valObj.title || valObj.product || key).toLowerCase();
          const valCategory = String(valObj.category || valObj.dosage || valObj.description || '').toLowerCase();
          const combined = `${keyLower} ${valName} ${valCategory}`;

          if (keyLower.includes(target) || target.includes(keyLower) ||
              valName.includes(target) || target.includes(valName) ||
              combined.includes(cleanTarget) || (cleanTarget.length > 3 && combined.includes(cleanTarget))) {
            return { name: valObj.name || key, ...valObj };
          }
        }

        let best = null;
        let maxOverlap = 0;
        for (const [key, val] of Object.entries(inventorySource)) {
          const keyLower = String(key || '').toLowerCase();
          const valObj = typeof val === 'object' && val !== null ? val : { stock: val };
          const valName = String(valObj.name || valObj.title || valObj.product || key).toLowerCase();
          const valCategory = String(valObj.category || valObj.dosage || valObj.description || '').toLowerCase();
          const combined = `${keyLower} ${valName} ${valCategory}`;

          let overlap = 0;
          for (const tok of targetTokens) {
            if (combined.includes(tok)) overlap++;
          }
          if (overlap > maxOverlap && overlap >= Math.min(1, targetTokens.length)) {
            maxOverlap = overlap;
            best = { name: valObj.name || key, ...valObj };
          }
        }
        if (best) return best;
      }

      return null;
    }

    function formatRealtimeStockResponse(itemData, queryLang) {
      const name = itemData.name || itemData.product || itemData.title || 'The requested item';
      const stock = itemData.stock !== undefined ? itemData.stock : (itemData.quantity !== undefined ? itemData.quantity : null);
      const price = itemData.price ? (typeof itemData.price === 'number' ? `₹${itemData.price}` : itemData.price) : '';
      const unit = itemData.unit || 'units';
      const rx = itemData.rx || itemData.prescriptionRequired;

      if (queryLang === 'mr-IN') {
        if (stock !== null && stock > 0) {
          return `${name} सध्या उपलब्ध आहे. शिल्लक साठा: ${stock} ${unit}${price ? ` (किंमत: ${price})` : ''}.${rx ? ' (डॉक्टरांचे प्रिस्क्रिप्शन आवश्यक).' : ''}`;
        } else if (stock === 0) {
          return `क्षमस्व, ${name} चा साठा सध्या संपला आहे. नवीन स्टॉक लवकरच उपलब्ध होईल!`;
        }
      }

      if (queryLang === 'hi-IN') {
        if (stock !== null && stock > 0) {
          return `${name} वर्तमान में उपलब्ध है। स्टॉक: ${stock} ${unit}${price ? ` (कीमत: ${price})` : ''} उपलब्ध है।${rx ? ' (डॉक्टर का पर्चा आवश्यक है)।' : ''}`;
        } else if (stock === 0) {
          return `क्षमा करें, ${name} अभी आउट ऑफ स्टॉक है। जल्द ही नया स्टॉक उपलब्ध होगा!`;
        }
      }

      // English default
      if (stock !== null && stock > 0) {
        return `${name} is currently in stock! We have ${stock} ${unit} available${price ? ` at ${price} each` : ''}.${rx ? ' Please note a valid doctor prescription is required.' : ''}`;
      } else if (stock === 0) {
        return `I'm sorry, ${name} is currently out of stock. We can notify you once new inventory arrives!`;
      }

      if (itemData.message) return itemData.message;
      return `${name} is available in our store.${price ? ` Price: ${price}.` : ''}`;
    }

    // --- REAL-TIME LIVE WEBSITE DATABASE BRIDGE ---
    async function resolveDatabaseBridge(query, agentConfig) {
      const isList = isCatalogListQuery(query);
      const isNav = isSectionNavigationQuery(query);
      const isDynamic = isDynamicDataQuery(query);

      if (!isList && !isNav && !isDynamic) {
        return { status: 'NOT_DYNAMIC_QUERY', item: null, data: null };
      }

      // Handle Catalog List query
      if (isList) {
        const allItems = getAllCatalogItems(agentConfig);

        // If local items empty and external databaseHookUrl / apiEndpoint exists, query webhook
        const dbEndpoint = agentConfig?.databaseHookUrl || (currentScript && currentScript.getAttribute('data-database-url')) || (currentScript && currentScript.getAttribute('data-api-endpoint')) || agentConfig?.apiEndpoint;
        if (allItems.length === 0 && dbEndpoint && !dbEndpoint.includes('example.com')) {
          try {
            const fetchUrl = dbEndpoint.includes('?') ? `${dbEndpoint}&action=get_catalog` : `${dbEndpoint}?action=get_catalog`;
            const res = await fetch(fetchUrl, { headers: { 'Accept': 'application/json' } });
            if (res.ok) {
              const resData = await res.json();
              const recs = resData.records || resData.items || (Array.isArray(resData) ? resData : null);
              if (Array.isArray(recs)) {
                recs.forEach(r => {
                  if (r && typeof r === 'object') {
                    const name = r.name || r.product || r.title;
                    if (name && !allItems.some(x => x.name.toLowerCase() === name.toLowerCase())) {
                      allItems.push({
                        name,
                        price: r.price || '',
                        stock: r.stock !== undefined ? r.stock : null,
                        unit: r.unit || 'units',
                        category: r.category || ''
                      });
                    }
                  }
                });
              }
            }
          } catch (e) {
            console.warn('[Echo AI Live Bridge] Webhook catalog fetch skipped:', e);
          }
        }

        return {
          status: 'FOUND_CATALOG_LIST',
          item: 'catalog',
          data: allItems
        };
      }

      // Handle Section Navigation query
      if (isNav) {
        const sec = findHostSection(query);
        return {
          status: 'NAVIGATE_SECTION',
          item: sec ? sec.label : 'section',
          data: sec
        };
      }

      const targetItem = extractTargetItem(query, conversationHistory);

      // Stage 1: Check Host Page State (window.EchoAIData)
      if (typeof window !== 'undefined' && window.EchoAIData) {
        if (typeof window.EchoAIData.queryDatabase === 'function') {
          try {
            const hostResult = await window.EchoAIData.queryDatabase(query);
            if (hostResult) {
              return {
                status: 'FOUND_IN_HOST_STATE',
                item: targetItem,
                data: hostResult
              };
            }
          } catch (err) {
            console.warn('[Echo AI Live Bridge] window.EchoAIData.queryDatabase error:', err);
          }
        }

        const hostInventory = window.EchoAIData.inventory || window.EchoAIData.liveInventory || window.EchoAIData.products || window.EchoAIData.database;
        if (hostInventory) {
          const match = matchInInventory(hostInventory, targetItem || query);
          if (match) {
            return {
              status: 'FOUND_IN_HOST_STATE',
              item: targetItem,
              data: match
            };
          }
        }
      }

      // Stage 1.2: Check Agent's Structured Database Records from Firestore
      if (agentConfig && Array.isArray(agentConfig.databaseRecords) && agentConfig.databaseRecords.length > 0) {
        const match = matchInInventory(agentConfig.databaseRecords, targetItem || query);
        if (match) {
          return {
            status: 'FOUND_IN_HOST_STATE',
            item: targetItem,
            data: match
          };
        }
      }

      // Stage 1.5: Autonomous DOM Scraper for products on page
      if (typeof document !== 'undefined') {
        const domItems = getAllCatalogItems(agentConfig);
        if (domItems.length > 0) {
          const match = matchInInventory(domItems, targetItem || query);
          if (match) {
            return {
              status: 'FOUND_IN_HOST_STATE',
              item: targetItem,
              data: match
            };
          }
        }
      }

      // Check window.echoLiveInventory fallback
      if (typeof window !== 'undefined' && window.echoLiveInventory) {
        const match = matchInInventory(window.echoLiveInventory, targetItem || query);
        if (match) {
          return {
            status: 'FOUND_IN_HOST_STATE',
            item: targetItem,
            data: match
          };
        }
      }

      // Stage 2: Check Live API / Webhook (data-api-endpoint / databaseHookUrl)
      const apiEndpoint = (currentScript && (currentScript.getAttribute('data-database-url') || currentScript.getAttribute('data-api-endpoint'))) ||
                          agentConfig.databaseHookUrl ||
                          agentConfig.apiEndpoint ||
                          (agentConfig.tools && agentConfig.tools.find(t => t.endpoint && !t.endpoint.includes('example.com'))?.endpoint) ||
                          '';

      if (apiEndpoint && !apiEndpoint.includes('example.com')) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          const url = apiEndpoint.includes('?')
            ? `${apiEndpoint}&action=query&q=${encodeURIComponent(targetItem || query)}`
            : `${apiEndpoint}?action=query&q=${encodeURIComponent(targetItem || query)}`;

          const apiRes = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: controller.signal
          }).catch(async () => {
            return await fetch(apiEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query, item: targetItem, action: 'query', timestamp: Date.now() }),
              signal: controller.signal
            });
          });

          clearTimeout(timeoutId);

          if (apiRes && apiRes.ok) {
            const apiData = await apiRes.json();
            const rec = apiData.data || (Array.isArray(apiData.records) && apiData.records[0]) || (Array.isArray(apiData) ? apiData[0] : apiData);
            if (rec && typeof rec === 'object' && (rec.name || rec.stock !== undefined || rec.price)) {
              return {
                status: 'FOUND_IN_LIVE_API',
                item: targetItem,
                data: rec
              };
            }
          }
        } catch (apiErr) {
          console.warn('[Echo AI Live Bridge] Live API endpoint timeout/error:', apiErr);
        }
      }

      // If the item is not found in database:
      return {
        status: 'ITEM_NOT_FOUND',
        item: targetItem,
        data: null
      };
    }

    // --- STRICT LIVE CUSTOMER SUPPORT SYSTEM PROMPT BUILDER ---
    function buildCustomerSystemPrompt(agentConfig, bridgeResult, queryLang = 'en-US') {
      const businessName = agentConfig.businessName || agentConfig.companyName || agentConfig.name || 'our store';
      const rawKb = agentConfig.knowledgeBase || [];
      const cleanFaqs = rawKb.filter(item => isCustomerSafeFaq(item.q, item.a)).slice(0, 25);
      const cleanFaqBlock = cleanFaqs.length > 0
        ? cleanFaqs.map(k => `Q: ${k.q}\nA: ${k.a}`).join('\n\n')
        : 'General customer support assistance.';

      let bridgeBlock = '';
      if (bridgeResult && bridgeResult.status === 'FOUND_IN_HOST_STATE') {
        bridgeBlock = `STATUS: FOUND_IN_HOST_STATE\nDATA: ${JSON.stringify(bridgeResult.data)}`;
      } else if (bridgeResult && bridgeResult.status === 'FOUND_IN_LIVE_API') {
        bridgeBlock = `STATUS: FOUND_IN_LIVE_API\nDATA: ${JSON.stringify(bridgeResult.data)}`;
      } else if (bridgeResult && bridgeResult.status === 'FOUND_CATALOG_LIST') {
        bridgeBlock = `STATUS: FOUND_CATALOG_LIST\nDATA: ${JSON.stringify(bridgeResult.data)}`;
      } else if (bridgeResult && bridgeResult.status === 'ITEM_NOT_FOUND') {
        bridgeBlock = `STATUS: ITEM_NOT_FOUND\nTARGET_ITEM: "${bridgeResult.item || 'The requested item'}"`;
      } else {
        bridgeBlock = `STATUS: NO_DYNAMIC_DATA_REQUESTED`;
      }

      let langDirective = 'Speak in clear, natural English.';
      if (queryLang === 'mr-IN') {
        langDirective = 'Reply strictly in natural, polite Marathi (मराठी).';
      } else if (queryLang === 'hi-IN') {
        langDirective = 'Reply strictly in natural, polite Hindi (हिंदी).';
      }

      return `You are the official live customer support voice & chat assistant embedded on ${businessName}'s website. You are speaking directly to a customer browsing the website.
CRITICAL RULES:
- NEVER ask the user how to implement code, configure APIs, set up webhooks, or provide database schemas. You are already live in production.
- Answer strictly using the injected [LIVE_BRIDGE_DATA] and [CLEAN_CUSTOMER_FAQ_KB] provided below.
- If [LIVE_BRIDGE_DATA] contains exact stock, price, order status, or availability (e.g., '42 strips available at ₹185.50'), state the exact numbers naturally and concisely in 1-2 spoken-friendly sentences.
- If [LIVE_BRIDGE_DATA] returns STATUS: FOUND_CATALOG_LIST, summarize the available catalog products/medicines with prices concisely in 1-2 sentences and confirm you have scrolled them to the inventory section.
- If [LIVE_BRIDGE_DATA] returns STATUS: ITEM_NOT_FOUND, politely inform the customer that the requested item is not currently listed in our live catalog, mention available alternatives if present, and offer to scroll them to the catalog section. NEVER say "verify with our counter/support team" or give generic error text.
- Keep responses plain-text, conversational, and under 35 words so Web Speech API TTS reads them smoothly without reading markdown symbols (*, #, \`).
- LANGUAGE: ${langDirective}

[LIVE_BRIDGE_DATA]
${bridgeBlock}

[CLEAN_CUSTOMER_FAQ_KB]
${cleanFaqBlock}`;
    }

    // --- UNIFIED BYOK LLM FETCHER (Groq, Gemini, OpenAI) ---
    async function callLLMWithBYOK(userMessage, systemPrompt, conversationHistory, apiKey, model = '') {
      if (!apiKey) return null;

      const cleanUser = String(userMessage || '').trim();
      const trimmedKey = String(apiKey).trim();

      function sanitizeSpokenOutput(text) {
        if (!text) return '';
        let cleaned = String(text)
          .replace(/```[\s\S]*?```/g, '')
          .replace(/[*#_`]/g, '')
          .replace(/^[-*•]\s+/gm, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Enforce under 35 words so Web Speech API TTS reads smoothly
        const words = cleaned.split(' ');
        if (words.length > 35) {
          cleaned = words.slice(0, 35).join(' ') + '.';
        }
        return cleaned;
      }

      try {
        // 1. Groq Provider (gsk_...)
        if (trimmedKey.startsWith('gsk_')) {
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${trimmedKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: model || 'llama-3.3-70b-versatile',
              messages: [
                { role: 'system', content: systemPrompt },
                ...conversationHistory.slice(-6).map(m => ({
                  role: (m.role === 'assistant' || m.role === 'agent') ? 'assistant' : 'user',
                  content: m.content || m.text || ''
                })),
                { role: 'user', content: cleanUser }
              ],
              temperature: 0.3,
              max_tokens: 150
            }),
            signal: AbortSignal.timeout(5000)
          });

          if (groqRes.ok) {
            const data = await groqRes.json();
            const content = data.choices?.[0]?.message?.content;
            if (content) return sanitizeSpokenOutput(content);
          }
        }

        // 2. Google Gemini Provider (AIza...)
        // Valid system_instruction schema preventing HTTP 400 errors
        if (trimmedKey.startsWith('AIza')) {
          const geminiModel = (model && model.includes('gemini')) ? model : 'gemini-2.5-flash';
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${trimmedKey}`;

          const contents = [
            ...conversationHistory.slice(-4).map(m => ({
              role: (m.role === 'assistant' || m.role === 'agent') ? 'model' : 'user',
              parts: [{ text: m.content || m.text || '' }]
            })),
            {
              role: 'user',
              parts: [{ text: cleanUser }]
            }
          ];

          const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: {
                parts: [{ text: systemPrompt }]
              },
              contents,
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 150
              }
            }),
            signal: AbortSignal.timeout(6000)
          });

          if (geminiRes.ok) {
            const data = await geminiRes.json();
            const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (candidateText) return sanitizeSpokenOutput(candidateText);
          } else {
            console.warn('[Echo AI BYOK] Gemini API error status:', geminiRes.status);
          }
        }

        // 3. OpenAI / Compatible Provider (sk-...)
        if (trimmedKey.startsWith('sk-')) {
          const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${trimmedKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: model || 'gpt-4o-mini',
              messages: [
                { role: 'system', content: systemPrompt },
                ...conversationHistory.slice(-6).map(m => ({
                  role: (m.role === 'assistant' || m.role === 'agent') ? 'assistant' : 'user',
                  content: m.content || m.text || ''
                })),
                { role: 'user', content: cleanUser }
              ],
              temperature: 0.3,
              max_tokens: 150
            }),
            signal: AbortSignal.timeout(5000)
          });

          if (openAiRes.ok) {
            const data = await openAiRes.json();
            const content = data.choices?.[0]?.message?.content;
            if (content) return sanitizeSpokenOutput(content);
          }
        }
      } catch (err) {
        console.warn('[Echo AI BYOK] Error calling LLM provider:', err);
      }

      return null;
    }

    // Autonomous Zero-API-Key Local Reasoning Engine
    async function inferLocalAgentResponse(userText, bridgeResult = null) {
      const text = userText.trim();
      const lower = text.toLowerCase();
      const cleanWords = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
      const stopWords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'are', 'what', 'your', 'about', 'can', 'you']);
      const meaningfulWords = cleanWords.filter(w => !stopWords.has(w));
      const queryLang = detectTextLanguage(text);

      // 1. Direct Catalog List Query Handler (e.g. "give list of all meds", "show all products")
      const bridge = bridgeResult || await resolveDatabaseBridge(text, agentConfig);
      if (bridge && bridge.status === 'FOUND_CATALOG_LIST') {
        const allItems = Array.isArray(bridge.data) && bridge.data.length > 0 ? bridge.data : getAllCatalogItems(agentConfig);
        const sec = findHostSection('inventory');
        if (sec) scrollToHostSection(sec);

        const isMed = allItems.some(i => i.dosage || i.rx || /tablet|capsule|syrup|mg|duo|strips/i.test(i.name + ' ' + (i.unit || ''))) ||
                      agentConfig?.type === 'pharmacy' ||
                      /\b(pharmacy|medicine|meds|clinic)\b/i.test(agentConfig?.description || agentConfig?.name || '');
        const nounEn = isMed ? 'medicines' : 'items';
        const nounHi = isMed ? 'दवाइयां' : 'उत्पाद';
        const nounMr = isMed ? 'औषधे' : 'वस्तू';

        let replyText = '';
        if (allItems.length > 0) {
          const itemSummary = allItems.map(i => `${i.name}${i.price ? ` (${i.price})` : ''}`).join(', ');
          if (queryLang === 'mr-IN') {
            replyText = `आमच्या लाइव्ह डेटाबेसमध्ये सध्या उपलब्ध ${nounMr}: ${itemSummary}.${sec ? ' मी आपल्या स्क्रीनला थेट लाइव्ह स्टॉक तक्त्यावर नेले आहे!' : ''}`;
          } else if (queryLang === 'hi-IN') {
            replyText = `हमारे लाइव डेटाबेस में उपलब्ध ${nounHi}: ${itemSummary}।${sec ? ' मैंने स्क्रीन को सीधे लाइव टेबल पर स्क्रॉल कर दिया है!' : ''}`;
          } else {
            replyText = `We currently have ${allItems.length} ${nounEn} in our live database: ${itemSummary}.${sec ? ' I have scrolled your screen down to the live inventory table!' : ''}`;
          }
        } else {
          if (sec) {
            if (queryLang === 'mr-IN') {
              replyText = `आमचा संपूर्ण कॅटलॉग थेट खालील ${sec.label} विभागात उपलब्ध आहे. मी आपल्याला तेथे नेले आहे!`;
            } else if (queryLang === 'hi-IN') {
              replyText = `हमारा पूरा कैटलॉग नीचे ${sec.label} में उपलब्ध है। मैंने आपको वहां स्क्रॉल कर दिया है!`;
            } else {
              replyText = `Our full catalog is available directly in the ${sec.label} section on this page. I have scrolled your screen right to it!`;
            }
          } else {
            if (queryLang === 'mr-IN') {
              replyText = `मी डेटाबेस तपासला, परंतु या कॅटलॉगमध्ये सध्या कोणत्याही वस्तू किंवा औषधांची नोंद नाही. आपण आमच्या सेवा किंवा वैशिष्ट्यांबद्दल जाणून घेऊ इच्छिता का?`;
            } else if (queryLang === 'hi-IN') {
              replyText = `मैंने डेटाबेस चेक किया, लेकिन इस कैटलॉग में कोई उत्पाद या दवा रिकॉर्ड दर्ज नहीं है। यदि आप हमारी सेवाओं या सुविधाओं के बारे में जानना चाहते हैं, तो कृपया पूछें।`;
            } else {
              replyText = `I checked our database, but no product or medicine records are currently loaded in this catalog. If you would like to know about our services or features, please let me know!`;
            }
          }
        }

        return {
          reply: replyText,
          navAction: sec ? { label: `View ${sec.label}`, sectionInfo: sec } : null
        };
      }

      // 2. Direct Section Navigation Handler (e.g. "take me to pricing", "where is contact")
      if (bridge && bridge.status === 'NAVIGATE_SECTION') {
        const sec = bridge.data || findHostSection(text);
        if (sec) {
          scrollToHostSection(sec);
          let navReply = `Certainly! I have scrolled your screen directly to our ${sec.label} section right here.`;
          if (queryLang === 'mr-IN') {
            navReply = `नक्कीच! मी आपल्या स्क्रीनला थेट आमच्या ${sec.label} विभागावर नेले आहे.`;
          } else if (queryLang === 'hi-IN') {
            navReply = `ज़रूर! मैंने स्क्रीन को सीधे हमारे ${sec.label} सेक्शन पर स्क्रॉल कर दिया है।`;
          }
          return {
            reply: navReply,
            navAction: { label: `Jump to ${sec.label}`, sectionInfo: sec }
          };
        }
      }

      // 3. Exact Database Item Found in Host State / Live API
      if (bridge && (bridge.status === 'FOUND_IN_HOST_STATE' || bridge.status === 'FOUND_IN_LIVE_API')) {
        const formatted = formatRealtimeStockResponse(bridge.data, queryLang);
        const sec = findHostSection('inventory');
        if (sec) scrollToHostSection(sec);
        return {
          reply: formatted,
          navAction: sec ? { label: `View ${bridge.data.name || 'Item'} in Table`, sectionInfo: sec } : null
        };
      }

      // 4. Item Not Listed in Catalog
      if (bridge && bridge.status === 'ITEM_NOT_FOUND') {
        const item = bridge.item || 'The requested item';
        const allItems = getAllCatalogItems(agentConfig);
        const topAvailable = allItems.slice(0, 3).map(i => i.name).filter(Boolean);
        const sec = findHostSection('inventory');
        if (sec) scrollToHostSection(sec);

        let replyText = '';
        if (queryLang === 'mr-IN') {
          replyText = `मी तपासले, पण "${item}" सध्या आमच्या लाइव्ह कॅटलॉगमध्ये उपलब्ध नाही.${topAvailable.length > 0 ? ` आमच्याकडे सध्या उपलब्ध पर्याय: ${topAvailable.join(', ')}.` : ''} आपण उपलब्ध औषधांची माहिती पाहू इच्छिता?`;
        } else if (queryLang === 'hi-IN') {
          replyText = `मैंने चेक किया, लेकिन "${item}" वर्तमान में हमारे लाइव कैटलॉग में उपलब्ध नहीं है।${topAvailable.length > 0 ? ` हमारे पास उपलब्ध दवाइयां: ${topAvailable.join(', ')}।` : ''} क्या आप उपलब्ध कैटलॉग देखना चाहेंगे?`;
        } else {
          replyText = `I checked our live catalog, but "${item}" is not currently listed.${topAvailable.length > 0 ? ` Available options in stock include: ${topAvailable.join(', ')}.` : ''} Would you like to check our live inventory section?`;
        }

        return {
          reply: replyText,
          navAction: sec ? { label: 'View Live Catalog Table', sectionInfo: sec } : null
        };
      }

      // Marathi Conversational Queries
      if (/(नमस्कार|कसे आहात|काय चाललंय|हाय|हॅलो|शुभ सकाळ|शुभ संध्याकाळ)/i.test(text) || /\b(kasa ahes|kase ahat|namaskar)\b/i.test(lower)) {
        return `नमस्कार! मी ${agentConfig.name} आहे, आपला व्हॉइस असिस्टंट. मी आपल्याला कशी मदत करू शकतो?`;
      }
      if (/(तुम्ही कोण आहात|तुमचे नाव काय|ओळख द्या)/i.test(text) || /\b(tumhi kon ahat)\b/i.test(lower)) {
        return `मी ${agentConfig.name} आहे, या वेबसाइटचा अधिकृत एआय व्हॉइस असिस्टंट.`;
      }
      if (/(तुम्ही काय करू शकता|मदत करा|सेवा|वैशिष्ट्ये)/i.test(text) || /\b(tumhi kay karu shakta|madat kara)\b/i.test(lower)) {
        return "मी आपल्या सर्व शंकांचे निरसन करू शकतो आणि आमच्या सेवांबद्दल माहिती देऊ शकतो. आपल्याला काय जाणून घ्यायचे आहे?";
      }
      if (/(धन्यवाद|आभार|खूप छान)/i.test(text) || /\b(dhanyavad|dhanyavaad|aabhar)\b/i.test(lower)) {
        return "आपले मनःपूर्वक स्वागत आहे! मी आपल्याला आणखी काही मदत करू शकतो का?";
      }
      if (/(अलविदा|बाय|पुन्हा भेटू|काळजी घ्या)/i.test(text)) {
        return "धन्यवाद! काळजी घ्या आणि आपला दिवस चांगला जावो.";
      }

      // Hindi Conversational Queries
      if (/(नमस्ते|प्रणाम|हेलो|हाय|कैसे हो|क्या हाल है|शुभ प्रभात)/i.test(text) || /\b(namaste|kaise ho|kya haal)\b/i.test(lower)) {
        return `नमस्ते! मैं ${agentConfig.name} हूँ, आपका एआई वॉइस गाइड। मैं आज आपकी क्या सहायता कर सकता हूँ?`;
      }
      if (/(आप कौन हैं|तुम्हारा नाम क्या|अपना परिचय)/i.test(text) || /\b(aap kaun hain)\b/i.test(lower)) {
        return `मैं ${agentConfig.name} हूँ, आपकी वेबसाइट का आधिकारिक एआई वॉइस गाइड।`;
      }
      if (/(आप क्या कर सकते हैं|मदद करो|सुविधाएं|सेवाएं)/i.test(text) || /\b(aap kya kar sakte hain|madad karo)\b/i.test(lower)) {
        return "मैं आपको हमारी सेवाओं, उत्पादों और जानकारी के बारे में विस्तृत सहायता प्रदान कर सकता हूँ। आप क्या जानना चाहते हैं?";
      }
      if (/(धन्यवाद|शुक्रिया|बहुत अच्छा)/i.test(text) || /\b(dhanyawad|shukriya)\b/i.test(lower)) {
        return "आपका बहुत-बहुत स्वागत है! क्या मैं आपकी किसी अन्य चीज़ में सहायता कर सकता हूँ?";
      }
      if (/(अलविदा|बाय|फिर मिलेंगे)/i.test(text)) {
        return "धन्यवाद! आपका दिन शुभ हो, फिर मिलेंगे।";
      }

      // 1. Common English Conversational Greetings
      if (/^(hi|hello|hey|good\s(morning|afternoon|evening)|howdy)\b/i.test(lower)) {
        return agentConfig.greeting || `Hello! I'm ${agentConfig.name}, your ${agentConfig.role || 'assistant'}. How can I assist you today?`;
      }

      // 2. Identity & Role Inquiries
      if (/\b(who are you|what is your name|what do you do|introduce yourself)\b/i.test(lower)) {
        const topicSamples = (agentConfig.knowledgeBase || []).slice(0, 3).map(k => k.q).join(', ');
        return `I am ${agentConfig.name}, an AI voice agent configured as a ${agentConfig.role || 'customer assistant'}. I run directly in your browser with zero external servers. ${topicSamples ? `You can ask me about: ${topicSamples}.` : ''}`;
      }

      // 3. Capabilities & Help Inquiries
      if (/\b(what can you do|help me|features|services|capabilities|options)\b/i.test(lower)) {
        const kb = agentConfig.knowledgeBase || [];
        const topics = kb.slice(0, 4).map(k => k.q).filter(Boolean);
        const tools = (agentConfig.tools || []).map(t => t.name).filter(Boolean);
        let reply = "I can guide you through our services and answer your inquiries. ";
        if (topics.length > 0) {
          reply += "I'm trained to answer questions on " + topics.join('; ') + ". ";
        }
        if (tools.length > 0) {
          reply += "I can also trigger actions such as " + tools.join(', ') + ". ";
        }
        reply += "What would you like to know?";
        return reply;
      }

      // 4. Gratitude & Farewells
      if (/\b(thank you|thanks|appreciate it)\b/i.test(lower)) {
        return "You're very welcome! Let me know if there's anything else I can help you with.";
      }
      if (/\b(bye|goodbye|see you|have a good day)\b/i.test(lower)) {
        return "Goodbye! Have a great day, and feel free to reach out anytime.";
      }

      // 4.1 Technical/Developer Query Protection (Customer Assistant Boundary)
      if (/\b(?:(?:how\s+(?:do\s+i|can\s+i|to)\s+)?(?:get|find|obtain|create|generate|acquire|setup|add|enter|use)\s+.*(?:api\s*key|groq\s*key|gemini\s*key|google\s*key|key)|(?:where|how)\s+(?:do\s+i|can\s+i|to)\s+(?:get|find|obtain|create)\s+.*key|(?:groq|gemini|google)\s+(?:api\s*)?key|api\s*key\s*(?:of|for|from)\s*(?:google|groq|gemini)|key\s+(?:of|for|from)\s*(?:the\s*)?(?:google|groq|gemini)|embed|integrate|script tag|widget\.js)\b/i.test(lower)) {
        return `I am ${agentConfig.name}, your live customer support assistant. How can I assist you with our catalog, services, or placing an order today?`;
      }

      // 5. Backend Action Tool Intent Matching
      const tools = agentConfig.tools || [];
      for (const tool of tools) {
        const tName = (tool.name || '').toLowerCase();
        const tDesc = (tool.description || '').toLowerCase();
        if ((tName && lower.includes(tName)) || (tDesc && meaningfulWords.some(w => tDesc.includes(w)))) {
          return `I can help you with ${tool.name || 'this action'}. ${tool.description || ''}. Please share the necessary details and I'll proceed.`;
        }
      }

      // 6. Semantic Knowledge Base Matching (Customer-Safe Only)
      const kb = (agentConfig.knowledgeBase || []).filter(item => isCustomerSafeFaq(item.q, item.a));
      let bestItem = null;
      let highestScore = 0;

      for (const item of kb) {
        const qLower = (item.q || '').toLowerCase();
        const aLower = (item.a || '').toLowerCase();
        let score = 0;

        if (lower.includes(qLower) || qLower.includes(lower)) {
          score += 80;
        }

        for (const word of meaningfulWords) {
          if (qLower.includes(word)) score += 15;
          if (aLower.includes(word)) score += 5;
        }

        if (score > highestScore && isCustomerSafeFaq(item.q, item.a)) {
          highestScore = score;
          bestItem = item;
        }
      }

      if (bestItem && highestScore >= 25 && isCustomerSafeFaq(bestItem.q, bestItem.a)) {
        return bestItem.a;
      }

      // 7. Polite Everyday Knowledge & Catalog Guidance Fallback
      const allItems = getAllCatalogItems(agentConfig);
      if (allItems.length > 0 && /\b(medicine|med|product|item|drug|table|catalog|stock|price)\b/i.test(lower)) {
        const itemSummary = allItems.slice(0, 4).map(i => `${i.name}${i.price ? ` (${i.price})` : ''}`).join(', ');
        const sec = findHostSection('inventory');
        if (sec) scrollToHostSection(sec);
        let catReply = `In our live database, we currently offer: ${itemSummary}.${sec ? ' I have scrolled your screen down to the live inventory table!' : ''}`;
        if (queryLang === 'mr-IN') {
          catReply = `आमच्या लाइव्ह डेटाबेसमध्ये उपलब्ध पर्याय: ${itemSummary}.${sec ? ' मी स्क्रीन थेट लाइव्ह स्टॉक तक्त्यावर नेली आहे!' : ''}`;
        } else if (queryLang === 'hi-IN') {
          catReply = `हमारे लाइव डेटाबेस में उपलब्ध विकल्प: ${itemSummary}।${sec ? ' मैंने स्क्रीन को सीधे लाइव इन्वेंटरी टेबल पर स्क्रॉल कर दिया है!' : ''}`;
        }
        return {
          reply: catReply,
          navAction: sec ? { label: `View ${sec.label}`, sectionInfo: sec } : null
        };
      }

      if (queryLang === 'mr-IN') {
        return `मी ${agentConfig.name} आहे. मी आपल्या प्रश्नाचे स्वागत करतो. आपण आमच्या सेवा, कॅटलॉग, थेट डेटाबेस साठा, किंमती किंवा अपॉइंटमेंटबद्दल विचारू शकता. मी कशी मदत करू?`;
      }
      if (queryLang === 'hi-IN') {
        return `मैं ${agentConfig.name} हूँ। मैं आपकी सहायता के लिए तत्पर हूँ। आप हमारी सेवाओं, कैटलॉग, लाइव डेटाबेस स्टॉक, कीमतों या अपॉइंटमेंट के बारे में पूछ सकते हैं। मैं आपकी क्या मदद करूँ?`;
      }

      return `Hello, I'm ${agentConfig.name}! I am your customer support guide for this website. You can ask me about our services, database catalog, live stock, pricing, or ask me to scroll to any section on this page!`;
    }

    // Maintain multi-turn conversation memory & session logs
    const conversationHistory = [];
    const visitorId = 'Visitor #' + Math.floor(1000 + Math.random() * 9000);
    const sessionStartTime = Date.now();
    const sessionLogMessages = [];
    let saveLogTimeout = null;

    function recordSessionLogToAgentFolder(msgs) {
      if (!msgs || msgs.length === 0) return;
      clearTimeout(saveLogTimeout);
      saveLogTimeout = setTimeout(async () => {
        let cleanAgentTitle = (agentConfig.name || agentId || 'Voice Assistant').trim();
        if (/^agent_[a-z0-9_]+$/i.test(cleanAgentTitle)) {
          cleanAgentTitle = cleanAgentTitle.replace(/^agent_/, '').replace(/_[a-z0-9]{4,6}$/, '').replace(/_/g, ' ')
            .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
        cleanAgentTitle = cleanAgentTitle.replace(/\//g, '-').trim() || 'Voice Assistant';

        const durationSec = Math.max(1, Math.round((Date.now() - sessionStartTime) / 1000));
        const durationStr = durationSec < 60 ? `${durationSec}s` : `${Math.floor(durationSec / 60)}m ${durationSec % 60}s`;
        const summaryText = msgs[0]?.text || 'Visitor voice inquiry';

        const sessionPayload = {
          id: cleanAgentTitle,
          agentId: cleanAgentTitle,
          agentName: cleanAgentTitle,
          title: `${cleanAgentTitle} - Overall Conversation`,
          caller: visitorId,
          duration: durationStr,
          status: 'Resolved',
          summary: summaryText.substring(0, 85),
          lastMessage: msgs[msgs.length - 1]?.text || 'Voice interaction',
          timestamp: 'Just now',
          createdAt: new Date().toISOString(),
          messages: msgs,
          overallConversation: msgs
        };

        // 1. LocalStorage folder caching using clean agent title
        try {
          const storeKey = `echo_logs_${cleanAgentTitle}`;
          const existing = JSON.parse(localStorage.getItem(storeKey) || '[]');
          const updated = [sessionPayload, ...existing.filter(i => i.id !== cleanAgentTitle)].slice(0, 50);
          localStorage.setItem(storeKey, JSON.stringify(updated));

          const allKey = 'echo_logs_all';
          const existingAll = JSON.parse(localStorage.getItem(allKey) || '[]');
          const updatedAll = [sessionPayload, ...existingAll.filter(i => i.id !== cleanAgentTitle)].slice(0, 100);
          localStorage.setItem(allKey, JSON.stringify(updatedAll));
        } catch (e) {}

        // 2. Persist to single agent conversation document in Firestore (NO encrypted ID!)
        try {
          await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/conversations/${encodeURIComponent(cleanAgentTitle)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                id: { stringValue: cleanAgentTitle },
                agentId: { stringValue: cleanAgentTitle },
                agentName: { stringValue: cleanAgentTitle },
                agentTitle: { stringValue: cleanAgentTitle },
                title: { stringValue: `${cleanAgentTitle} - Overall Conversation` },
                caller: { stringValue: visitorId },
                duration: { stringValue: durationStr },
                status: { stringValue: 'Active' },
                summary: { stringValue: summaryText.substring(0, 85) },
                lastMessage: { stringValue: (msgs[msgs.length - 1]?.text || '').substring(0, 150) },
                timestamp: { stringValue: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
                createdAt: { timestampValue: new Date().toISOString() },
                totalMessages: { integerValue: String(msgs.length) },
                messages: {
                  arrayValue: {
                    values: msgs.map(m => ({
                      mapValue: {
                        fields: {
                          role: { stringValue: m.role || 'user' },
                          sender: { stringValue: m.role || 'user' },
                          text: { stringValue: m.text || '' },
                          timestamp: { stringValue: m.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
                        }
                      }
                    }))
                  }
                },
                overallConversation: {
                  arrayValue: {
                    values: msgs.map(m => ({
                      mapValue: {
                        fields: {
                          role: { stringValue: m.role || 'user' },
                          sender: { stringValue: m.role || 'user' },
                          text: { stringValue: m.text || '' },
                          timestamp: { stringValue: m.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
                        }
                      }
                    }))
                  }
                }
              }
            })
          });
        } catch (err) {
          // LocalStorage cache already secured
        }
      }, 400);
    }

    // Process Message with User-Provided API Key (Groq / Gemini / OpenAI with Local Semantic Fallback)
    async function handleUserMessage(userText) {
      // Re-verify if agent has been deleted before responding
      const stillActive = await fetchAgentConfig();
      if (!stillActive) {
        const existing = document.getElementById('voice-helpdesk-root');
        if (existing) existing.remove();
        return;
      }

      appendMsg(userText, 'user');
      conversationHistory.push({ role: 'user', content: userText });
      sessionLogMessages.push({ role: 'user', text: userText, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
      orb.className = 'vhd-orb-btn listening';
      voiceLabel.textContent = 'Thinking...';

      const detectedQueryLang = detectTextLanguage(userText);
      if (recognition && currentSpeechLang === 'auto') {
        recognition.lang = detectedQueryLang;
      }

      let reply = '';
      let navAction = null;
      const apiKey = (currentScript && (currentScript.getAttribute('data-api-key') || currentScript.getAttribute('data-key'))) ||
                     agentConfig.apiKey ||
                     window.AI_AGENT_API_KEY ||
                     '';

      // 1. Deterministically resolve Live Real-Time Website Database Bridge first
      const bridgeResult = await resolveDatabaseBridge(userText, agentConfig);
      if (bridgeResult && (bridgeResult.status === 'FOUND_IN_HOST_STATE' || bridgeResult.status === 'FOUND_IN_LIVE_API' || bridgeResult.status === 'FOUND_CATALOG_LIST' || bridgeResult.status === 'NAVIGATE_SECTION' || bridgeResult.status === 'ITEM_NOT_FOUND')) {
        const localRes = await inferLocalAgentResponse(userText, bridgeResult);
        if (typeof localRes === 'object' && localRes !== null) {
          reply = localRes.reply || '';
          navAction = localRes.navAction || null;
        } else {
          reply = localRes;
        }
      }

      // 2. Call BYOK LLM if API Key is configured and bridge hasn't resolved it
      if (!reply && apiKey) {
        const customerSystemPrompt = buildCustomerSystemPrompt(agentConfig, bridgeResult, detectedQueryLang);
        reply = await callLLMWithBYOK(userText, customerSystemPrompt, conversationHistory, apiKey, agentConfig.model);
      }

      // 3. Fallback to Local Semantic Knowledge Reasoner if API key is not present or BYOK failed
      if (!reply) {
        const localRes = await inferLocalAgentResponse(userText, bridgeResult);
        if (typeof localRes === 'object' && localRes !== null) {
          reply = localRes.reply || '';
          navAction = localRes.navAction || null;
        } else {
          reply = localRes;
        }
      }

      conversationHistory.push({ role: 'assistant', content: reply });
      sessionLogMessages.push({ role: 'agent', text: reply, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
      recordSessionLogToAgentFolder(sessionLogMessages);

      orb.className = 'vhd-orb-btn speaking';
      voiceLabel.textContent = 'Speaking...';
      appendMsg(reply, 'agent', navAction);
      speakReply(reply);
    }

    // Deterministic Persona Voice Profiles
    const VOICE_SPECS = {
      adam: {
        name: 'Adam',
        gender: 'male',
        primaryVoices: [
          'Microsoft Guy Online (Natural) - English (United States)',
          'Microsoft Christopher Online (Natural) - English (United States)',
          'Microsoft Guy',
          'Microsoft Christopher',
          'Google US English Male',
          'Microsoft David',
          'Daniel',
          'Alex'
        ],
        keywords: ['guy', 'christopher', 'david', 'mark', 'daniel', 'alex', 'male', 'natural'],
        pitch: 0.90,
        rate: 0.97
      },
      rachel: {
        name: 'Rachel',
        gender: 'female',
        primaryVoices: [
          'Microsoft Jenny Online (Natural) - English (United States)',
          'Microsoft Aria Online (Natural) - English (United States)',
          'Microsoft Jenny',
          'Microsoft Aria',
          'Google US English Female',
          'Google US English',
          'Microsoft Zira',
          'Samantha',
          'Victoria'
        ],
        keywords: ['jenny', 'aria', 'zira', 'samantha', 'karen', 'victoria', 'female', 'natural'],
        pitch: 1.02,
        rate: 0.98
      },
      clara: {
        name: 'Clara',
        gender: 'female',
        primaryVoices: [
          'Microsoft Jenny Online (Natural) - English (United States)',
          'Microsoft Jenny',
          'Microsoft Aria Online (Natural) - English (United States)',
          'Google US English',
          'Microsoft Zira',
          'Samantha',
          'Victoria'
        ],
        keywords: ['jenny', 'aria', 'zira', 'samantha', 'karen', 'victoria', 'female'],
        pitch: 1.05,
        rate: 1.0
      },
      elliot: {
        name: 'Elliot',
        gender: 'male',
        primaryVoices: [
          'Microsoft Guy Online (Natural) - English (United States)',
          'Microsoft Guy',
          'Microsoft David',
          'Microsoft Mark',
          'Daniel',
          'Alex'
        ],
        keywords: ['guy', 'david', 'mark', 'daniel', 'alex', 'male'],
        pitch: 0.95,
        rate: 1.0
      },
      godfrey: {
        name: 'Godfrey',
        gender: 'male',
        primaryVoices: ['Microsoft George', 'Microsoft David', 'Google UK English Male', 'Daniel'],
        keywords: ['george', 'david', 'daniel', 'male', 'uk'],
        pitch: 0.84,
        rate: 0.96
      },
      layla: {
        name: 'Layla',
        gender: 'female',
        primaryVoices: ['Microsoft Sonia Online (Natural)', 'Microsoft Sonia', 'Microsoft Jenny', 'Google US English', 'Microsoft Zira', 'Samantha'],
        keywords: ['sonia', 'jenny', 'zira', 'samantha', 'female'],
        pitch: 1.14,
        rate: 1.02
      },
      emma: {
        name: 'Emma',
        gender: 'female',
        primaryVoices: ['Microsoft Libby Online (Natural) - English (United Kingdom)', 'Microsoft Libby', 'Google UK English Female', 'Microsoft Hazel', 'Fiona'],
        keywords: ['libby', 'hazel', 'stephanie', 'female', 'uk', 'gb'],
        pitch: 1.08,
        rate: 1.0
      },
      sid: {
        name: 'Sid',
        gender: 'male',
        primaryVoices: ['Microsoft Guy Online (Natural)', 'Microsoft David', 'Google US English Male', 'Alex'],
        keywords: ['guy', 'david', 'male'],
        pitch: 1.0,
        rate: 1.04
      },
      savannah: {
        name: 'Savannah',
        gender: 'female',
        primaryVoices: ['Microsoft Aria Online (Natural)', 'Microsoft Aria', 'Google US English', 'Samantha'],
        keywords: ['aria', 'natural', 'female'],
        pitch: 1.15,
        rate: 0.98
      },
      kai: {
        name: 'Kai',
        gender: 'male',
        primaryVoices: ['Microsoft Guy', 'Microsoft David', 'Google US English'],
        keywords: ['guy', 'david', 'natural', 'male'],
        pitch: 0.98,
        rate: 1.02
      },
      nico: {
        name: 'Nico',
        gender: 'male',
        primaryVoices: ['Microsoft Ryan Online (Natural)', 'Microsoft David', 'Alex'],
        keywords: ['ryan', 'david', 'male'],
        pitch: 0.92,
        rate: 1.0
      },
      sagar: {
        name: 'Sagar',
        gender: 'male',
        primaryVoices: ['Microsoft Ravi', 'Microsoft Heera', 'Google UK English Male', 'Microsoft David'],
        keywords: ['ravi', 'heera', 'indian', 'male'],
        pitch: 0.95,
        rate: 1.0
      }
    };

    let cachedVoices = [];
    let lockedVoice = null;
    let lockedPitch = 1.0;
    let lockedRate = 1.0;
    let currentLockedPersona = null;

    function refreshVoices() {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        cachedVoices = window.speechSynthesis.getVoices() || [];
        if (cachedVoices.length > 0) {
          resolveAndLockVoice(agentConfig.voice, true);
        }
      }
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      refreshVoices();
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }

    function resolveAndLockVoice(preferredName, forceUpdate = false) {
      const personaKey = String(preferredName || agentConfig.voice || 'Adam').toLowerCase().trim();
      
      // If voice is already locked for this exact persona and not forcing update, return immediately
      if (!forceUpdate && lockedVoice && currentLockedPersona === personaKey) {
        return { voice: lockedVoice, pitch: lockedPitch, rate: lockedRate };
      }

      currentLockedPersona = personaKey;
      if (!window.speechSynthesis) return { voice: null, pitch: 1.0, rate: 1.0 };

      const voices = (cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices()) || [];
      if (!voices.length) return { voice: null, pitch: 1.0, rate: 1.0 };

      const spec = VOICE_SPECS[personaKey] || VOICE_SPECS.adam || VOICE_SPECS.rachel || VOICE_SPECS.clara;
      lockedPitch = spec.pitch;
      lockedRate = spec.rate;

      // 1. Check session storage for locked voice specifically for this persona
      try {
        const savedURI = sessionStorage.getItem(`vhd_locked_${personaKey}`);
        if (savedURI) {
          const match = voices.find(v => v.voiceURI === savedURI);
          if (match) {
            lockedVoice = match;
            return { voice: lockedVoice, pitch: lockedPitch, rate: lockedRate };
          }
        }
      } catch (e) {}

      // 2. Check prioritized list of exact high-quality voice names
      for (const name of spec.primaryVoices) {
        const match = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
        if (match) {
          lockedVoice = match;
          try {
            sessionStorage.setItem(`vhd_locked_${personaKey}`, match.voiceURI);
          } catch (e) {}
          return { voice: lockedVoice, pitch: lockedPitch, rate: lockedRate };
        }
      }

      // 3. Fallback: match by gender & keywords
      const isFemale = spec.gender === 'female';
      const candidate = voices.find(v => {
        const n = v.name.toLowerCase();
        const isEnglish = v.lang.startsWith('en');
        if (!isEnglish) return false;
        const matchesKeyword = spec.keywords.some(k => n.includes(k));
        const hasFemaleTag = n.includes('female') || n.includes('zira') || n.includes('jenny') || n.includes('aria') || n.includes('samantha');
        const hasMaleTag = n.includes('male') || n.includes('david') || n.includes('guy') || n.includes('mark') || n.includes('george');
        return matchesKeyword || (isFemale ? hasFemaleTag : hasMaleTag);
      });

      if (candidate) {
        lockedVoice = candidate;
        try {
          sessionStorage.setItem(`vhd_locked_${personaKey}`, candidate.voiceURI);
        } catch (e) {}
        return { voice: candidate, pitch: spec.pitch, rate: spec.rate };
      }

      // 4. Fallback to English Natural or first English voice
      const fallback = voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural')) ||
                       voices.find(v => v.lang.startsWith('en')) ||
                       voices[0];

      if (fallback) {
        lockedVoice = fallback;
        try {
          sessionStorage.setItem(`vhd_locked_${personaKey}`, fallback.voiceURI);
        } catch (e) {}
        return { voice: fallback, pitch: spec.pitch, rate: spec.rate };
      }

      return { voice: null, pitch: spec.pitch, rate: spec.rate };
    }

    // Detect language from text: 'mr-IN' (Marathi), 'hi-IN' (Hindi), or 'en-US' (English)
    function detectTextLanguage(text) {
      if (!text || typeof text !== 'string') return 'en-US';
      const clean = text.trim();

      // 1. Devanagari script detection (\u0900 to \u097F)
      const devanagariMatches = clean.match(/[\u0900-\u097F]/g);
      if (devanagariMatches && devanagariMatches.length > 0) {
        let mrScore = 0;
        let hiScore = 0;

        // Distinctive Marathi markers
        const mrWords = /\b(आहे|आहेत|नाही|नाहीत|काय|कसे|कसा|कशी|करा|करावे|होय|मला|तुम्ही|आपण|आपले|आपली|आपल्या|नमस्कार|सांगा|सांगू|पाहिजे|झाले|झाली|झाला|करतो|करते|आहात|माझे|माझं|तुझे|तुझं|कुठे|कधी|कोण|कसं|आमचे|तुमचे|का|नक्की|छान|विचारू|शकता|द्या|येथे|बद्दल|वार|आज|उद्या|काल|कळवा)\b/g;
        const mrSuffixes = /(ंच्या|च्या|तील|वरून|साठी|बद्दल|कडून|नुसार)/g;
        const mrVerbEndings = /(तोय|तेय|ताहेत|तात|णार|लेलं)/g;

        const mrW = clean.match(mrWords);
        if (mrW) mrScore += mrW.length * 2;
        const mrS = clean.match(mrSuffixes);
        if (mrS) mrScore += mrS.length * 2;
        const mrV = clean.match(mrVerbEndings);
        if (mrV) mrScore += mrV.length * 2;

        // Distinctive Hindi markers
        const hiWords = /\b(है|हैं|हो|हूँ|हूं|था|थी|थे|क्या|कैसे|कैसा|कैसी|कहाँ|कहा|बताओ|बताइए|चाहिए|आपकी|आपका|आपके|मुझे|हमे|हमें|नहीं|शुक्रिया|नमस्ते|करना|करते|करता|करती|सकते|सकता|सकती|होगा|होगी|होंगे)\b/g;
        const hiW = clean.match(hiWords);
        if (hiW) hiScore += hiW.length * 2;

        if (mrScore > hiScore) return 'mr-IN';
        if (hiScore > mrScore) return 'hi-IN';

        if (/(आहे|च्या|सांगा|काय)/.test(clean)) return 'mr-IN';
        return 'hi-IN';
      }

      // 2. Romanized Hindi (Hinglish) & Romanized Marathi (Marathish) detection
      const lower = clean.toLowerCase();
      let mrRomanScore = 0;
      let hiRomanScore = 0;

      const mrRoman = /\b(kasa|kashi|ahes|ahe|ahet|nahit|kaay|tumhi|tumi|mala|amhi|aamhi|sanga|sangu|pahije|zhala|jhala|zhal|kuthe|aapan|aple|apli|shakto|shakte|vichara|baddal|sathi|madhye|aaj|udya|kiti|tumche|aamche|tula)\b/g;
      const hiRoman = /\b(kya|kaise|kaisa|kaisi|hai|hain|nahin|namaste|shukriya|mujhe|aap|hum|batao|bataiye|chahiye|hoga|hogi|theek|accha|achha|kahan|kidhar|kitna|kripya)\b/g;

      const mrM = lower.match(mrRoman);
      if (mrM) mrRomanScore += mrM.length;
      const hiM = lower.match(hiRoman);
      if (hiM) hiRomanScore += hiM.length;

      if (mrRomanScore > hiRomanScore) return 'mr-IN';
      if (hiRomanScore > mrRomanScore) return 'hi-IN';

      return 'en-US';
    }

    // Resolves optimal voice for English, Hindi, or Marathi text
    function resolveVoiceForText(preferredName, text) {
      const detectedLang = detectTextLanguage(text);
      const personaKey = String(preferredName || agentConfig.voice || 'Adam').toLowerCase().trim();
      const isFemale = VOICE_SPECS[personaKey]?.gender === 'female';

      if (!window.speechSynthesis) {
        return { voice: null, pitch: 1.0, rate: 1.0, lang: detectedLang };
      }

      const voices = (cachedVoices.length > 0 ? cachedVoices : window.speechSynthesis.getVoices()) || [];

      if (detectedLang === 'mr-IN') {
        const mrVoice = voices.find(v => {
          const n = v.name.toLowerCase();
          const l = (v.lang || '').toLowerCase();
          const isMr = l.startsWith('mr') || n.includes('marathi') || n.includes('मराठी') || n.includes('manohar') || n.includes('aarohi');
          if (!isMr) return false;
          return isFemale ? (n.includes('female') || n.includes('aarohi') || n.includes('heera')) : (!n.includes('female') && !n.includes('aarohi'));
        }) || voices.find(v => (v.lang || '').toLowerCase().startsWith('mr') || v.name.toLowerCase().includes('marathi'));

        if (mrVoice) return { voice: mrVoice, pitch: isFemale ? 1.05 : 0.95, rate: 0.98, lang: 'mr-IN' };

        const hiFallback = voices.find(v => {
          const n = v.name.toLowerCase();
          const l = (v.lang || '').toLowerCase();
          const isHi = l.startsWith('hi') || n.includes('hindi') || n.includes('हिन्दी') || n.includes('hemant') || n.includes('kalpana');
          if (!isHi) return false;
          return isFemale ? (n.includes('female') || n.includes('kalpana')) : (!n.includes('female') && !n.includes('kalpana'));
        }) || voices.find(v => (v.lang || '').toLowerCase().startsWith('hi'));

        if (hiFallback) return { voice: hiFallback, pitch: isFemale ? 1.05 : 0.95, rate: 0.98, lang: 'hi-IN' };
      }

      if (detectedLang === 'hi-IN') {
        const hiVoice = voices.find(v => {
          const n = v.name.toLowerCase();
          const l = (v.lang || '').toLowerCase();
          const isHi = l.startsWith('hi') || n.includes('hindi') || n.includes('हिन्दी') || n.includes('hemant') || n.includes('kalpana');
          if (!isHi) return false;
          return isFemale ? (n.includes('female') || n.includes('kalpana')) : (!n.includes('female') && !n.includes('kalpana'));
        }) || voices.find(v => (v.lang || '').toLowerCase().startsWith('hi') || v.name.toLowerCase().includes('hindi'));

        if (hiVoice) return { voice: hiVoice, pitch: isFemale ? 1.05 : 0.95, rate: 0.98, lang: 'hi-IN' };
      }

      const resolved = resolveAndLockVoice(preferredName);
      return { ...resolved, lang: resolved?.voice?.lang || 'en-US' };
    }

    // Speak Reply via Browser Web Speech Synthesis (Hardened GC Pinning & Watchdog)
    function speakReply(text) {
      if (!window.speechSynthesis || !text) {
        orb.className = 'vhd-orb-btn';
        voiceLabel.textContent = currentSpeechLang.startsWith('hi') ? 'बोलने के लिए टैप करें' :
                                 currentSpeechLang.startsWith('mr') ? 'बोलण्यासाठी टॅप करा' :
                                 'Tap to Speak';
        return;
      }

      // 1. Cleanly cancel pending/paused speech in browser
      try { window.speechSynthesis.cancel(); } catch (_) {}
      if (window.__vhdWatchdog) clearTimeout(window.__vhdWatchdog);
      if (window.__vhdHeartbeat) clearInterval(window.__vhdHeartbeat);

      if (window.speechSynthesis.paused) {
        try { window.speechSynthesis.resume(); } catch (_) {}
      }

      const cleanSpoken = String(text).replace(/[*#_`]/g, '').trim();
      if (!cleanSpoken) return;

      const utterance = new SpeechSynthesisUtterance(cleanSpoken);
      const resolved = resolveVoiceForText(agentConfig.voice, cleanSpoken);
      if (resolved.voice) {
        utterance.voice = resolved.voice;
      }
      utterance.pitch = resolved.pitch;
      utterance.rate = resolved.rate;
      utterance.lang = resolved.lang || 'en-US';

      // Pin utterance to window so V8 Garbage Collection cannot silence speech mid-sentence
      window.__vhdActiveUtterance = utterance;

      let hasFinished = false;
      const cleanupSpeech = () => {
        if (hasFinished) return;
        hasFinished = true;
        if (window.__vhdWatchdog) clearTimeout(window.__vhdWatchdog);
        if (window.__vhdHeartbeat) clearInterval(window.__vhdHeartbeat);
        window.__vhdActiveUtterance = null;
        orb.className = 'vhd-orb-btn';
        voiceLabel.textContent = currentSpeechLang.startsWith('hi') ? 'बोलने के लिए टैप करें' :
                                 currentSpeechLang.startsWith('mr') ? 'बोलण्यासाठी टॅप करा' :
                                 'Tap to Speak';
      };

      utterance.onstart = () => {
        orb.className = 'vhd-orb-btn speaking';
        voiceLabel.textContent = resolved.lang.startsWith('hi') ? 'बोल रहे हैं...' :
                                 resolved.lang.startsWith('mr') ? 'बोलत आहे...' :
                                 'Speaking...';

        // Chrome Heartbeat: prevents browser synthesis engine from freezing on utterances > 8s
        if (window.__vhdHeartbeat) clearInterval(window.__vhdHeartbeat);
        window.__vhdHeartbeat = setInterval(() => {
          if (window.speechSynthesis && window.speechSynthesis.speaking) {
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }
        }, 7000);
      };

      utterance.onend = cleanupSpeech;
      utterance.onerror = cleanupSpeech;

      // Fallback Watchdog Timer: auto-release UI if browser drops onend
      const maxSpeechMs = Math.max(4000, Math.round((cleanSpoken.length / 10) * 1000) + 3000);
      window.__vhdWatchdog = setTimeout(() => {
        if (!hasFinished) {
          console.warn('[Widget Voice Watchdog] Speech timed out, releasing orb');
          try { window.speechSynthesis.cancel(); } catch (_) {}
          cleanupSpeech();
        }
      }, maxSpeechMs);

      try {
        window.speechSynthesis.speak(utterance);
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch (speakErr) {
        console.warn('[Widget Voice] Speech error:', speakErr);
        cleanupSpeech();
      }
    }
  }

  // Start initialization with strict deletion check
  async function startWidget() {
    isAgentActive = await fetchAgentConfig();
    if (isAgentActive) {
      initWidget();
    } else {
      console.warn(`[Voice Help Desk] Agent "${cleanInitialName}" (ID: ${agentId}) does not exist in the database or has been deleted. Voice widget is disabled.`);
      const existing = document.getElementById('voice-helpdesk-root');
      if (existing) existing.remove();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startWidget);
  } else {
    startWidget();
  }
})();
