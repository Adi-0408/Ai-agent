import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import {
  decomposeComplexQuestion,
  analyzeQuestionUnderstanding,
  findRelevantSectionLinks,
  formatSectionLinksMarkdown
} from '../src/utils/answerDepthAndNavigationEngine.js';
import { splitMultiStepQuestion } from '../src/utils/projectArchitectureAnalyzer.js';
import { generateAIResponse } from '../src/services/aiCompletionService.js';

const widgetPath = path.resolve(process.cwd(), 'public/widget.js');
const widgetSrc = fs.readFileSync(widgetPath, 'utf8');

const sampleBlueprint = {
  roleSummary: 'Junior college admissions portal with courses, fees, dashboard analytics, and online application form.',
  sections: [
    {
      id: 'fee-structure',
      label: 'Fee Structure',
      href: '#fee-structure',
      path: '/',
      excerpt: 'Annual fee structure for Class 11 Science, Commerce, and Arts streams.',
      keywords: ['fees', 'fee', 'tuition', 'pricing', 'cost', 'science', 'commerce']
    },
    {
      id: 'eligibility-criteria',
      label: 'Eligibility & Documents',
      href: '#eligibility-criteria',
      path: '/',
      excerpt: 'Minimum board exam percentage eligibility and required documents for Class 11 admission.',
      keywords: ['eligibility', 'criteria', 'documents', 'marksheet', 'lc', 'admission']
    },
    {
      id: 'scholarships',
      label: 'Scholarships',
      href: '#scholarships',
      path: '/',
      excerpt: 'Merit scholarships and fee concessions for top students.',
      keywords: ['scholarship', 'concession', 'discount', 'merit']
    }
  ],
  forms: [
    {
      id: 'admission-form',
      sectionId: 'admission-form',
      title: 'Online Admission Form',
      href: '#admission-form',
      path: '/',
      submitLabel: 'Submit Application',
      fields: ['Full Name', 'Stream', 'Percentage', 'Phone'],
      keywords: ['apply', 'admission', 'register', 'enroll', 'form']
    }
  ],
  routes: [
    {
      label: 'Analytics Dashboard',
      path: '/dashboard',
      file: 'dashboard.html',
      keywords: ['dashboard', 'analytics', 'revenue', 'enrollment', 'report']
    }
  ],
  frontendIndex: {
    pages: [
      {
        pageLabel: 'Analytics Dashboard',
        pagePath: '/dashboard',
        summary: 'Live enrollment metrics, monthly revenue chart, and fee collection report table.'
      }
    ],
    charts: [
      {
        title: 'Monthly Enrollment Trend',
        pageLabel: 'Analytics Dashboard',
        pagePath: '/dashboard',
        sectionId: 'enrollment-chart',
        summary: 'Monthly enrollment trend grew from 120 in May to 265 in July.'
      }
    ],
    reportTables: [
      {
        title: 'Stream Fee Collection Report',
        pageLabel: 'Analytics Dashboard',
        pagePath: '/dashboard',
        sectionId: 'fee-report-table',
        headers: ['Stream', 'Students', 'Fees Collected'],
        summary: 'Stream Fee Collection Report shows Science ₹18.5L and Commerce ₹12.2L.'
      }
    ]
  }
};

const sampleCourses = [
  {
    name: 'Class 11 Science',
    price: '₹28,000/yr',
    stock: 42,
    unit: 'seats',
    description: 'Physics, Chemistry, Mathematics, Biology and Computer Science with lab sessions.'
  },
  {
    name: 'Class 11 Commerce',
    price: '₹19,500/yr',
    stock: 35,
    unit: 'seats',
    description: 'Accountancy, Economics, Business Studies, and Secretarial Practice.'
  }
];

