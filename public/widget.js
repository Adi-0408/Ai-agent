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
  const CACHE_TTL_MS = 15 * 1000; // 15 second cache so edits reflect quickly

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

  // Fetch Agent Config from Firestore REST API (with multi-strategy lookup)
  async function fetchAgentConfig() {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < CACHE_TTL_MS && parsed.data) {
            agentConfig = { ...agentConfig, ...parsed.data };
          }
        } catch (e) {}
      }

      // 1. Try exact agentId
      let res = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agents/${encodeURIComponent(agentId)}`);
      
      // 2. Try clean human-readable name
      if (!res.ok && agentId !== cleanInitialName) {
        const retryRes = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agents/${encodeURIComponent(cleanInitialName)}`);
        if (retryRes.ok) res = retryRes;
      }

      // 3. Multi-strategy search across agents collection
      if (!res.ok) {
        try {
          const listRes = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agents`);
          if (listRes.ok) {
            const listJson = await listRes.json();
            const docs = listJson.documents || [];
            const targetLower = cleanInitialName.toLowerCase();
            const match = docs.find(d => {
              const dName = (d.fields?.name?.stringValue || '').toLowerCase().trim();
              const dId = (d.fields?.id?.stringValue || '').toLowerCase().trim();
              const docName = (d.name || '').toLowerCase();
              return dName === targetLower || dId === targetLower || docName.endsWith('/' + encodeURIComponent(cleanInitialName).toLowerCase()) || dName.includes(targetLower) || targetLower.includes(dName);
            });
            if (match) {
              res = { ok: true, json: async () => match };
            }
          }
        } catch (searchErr) {}
      }

      if (res.ok) {
        const json = await res.json();
        if (json && json.fields) {
          const fields = json.fields;
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
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: parsedData, timestamp: Date.now() }));

          if (agentConfig.voice) {
            resolveAndLockVoice(agentConfig.voice, true);
          }
        }
      }
    } catch (err) {
      console.warn('[Voice Help Desk] Could not fetch remote config, using defaults:', err);
    }
  }

  // Inject Shadow DOM Widget
  function initWidget() {
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
      recognition.lang = currentSpeechLang === 'auto' ? 'hi-IN' : currentSpeechLang;

      recognition.onstart = () => {
        isListening = true;
        finalRecordedTranscript = '';
        lastCapturedSpokenText = '';
        orb.className = 'vhd-orb-btn listening';
        voiceLabel.textContent = currentSpeechLang === 'auto' ? 'Listening (Auto-Detecting language)...' :
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
        if (event?.error === 'not-allowed' || event?.error === 'permission-denied') {
          voiceLabel.textContent = 'Mic blocked! Allow in URL bar';
          appendMsg('Microphone access was denied. Please click the camera/lock icon in your address bar and allow microphone permissions.', 'agent');
        } else if (event?.error === 'no-speech') {
          voiceLabel.textContent = 'No voice heard. Tap to retry';
        } else if (event?.error === 'audio-capture') {
          voiceLabel.textContent = 'No microphone device found';
        } else {
          voiceLabel.textContent = currentSpeechLang === 'auto' ? 'Tap to Speak (Auto-Detect)' : 'Tap to Speak';
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
                body: formData
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

    // Voice Orb Click
    orb.addEventListener('click', async () => {
      if (!recognition) {
        alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
        return;
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
    function appendMsg(text, sender) {
      const div = document.createElement('div');
      div.className = `vhd-msg vhd-msg-${sender}`;
      div.textContent = text;
      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }

    // Autonomous Zero-API-Key Local Reasoning Engine
    function inferLocalAgentResponse(userText) {
      const text = userText.trim();
      const lower = text.toLowerCase();
      const cleanWords = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
      const stopWords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'are', 'what', 'your', 'about', 'can', 'you']);
      const meaningfulWords = cleanWords.filter(w => !stopWords.has(w));

      // Marathi Conversational Queries
      if (/(नमस्कार|कसे आहात|काय चाललंय|हाय|हॅलो|शुभ सकाळ|शुभ संध्याकाळ)\b/i.test(text) || /\b(kasa ahes|kase ahat|namaskar)\b/i.test(lower)) {
        return `नमस्कार! मी ${agentConfig.name} आहे, आपला व्हॉइस असिस्टंट. मी आपल्याला कशी मदत करू शकतो?`;
      }
      if (/(तुम्ही कोण आहात|तुमचे नाव काय|ओळख द्या)\b/i.test(text) || /\b(tumhi kon ahat)\b/i.test(lower)) {
        return `मी ${agentConfig.name} आहे, या वेबसाइटचा अधिकृत एआय व्हॉइस असिस्टंट.`;
      }
      if (/(तुम्ही काय करू शकता|मदत करा|सेवा|वैशिष्ट्ये)\b/i.test(text) || /\b(tumhi kay karu shakta|madat kara)\b/i.test(lower)) {
        return "मी आपल्या सर्व शंकांचे निरसन करू शकतो आणि आमच्या सेवांबद्दल माहिती देऊ शकतो. आपल्याला काय जाणून घ्यायचे आहे?";
      }
      if (/(धन्यवाद|आभार|खूप छान)\b/i.test(text) || /\b(dhanyavad|dhanyavaad|aabhar)\b/i.test(lower)) {
        return "आपले मनःपूर्वक स्वागत आहे! मी आपल्याला आणखी काही मदत करू शकतो का?";
      }
      if (/(अलविदा|बाय|पुन्हा भेटू|काळजी घ्या)\b/i.test(text)) {
        return "धन्यवाद! काळजी घ्या आणि आपला दिवस चांगला जावो.";
      }

      // Hindi Conversational Queries
      if (/(नमस्ते|प्रणाम|हेलो|हाय|कैसे हो|क्या हाल है|शुभ प्रभात)\b/i.test(text) || /\b(namaste|kaise ho|kya haal)\b/i.test(lower)) {
        return `नमस्ते! मैं ${agentConfig.name} हूँ, आपका एआई वॉइस गाइड। मैं आज आपकी क्या सहायता कर सकता हूँ?`;
      }
      if (/(आप कौन हैं|तुम्हारा नाम क्या|अपना परिचय)\b/i.test(text) || /\b(aap kaun hain)\b/i.test(lower)) {
        return `मैं ${agentConfig.name} हूँ, आपकी वेबसाइट का आधिकारिक एआई वॉइस गाइड।`;
      }
      if (/(आप क्या कर सकते हैं|मदद करो|सुविधाएं|सेवाएं)\b/i.test(text) || /\b(aap kya kar sakte hain|madad karo)\b/i.test(lower)) {
        return "मैं आपको हमारी सेवाओं, उत्पादों और जानकारी के बारे में विस्तृत सहायता प्रदान कर सकता हूँ। आप क्या जानना चाहते हैं?";
      }
      if (/(धन्यवाद|शुक्रिया|बहुत अच्छा)\b/i.test(text) || /\b(dhanyawad|shukriya)\b/i.test(lower)) {
        return "आपका बहुत-बहुत स्वागत है! क्या मैं आपकी किसी अन्य चीज़ में सहायता कर सकता हूँ?";
      }
      if (/(अलविदा|बाय|फिर मिलेंगे)\b/i.test(text)) {
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

      // 5. Backend Action Tool Intent Matching
      const tools = agentConfig.tools || [];
      for (const tool of tools) {
        const tName = (tool.name || '').toLowerCase();
        const tDesc = (tool.description || '').toLowerCase();
        if ((tName && lower.includes(tName)) || (tDesc && meaningfulWords.some(w => tDesc.includes(w)))) {
          return `I can help you with ${tool.name || 'this action'}. ${tool.description || ''}. Please share the necessary details and I'll proceed.`;
        }
      }

      // 6. Semantic Knowledge Base Matching
      const kb = agentConfig.knowledgeBase || [];
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

        if (score > highestScore) {
          highestScore = score;
          bestItem = item;
        }
      }

      if (bestItem && highestScore >= 15) {
        return bestItem.a;
      }

      // 7. Contextual Fallback
      const sampleQuestions = kb.slice(0, 3).map(k => k.q).filter(Boolean);
      if (sampleQuestions.length > 0) {
        return `I understand you're asking about "${text}". While I don't have that specific detail, I can answer questions like: ${sampleQuestions.join(', ')}. What would you like to explore?`;
      }

      return `I'm ${agentConfig.name}. I didn't quite catch that, but please feel free to ask about our services, support, or pricing!`;
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

    // Process Message with User-Provided API Key (Groq LPU <200ms with Local Semantic Fallback)
    async function handleUserMessage(userText) {
      appendMsg(userText, 'user');
      conversationHistory.push({ role: 'user', content: userText });
      sessionLogMessages.push({ role: 'user', text: userText, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
      orb.className = 'vhd-orb-btn listening';
      voiceLabel.textContent = 'Thinking...';

      let reply = '';
      const apiKey = (currentScript && (currentScript.getAttribute('data-api-key') || currentScript.getAttribute('data-key'))) ||
                     agentConfig.apiKey ||
                     window.AI_AGENT_API_KEY ||
                     '';

      function sanitizeSpokenWidgetText(raw) {
        if (!raw) return '';
        let str = String(raw).trim();
        if (str.startsWith('{') || str.startsWith('[') || str.includes('"agent_config"') || str.includes('"personality"')) {
          try {
            const parsed = JSON.parse(str);
            if (parsed.message) return sanitizeSpokenWidgetText(parsed.message);
            if (parsed.response) return sanitizeSpokenWidgetText(parsed.response);
            if (parsed.description) return sanitizeSpokenWidgetText(parsed.description);
            if (parsed.agent_config?.description) return sanitizeSpokenWidgetText(parsed.agent_config.description);
          } catch (_) {
            const descMatch = str.match(/"description"\s*:\s*"([^"]+)"/i);
            if (descMatch) return descMatch[1];
          }
          return "Hello! How can I assist you today?";
        }
        return str.replace(/[*#_`]/g, '').trim();
      }

      // 1. Live AI Inference using User-Provided API Key
      if (apiKey && apiKey.startsWith('gsk_')) {
        try {
          const kbFacts = (agentConfig.knowledgeBase || []).slice(0, 25);
          const kbText = kbFacts.length > 0 ? `\nVerified Website Knowledge Base Facts:\n${JSON.stringify(kbFacts)}` : '';
          const systemContext = `Your name is "${agentConfig.name}". You are "${agentConfig.name}", the official AI voice guide for this website. Never introduce yourself as "app Concierge", "Site Sentinel", "Help Desk AI", or any other name. Always identify yourself as "${agentConfig.name}".\n\n${agentConfig.prompt || agentConfig.systemPrompt || `You are ${agentConfig.name}, the official AI voice guide for this website.`}${kbText}\n\nCRITICAL INSTRUCTIONS:\n1. Conversational Voice Output: Respond in 1 to 2 clear, natural, spoken sentences directly answering the visitor. Never output markdown asterisks, hashtags, or bullet points as this will be read aloud by browser voice synthesis.\n2. Normal Everyday Inquiries: Warmly and helpfully answer normal everyday questions, greetings, small talk, and common conversational queries. Never decline ordinary conversation or state you lack data for everyday pleasantries.\n3. Website & Product Inquiries: For questions regarding products, services, policies, or specifications, accurately reference the verified facts above.\n4. Output Format: ALWAYS output pure spoken speech text directly. NEVER output JSON, code blocks, or configuration objects.\n5. Multilingual Rules: You support English, Hindi (हिंदी), and Marathi (मराठी). You MUST always detect the language of the user's message (Hindi, Marathi, or English) and reply in that EXACT SAME language. If the user asks in Hindi, reply in natural, polite Hindi. If the user asks in Marathi, reply in natural, polite Marathi. If the user asks in English, reply in natural English.`;

          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: agentConfig.model || 'llama-3.3-70b-versatile',
              messages: [
                { role: 'system', content: systemContext },
                ...conversationHistory.slice(-6)
              ],
              temperature: 0.5,
              max_tokens: 160
            }),
            signal: AbortSignal.timeout(6000)
          });

          if (groqRes.ok) {
            const data = await groqRes.json();
            if (data.choices && data.choices[0] && data.choices[0].message) {
              reply = sanitizeSpokenWidgetText(data.choices[0].message.content);
            }
          }
        } catch (apiErr) {
          console.warn('[Voice Help Desk] Live AI inference error, using local fallback:', apiErr);
        }
      }

      // 2. Fallback to Local Semantic Knowledge Reasoner if API failed or offline
      if (!reply) {
        reply = inferLocalAgentResponse(userText);
      }

      conversationHistory.push({ role: 'assistant', content: reply });
      sessionLogMessages.push({ role: 'agent', text: reply, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
      recordSessionLogToAgentFolder(sessionLogMessages);

      orb.className = 'vhd-orb-btn speaking';
      voiceLabel.textContent = 'Speaking...';
      appendMsg(reply, 'agent');
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
      const devanagariCount = (clean.match(/[\u0900-\u097F]/g) || []).length;
      if (devanagariCount > 0) {
        const marathiPattern = /\b(आहे|आहेत|नाही|नाहीत|काय|कसे|कसा|कशी|करा|करावे|होय|मला|तुम्ही|आपण|नमस्कार|सांगा|पाहिजे|झाले|झाली|झाला|करतो|करते|आहात|माझे|माझं|तुझे|तुझं|कशा|कोठे|कुठे|कधी|कोण|कसं|होते|होती|होता|आमचे|तुमचे|का|नक्की|छान|मित्रा|मित्रांनो)\b/i;
        const marathiSuffixes = /(ंच्या|च्या|तील|वरून|साठी|प्रमाणे|बद्दल|कडे)\b/;
        if (marathiPattern.test(clean) || marathiSuffixes.test(clean)) {
          return 'mr-IN';
        }
        return 'hi-IN';
      }
      const lower = clean.toLowerCase();
      const marathiRoman = /\b(kasa|kase|kashi|ahes|ahe|ahet|nahi|kaay|kay|tumhi|tumi|mala|namaskar|dhanyavad|sang|sanga|pahije|zhala|jhala|zhal|karto|karte|kuth|kuthe|aapan)\b/i;
      if (marathiRoman.test(lower)) return 'mr-IN';
      const hindiRoman = /\b(kya|kaise|kaisa|kaisi|hai|hain|nahi|nahin|namaste|dhanyawad|dhanyavad|shukriya|mujhe|aap|hum|batao|bataiye|chahiye|karo|karna|hoga|hogi|theek|accha|achha)\b/i;
      if (hindiRoman.test(lower)) return 'hi-IN';
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

    // Speak Reply via Browser Web Speech Synthesis (100% Free & Voice Locked)
    function speakReply(text) {
      if (!window.speechSynthesis) {
        voiceLabel.textContent = currentSpeechLang.startsWith('hi') ? 'बोलने के लिए टैप करें' :
                                 currentSpeechLang.startsWith('mr') ? 'बोलण्यासाठी टॅप करा' :
                                 'Tap to Speak';
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);

      const resolved = resolveVoiceForText(agentConfig.voice, text);
      if (resolved.voice) {
        utterance.voice = resolved.voice;
      }
      utterance.pitch = resolved.pitch;
      utterance.rate = resolved.rate;
      utterance.lang = resolved.lang || 'en-US';

      orb.className = 'vhd-orb-btn speaking';
      voiceLabel.textContent = resolved.lang.startsWith('hi') ? 'बोल रहे हैं...' :
                               resolved.lang.startsWith('mr') ? 'बोलत आहे...' :
                               'Speaking...';

      utterance.onend = () => {
        orb.className = 'vhd-orb-btn';
        voiceLabel.textContent = currentSpeechLang.startsWith('hi') ? 'बोलने के लिए टैप करें' :
                                 currentSpeechLang.startsWith('mr') ? 'बोलण्यासाठी टॅप करा' :
                                 'Tap to Speak';
      };

      utterance.onerror = () => {
        orb.className = 'vhd-orb-btn';
        voiceLabel.textContent = currentSpeechLang.startsWith('hi') ? 'बोलने के लिए टैप करें' :
                                 currentSpeechLang.startsWith('mr') ? 'बोलण्यासाठी टॅप करा' :
                                 'Tap to Speak';
      };

      window.speechSynthesis.speak(utterance);
    }
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', async () => {
      await fetchAgentConfig();
      initWidget();
    });
  } else {
    fetchAgentConfig().then(() => initWidget());
  }
})();
