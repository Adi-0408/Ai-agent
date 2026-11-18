/**
 * Verification Suite: Device-Scoped Cross-Page Conversation Persistence on Integrated Websites
 * Verifies:
 * 1. Conversation, activeItem/context, visitorId & open panel state are stored per DEVICE + AGENT (NOT per page URL).
 * 2. Navigating from Page 1 (/index.html) to Page 2 (/admissions.html) restores the full transcript & memory seamlessly.
 * 3. Local file:// multi-page websites preserve the conversation via the window.name fallback mirror even if localStorage is isolated.
 * 4. Multi-tab storage sync & manual Reset (↺) clear only that agent's conversation cleanly.
 * 5. Both public/widget.js and src/utils/agentPackager.js implement device-scoped cross-page persistence.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const widgetSrc = fs.readFileSync(path.resolve('public/widget.js'), 'utf-8');
const packagerSrc = fs.readFileSync(path.resolve('src/utils/agentPackager.js'), 'utf-8');

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('=== DEVICE-SCOPED CROSS-PAGE CONVERSATION PERSISTENCE SUITE ===\n');

// Extract the exact device persistence engine block from public/widget.js for live simulated multi-page execution
const startMarker = 'const deviceAgentKey = String(agentConfig.name || agentId';
const endMarker = 'function recordSessionLogToAgentFolder(';
const blockStart = widgetSrc.indexOf(startMarker);
const blockEnd = widgetSrc.indexOf(endMarker);
assert(blockStart > 0 && blockEnd > blockStart, 'Device persistence markers must exist in public/widget.js');
const persistenceBlock = widgetSrc.slice(blockStart, blockEnd);

function createSimulatedPage({ agentName, localStorageMap, windowNameRef, pagePath, autoOpen = false }) {
  const storageApi = {
    getItem(k) { return localStorageMap.has(k) ? localStorageMap.get(k) : null; },
    setItem(k, v) { localStorageMap.set(k, String(v)); },
    removeItem(k) { localStorageMap.delete(k); }
  };
  const listeners = {};
  const win = {
    location: { pathname: pagePath, origin: 'https://college-site.example.com' },
    get name() { return windowNameRef.value; },
    set name(v) { windowNameRef.value = String(v); },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }
  };
  const renderedMessages = [];
  const panelClasses = new Set();
  const panel = {
    classList: {
      add(c) { panelClasses.add(c); },
      remove(c) { panelClasses.delete(c); },
      contains(c) { return panelClasses.has(c); }
    }
  };
  const body = {
    _html: '',
    set innerHTML(v) { this._html = v; renderedMessages.length = 0; },
    appendChild(node) { if (node && node.textContent) renderedMessages.push({ sender: 'agent', text: node.textContent, isGreeting: true }); },
    scrollTop: 0,
    scrollHeight: 0
  };
  const doc = {
    createElement() { return { className: '', textContent: '' }; }
  };
  const appendMsg = (text, sender, navAction = null) => {
    renderedMessages.push({ sender, text, navAction });
  };
  const currentScript = autoOpen ? { getAttribute: (k) => (k === 'data-auto-open' ? 'true' : null) } : null;

  const factory = new Function(
    'agentConfig', 'agentId', 'localStorage', 'window', 'document', 'panel', 'body', 'appendMsg', 'currentScript',
    `
      ${persistenceBlock}
      return {
        DEVICE_CONV_KEY,
        visitorId,
        sessionStartTime,
        conversationHistory,
        conversationContext,
        sessionLogMessages,
        saveDeviceConversationState,
        clearDeviceConversationState,
        serializeNavAction,
        hydrateDeviceConversationUI,
        panel
      };
    `
  );

  const instance = factory(
    { name: agentName, greeting: `Hello! Welcome to ${agentName}.` },
    agentName,
    storageApi,
    win,
    doc,
    panel,
    body,
    appendMsg,
    currentScript
  );
  return { ...instance, renderedMessages, listeners };
}

check('Storage key is strictly device + agent scoped (independent of page URL/pathname)', () => {
  const sharedStorage = new Map();
  const winName = { value: '' };
  const p1 = createSimulatedPage({ agentName: 'Sangli Academy', localStorageMap: sharedStorage, windowNameRef: winName, pagePath: '/index.html' });
  const p2 = createSimulatedPage({ agentName: 'Sangli Academy', localStorageMap: sharedStorage, windowNameRef: winName, pagePath: '/admissions.html' });
  assert.strictEqual(p1.DEVICE_CONV_KEY, p2.DEVICE_CONV_KEY, 'Different pages must resolve the exact same device conversation key');
  assert(!p1.DEVICE_CONV_KEY.includes('index') && !p2.DEVICE_CONV_KEY.includes('admissions'), 'Key must NEVER include page filename/path');
});

check('Navigating from Page 1 to Page 2 restores full chat transcript, activeItem memory, language, visitorId & open panel', () => {
  const sharedStorage = new Map();
  const winName = { value: '' };

  // Page 1: Visitor opens widget, asks about Class 11 Science, gets reply with navAction
  const page1 = createSimulatedPage({ agentName: 'Sangli Academy', localStorageMap: sharedStorage, windowNameRef: winName, pagePath: '/index.html' });
  page1.panel.classList.add('open');
  page1.conversationContext.activeItem = { name: 'Class 11 Science', price: '₹25,000 / year' };
  page1.conversationContext.activeLang = 'mr-IN';
  page1.conversationContext.turnCount = 1;
  page1.conversationHistory.push({ role: 'user', content: '11th science fees kiti aahe?' });
  page1.conversationHistory.push({ role: 'assistant', content: '11th Science ची फी ₹25,000 प्रति वर्ष आहे.' });
  const nav = page1.serializeNavAction({ label: 'Open Admission Form', redirectUrl: '/admissions.html', isCrossPage: true, targetType: 'form' });
  page1.sessionLogMessages.push({ role: 'user', text: '11th science fees kiti aahe?', timestamp: '10:01' });
  page1.sessionLogMessages.push({ role: 'agent', text: '11th Science ची फी ₹25,000 प्रति वर्ष आहे.', timestamp: '10:01', navAction: nav });
  page1.saveDeviceConversationState({ isOpen: true });

  // Visitor clicks link to Page 2 (/admissions.html) -> fresh widget boot!
  const page2 = createSimulatedPage({ agentName: 'Sangli Academy', localStorageMap: sharedStorage, windowNameRef: winName, pagePath: '/admissions.html' });
  assert.strictEqual(page2.panel.classList.contains('open'), true, 'Widget must remain open across page navigation');
  assert.strictEqual(page2.visitorId, page1.visitorId, 'Device visitorId must stay identical across pages');
  assert.strictEqual(page2.sessionLogMessages.length, 2, 'All messages must be restored on Page 2');
  assert.strictEqual(page2.conversationHistory.length, 2, 'LLM conversationHistory must be restored on Page 2');
  assert.strictEqual(page2.conversationContext.activeItem?.name, 'Class 11 Science', 'Active topic/item memory must survive page change');
  assert.strictEqual(page2.conversationContext.activeLang, 'mr-IN', 'Detected conversation language must survive page change');
  assert.strictEqual(page2.renderedMessages.some(m => m.text.includes('₹25,000')), true, 'Chat bubbles must re-render on Page 2');
});

check('Local file:// multi-page HTML sites preserve conversation via window.name fallback even if localStorage is isolated', () => {
  const file1Storage = new Map();
  const file2Storage = new Map(); // Completely separate storage per file:// page!
  const sharedWindowName = { value: '' };

  const page1 = createSimulatedPage({ agentName: 'Sangli Academy', localStorageMap: file1Storage, windowNameRef: sharedWindowName, pagePath: '/C:/site/index.html' });
  page1.panel.classList.add('open');
  page1.conversationHistory.push({ role: 'user', content: 'Show courses' });
  page1.sessionLogMessages.push({ role: 'user', text: 'Show courses', timestamp: '10:05' });
  page1.saveDeviceConversationState({ isOpen: true });

  const page2 = createSimulatedPage({ agentName: 'Sangli Academy', localStorageMap: file2Storage, windowNameRef: sharedWindowName, pagePath: '/C:/site/courses.html' });
  assert.strictEqual(page2.sessionLogMessages.length, 1, 'window.name fallback must restore conversation across local file:// pages');
  assert.strictEqual(page2.sessionLogMessages[0].text, 'Show courses');
  assert.strictEqual(page2.panel.classList.contains('open'), true);
});

check('Manual Reset (↺) clears conversation cleanly for that agent without affecting other agents on the device', () => {
  const sharedStorage = new Map();
  const winName = { value: '' };

  const botA = createSimulatedPage({ agentName: 'Sangli Academy', localStorageMap: sharedStorage, windowNameRef: winName, pagePath: '/' });
  botA.sessionLogMessages.push({ role: 'user', text: 'Hi Bot A' });
  botA.saveDeviceConversationState({ isOpen: true });

  const botB = createSimulatedPage({ agentName: 'City Pharmacy', localStorageMap: sharedStorage, windowNameRef: winName, pagePath: '/' });
  botB.sessionLogMessages.push({ role: 'user', text: 'Hi Bot B' });
  botB.saveDeviceConversationState({ isOpen: true });

  botA.clearDeviceConversationState();
  const botAReloaded = createSimulatedPage({ agentName: 'Sangli Academy', localStorageMap: sharedStorage, windowNameRef: winName, pagePath: '/about' });
  const botBReloaded = createSimulatedPage({ agentName: 'City Pharmacy', localStorageMap: sharedStorage, windowNameRef: winName, pagePath: '/about' });

  assert.strictEqual(botAReloaded.sessionLogMessages.length, 0, 'Reset must clear Bot A messages');
  assert.strictEqual(botBReloaded.sessionLogMessages.length, 1, 'Resetting Bot A must NOT affect Bot B');
  assert.strictEqual(botBReloaded.sessionLogMessages[0].text, 'Hi Bot B');
});

check('Both public/widget.js and src/utils/agentPackager.js implement device-level cross-page persistence & Reset button', () => {
  assert(widgetSrc.includes('id="vhd-reset"'), 'public/widget.js must include Start New Conversation button');
  assert(widgetSrc.includes("window.addEventListener('storage'"), 'public/widget.js must sync across tabs on the same device');
  assert(widgetSrc.includes("window.addEventListener('pagehide'"), 'public/widget.js must flush conversation state before page navigation');
  assert(packagerSrc.includes('vhd_device_conv_'), 'agentPackager.js standalone bundle must persist conversation per device');
  assert(packagerSrc.includes('__VHD_DEVICE_STATE__:'), 'agentPackager.js must include window.name fallback for file:// multi-page sites');
});

console.log(`\n🎉 ALL ${passed}/${passed} DEVICE-SCOPED CROSS-PAGE PERSISTENCE TESTS PASSED!`);
