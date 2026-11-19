import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import {
  parseMessageWithSectionLinks,
  tokenizeInlineRichText,
  resolveSectionHref,
  stripLinksForSpeech
} from '../src/utils/richMessageParser.js';

const widgetSrc = fs.readFileSync(path.resolve(process.cwd(), 'public/widget.js'), 'utf8');
const voiceModalSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/VoiceTestModal.jsx'), 'utf8');
const appSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/App.jsx'), 'utf8');
const richCompSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/RichMessageContent.jsx'), 'utf8');

async function runTests() {
  let passed = 0;

  // TEST 1: Rich Message Parser, Safe URL Resolution & Clean Speech Stripping
  {
    const sample = `Class 11 Science costs **₹28,000/yr** and includes \`Physics, Chemistry, Math\`. Visit [College Portal](https://sunrise.edu) or https://sunrise.edu/fees for brochures.\n\nRelevant sections: [Fee Structure](#fee-structure) · [Online Admission Form](#admission-form) · [Analytics Dashboard](/dashboard)`;
    const parsed = parseMessageWithSectionLinks(sample);
    assert.ok(!parsed.bodyText.includes('Relevant sections:'), 'Body text must strip trailing Relevant sections block');
    assert.equal(parsed.sectionLinks.length, 3, 'Must extract all 3 section links');
    assert.equal(parsed.sectionLinks[0].role, 'primary');
    assert.equal(parsed.sectionLinks[0].label, 'Fee Structure');
    assert.equal(parsed.sectionLinks[0].icon, '📍');
    assert.equal(parsed.sectionLinks[1].role, 'related');
    assert.equal(parsed.sectionLinks[1].icon, '📝');
    assert.equal(parsed.sectionLinks[2].icon, '📊');

    // Inline tokenization: bold, code, markdown link, bare URL
    const toks = tokenizeInlineRichText(parsed.bodyText);
    assert.ok(toks.some(t => t.type === 'bold' && t.text === '₹28,000/yr'));
    assert.ok(toks.some(t => t.type === 'code' && t.text === 'Physics, Chemistry, Math'));
    assert.ok(toks.some(t => t.type === 'link' && t.href === 'https://sunrise.edu'));
    assert.ok(toks.some(t => t.type === 'link' && t.href === 'https://sunrise.edu/fees'));

    // XSS protection: block javascript: URLs
    const xssParsed = parseMessageWithSectionLinks('Hello\n\nRelevant sections: [Click](javascript:alert(1)) · [Safe](#fees)');
    assert.equal(xssParsed.sectionLinks.length, 1);
    assert.equal(xssParsed.sectionLinks[0].href, '#fees');
    const xssInline = tokenizeInlineRichText('[Bad](javascript:alert(1))');
    assert.equal(xssInline[0].type, 'text', 'javascript: inline link must degrade safely to plain text');

    // URL resolution with and without siteBaseUrl
    const resExt = resolveSectionHref('/dashboard', 'https://sunrise.edu');
    assert.equal(resExt.resolvedUrl, 'https://sunrise.edu/dashboard');
    assert.equal(resExt.isExternal, true);
    const resHashLocal = resolveSectionHref('#fee-structure', '');
    assert.equal(resHashLocal.isHashOnly, true);
    assert.equal(resHashLocal.hashId, 'fee-structure');

    // Speech stripping: removes markdown, URLs, and trailing Relevant sections
    const speech = stripLinksForSpeech(sample);
    assert.ok(!speech.includes('Relevant sections'), 'TTS must not speak Relevant sections block');
    assert.ok(!speech.includes('#fee-structure') && !speech.includes('https://'), 'TTS must not speak raw anchors or URLs');
    assert.ok(speech.includes('Class 11 Science costs ₹28,000/yr') && speech.includes('College Portal'));

    // Component must NEVER use dangerouslySetInnerHTML
    assert.ok(!/dangerouslySetInnerHTML\s*=/.test(richCompSrc), 'RichMessageContent must remain 100% XSS-safe');

    console.log('✅ Test 1 passed: RichMessageContent parser, XSS guard, URL resolver & TTS cleaner verified');
    passed++;
  }

  // TEST 2: Voice Sandbox (VoiceTestModal.jsx) Full Context Parity & Detailed Answers
  {
    assert.ok(!voiceModalSrc.includes('Respond in 1-2 clear, conversational spoken sentences'), 'VoiceTestModal must NOT restrict replies to 1-2 brief sentences');
    assert.ok(voiceModalSrc.includes('assistant?.prompt || assistant?.systemPrompt'), 'VoiceTestModal must read saved assistant.prompt first');
    assert.ok(voiceModalSrc.includes('siteBlueprint: assistant?.siteBlueprint'), 'VoiceTestModal must pass siteBlueprint');
    assert.ok(voiceModalSrc.includes('frontendIntelligence:'), 'VoiceTestModal must pass frontendIntelligence');
    assert.ok(voiceModalSrc.includes('projectArchitecture:'), 'VoiceTestModal must pass projectArchitecture');
    assert.ok(voiceModalSrc.includes('deepProjectIndex:'), 'VoiceTestModal must pass deepProjectIndex');
    assert.ok(voiceModalSrc.includes('.slice(-12)'), 'VoiceTestModal must use 12-turn conversation history');
    assert.ok(voiceModalSrc.includes('<RichMessageContent'), 'VoiceTestModal must render clickable links via RichMessageContent');
    assert.ok(voiceModalSrc.includes('stripLinksForSpeech(replyText)'), 'VoiceTestModal must strip markdown links before TTS');

    console.log('✅ Test 2 passed: VoiceTestModal delivers detailed answers with full project context & clickable links');
    passed++;
  }

  // TEST 3: Studio Chat (App.jsx) 12-Turn History & Clickable Section Navigation UI
  {
    assert.ok(appSrc.includes('import RichMessageContent from \'./components/RichMessageContent\''), 'App.jsx must import RichMessageContent');
    assert.ok(appSrc.includes('(currentThread?.messages || []).slice(-12)'), 'App.jsx must pass 12-turn history to generateAIResponse');
    assert.ok(appSrc.includes('<RichMessageContent'), 'App.jsx must render assistant messages with RichMessageContent');
    assert.ok(appSrc.includes('onSectionNavigate='), 'App.jsx must wire Studio fallback navigation handler');

    console.log('✅ Test 3 passed: Studio Chat uses 12-turn memory and clickable RichMessageContent navigation pills');
    passed++;
  }

  // TEST 4: Autonomous Zero-Blueprint Live DOM Discovery in public/widget.js
  {
    const archetypeStart = widgetSrc.indexOf('const ARCHETYPE_PROFILES =');
    const archetypeEnd = widgetSrc.indexOf('let lastConfigFetchAt =');
    const helperStart = widgetSrc.indexOf('function isCustomerSafeFaq(');
    const helperEnd = widgetSrc.indexOf('// Maintain multi-turn conversation memory');

    const feeSectionEl = {
      tagName: 'SECTION',
      id: '',
      textContent: 'Fee Structure Class 11 Science ₹28,000/yr Commerce ₹19,500/yr annual tuition breakdown',
      closest: () => null,
      querySelector: () => null
    };
    const feeHeadingEl = {
      tagName: 'H2',
      textContent: 'Fee Structure',
      closest: (sel) => (sel.includes('voice-helpdesk-root') ? null : feeSectionEl)
    };
    const eligSectionEl = {
      tagName: 'SECTION',
      id: '',
      textContent: 'Eligibility Criteria Minimum 60% marks in Class 10 board examination for Science stream',
      closest: () => null,
      querySelector: () => null
    };
    const eligHeadingEl = {
      tagName: 'H2',
      textContent: 'Eligibility Criteria',
      closest: (sel) => (sel.includes('voice-helpdesk-root') ? null : eligSectionEl)
    };
    const dashNavLink = {
      tagName: 'A',
      href: '/dashboard.html',
      textContent: 'Analytics Dashboard',
      getAttribute: (attr) => (attr === 'href' ? '/dashboard.html' : null),
      closest: () => null
    };
    const admNavLink = {
      tagName: 'A',
      href: '/admissions.html',
      textContent: 'Online Admissions Form',
      getAttribute: (attr) => (attr === 'href' ? '/admissions.html' : null),
      closest: () => null
    };

    const sandbox = {
      console,
      URL,
      window: { location: { pathname: '/', origin: 'https://college.example.com' } },
      document: {
        title: 'Sunrise Junior College',
        querySelector: () => null,
        getElementById: () => null,
        querySelectorAll: (sel) => {
          if (sel.includes('[id]')) return []; // ZERO id attributes on the page!
          if (sel === 'h1, h2, h3') return [feeHeadingEl, eligHeadingEl];
          if (sel.includes('nav a[href]')) return [dashNavLink, admNavLink];
          return [];
        }
      },
      agentConfig: { name: 'Sunrise College', siteBlueprint: null },
      conversationHistory: [],
      detectTextLanguage: () => 'en-US',
      getWidgetScript: () => null,
      findHostSection: () => null,
      scrollToHostSection: () => {},
      executeRedirectAction: () => {}
    };
    vm.createContext(sandbox);
    vm.runInContext(
      `${widgetSrc.slice(archetypeStart, archetypeEnd)}\n${widgetSrc.slice(helperStart, helperEnd)}`,
      sandbox
    );

    const discovered = sandbox.collectLiveDomSectionsForLinks();
    assert.ok(discovered.length >= 4, `Should autonomously discover heading sections + nav links without IDs or blueprint, got ${discovered.length}`);
    assert.ok(discovered.some(d => d.label === 'Fee Structure' && d.element === feeSectionEl), 'Must discover heading-only Fee Structure section with live DOM element');
    assert.ok(discovered.some(d => d.label === 'Analytics Dashboard' && d.isCrossPage && d.redirectUrl === '/dashboard.html'), 'Must discover cross-page Analytics Dashboard nav link');
    assert.ok(discovered.some(d => d.label === 'Online Admissions Form' && d.targetType === 'form' && d.redirectUrl === '/admissions.html'), 'Must discover cross-page Admissions Form nav link');

    // Match links with ZERO siteBlueprint!
    const matchedLinks = sandbox.findRelevantSectionLinks(
      'Explain the fee structure and eligibility criteria and where is the admissions form?',
      'Fee Structure is ₹28,000/yr, Eligibility Criteria is 60%, apply via Online Admissions Form.',
      { siteBlueprint: null, frontendIntelligence: null, liveDomSections: discovered },
      { maxLinks: 3 }
    );
    assert.equal(matchedLinks.length, 3, `Expected 3 autonomous primary+related links, got ${JSON.stringify(matchedLinks)}`);
    assert.equal(matchedLinks[0].role, 'primary');
    assert.equal(matchedLinks[1].role, 'related');
    assert.ok(matchedLinks.some(l => l.label === 'Fee Structure' && l.sectionInfo?.element === feeSectionEl));
    assert.ok(matchedLinks.some(l => l.label === 'Online Admissions Form' && l.isCrossPage));

    // Off-topic must still return ZERO links
    const offTopic = sandbox.findRelevantSectionLinks(
      'Explain photosynthesis',
      'Photosynthesis converts sunlight into energy.',
      { siteBlueprint: null, liveDomSections: discovered },
      { isGeneralOffTopic: true }
    );
    assert.equal(offTopic.length, 0, 'Off-topic queries must never attach autonomous DOM links');

    console.log('✅ Test 4 passed: Autonomous zero-blueprint live DOM discovery finds heading sections & cross-page nav links');
    passed++;
  }

  console.log(`\n🎉 ALL ${passed}/4 PILLAR 6B CLICKABLE UI LINKS & AUTONOMOUS DOM NAV TESTS PASSED!`);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