const sampleKb = [
  {
    q: 'What is the eligibility criteria for Class 11 Science?',
    a: 'Students must pass Class 10 (SSC/CBSE/ICSE) with at least 60% aggregate marks and strong scores in Science and Mathematics.'
  },
  {
    q: 'What documents are required for Class 11 Science admission?',
    a: 'You need your Class 10 original marksheet, School Leaving Certificate (LC), Aadhaar card copy, and 2 passport-size photographs.'
  },
  {
    q: 'How do I apply for admission?',
    a: 'Complete the Online Admission Form with your Class 10 marks and preferred stream, upload your documents, and click Submit Application.'
  }
];

async function runTests() {
  let passed = 0;

  // TEST 1: Adaptive Question Complexity Classification & Dynamic Token Budgets
  {
    const simple = analyzeQuestionUnderstanding('What is the fee for Class 11 Science?', null, [], { catalogItems: sampleCourses });
    assert.equal(simple.mode, 'simple', 'Short factual question should classify as simple');
    assert.equal(simple.recommendedMaxTokens, 1000);

    const detailed = analyzeQuestionUnderstanding('Please explain in detail how the admission process works step by step with examples', null, [], { catalogItems: sampleCourses });
    assert.equal(detailed.mode, 'detailed', 'Explicit detailed/step-by-step ask should classify as detailed');
    assert.equal(detailed.wantsStepByStep, true);
    assert.equal(detailed.wantsExamples, true);
    assert.equal(detailed.recommendedMaxTokens, 1400);

    const technical = analyzeQuestionUnderstanding('Explain how JWT authentication middleware and database schema relationships work in the backend API', null, [], {});
    assert.equal(technical.mode, 'technical', 'Technical architecture query should classify as technical');
    assert.equal(technical.recommendedMaxTokens, 1500);

    const multiPart = analyzeQuestionUnderstanding('Explain the fee structure, eligibility criteria, and documents required for Class 11 Science', null, [], { catalogItems: sampleCourses });
    assert.equal(multiPart.mode, 'complex_multi_part', 'Comma-separated multi-aspect query should classify as complex_multi_part');
    assert.equal(multiPart.requiredParts.length, 3, 'Should decompose into 3 distinct parts');
    assert.equal(multiPart.recommendedMaxTokens, 1500);

    const followUp = analyzeQuestionUnderstanding('Tell me more about that', null, [
      { role: 'user', content: 'What subjects are included in Class 11 Science?' },
      { role: 'assistant', content: 'Class 11 Science covers Physics, Chemistry, Mathematics, and Biology.' }
    ], { catalogItems: sampleCourses });
    assert.equal(followUp.mode, 'follow_up', 'Pronoun reference with prior turn should classify as follow_up');
    assert.equal(followUp.isFollowUp, true);
    assert.ok(followUp.resolvedAnchor.includes('Class 11 Science'), 'Should anchor follow-up to prior turn');

    const unclear = analyzeQuestionUnderstanding('hmm', null, [], {});
    assert.equal(unclear.mode, 'unclear');
    assert.equal(unclear.recommendedMaxTokens, 500);

    const offTopic = analyzeQuestionUnderstanding('What is the capital of Japan?', null, [], { catalogItems: sampleCourses });
    assert.equal(offTopic.mode, 'general_off_topic');

    console.log('✅ Test 1 passed: Adaptive complexity classification, follow-up anchoring & dynamic token budgets');
    passed++;
  }

  // TEST 2: Complex Multi-Part & Comma-List Decomposition (Preserves Comparisons!)
  {
    const multiAspect = decomposeComplexQuestion('Explain the fee structure, eligibility criteria, and documents required for Class 11 Science');
    assert.equal(multiAspect.length, 3, `Expected 3 clauses, got ${JSON.stringify(multiAspect)}`);
    assert.ok(multiAspect[0].toLowerCase().includes('fee structure') && multiAspect[0].includes('Class 11 Science'));
    assert.ok(multiAspect[1].toLowerCase().includes('eligibility criteria') && multiAspect[1].includes('Class 11 Science'));
    assert.ok(multiAspect[2].toLowerCase().includes('documents required') && multiAspect[2].includes('Class 11 Science'));

    // splitMultiStepQuestion delegates to decomposeComplexQuestion
    const delegated = splitMultiStepQuestion('Explain the fee structure, eligibility criteria, and documents required for Class 11 Science');
    assert.deepEqual(delegated, multiAspect, 'splitMultiStepQuestion must delegate cleanly to decomposeComplexQuestion');

    // Comparisons must NEVER be split
    const comparison = decomposeComplexQuestion('Compare Class 11 Science and Class 11 Commerce');
    assert.equal(comparison.length, 1, 'Comparison query must remain a single intact clause');

    // End-to-end Studio offline multi-part answer addresses ALL 3 parts + appends section links
    const studioMultiAnswer = await generateAIResponse(
      'Explain the fee structure, eligibility criteria, and documents required for Class 11 Science',
      'You are Sunrise Junior College Assistant.',
      sampleKb,
      '',
      { databaseRecords: sampleCourses, siteBlueprint: sampleBlueprint }
    );
    assert.ok(studioMultiAnswer.includes('28,000'), `Multi-part answer must include Science fee: ${studioMultiAnswer}`);
    assert.ok(/60%|marksheet|eligibility/i.test(studioMultiAnswer), `Multi-part answer must include eligibility: ${studioMultiAnswer}`);
    assert.ok(/leaving certificate|aadhaar|marksheet/i.test(studioMultiAnswer), `Multi-part answer must include documents: ${studioMultiAnswer}`);
    assert.ok(studioMultiAnswer.includes('Relevant sections:'), `Studio website-related answer should include clickable markdown section links: ${studioMultiAnswer}`);

    console.log('✅ Test 2 passed: Multi-aspect decomposition addresses ALL parts cleanly while keeping comparisons intact');
    passed++;
  }

  // TEST 3: Universal Primary + Related Section Link Resolution (Zero Links for Off-Topic & Unclear!)
  {
    const feeLinks = findRelevantSectionLinks(
      'What is the fee structure and eligibility for Class 11 Science?',
      'Class 11 Science fee is ₹28,000/yr and requires 60% marks plus marksheet.',
      { siteBlueprint: sampleBlueprint, frontendIntelligence: sampleBlueprint.frontendIndex },
      { maxLinks: 3 }
    );
    assert.ok(feeLinks.length >= 2, `Expected primary + related links, got ${feeLinks.length}`);
    assert.equal(feeLinks[0].role, 'primary');
    assert.equal(feeLinks[1].role, 'related');
    assert.ok(feeLinks.some(l => l.href === '#fee-structure'), 'Should link directly to #fee-structure');
    assert.ok(feeLinks.some(l => l.href === '#eligibility-criteria'), 'Should link to related #eligibility-criteria');

    const md = formatSectionLinksMarkdown(feeLinks);
    assert.ok(md.includes('[Fee Structure](#fee-structure)'), `Markdown link format mismatch: ${md}`);

    // Dashboard / Chart / Report query resolves cross-page dashboard & chart links
    const dashLinks = findRelevantSectionLinks(
      'Show me the monthly enrollment trend chart and stream fee collection report on the dashboard',
      'Monthly enrollment trend grew to 265 in July and Science collected ₹18.5L.',
      { siteBlueprint: sampleBlueprint, frontendIntelligence: sampleBlueprint.frontendIndex },
      { maxLinks: 3 }
    );
    assert.ok(dashLinks.length >= 1, 'Should resolve dashboard/chart/report links');
    assert.ok(dashLinks.some(l => l.targetType === 'dashboard' || l.targetType === 'report'), 'Should tag dashboard/report links properly');

    // Off-topic and unclear queries MUST NEVER attach unrelated website links!
    const offTopicLinks = findRelevantSectionLinks('Explain photosynthesis', 'Photosynthesis converts sunlight...', { siteBlueprint: sampleBlueprint }, { isGeneralOffTopic: true });
    assert.equal(offTopicLinks.length, 0, 'Off-topic query must never attach website section links');

    const unclearLinks = findRelevantSectionLinks('hmm', 'Could you clarify?', { siteBlueprint: sampleBlueprint }, { isUnclear: true });
    assert.equal(unclearLinks.length, 0, 'Unclear query must never attach website section links');

    // Studio off-topic reply must also have ZERO section links attached
    const studioOffTopic = await generateAIResponse(
      'Explain photosynthesis',
      'You are Sunrise Junior College Assistant.',
      sampleKb,
      '',
      { databaseRecords: sampleCourses, siteBlueprint: sampleBlueprint }
    );
    assert.ok(/sunlight|glucose|oxygen/i.test(studioOffTopic));
    assert.ok(!studioOffTopic.includes('Relevant sections:'), 'Studio off-topic answer must not include website section links');

    console.log('✅ Test 3 passed: Universal primary + related section/form/dashboard links with strict off-topic/unclear exclusion');
    passed++;
  }

  // TEST 4: Live Widget (public/widget.js) Architecture, Multi-Link CSS/DOM, 12-Turn History & Zero Blue Box
  {
    assert.ok(widgetSrc.includes('.vhd-nav-links-row'), 'widget.js must include .vhd-nav-links-row CSS');
    assert.ok(widgetSrc.includes('.vhd-nav-pill-btn.vhd-nav-pill-secondary'), 'widget.js must style secondary related nav pills');
    assert.ok(widgetSrc.includes('conversationHistory.slice(-12)'), 'widget.js must expand history window to 12 turns');
    assert.ok(widgetSrc.includes('[QUESTION_UNDERSTANDING_AND_DEPTH_PLAN]'), 'widget.js prompt must include depth & understanding plan');
    assert.ok(widgetSrc.includes('HONEST UNCERTAINTY'), 'widget.js prompt must preserve HONEST UNCERTAINTY guard');
    assert.ok(widgetSrc.includes('function serializeNavActions('), 'widget.js must serialize navActions[] for device persistence');
    assert.ok(widgetSrc.includes('navActions: serializedNavs'), 'widget.js must persist navActions[] on assistant turns');

    // Verify scrollToHostSection remains 100% blue-box-free
    const scrollStart = widgetSrc.indexOf('function scrollToHostSection(');
    const scrollEnd = widgetSrc.indexOf('// --- EXACT FORM, SECTION & ROUTE REDIRECTION ENGINE');
    const scrollSlice = widgetSrc.slice(scrollStart, scrollEnd);
    assert.ok(scrollStart > 0 && scrollEnd > scrollStart);
    assert.ok(!scrollSlice.includes('#38bdf8') && !scrollSlice.includes('boxShadow') && !scrollSlice.includes('outline'), 'scrollToHostSection must remain 100% blue-box-free');

    // Execute mirrored widget.js helpers inside VM sandbox
    const archetypeStart = widgetSrc.indexOf('const ARCHETYPE_PROFILES =');
    const archetypeEnd = widgetSrc.indexOf('let lastConfigFetchAt =');
    const helperStart = widgetSrc.indexOf('function isCustomerSafeFaq(');
    const helperEnd = widgetSrc.indexOf('// Maintain multi-turn conversation memory');

    assert.ok(archetypeStart > 0 && archetypeEnd > archetypeStart);
    assert.ok(helperStart > 0 && helperEnd > helperStart);

    const sandbox = {
      console,
      URL,
      window: { location: { pathname: '/', origin: 'https://college.example.com' } },
      document: {
        title: 'Sunrise Junior College',
        querySelector: () => null,
        querySelectorAll: () => [],
        getElementById: () => null
      },
      agentConfig: {
        name: 'Sunrise Junior College',
        databaseRecords: sampleCourses,
        knowledgeBase: sampleKb,
        siteBlueprint: sampleBlueprint
      },
      conversationHistory: [
        { role: 'user', content: 'Tell me about Class 11 Science' },
        { role: 'assistant', content: 'Class 11 Science is ₹28,000/yr with 42 seats available.' }
      ],
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

    const widgetPrompt = sandbox.buildCustomerSystemPrompt(
      sandbox.agentConfig,
      { status: 'NO_SPECIFIC_ITEM_FILTER' },
      'en-US',
      { activeItem: sampleCourses[0] },
      'Explain the fee structure, eligibility criteria, and documents required for Class 11 Science'
    );
    assert.ok(widgetPrompt.includes('COMPLEXITY_MODE: complex_multi_part'), 'Widget prompt must detect complex_multi_part');
    assert.ok(widgetPrompt.includes('REQUIRED_PARTS_CHECKLIST:'), 'Widget prompt must inject REQUIRED_PARTS_CHECKLIST');

    const widgetLinks = sandbox.findRelevantSectionLinks(
      'How do I apply for admission and what is the fee structure?',
      'Complete the Online Admission Form and review the Fee Structure.',
      { siteBlueprint: sampleBlueprint, frontendIntelligence: sampleBlueprint.frontendIndex },
      { maxLinks: 3 }
    );
    assert.ok(widgetLinks.length >= 2, `Widget link finder should return primary + related links, got ${widgetLinks.length}`);
    assert.equal(widgetLinks[0].role, 'primary');
    assert.equal(widgetLinks[1].role, 'related');

    const widgetMultiLocal = await sandbox.inferLocalAgentResponse(
      'Explain the fee structure, eligibility criteria, and documents required for Class 11 Science',
      null,
      sandbox.conversationHistory,
      { activeItem: null }
    );
    const widgetMultiText = typeof widgetMultiLocal === 'object' ? widgetMultiLocal.reply : widgetMultiLocal;
    assert.ok(widgetMultiText.includes('28,000'), `Widget local multi-part reply must cover fees: ${widgetMultiText}`);
    assert.ok(/60%|board exam|eligibility/i.test(widgetMultiText), `Widget local multi-part reply must cover eligibility: ${widgetMultiText}`);
    assert.ok(/marksheet|leaving certificate|aadhaar/i.test(widgetMultiText), `Widget local multi-part reply must cover documents: ${widgetMultiText}`);

    console.log('✅ Test 4 passed: Live widget.js prompt depth plan, multi-part local synthesis, multi-link resolution & zero blue box');
    passed++;
  }

  // TEST 5: Multi-Turn Follow-Up Context Resolution in Studio (12-Turn Window)
  {
    const longHistory = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'What courses do you offer?' },
      { role: 'assistant', content: 'We offer Class 11 Science and Class 11 Commerce.' },
      { role: 'user', content: 'Tell me about Class 11 Commerce' },
      { role: 'assistant', content: 'Class 11 Commerce is ₹19,500/yr covering Accountancy, Economics, and Business Studies.' }
    ];
    const followUpReply = await generateAIResponse(
      'What is the fee for that?',
      'You are Sunrise Junior College Assistant.',
      sampleKb,
      '',
      { databaseRecords: sampleCourses, conversationHistory: longHistory, siteBlueprint: sampleBlueprint }
    );
    assert.ok(followUpReply.includes('Class 11 Commerce') && followUpReply.includes('19,500'), `Follow-up should resolve Class 11 Commerce fee from prior turn: ${followUpReply}`);
    assert.ok(followUpReply.includes('[Fee Structure](#fee-structure)'), `Follow-up fee answer should link to #fee-structure: ${followUpReply}`);

    console.log('✅ Test 5 passed: Follow-up context awareness resolves prior turn anchor & attaches matching section link');
    passed++;
  }

  console.log(`\n🎉 ALL ${passed}/5 PILLAR 6 DETAILED ANSWERS, SECTION NAVIGATION & QUESTION UNDERSTANDING TESTS PASSED!`);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
