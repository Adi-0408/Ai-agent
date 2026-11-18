import assert from 'assert';
import {
  detectTextLanguage,
  resolveVoiceForText,
  isFarewellMessage
} from '../src/utils/voiceConsistency.js';
import { generateStandaloneScriptContent } from '../src/utils/agentPackager.js';

console.log('=== VOICE AUTO-LOOP, CODE-MIXING & PERSONA CONSISTENCY TEST SUITE ===\n');

// ---------------------------------------------------------------------------
// 1. Code-Mixed Marathi + English Detection Tests
// ---------------------------------------------------------------------------
console.log('1. Testing Marathi + English Code-Mixing...');
const marathiCases = [
  'Admission form कसा भरायचा?',
  'Courses ची fees किती आहे?',
  'Admission form kasa bharaycha?',
  'Courses chi fees kiti aahe?',
  'College timing kay aahe?',
  'BCA cha syllabus sanga',
  'Mala admission baddal mahiti pahije',
  'Hostel facility aahe ka?',
  'Course sathi eligibility kay ahe?'
];
for (const sample of marathiCases) {
  const lang = detectTextLanguage(sample);
  assert.strictEqual(lang, 'mr-IN', `Expected mr-IN for "${sample}", got ${lang}`);
}
console.log(`✓ Passed ${marathiCases.length}/${marathiCases.length} Marathi code-mixed cases.\n`);

// ---------------------------------------------------------------------------
// 2. Code-Mixed Hindi + English Detection Tests
// ---------------------------------------------------------------------------
console.log('2. Testing Hindi + English Code-Mixing...');
const hindiCases = [
  'Courses की fees कितनी है?',
  'Admission form कैसे भरना है?',
  'Course ke bare me bata',
  'Admission form kaise bharna hai?',
  'College ki fees kitni hai?',
  'MCA course ka timing kya hai?',
  'Mujhe scholarship ke baare mein bataiye',
  'Hostel facility milta hai kya?'
];
for (const sample of hindiCases) {
  const lang = detectTextLanguage(sample);
  assert.strictEqual(lang, 'hi-IN', `Expected hi-IN for "${sample}", got ${lang}`);
}
console.log(`✓ Passed ${hindiCases.length}/${hindiCases.length} Hindi code-mixed cases.\n`);

// ---------------------------------------------------------------------------
// 3. Sticky Conversation Context, Whisper LID & Pure English Guard Tests
// ---------------------------------------------------------------------------
console.log('3. Testing Sticky Context, Whisper LID & English Guard...');
assert.strictEqual(detectTextLanguage('What courses do you offer?'), 'en-US');
assert.strictEqual(detectTextLanguage('Tell me about your admission form'), 'en-US');
assert.strictEqual(detectTextLanguage('I have a question about fees'), 'en-US');
assert.strictEqual(detectTextLanguage('Admission form?', { previousLang: 'mr-IN' }), 'mr-IN');
assert.strictEqual(detectTextLanguage('BCA fees?', { previousLang: 'hi-IN' }), 'hi-IN');
assert.strictEqual(detectTextLanguage('Admission form', { whisperLang: 'marathi' }), 'mr-IN');
assert.strictEqual(detectTextLanguage('Switch to English please', { previousLang: 'mr-IN' }), 'en-US');
assert.strictEqual(detectTextLanguage('What are the admission dates for BCA?', { previousLang: 'mr-IN' }), 'en-US');
console.log('✓ Passed sticky context, Whisper LID, and zero-false-positive English guard tests.\n');

// ---------------------------------------------------------------------------
// 4. Farewell Detection Tests (Stops Auto-Listening Loop Cleanly)
// ---------------------------------------------------------------------------
console.log('4. Testing Farewell Detection...');
assert.strictEqual(isFarewellMessage('Bye'), true);
assert.strictEqual(isFarewellMessage('Thank you, goodbye!'), true);
assert.strictEqual(isFarewellMessage('धन्यवाद बाय'), true);
assert.strictEqual(isFarewellMessage('अलविदा'), true);
assert.strictEqual(isFarewellMessage('Stop listening'), true);
assert.strictEqual(isFarewellMessage('Admission form kasa bharaycha?'), false);
console.log('✓ Passed farewell detection tests.\n');

// ---------------------------------------------------------------------------
// 5. Voice Persona Consistency Tests (Adam stays Male/Multilingual!)
// ---------------------------------------------------------------------------
console.log('5. Testing Voice Persona Consistency (Adam vs Rachel across EN, MR, HI)...');

// Scenario A: Edge with Multilingual Neural Voices
const edgeMultilingualVoices = [
  { name: 'Google हिन्दी', lang: 'hi-IN', voiceURI: 'Google हिन्दी' },
  { name: 'Microsoft Aarohi Online (Natural) - Marathi (India)', lang: 'mr-IN', voiceURI: 'aarohi' },
  { name: 'Microsoft Swara Online (Natural) - Hindi (India)', lang: 'hi-IN', voiceURI: 'swara' },
  { name: 'Microsoft Manohar Online (Natural) - Marathi (India)', lang: 'mr-IN', voiceURI: 'manohar' },
  { name: 'Microsoft Madhur Online (Natural) - Hindi (India)', lang: 'hi-IN', voiceURI: 'madhur' },
  { name: 'Microsoft AndrewMultilingual Online (Natural) - English (United States)', lang: 'en-US', voiceURI: 'andrew-multi' },
  { name: 'Microsoft AvaMultilingual Online (Natural) - English (United States)', lang: 'en-US', voiceURI: 'ava-multi' }
];

