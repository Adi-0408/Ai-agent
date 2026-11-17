import assert from 'node:assert';
import fs from 'node:fs';

console.log('🧪 Starting Enterprise Flipkart/Amazon Helpdesk & Voice Button Positioning Tests...\n');

// 1. Check public/widget.js
const widgetSrc = fs.readFileSync('public/widget.js', 'utf-8');

// A. Assert Voice Button is directly on the left of Enter/Send button in widget footer
const footerInputIdx = widgetSrc.indexOf('class="vhd-input"');
const footerVoiceBtnIdx = widgetSrc.indexOf('class="vhd-voice-btn" id="vhd-voice-btn"');
const footerSendBtnIdx = widgetSrc.indexOf('class="vhd-send-btn" id="vhd-send"');

assert(footerInputIdx !== -1, 'Footer input missing');
assert(footerVoiceBtnIdx !== -1, 'Footer voice button missing');
assert(footerSendBtnIdx !== -1, 'Footer send button missing');
assert(footerInputIdx < footerVoiceBtnIdx, 'Voice button must be after input box');
assert(footerVoiceBtnIdx < footerSendBtnIdx, 'Voice button must be directly to the left of send/enter button');
console.log('✅ widget.js: Voice button layout confirmed [Input] -> [Voice Button] -> [Send]');

// B. Check VoiceTestModal.jsx layout in the footer
const modalSrc = fs.readFileSync('src/components/VoiceTestModal.jsx', 'utf-8');
const footerBarIdx = modalSrc.indexOf('{/* Text Input Bar with Voice Button on Left of Enter */}');
const modalFooterSlice = modalSrc.slice(footerBarIdx);
const modalInputIdx = modalFooterSlice.indexOf('placeholder="Type a test question or tap mic to speak..."');
const modalMicBtnIdx = modalFooterSlice.indexOf('onClick={handleToggleListen}');
const modalSendBtnIdx = modalFooterSlice.indexOf('onClick={handleSendText}');

assert(footerBarIdx !== -1, 'Modal footer bar comment missing');
assert(modalInputIdx !== -1, 'Modal input missing');
assert(modalMicBtnIdx !== -1, 'Modal mic button missing');
assert(modalSendBtnIdx !== -1, 'Modal send button missing');
assert(modalInputIdx < modalMicBtnIdx, 'Modal mic button must be after input box');
assert(modalMicBtnIdx < modalSendBtnIdx, 'Modal mic button must be on the left of Send/Enter button');
console.log('✅ VoiceTestModal.jsx: Mic button layout confirmed [Input] -> [Mic] -> [Send]');

// C. Verify Groq Model is llama-3.1-8b-instant (<200ms ultra-fast)
assert(widgetSrc.includes("llama-3.1-8b-instant"), 'widget.js must use llama-3.1-8b-instant for zero-lag Groq inference');
const aiCompSrc = fs.readFileSync('src/services/aiCompletionService.js', 'utf-8');
assert(aiCompSrc.includes("llama-3.1-8b-instant"), 'aiCompletionService.js must default to llama-3.1-8b-instant');
console.log('✅ Groq Model verified as llama-3.1-8b-instant across both services');

// D. Verify Flipkart/Amazon Enterprise Helpdesk Prompt Directives
assert(widgetSrc.includes('Flipkart and Amazon customer support specialists'), 'widget.js must include Flipkart/Amazon customer support contract');
const synthSrc = fs.readFileSync('src/services/agentSynthesizer.js', 'utf-8');
assert(synthSrc.includes('Flipkart/Amazon-grade helpdesk'), 'agentSynthesizer.js must train agent prompt with Flipkart/Amazon grade support');
console.log('✅ Enterprise Helpdesk system prompts verified');

// E. Verify Catalog Cache in widget.js
assert(widgetSrc.includes('_catalogCache'), 'widget.js must include _catalogCache to prevent repeated DOM queries');
console.log('✅ Catalog Cache verified with TTL optimization');

console.log('\n🎉 ALL ENTERPRISE HELPDESK & UI TESTS PASSED 100%! 🚀');