const adamEnEdge = resolveVoiceForText('Adam', 'Welcome to our college.', edgeMultilingualVoices);
const adamMrEdge = resolveVoiceForText('Adam', 'नमस्कार, प्रवेश प्रक्रिया सुरू आहे.', edgeMultilingualVoices);
const adamHiEdge = resolveVoiceForText('Adam', 'नमस्ते, एडमिशन फॉर्म ऑनलाइन उपलब्ध है।', edgeMultilingualVoices);

assert.strictEqual(adamEnEdge.voice.voiceURI, 'andrew-multi', 'Adam EN should use AndrewMultilingual');
assert.strictEqual(adamMrEdge.voice.voiceURI, 'andrew-multi', 'Adam MR should use SAME AndrewMultilingual voice');
assert.strictEqual(adamHiEdge.voice.voiceURI, 'andrew-multi', 'Adam HI should use SAME AndrewMultilingual voice');
assert.strictEqual(adamMrEdge.lang, 'mr-IN');
assert.strictEqual(adamHiEdge.lang, 'hi-IN');

const rachelMrEdge = resolveVoiceForText('Rachel', 'नमस्कार, मी आपली मदत करू शकते.', edgeMultilingualVoices);
assert.strictEqual(rachelMrEdge.voice.voiceURI, 'ava-multi', 'Rachel MR should use AvaMultilingual');

// Scenario B: Windows Voices without Multilingual (Female listed BEFORE Male to verify strict gender filter!)
const nativeIndicVoices = [
  { name: 'Microsoft David - English (United States)', lang: 'en-US', voiceURI: 'david' },
  { name: 'Google हिन्दी', lang: 'hi-IN', voiceURI: 'google-hi-female' },
  { name: 'Microsoft Aarohi Online (Natural) - Marathi (India)', lang: 'mr-IN', voiceURI: 'aarohi' },
  { name: 'Microsoft Swara Online (Natural) - Hindi (India)', lang: 'hi-IN', voiceURI: 'swara' },
  { name: 'Microsoft Manohar Online (Natural) - Marathi (India)', lang: 'mr-IN', voiceURI: 'manohar' },
  { name: 'Microsoft Madhur Online (Natural) - Hindi (India)', lang: 'hi-IN', voiceURI: 'madhur' }
];

const adamMrNative = resolveVoiceForText('Adam', 'प्रवेश फॉर्म ऑनलाइन उपलब्ध आहे.', nativeIndicVoices);
const adamHiNative = resolveVoiceForText('Adam', 'एडमिशन फॉर्म ऑनलाइन उपलब्ध है।', nativeIndicVoices);
assert.strictEqual(adamMrNative.voice.voiceURI, 'manohar', 'Adam MR must pick Male Manohar, NEVER Aarohi/Google Hindi');
assert.strictEqual(adamHiNative.voice.voiceURI, 'madhur', 'Adam HI must pick Male Madhur, NEVER Swara/Google Hindi');

const rachelMrNative = resolveVoiceForText('Rachel', 'प्रवेश फॉर्म ऑनलाइन उपलब्ध आहे.', nativeIndicVoices);
const rachelHiNative = resolveVoiceForText('Rachel', 'एडमिशन फॉर्म ऑनलाइन उपलब्ध है।', nativeIndicVoices);
assert.strictEqual(rachelMrNative.voice.voiceURI, 'aarohi', 'Rachel MR must pick Female Aarohi');
assert.strictEqual(rachelHiNative.voice.voiceURI, 'swara', 'Rachel HI must pick Female Swara');

// Scenario C: Chrome-only fallback (only English David + Female Google हिन्दी)
const chromeOnlyVoices = [
  { name: 'Microsoft David - English (United States)', lang: 'en-US', voiceURI: 'david' },
  { name: 'Google हिन्दी', lang: 'hi-IN', voiceURI: 'google-hi' }
];
const adamMrChrome = resolveVoiceForText('Adam', 'प्रवेश फॉर्म ऑनलाइन उपलब्ध आहे.', chromeOnlyVoices);
assert.strictEqual(adamMrChrome.voice.voiceURI, 'google-hi');
assert.ok(adamMrChrome.pitch <= 0.80, `Expected baritone pitch <= 0.80 on Chrome fallback, got ${adamMrChrome.pitch}`);
console.log('✓ Passed all Edge Multilingual, Native Male/Female, and Chrome Baritone fallback voice tests.\n');

// ---------------------------------------------------------------------------
// 6. Standalone Packager Generated JS Syntax Verification
// ---------------------------------------------------------------------------
console.log('6. Verifying standalone agentPackager.js generated script syntax...');
const standaloneCode = generateStandaloneScriptContent({
  id: 'test-agent',
  name: 'Test Agent',
  voice: 'Adam',
  knowledgeBase: [{ q: 'What are the fees?', a: 'Fees start at Rs 15,000.' }]
});
// Parse generated script using Function constructor to guarantee zero syntax errors
new Function(standaloneCode);
assert.ok(standaloneCode.includes('scheduleAutoResumeIfVoice'), 'Standalone bundle must include voice-only auto-resume');
assert.ok(standaloneCode.includes('MULTILINGUAL_MALE_VOICES'), 'Standalone bundle must include Multilingual Male voices');
console.log('✓ Standalone generated JS compiled cleanly with zero syntax errors.\n');

console.log('=== ALL TESTS PASSED SUCCESSFULLY ===');
