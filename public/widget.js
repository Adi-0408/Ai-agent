/**
 * Voice Help Desk Embeddable Widget
 * Zero-dependency, Shadow DOM isolated, Free-tier friendly Voice AI Assistant.
 * Embed on any website: <script src="https://your-domain/widget.js" data-agent-id="YOUR_AGENT_ID"></script>
 */
(function () {
  'use strict';

  // Find the widget script tag safely across all bundlers, defer, async, and iframe setups
  function getWidgetScript() {
    if (document.currentScript) return document.currentScript;
    const scripts = document.querySelectorAll('script[src*="widget.js"], script[data-agent-id], script[data-api-key]');
    if (scripts.length > 0) return scripts[scripts.length - 1];
    const all = document.getElementsByTagName('script');
    return all.length > 0 ? all[all.length - 1] : null;
  }

  const currentScript = getWidgetScript();
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
  const hostDomain = (typeof window !== 'undefined' && window.location && window.location.hostname)
    ? window.location.hostname.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    : 'site';
  const agentKeySegment = encodeURIComponent(agentId || cleanInitialName).toLowerCase().replace(/[^a-z0-9_-]/gi, '_');
  const CACHE_KEY = `vhd_agent_${agentKeySegment}_${hostDomain}`;
  const DELETED_KEY = `vhd_deleted_${agentKeySegment}_${hostDomain}`;
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

  // Universal Archetype Profiles: adapts conversational memory, phrasing, and domain isolation to ANY website type
  const ARCHETYPE_PROFILES = {
    academic: {
      nounEn: 'courses and admissions', nounHi: 'कोर्स और एडमिशन', nounMr: 'अभ्यासक्रम आणि प्रवेश',
      itemNounEn: 'courses / programs', itemNounHi: 'कोर्स / कार्यक्रम', itemNounMr: 'अभ्यासक्रम / कोर्सेस',
      itemUnit: 'seats', priceLabelEn: 'annual fee', priceLabelHi: 'वार्षिक फीस', priceLabelMr: 'वार्षिक फी',
      defaultDesc: 'comprehensive curriculum, experienced faculty, laboratory facilities, and student guidance',
      actionEn: 'complete the online admission form on this portal and submit your required documents',
      actionHi: 'इस पोर्टल पर ऑनलाइन एडमिशन फॉर्म भरें और आवश्यक दस्तावेज जमा करें',
      actionMr: 'या पोर्टलवर ऑनलाइन प्रवेश अर्ज भरा आणि आवश्यक कागदपत्रे सादर करा',
      followUpEn: 'course details, fee structure, eligibility criteria, or admission procedure',
      followUpHi: 'कोर्स विवरण, फीस, पात्रता या एडमिशन प्रक्रिया',
      followUpMr: 'अभ्यासक्रम, फी, पात्रता किंवा प्रवेश प्रक्रिया',
      roleDesc: 'the official academic admissions & student support assistant',
      audience: 'students, parents, and applicants exploring courses, admissions, eligibility, and fees',
      topicsList: 'courses, admissions, fees, eligibility, syllabus, campus guidelines',
      catalogLabel: '[VERIFIED_COURSES_AND_PROGRAMS_DATABASE]'
    },
    healthcare: {
      nounEn: 'medicines and healthcare services', nounHi: 'दवाइयां और स्वास्थ्य सेवाएं', nounMr: 'औषधे आणि आरोग्य सेवा',
      itemNounEn: 'medicines', itemNounHi: 'दवाइयां', itemNounMr: 'औषधे',
      itemUnit: 'packs', priceLabelEn: 'price', priceLabelHi: 'कीमत', priceLabelMr: 'किंमत',
      defaultDesc: 'certified pharmaceutical quality with clear dosage guidance and pharmacist support',
      actionEn: 'add it to your order or upload your prescription on our website for doorstep delivery or counter pickup',
      actionHi: 'इसे अपने ऑर्डर में जोड़ें या होम डिलीवरी के लिए वेबसाइट पर अपना पर्चा अपलोड करें',
      actionMr: 'हे आपल्या ऑर्डरमध्ये जोडा किंवा होम डिलिव्हरीसाठी वेबसाइटवर प्रिस्क्रिप्शन अपलोड करा',
      followUpEn: 'dosage details, pricing, stock availability, or prescription requirements',
      followUpHi: 'खुराक, कीमत, स्टॉक उपलब्धता या प्रिस्क्रिप्शन आवश्यकताओं',
      followUpMr: 'डोस, किंमत, स्टॉक उपलब्धता किंवा प्रिस्क्रिप्शन नियमां',
      roleDesc: 'the official pharmacy & healthcare customer assistant',
      audience: 'patients and healthcare customers inquiring about medicines, prescriptions, and clinic services',
      topicsList: 'medicines, dosage, stock availability, prescription requirements, prices, clinic timings',
      catalogLabel: '[VERIFIED_MEDICINES_AND_HEALTHCARE_CATALOG]'
    },
    ecommerce: {
      nounEn: 'products, orders, and shopping', nounHi: 'उत्पाद और ऑर्डर', nounMr: 'उत्पादने आणि ऑर्डर्स',
      itemNounEn: 'products', itemNounHi: 'उत्पाद', itemNounMr: 'उत्पादने',
      itemUnit: 'units', priceLabelEn: 'price', priceLabelHi: 'कीमत', priceLabelMr: 'किंमत',
      defaultDesc: 'authentic quality, manufacturer warranty, fast shipping, and hassle-free returns',
      actionEn: 'add it to your cart and complete checkout directly on this website',
      actionHi: 'इसे अपने कार्ट में जोड़ें और सीधे इस वेबसाइट पर चेकआउट पूरा करें',
      actionMr: 'हे आपल्या कार्टमध्ये जोडा आणि थेट या वेबसाइटवर चेकआउट पूर्ण करा',
      followUpEn: 'product specifications, pricing, stock availability, shipping, or return policy',
      followUpHi: 'उत्पाद विवरण, कीमत, स्टॉक, डिलीवरी या रिटर्न पॉलिसी',
      followUpMr: 'उत्पादन तपशील, किंमत, स्टॉक, डिलिव्हरी किंवा रिटर्न पॉलिसी',
      roleDesc: 'the official online store & customer care assistant',
      audience: 'online shoppers and customers browsing products, pricing, shipping, and orders',
      topicsList: 'products, specifications, pricing, stock availability, shipping, delivery, returns',
      catalogLabel: '[VERIFIED_PRODUCTS_AND_INVENTORY_DATABASE]'
    },
    food: {
      nounEn: 'our menu and dining services', nounHi: 'हमारे मेनू और डाइनिंग सेवाओं', nounMr: 'आमच्या मेनू आणि जेवण सेवां',
      itemNounEn: 'dishes', itemNounHi: 'व्यंजन', itemNounMr: 'पदार्थ',
      itemUnit: 'portions', priceLabelEn: 'price', priceLabelHi: 'कीमत', priceLabelMr: 'किंमत',
      defaultDesc: 'freshly prepared ingredients, authentic recipe, and prompt dine-in or delivery service',
      actionEn: 'place your order directly through our menu section or reserve a table with us',
      actionHi: 'सीधे हमारे मेनू से ऑर्डर करें या हमारे साथ टेबल रिजर्व करें',
      actionMr: 'थेट आमच्या मेनूमधून ऑर्डर करा किंवा आमच्याकडे टेबल बुक करा',
      followUpEn: 'ingredients, pricing, dietary options, combos, or table reservations',
      followUpHi: 'सामग्री, कीमत, डाइटरी विकल्प, कॉम्बो या टेबल बुकिंग',
      followUpMr: 'घटक, किंमत, आहार पर्याय, कॉम्बो किंवा टेबल बुकिंग',
      roleDesc: 'the official dining & food ordering concierge',
      audience: 'diners and guests exploring dishes, ingredients, combos, prices, and reservations',
      topicsList: 'menu dishes, ingredients, prices, dietary options, reservations, delivery',
      catalogLabel: '[VERIFIED_MENU_AND_DISHES_DATABASE]'
    },
    saas: {
      nounEn: 'plans and platform features', nounHi: 'प्लान और प्लेटफॉर्म सुविधाओं', nounMr: 'प्लॅन्स आणि सॉफ्टवेअर वैशिष्ट्यां',
      itemNounEn: 'plans', itemNounHi: 'प्लान्स', itemNounMr: 'प्लॅन्स',
      itemUnit: 'licenses', priceLabelEn: 'subscription rate', priceLabelHi: 'सब्सक्रिप्शन शुल्क', priceLabelMr: 'सबस्क्रिप्शन दर',
      defaultDesc: 'cloud-hosted reliability, priority technical support, analytics, and seamless integrations',
      actionEn: 'select the plan from our pricing section to start your subscription or free trial',
      actionHi: 'सब्सक्रिप्शन या फ्री ट्रायल शुरू करने के लिए प्राइसिंग सेक्शन से प्लान चुनें',
      actionMr: 'सबस्क्रिप्शन किंवा फ्री ट्रायल सुरू करण्यासाठी किंमत विभागातून प्लॅन निवडा',
      followUpEn: 'plan features, pricing tiers, billing options, or getting started',
      followUpHi: 'प्लान की सुविधाएं, प्राइसिंग, बिलिंग या शुरुआत करने',
      followUpMr: 'प्लॅन वैशिष्ट्ये, किंमत, बिलिंग किंवा सुरुवात करण्या',
      roleDesc: 'the official software product & customer support specialist',
      audience: 'users, teams, and subscribers exploring plans, features, and billing',
      topicsList: 'plans, features, pricing tiers, billing, trials, customer support',
      catalogLabel: '[VERIFIED_PLANS_AND_FEATURES_DATABASE]'
    },
    hospitality: {
      nounEn: 'rooms, packages, and stays', nounHi: 'कमरे, पैकेज और बुकिंग', nounMr: 'रूम्स, पॅकेजेस आणि बुकिंग',
      itemNounEn: 'rooms', itemNounHi: 'कमरे', itemNounMr: 'रूम्स',
      itemUnit: 'rooms', priceLabelEn: 'nightly rate', priceLabelHi: 'प्रति रात किराया', priceLabelMr: 'प्रति रात्र दर',
      defaultDesc: 'comfortable accommodations, complimentary Wi-Fi, room service, and modern guest amenities',
      actionEn: 'select your check-in and check-out dates on our reservation section to confirm your stay',
      actionHi: 'बुकिंग कन्फर्म करने के लिए रिजर्वेशन सेक्शन में अपनी तारीखें चुनें',
      actionMr: 'बुकिंग निश्चित करण्यासाठी आरक्षण विभागात आपल्या तारखा निवडा',
      followUpEn: 'room amenities, rates, availability, check-in timings, or booking',
      followUpHi: 'रूम की सुविधाएं, किराया, उपलब्धता, चेक-इन समय या बुकिंग',
      followUpMr: 'रूम सुविधा, दर, उपलब्धता, चेक-इन वेळ किंवा बुकिंग',
      roleDesc: 'the official hospitality & guest reservation concierge',
      audience: 'guests and travelers booking rooms, stays, amenities, and packages',
      topicsList: 'rooms, rates, amenities, check-in/out timings, dining, reservations',
      catalogLabel: '[VERIFIED_ROOMS_AND_PACKAGES_DATABASE]'
    },
    automotive: {
      nounEn: 'vehicles and showroom services', nounHi: 'वाहन और शोरूम सेवाओं', nounMr: 'वाहने आणि शोरूम सेवां',
      itemNounEn: 'vehicles', itemNounHi: 'वाहन', itemNounMr: 'वाहने',
      itemUnit: 'vehicles', priceLabelEn: 'price', priceLabelHi: 'कीमत', priceLabelMr: 'किंमत',
      defaultDesc: 'advanced engineering, manufacturer warranty, safety features, and flexible financing',
      actionEn: 'schedule a showroom visit or test drive through our booking form',
      actionHi: 'हमारे बुकिंग फॉर्म के माध्यम से शोरूम विजिट या टेस्ट ड्राइव शेड्यूल करें',
      actionMr: 'आमच्या बुकिंग फॉर्मद्वारे शोरूम भेट किंवा टेस्ट ड्राइव्ह बुक करा',
      followUpEn: 'vehicle specifications, pricing, availability, warranty, or test drives',
      followUpHi: 'वाहन विनिर्देश, कीमत, उपलब्धता, वारंटी या टेस्ट ड्राइव बुकिंग',
      followUpMr: 'वाहन वैशिष्ट्ये, किंमत, उपलब्धता, वॉरंटी किंवा टेस्ट ड्राइव्ह बुकिंग',
      roleDesc: 'the official automotive sales & service concierge',
      audience: 'vehicle buyers and drivers exploring models, specs, test drives, and service',
      topicsList: 'vehicle models, specifications, pricing, test drives, warranty, service appointments',
      catalogLabel: '[VERIFIED_VEHICLES_AND_SERVICES_DATABASE]'
    },
    financial: {
      nounEn: 'financial and advisory services', nounHi: 'वित्तीय और सलाहकार सेवाओं', nounMr: 'आर्थिक आणि सल्लागार सेवां',
      itemNounEn: 'services', itemNounHi: 'सेवाएं', itemNounMr: 'सेवा',
      itemUnit: 'slots', priceLabelEn: 'consultation fee', priceLabelHi: 'परामर्श शुल्क', priceLabelMr: 'सल्लामसलत शुल्क',
      defaultDesc: 'personalized advisory by certified specialists, compliance accuracy, and confidential handling',
      actionEn: 'book a consultation session through our contact form and share your basic details',
      actionHi: 'हमारे कॉन्टैक्ट फॉर्म के माध्यम से परामर्श सत्र बुक करें',
      actionMr: 'आमच्या संपर्क फॉर्मद्वारे सल्लामसलत सत्र बुक करा',
      followUpEn: 'service details, fees, required documents, or booking a consultation',
      followUpHi: 'सेवा विवरण, शुल्क, आवश्यक दस्तावेज या परामर्श बुकिंग',
      followUpMr: 'सेवा तपशील, शुल्क, आवश्यक कागदपत्रे किंवा सल्लामसलत बुकिंग',
      roleDesc: 'the official financial & tax advisory assistant',
      audience: 'clients and business owners seeking tax filing, loans, wealth advisory, and compliance',
      topicsList: 'tax filing, GST, loans, investments, wealth advisory, consultation booking',
      catalogLabel: '[VERIFIED_FINANCIAL_SERVICES_DATABASE]'
    },
    realestate: {
      nounEn: 'properties and listings', nounHi: 'प्रॉपर्टी और लिस्टिंग', nounMr: 'प्रॉपर्टी आणि लिस्टिंग',
      itemNounEn: 'properties', itemNounHi: 'प्रॉपर्टी', itemNounMr: 'प्रॉपर्टी',
      itemUnit: 'units', priceLabelEn: 'price', priceLabelHi: 'कीमत', priceLabelMr: 'किंमत',
      defaultDesc: 'prime location, verified documentation, modern amenities, and guided site visits',
      actionEn: 'request a guided site visit or callback through our inquiry section',
      actionHi: 'हमारे इन्क्वायरी सेक्शन से साइट विजिट या कॉलबैक का अनुरोध करें',
      actionMr: 'आमच्या चौकशी विभागातून साइट व्हिजिट किंवा कॉलबॅकची विनंती करा',
      followUpEn: 'property specifications, pricing, amenities, floor plans, or site visits',
      followUpHi: 'प्रॉपर्टी विवरण, कीमत, सुविधाएं या साइट विजिट बुकिंग',
      followUpMr: 'प्रॉपर्टी तपशील, किंमत, सुविधा किंवा साइट व्हिजिट बुकिंग',
      roleDesc: 'the official real estate & property concierge',
      audience: 'homebuyers, tenants, and investors exploring properties and listings',
      topicsList: 'properties, pricing, floor plans, amenities, site visits, purchase/rent terms',
      catalogLabel: '[VERIFIED_PROPERTIES_LISTINGS_DATABASE]'
    },
    general: {
      nounEn: 'our products and services', nounHi: 'हमारे उत्पाद और सेवाओं', nounMr: 'आमची उत्पादने आणि सेवां',
      itemNounEn: 'items', itemNounHi: 'उत्पाद', itemNounMr: 'उत्पादने',
      itemUnit: 'units', priceLabelEn: 'price', priceLabelHi: 'कीमत', priceLabelMr: 'किंमत',
      defaultDesc: 'high quality offerings, transparent pricing, and dedicated customer support',
      actionEn: 'submit an inquiry or use the order/booking section directly on this website',
      actionHi: 'सीधे इस वेबसाइट पर ऑर्डर/बुकिंग सेक्शन का उपयोग करें या इन्क्वायरी भेजें',
      actionMr: 'थेट या वेबसाइटवरील ऑर्डर/बुकिंग विभाग वापरा किंवा चौकशी पाठवा',
      followUpEn: 'details, pricing, availability, or how to get started',
      followUpHi: 'विवरण, कीमत, उपलब्धता या शुरुआत करने',
      followUpMr: 'तपशील, किंमत, उपलब्धता किंवा सुरुवात करण्या',
      roleDesc: 'the official live customer support assistant',
      audience: 'customers and website visitors',
      topicsList: 'products, services, pricing, availability, timings, location, ordering',
      catalogLabel: '[VERIFIED_DATABASE_RECORDS]'
    }
  };

  function getArchetypeProfile(arch) {
    return ARCHETYPE_PROFILES[arch] || ARCHETYPE_PROFILES.general;
  }

  // Domain archetype detector: universally detects ANY website type for strict isolation & tailored phrasing
  function detectCurrentArchetype(cfg = agentConfig) {
    const pageTitle = (typeof document !== 'undefined' && document.title) ? document.title : '';
    const bodySnippet = (typeof document !== 'undefined' && document.body) ? (document.body.innerText || '').slice(0, 1500) : '';
    const dbNames = Array.isArray(cfg?.databaseRecords) ? cfg.databaseRecords.slice(0, 10).map(r => `${r.name || ''} ${r.category || ''}`).join(' ') : '';
    const text = `${cfg?.archetype || ''} ${cfg?.name || ''} ${cfg?.role || ''} ${cfg?.prompt || ''} ${dbNames} ${pageTitle} ${bodySnippet}`.toLowerCase();

    if (/\b(admission|admissions|school|college|university|academy|academic|student|students|course|courses|degree|diploma|syllabus|faculty|tuition|shikshan|sanstha|vidyalaya|curriculum|exam|campus|std\s*11|std\s*12)\b/i.test(text)) {
      return 'academic';
    }
    if (/\b(pharmacy|medicine|medicines|drug|drugs|pill|pills|tablet|tablets|prescription|capsule|syrup|dosage|clinic|hospital|patient|doctor|pharma)\b/i.test(text)) {
      return 'healthcare';
    }
    if (/\b(restaurant|cafe|dining|food|dish|dishes|menu|bakery|pizza|burger|meal|kitchen|cuisine|dessert|biryani|pasta)\b/i.test(text)) {
      return 'food';
    }
    if (/\b(hotel|resort|room|rooms|stay|suite|check-in|check-out|villa|hostel|banquet|lodge)\b/i.test(text)) {
      return 'hospitality';
    }
    if (/\b(software|saas|subscription|pricing\s*tier|starter\s*plan|pro\s*plan|enterprise\s*plan|cloud\s*platform|workspace|api\s*limit)\b/i.test(text)) {
      return 'saas';
    }
    if (/\b(car|cars|vehicle|vehicles|automotive|dealership|showroom|test\s*drive|suv|sedan|hatchback|motorcycle|bike|servicing)\b/i.test(text)) {
      return 'automotive';
    }
    if (/\b(finance|financial|tax\s*filing|itr|gst|wealth\s*management|accounting|audit|loan|loans|investment|mutual\s*fund|chartered|consultancy)\b/i.test(text)) {
      return 'financial';
    }
    if (/\b(real\s*estate|property|properties|apartment|apartments|flat|flats|2bhk|3bhk|plot|plots|lease|rent\s*home|commercial\s*space|site\s*visit)\b/i.test(text)) {
      return 'realestate';
    }
    if (/\b(shop|store|e-commerce|ecommerce|sneaker|shoe|shoes|clothing|apparel|fashion|electronics|gadget|watch|cart|checkout|shipping|return\s*policy|add\s*to\s*cart)\b/i.test(text)) {
      return 'ecommerce';
    }
    return 'general';
  }

  // Universal Strict Customer Catalog Item Validator (Defense-in-Depth for both new & legacy Firestore agents!)
  function isValidCustomerCatalogName(rawName, record = null) {
    const name = String(rawName || '').trim();
    if (!name || name.length < 2 || name.length > 75) return false;

    if (/^\s*(\.\.\.|\/\/|\/\*|\*\/|\*|-|–|—|•|▪|▸|►|◦|·|#|@|!|\$|&|\||<|>|=|\+|\[|\]|\(|\)|\{|\}|;|:|,|`|'|")/.test(name)) return false;
    if (name.includes('//') || name.includes('/*') || name.includes('*/')) return false;
    if (name.includes('=>') || name.includes('();') || name.includes('()') || name.includes('===') || name.includes('!==') || name.includes('==') || name.includes('!=') || name.includes('&&') || name.includes('||') || name.includes('+=') || name.includes('-=') || name.includes('??') || name.includes('?.') || name.includes('++') || name.includes('${')) return false;
    if (name.includes('{') || name.includes('}') || name.includes(';') || name.includes('[') || name.includes(']') || name.includes('?') || /CREATE\s+TABLE|INSERT\s+INTO|SELECT\s+.*\s+FROM/i.test(name)) return false;
    if (name.split(/\s+/).length > 9) return false;

    if (/^(api[_-]?key|auth[_-]?domain|project[_-]?id|storage[_-]?bucket|messaging[_-]?sender[_-]?id|sender[_-]?id|app[_-]?id|measurement[_-]?id|database[_-]?url|token|secret|client[_-]?id|client[_-]?secret|password|bearer|authorization|cookie|session|jwt|dotenv|config|options|settings|environment|env)\b/i.test(name)) return false;
    if (/: AIza|firebaseapp\.com|firebasestorage\.app|1:\d+:web:/i.test(name)) return false;

    if (/^[a-zA-Z_$][a-zA-Z0-9_$]*\s*:\s*\S+/.test(name)) return false;
    if (/^([a-z][a-zA-Z0-9\s]{1,28})\s*:\s*\1$/i.test(name)) return false;
    if (/^(method|headers|body|type|status|mode|cache|credentials|redirect|referrer|signal|action|url|uri|endpoint|path|route|timeout|retries|payload|params|query|fields|collection|document|doc|ref|data|error|message|code|token|key|id|uid|user\s*id|first\s*name|last\s*name|created\s*at|updated\s*at|timestamp|content\s*type|authorization|accept|origin|host|port)\s*:/i.test(name)) return false;

    const withoutSafeDots = name
      .replace(/\b(?:Dr|Mr|Mrs|Ms|St|Sr|Jr|Rs|No|Std|Prof|Inc|Ltd|Pvt|Co|etc)\./gi, ' ')
      .replace(/\b(?:B\.Sc|M\.Sc|B\.Tech|M\.Tech|B\.Com|M\.Com|B\.A|M\.A|B\.E|M\.E|B\.Ed|M\.Ed|Ph\.D|LL\.B|M\.B\.A|B\.B\.A|B\.C\.A|M\.C\.A|B\.Pharm|M\.Pharm|M\.B\.B\.S)\b\.?/gi, ' ')
      .replace(/\bv?\d+\.\d+[a-zA-Z]*\b/g, ' ');
    if (/\b[a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$][a-zA-Z0-9_$]{1,}\b/.test(withoutSafeDots)) return false;

    if (/^(console\.|function\b|async\b|await\b|const\b|let\b|var\b|for\s*\(|while\s*\(|import\b|export\b|return\b|class\b|if\s*\(|else\b|switch\b|case\b|default\b|try\b|catch\b|finally\b|throw\b|new\s|typeof\b|instanceof\b|window\.|document\.|process\.|localStorage\.|sessionStorage\.|JSON\.|Math\.|Object\.|Array\.|Promise\.|fetch\s*\(|require\s*\(|module\.exports|def\s|self\.)/i.test(name)) return false;
    if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|application\/json|text\/plain|content-type|utf-8|cors|null|undefined|true|false|nan)$/i.test(name)) return false;

    // Reject developer README/setup bullets & UI feature boilerplate
    if (/\b(apps\s*script|toolbar|optimized\s+for|responsive|configurable\s+by|mobile[- ]first|dark\s*mode|light\s*mode|desktop,\s*tablet|tablet\s+and\s+mobile|desktop\s+and\s+mobile|viewport|readme|changelog|setup\s+guide|installation|git\s+clone|npm\s+|yarn\s+|vite|webpack|tailwind|react\s+app|next\.?js|firestore|firebase|supabase|webhook|localhost|browser|sidebar|navbar|dropdown|tooltip|modal|animation|css|html|javascript|typescript|json\s+file|sql\s+file|source\s+code|repository|github|vercel|netlify|deployment|deploy\s+as|click\s+deploy|copy\s+the|paste\s+the|downloadable\s+pdfs?)\b/i.test(name)) return false;

    if (/^(generate|create|build|run|click|install|download|configure|setup|update|test|verify|deploy|fix|add|remove|delete|edit|include|allow|ensure|enable|disable|check|select|choose|press|provide|support|optimize|use|using|implement)\b/i.test(name)) return false;
    if (/^(what\b|tell me\b|how\b|can you\b|why\b|who\b|sample\b|untitled\b|sr\.?no\b|action\b|name\b|product\b|item\b|price\b|stock\b|total\b|status\b|features?\b|services?\b|welcome\b|about\b|privacy\b|terms\b|copyright\b|faq\b)/i.test(name)) return false;
    if (/\b(tell me about|how to|what is|why do|can you|about us|contact us|privacy policy|terms of service|features? overview|welcome to)\b/i.test(name)) return false;
    if (/^(?:a|an|the|this|that|these|those)\s+(?:modern|simple|clean|fast|smart|easy|interactive|complete|comprehensive|responsive|lightweight|powerful|scalable|flexible|built|custom|new|full|basic|advanced|user|web|online|digital|automated)\b/i.test(name)) return false;
    if (/^(?:in\s+the|on\s+the|at\s+the|for\s+the|to\s+the|from\s+the|with\s+the|by\s+the|built\s+with|powered\s+by|designed\s+for|made\s+for|optimized\s+for|step\s+\d+)\b/i.test(name)) return false;

    const hasPrice = Boolean(record && record.price !== undefined && String(record.price).trim() !== '');
    const hasStock = Boolean(record && (record.stock !== undefined && record.stock !== null && !isNaN(Number(record.stock))));
    if (!hasPrice && !hasStock && /^(?:a|an|the)\s+[a-z]+$/i.test(name)) return false;
    if (!hasPrice && !hasStock && !/\s/.test(name)) {
      const knownBrands = /^(iPhone|iPad|iMac|iPod|eBay|eBook|OnePlus|PayPal|YouTube|LinkedIn|WhatsApp|PlayStation|MacBook|AirPods|ThinkPad|PowerPoint|WordPress|FastAPI|NextJS|GraphQL)$/i;
      if (!knownBrands.test(name)) {
        if (/^[a-z]+_[a-z0-9_]+$/i.test(name)) return false;
        if (/^[a-z]{2,}[A-Z][a-z]+[A-Za-z0-9]*$/.test(name)) return false;
      }
    }
    return true;
  }

  let lastConfigFetchAt = 0;
  let hasLoadedRemoteConfig = false;

  // Fetch Agent Config from Firestore REST API (with strict deletion check, 30s throttle & safe fallback)
  async function fetchAgentConfig(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && lastConfigFetchAt > 0 && (now - lastConfigFetchAt < 30000)) {
      return true;
    }
    try {
      // 0 & 1. Run tombstone check + primary agent fetch IN PARALLEL with strict 2.5s timeout!
      const tombstoneUrls = [
        `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/deleted_agents/${encodeURIComponent(cleanInitialName)}`
      ];
      if (agentId !== cleanInitialName) {
        tombstoneUrls.push(
          `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/deleted_agents/${encodeURIComponent(agentId)}`
        );
      }

      const [tombstoneSettled, primarySettled] = await Promise.all([
        Promise.allSettled(tombstoneUrls.map(u => fetch(u, { signal: AbortSignal.timeout(2500) }))),
        Promise.allSettled([
          fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agents/${encodeURIComponent(agentId)}`, { signal: AbortSignal.timeout(2500) }),
          agentId !== cleanInitialName
            ? fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agents/${encodeURIComponent(cleanInitialName)}`, { signal: AbortSignal.timeout(2500) })
            : Promise.resolve(null)
        ])
      ]);

      for (const ts of tombstoneSettled) {
        if (ts.status === 'fulfilled' && ts.value && ts.value.ok) {
          console.warn(`[Voice Help Desk] Agent "${cleanInitialName}" has been deleted. Voice widget is disabled.`);
          try {
            localStorage.removeItem(CACHE_KEY);
            localStorage.setItem(DELETED_KEY, 'true');
          } catch (e) {}
          const existingHost = document.getElementById('voice-helpdesk-root');
          if (existingHost) existingHost.remove();
          return false;
        }
      }

      let res = (primarySettled[0]?.status === 'fulfilled' && primarySettled[0].value?.ok)
        ? primarySettled[0].value
        : ((primarySettled[1]?.status === 'fulfilled' && primarySettled[1].value?.ok)
            ? primarySettled[1].value
            : (primarySettled[0]?.status === 'fulfilled' ? primarySettled[0].value : null));

      // 3. Multi-strategy search across agents collection for exact matches
      if (!res || !res.ok) {
        try {
          const listRes = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agents`, { signal: AbortSignal.timeout(2500) });
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

      // If agent was not found in Firestore (e.g. 404 or CORS on external site), operate in Autonomous On-Page Mode!
      if (!res || !res.ok) {
        lastConfigFetchAt = Date.now();
        // Never wipe already-loaded verified databaseRecords on a transient mid-chat hiccup
        if (hasLoadedRemoteConfig) {
          return true;
        }
        console.info(`[Voice Help Desk] Operating in Autonomous On-Page Mode for "${cleanInitialName}".`);
        const scriptEl = getWidgetScript();
        const customName = scriptEl?.getAttribute('data-agent-id') || scriptEl?.getAttribute('data-agent') || cleanInitialName;
        const pageTitle = (typeof document !== 'undefined' && document.title) ? document.title.split(/[-|•–:]/)[0].trim() : '';
        const finalName = customName && customName !== 'Help Desk' ? customName : (pageTitle || 'AI Assistant');
        
        agentConfig.name = finalName;
        if (!Array.isArray(agentConfig.databaseRecords)) {
          agentConfig.databaseRecords = [];
        }
        const autoArchetype = detectCurrentArchetype(agentConfig);
        agentConfig.archetype = autoArchetype;
        if (autoArchetype === 'academic') {
          agentConfig.role = 'Academic Admissions & Student Support Guide';
          agentConfig.greeting = `Hello! Welcome to ${pageTitle || 'our institution'}. I am ${finalName}, your academic admissions assistant. How can I help you with courses, admissions, eligibility, or applications today?`;
        } else {
          agentConfig.greeting = `Hello! Welcome to ${pageTitle || 'our website'}. I am ${finalName}, your live customer support assistant. How can I assist you with our services, catalog, or inquiries today?`;
        }
        return true;
      }

      const json = await res.json();
      if (!json || !json.fields) {
        lastConfigFetchAt = Date.now();
        return true;
      }
      hasLoadedRemoteConfig = true;
      lastConfigFetchAt = Date.now();

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
      } else if (Array.isArray(json.knowledgeBase)) {
        parsedData.knowledgeBase = json.knowledgeBase;
      }

      // Universal recursive Firestore REST value decoder (for siteBlueprint, databaseConfig, nested objects)
      function decodeFirestoreValue(val) {
        if (!val || typeof val !== 'object') return val;
        if ('stringValue' in val) return val.stringValue;
        if ('integerValue' in val) return Number(val.integerValue);
        if ('doubleValue' in val) return Number(val.doubleValue);
        if ('booleanValue' in val) return Boolean(val.booleanValue);
        if ('nullValue' in val) return null;
        if ('timestampValue' in val) return val.timestampValue;
        if ('arrayValue' in val) {
          return Array.isArray(val.arrayValue?.values) ? val.arrayValue.values.map(decodeFirestoreValue) : [];
        }
        if ('mapValue' in val) {
          const obj = {};
          const flds = val.mapValue?.fields || {};
          for (const [k, v] of Object.entries(flds)) {
            obj[k] = decodeFirestoreValue(v);
          }
          return obj;
        }
        return null;
      }

      if (fields.siteBlueprint && fields.siteBlueprint.mapValue) {
        parsedData.siteBlueprint = decodeFirestoreValue(fields.siteBlueprint);
      } else if (json.siteBlueprint && typeof json.siteBlueprint === 'object') {
        parsedData.siteBlueprint = json.siteBlueprint;
      }

      if (fields.databaseRecords && fields.databaseRecords.arrayValue && fields.databaseRecords.arrayValue.values) {
        parsedData.databaseRecords = fields.databaseRecords.arrayValue.values.map(v => {
          if (v.mapValue && v.mapValue.fields) {
            const f = v.mapValue.fields;
            return {
              id: f.id?.stringValue || '',
              name: f.name?.stringValue || '',
              price: f.price?.stringValue || (f.price?.doubleValue !== undefined ? `₹${f.price.doubleValue}` : (f.price?.integerValue !== undefined ? `₹${f.price.integerValue}` : '')),
              stock: f.stock?.integerValue !== undefined ? Number(f.stock.integerValue) : (f.stock?.doubleValue !== undefined ? Number(f.stock.doubleValue) : null),
              unit: f.unit?.stringValue || 'units',
              category: f.category?.stringValue || '',
              dosage: f.dosage?.stringValue || '',
              description: f.description?.stringValue || '',
              rx: f.rx?.booleanValue || false
            };
          }
          return null;
        }).filter(rec => rec && isValidCustomerCatalogName(rec.name, rec));
      } else if (Array.isArray(json.databaseRecords)) {
        parsedData.databaseRecords = json.databaseRecords.filter(rec => rec && isValidCustomerCatalogName(rec.name, rec));
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
      console.warn('[Voice Help Desk] Could not verify remote agent config, running in autonomous mode:', err);
      const isDeletedFlag = localStorage.getItem(DELETED_KEY) === 'true';
      if (isDeletedFlag) return false;
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < CACHE_TTL_MS && parsed.data) {
            agentConfig = { ...agentConfig, ...parsed.data };
          }
        } catch (e) {}
      }
      return true; // Never self-destruct on external websites
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
        width: 392px;
        max-width: calc(100vw - 28px);
        height: 590px;
        max-height: calc(100vh - 116px);
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(11, 17, 32, 0.98) 100%);
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 22px;
        box-shadow: 0 24px 60px rgba(2, 6, 23, 0.65), 0 0 0 1px rgba(99, 102, 241, 0.12);
        display: none;
        flex-direction: column;
        overflow: hidden;
        z-index: 999999;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
      }
      .vhd-panel.open {
        display: flex;
        animation: slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes slideUp {
        from { opacity: 0; transform: translateY(14px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes msgFadeIn {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .vhd-header {
        padding: 14px 16px;
        background: linear-gradient(135deg, rgba(30, 41, 59, 0.85), rgba(15, 23, 42, 0.92));
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .vhd-header-info {
        display: flex;
        align-items: center;
        gap: 11px;
        min-width: 0;
      }
      .vhd-avatar {
        width: 38px;
        height: 38px;
        border-radius: 13px;
        background: linear-gradient(135deg, var(--primary), var(--accent));
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 0.4px;
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.28);
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
        flex-shrink: 0;
      }
      .vhd-agent-title {
        font-weight: 600;
        font-size: 14.5px;
        color: #f8fafc;
        letter-spacing: -0.01em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 235px;
      }
      .vhd-agent-status {
        font-size: 11px;
        color: #34d399;
        display: flex;
        align-items: center;
        gap: 5px;
        margin-top: 1px;
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
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #94a3b8;
        cursor: pointer;
        width: 30px;
        height: 30px;
        border-radius: 9px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.16s ease;
      }
      .vhd-close-btn:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.14);
      }
      .vhd-body {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 11px;
        scroll-behavior: smooth;
      }
      .vhd-body::-webkit-scrollbar {
        width: 5px;
      }
      .vhd-body::-webkit-scrollbar-track {
        background: transparent;
      }
      .vhd-body::-webkit-scrollbar-thumb {
        background: rgba(148, 163, 184, 0.25);
        border-radius: 99px;
      }
      .vhd-msg {
        max-width: 86%;
        padding: 10px 14px;
        border-radius: 15px;
        line-height: 1.52;
        font-size: 13.2px;
        word-break: break-word;
        animation: msgFadeIn 0.2s ease-out;
      }
      .vhd-msg-agent {
        background: rgba(30, 41, 59, 0.88);
        color: #e2e8f0;
        align-self: flex-start;
        border-bottom-left-radius: 5px;
        border: 1px solid rgba(148, 163, 184, 0.14);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
      }
      .vhd-msg-user {
        background: linear-gradient(135deg, var(--primary), #4f46e5);
        color: #ffffff;
        align-self: flex-end;
        border-bottom-right-radius: 5px;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.28);
      }
      .vhd-nav-pill-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 9px;
        padding: 6px 13px;
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.18), rgba(99, 102, 241, 0.2));
        border: 1px solid rgba(56, 189, 248, 0.45);
        color: #7dd3fc;
        border-radius: 10px;
        font-size: 11.5px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      .vhd-nav-pill-btn:hover {
        background: linear-gradient(135deg, rgba(56, 189, 248, 0.3), rgba(99, 102, 241, 0.32));
        border-color: #38bdf8;
        color: #ffffff;
        transform: translateY(-1px);
      }
      .vhd-quick-chips {
        display: flex;
        flex-wrap: nowrap;
        gap: 6px;
        padding: 8px 14px 4px;
        overflow-x: auto;
        scrollbar-width: none;
        background: rgba(11, 17, 32, 0.65);
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }
      .vhd-quick-chips::-webkit-scrollbar {
        display: none;
      }
      .vhd-chip-btn {
        background: rgba(30, 41, 59, 0.85);
        border: 1px solid rgba(148, 163, 184, 0.2);
        color: #cbd5e1;
        padding: 5px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
        cursor: pointer;
        transition: all 0.16s ease;
        flex-shrink: 0;
      }
      .vhd-chip-btn:hover {
        background: rgba(99, 102, 241, 0.22);
        border-color: rgba(129, 140, 248, 0.55);
        color: #ffffff;
        transform: translateY(-1px);
      }
      /* Sleek Compact Voice Strip (maximizes chat viewport by +40%) */
      .vhd-voice-hero {
        background: linear-gradient(90deg, rgba(99, 102, 241, 0.08), rgba(6, 182, 212, 0.08));
        padding: 7px 14px;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
      }
      .vhd-orb-btn {
        width: 32px;
        height: 32px;
        border-radius: 999px;
        background: linear-gradient(135deg, var(--primary), var(--accent));
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        box-shadow: 0 0 12px rgba(99, 102, 241, 0.45);
        transition: all 0.2s ease;
        flex-shrink: 0;
      }
      .vhd-orb-btn svg {
        width: 16px;
        height: 16px;
      }
      .vhd-orb-btn.listening {
        animation: pulseOrb 1.4s infinite;
        background: linear-gradient(135deg, #ef4444, #f97316);
        box-shadow: 0 0 18px rgba(239, 68, 68, 0.7);
      }
      .vhd-orb-btn.speaking {
        animation: pulseSpeaking 1.2s infinite;
        background: linear-gradient(135deg, #10b981, #06b6d4);
        box-shadow: 0 0 18px rgba(16, 185, 129, 0.7);
      }
      @keyframes pulseOrb {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.65); }
        70% { transform: scale(1.06); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
      }
      @keyframes pulseSpeaking {
        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.65); }
        70% { transform: scale(1.06); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
      }
      .vhd-voice-label {
        flex: 1;
        font-size: 11px;
        color: #94a3b8;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .vhd-footer {
        padding: 10px 14px 12px;
        background: rgba(11, 17, 32, 0.96);
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .vhd-input {
        flex: 1;
        background: rgba(30, 41, 59, 0.9);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        padding: 9px 13px;
        color: #f8fafc;
        font-size: 13px;
        outline: none;
        transition: border-color 0.16s ease, box-shadow 0.16s ease;
      }
      .vhd-input::placeholder {
        color: #64748b;
      }
      .vhd-input:focus {
        border-color: var(--accent);
        box-shadow: 0 0 0 2px rgba(6, 182, 212, 0.18);
      }
      .vhd-voice-btn {
        background: rgba(30, 41, 59, 0.9);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 12px;
        width: 38px;
        height: 38px;
        color: #38bdf8;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.16s ease;
        flex-shrink: 0;
      }
      .vhd-voice-btn:hover {
        background: rgba(56, 189, 248, 0.16);
        border-color: #38bdf8;
        color: #ffffff;
      }
      .vhd-voice-btn.listening {
        background: rgba(239, 68, 68, 0.22);
        border-color: #ef4444;
        color: #f87171;
      }
      .vhd-voice-btn.speaking {
        background: rgba(16, 185, 129, 0.2);
        border-color: #10b981;
        color: #34d399;
      }
      .vhd-send-btn {
        background: linear-gradient(135deg, var(--primary), #4f46e5);
        border: none;
        border-radius: 12px;
        width: 38px;
        height: 38px;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
        transition: transform 0.15s ease, filter 0.15s ease;
      }
      .vhd-send-btn:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
      }
      .vhd-lang-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 14px;
        background: rgba(15, 23, 42, 0.55);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 11px;
      }
      .vhd-lang-title {
        color: #94a3b8;
        font-size: 11px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .vhd-lang-pills {
        display: flex;
        gap: 4px;
        background: rgba(15, 23, 42, 0.8);
        padding: 2px;
        border-radius: 9px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .vhd-lang-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        padding: 3px 8px;
        border-radius: 7px;
        font-size: 10.5px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.16s ease;
      }
      .vhd-lang-btn:hover {
        color: #f8fafc;
      }
      .vhd-lang-btn.active {
        background: linear-gradient(135deg, var(--primary), var(--accent));
        color: #ffffff;
        box-shadow: 0 2px 6px rgba(99, 102, 241, 0.35);
      }
      /* Animated Typing & Progressive Delay Feedback Bubble */
      .vhd-typing-bubble {
        align-self: flex-start;
        background: rgba(30, 41, 59, 0.88);
        color: #cbd5e1;
        border: 1px solid rgba(56, 189, 248, 0.25);
        border-radius: 16px;
        border-bottom-left-radius: 4px;
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-width: 85%;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.25);
        animation: vhdFadeSlide 0.22s ease-out;
      }
      .vhd-typing-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .vhd-typing-dots {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        height: 14px;
      }
      .vhd-typing-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: linear-gradient(135deg, #38bdf8, #818cf8);
        animation: vhdTypingBounce 1.25s infinite ease-in-out;
      }
      .vhd-typing-dot:nth-child(2) { animation-delay: 0.16s; }
      .vhd-typing-dot:nth-child(3) { animation-delay: 0.32s; }
      @keyframes vhdTypingBounce {
        0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
        40% { transform: translateY(-4px); opacity: 1; }
      }
      @keyframes vhdFadeSlide {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .vhd-typing-status {
        font-size: 11.5px;
        color: #94a3b8;
        line-height: 1.35;
        transition: opacity 0.2s ease;
      }
      .vhd-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none !important;
      }
    `;

    // Build dynamic 1-tap workflow shortcut chips from Stage-1 siteBlueprint (or archetype defaults)
    const initialArch = detectCurrentArchetype(agentConfig);
    const defaultChipsByArch = {
      academic: [
        { label: 'Courses', query: 'What courses do you provide?' },
        { label: 'Fee Structure', query: 'What is the fee structure?' },
        { label: 'Admission Form', query: 'Take me to the admission form' }
      ],
      ecommerce: [
        { label: 'Products', query: 'Show me all products' },
        { label: 'Pricing', query: 'What are the prices?' },
        { label: 'Checkout / Order', query: 'Take me to checkout' }
      ],
      food: [
        { label: 'Menu', query: 'Show me the menu' },
        { label: 'Prices', query: 'What are the menu prices?' },
        { label: 'Book a Table', query: 'Take me to table reservation' }
      ],
      healthcare: [
        { label: 'Medicines', query: 'What medicines do you have?' },
        { label: 'Prescription', query: 'Is a prescription required?' },
        { label: 'Book Visit', query: 'Take me to appointment booking' }
      ],
      saas: [
        { label: 'Plans', query: 'What plans do you offer?' },
        { label: 'Pricing', query: 'Show pricing tiers' },
        { label: 'Get Started', query: 'How do I get started?' }
      ]
    };
    const rawQuickChips = (agentConfig.siteBlueprint && Array.isArray(agentConfig.siteBlueprint.quickActions) && agentConfig.siteBlueprint.quickActions.length > 0)
      ? agentConfig.siteBlueprint.quickActions
          .filter(c => c && c.label && !/^(result\s*price|total\s*cost|output|calc)/i.test(c.label.trim()))
          .map(c => {
            const rawLbl = String(c.label || '').trim();
            // Fix any legacy truncated chip labels (e.g. "Classes 11th & 12th Ac" -> clean word-boundary label)
            const cleanLbl = rawLbl.length > 20 ? rawLbl.split(/\s+/).slice(0, 3).join(' ') : rawLbl;
            return { label: cleanLbl, query: c.query || cleanLbl };
          })
          .slice(0, 3)
      : [];
    const quickChips = rawQuickChips.length > 0
      ? rawQuickChips
      : (defaultChipsByArch[initialArch] || [
          { label: 'Explore Options', query: 'What do you offer?' },
          { label: 'Pricing', query: 'What are the prices?' },
          { label: 'Contact Us', query: 'Take me to contact' }
        ]);

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
              <div class="vhd-agent-status">Online · Smart Voice &amp; Navigation Guide</div>
            </div>
          </div>
          <button class="vhd-close-btn" id="vhd-close" title="Close">✕</button>
        </div>
        <div class="vhd-body" id="vhd-body">
          <div class="vhd-msg vhd-msg-agent">${agentConfig.greeting}</div>
        </div>
        <div class="vhd-quick-chips" id="vhd-quick-chips">
          ${quickChips.map(c => `<button type="button" class="vhd-chip-btn" data-query="${String(c.query || c.label).replace(/"/g, '&quot;')}">${c.label}</button>`).join('')}
        </div>
        <div class="vhd-voice-hero">
          <button class="vhd-orb-btn" id="vhd-orb" title="Tap to Speak">
            <svg viewBox="0 0 24 24" fill="white"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>
          </button>
          <div class="vhd-voice-label" id="vhd-voice-label">Tap mic to speak — auto-detects language</div>
        </div>
        <div class="vhd-footer">
          <input type="text" class="vhd-input" id="vhd-input" placeholder="Ask anything or say 'take me to form'..." />
          <button class="vhd-voice-btn" id="vhd-voice-btn" title="Tap to Speak (Auto Language Detection)">
            <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
            </svg>
          </button>
          <button class="vhd-send-btn" id="vhd-send" title="Send message">➤</button>
        </div>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(container);

    // Wire 1-tap quick workflow shortcut chips
    shadow.querySelectorAll('.vhd-chip-btn').forEach(chip => {
      chip.addEventListener('click', () => {
        const q = chip.getAttribute('data-query');
        if (q) handleUserMessage(q);
      });
    });

    // Event Elements
    const launcher = shadow.getElementById('vhd-launcher');
    const panel = shadow.getElementById('vhd-panel');
    const closeBtn = shadow.getElementById('vhd-close');
    const orb = shadow.getElementById('vhd-orb');
    const voiceBtn = shadow.getElementById('vhd-voice-btn');
    const voiceLabel = shadow.getElementById('vhd-voice-label');
    const body = shadow.getElementById('vhd-body');
    const input = shadow.getElementById('vhd-input');
    const sendBtn = shadow.getElementById('vhd-send');

    // Fully Automatic Multilingual Detection (English, Hindi & Marathi detected automatically per turn!)
    let currentSpeechLang = 'auto';

    function updateVoiceState(state) {
      if (state === 'listening') {
        orb.className = 'vhd-orb-btn listening';
        if (voiceBtn) voiceBtn.className = 'vhd-voice-btn listening';
      } else if (state === 'speaking') {
        orb.className = 'vhd-orb-btn speaking';
        if (voiceBtn) voiceBtn.className = 'vhd-voice-btn speaking';
      } else {
        orb.className = 'vhd-orb-btn';
        if (voiceBtn) voiceBtn.className = 'vhd-voice-btn';
      }
    }

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
      const defaultNavLang = 'en-IN';
      recognition.lang = currentSpeechLang === 'auto' ? defaultNavLang : currentSpeechLang;

      recognition.onstart = () => {
        isListening = true;
        finalRecordedTranscript = '';
        lastCapturedSpokenText = '';
        updateVoiceState('listening');
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
        updateVoiceState('');
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
              formData.append('prompt', 'English, Hindi, Marathi, Sangli Shikshan Sanstha, admissions, courses, fees, syllabus, नमस्कार, नमस्ते, ॲडमिशन, प्रवेश, फी, अभ्यासक्रम, निकाल');

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
                const isAllowedLanguage = !detectedLID || ['en', 'english', 'hi', 'hindi', 'mr', 'marathi'].includes(detectedLID);
                const isHallucination = /^(thank you|thanks for watching|thank you for watching|bye|subtitles by|you|amara\.org)[\.!]?$/i.test(cleanWhisper);

                if (!isAllowedLanguage) {
                  console.warn('[Echo AI Voice] Rejecting unsupported voice input language:', detectedLID);
                  voiceLabel.textContent = 'Please speak in English, हिंदी, or मराठी';
                  return;
                }

                if (cleanWhisper && !isHallucination) {
                  finalRecordedTranscript = '';
                  lastCapturedSpokenText = '';
                  if (detectedLID) {
                    const tag = detectedLID.includes('marathi') ? '🚩 मराठी' :
                                detectedLID.includes('hindi') ? '🇮🇳 हिंदी' :
                                detectedLID.includes('english') ? '🇬🇧 English' : '🇮🇳 Indian English';
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
          updateVoiceState('');
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

    // Unified Voice Recording Handler (Instant <50ms Barge-in Response)
    const toggleVoiceRecording = async () => {
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
        updateVoiceState('');
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
    };

    orb.addEventListener('click', toggleVoiceRecording);
    if (voiceBtn) voiceBtn.addEventListener('click', toggleVoiceRecording);

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

      if (navAction && navAction.label && (navAction.sectionInfo || navAction.redirectTarget || navAction.redirectUrl)) {
        const navBtn = document.createElement('button');
        navBtn.type = 'button';
        navBtn.className = 'vhd-nav-pill-btn';
        const icon = navAction.targetType === 'form' ? '📝' : (navAction.isCrossPage || navAction.redirectUrl ? '↗' : '📍');
        const labelSpan = document.createElement('span');
        labelSpan.textContent = navAction.label;
        navBtn.appendChild(document.createTextNode(`${icon} `));
        navBtn.appendChild(labelSpan);
        navBtn.appendChild(document.createTextNode(' →'));
        navBtn.onclick = (e) => {
          e.stopPropagation();
          if (navAction.redirectTarget) {
            executeRedirectAction(navAction.redirectTarget, true);
          } else if (navAction.redirectUrl) {
            try { window.location.assign(navAction.redirectUrl); } catch (_) {}
          } else if (navAction.sectionInfo) {
            scrollToHostSection(navAction.sectionInfo);
          }
        };
        div.appendChild(navBtn);
      }

      body.appendChild(div);
      body.scrollTop = body.scrollHeight;
    }

    // Animated Typing Indicator with Progressive Late-Answer Messages (English, Hindi, Marathi)
    function showTypingIndicator(lang = 'en-US', opts = {}) {
      const stage1Ms = Number(opts.stage1Ms || 2200);
      const stage2Ms = Number(opts.stage2Ms || 5500);

      const copy = lang === 'mr-IN'
        ? {
            s0: 'विचार करत आहे…',
            s1: 'वेबसाइटवरील माहिती तपासत आहे, कृपया थोडा वेळ थांबा…',
            s2: 'नेहमीपेक्षा थोडा जास्त वेळ लागत आहे — आपले उत्तर जवळजवळ तयार आहे…'
          }
        : lang === 'hi-IN'
          ? {
              s0: 'सोच रहा हूँ…',
              s1: 'वेबसाइट की जानकारी देख रहा हूँ, कृपया प्रतीक्षा करें…',
              s2: 'थोड़ा अधिक समय लग रहा है — आपका उत्तर लगभग तैयार है…'
            }
          : {
              s0: 'Thinking…',
              s1: 'Checking website details, please wait a moment…',
              s2: 'Taking a little longer than usual — almost ready with your answer…'
            };

      const wrapper = document.createElement('div');
      wrapper.className = 'vhd-typing-bubble';
      wrapper.setAttribute('role', 'status');
      wrapper.setAttribute('aria-live', 'polite');

      const row = document.createElement('div');
      row.className = 'vhd-typing-row';

      const dots = document.createElement('div');
      dots.className = 'vhd-typing-dots';
      for (let i = 0; i < 3; i++) {
        const dot = document.createElement('span');
        dot.className = 'vhd-typing-dot';
        dots.appendChild(dot);
      }

      const statusEl = document.createElement('span');
      statusEl.className = 'vhd-typing-status';
      statusEl.textContent = copy.s0;

      row.appendChild(dots);
      row.appendChild(statusEl);
      wrapper.appendChild(row);

      body.appendChild(wrapper);
      body.scrollTop = body.scrollHeight;

      let removed = false;
      const t1 = setTimeout(() => {
        if (removed) return;
        statusEl.textContent = copy.s1;
        if (voiceLabel) voiceLabel.textContent = copy.s1;
        body.scrollTop = body.scrollHeight;
      }, stage1Ms);

      const t2 = setTimeout(() => {
        if (removed) return;
        statusEl.textContent = copy.s2;
        if (voiceLabel) voiceLabel.textContent = 'Almost ready…';
        body.scrollTop = body.scrollHeight;
      }, stage2Ms);

      return {
        element: wrapper,
        setStage(msg) {
          if (!removed && msg) {
            statusEl.textContent = msg;
            body.scrollTop = body.scrollHeight;
          }
        },
        remove() {
          if (removed) return;
          removed = true;
          clearTimeout(t1);
          clearTimeout(t2);
          if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
        }
      };
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

      if (/^[-*•]?\s*(record supplier invoices|automatically increment|purchase history register|todo:|fixme:|in the apps script|configurable by|optimized for desktop)/i.test(aLower)) {
        return false;
      }
      if (/\b(apps\s*script|script\s*toolbar|click\s+deploy|deploy\s+as\s+web\s+app|git\s+clone|optimized\s+for\s+desktop|responsive\s+layout|mobile[- ]first|tailwind\s+css|vite\s+build|webpack|source\s+code|repository)\b/i.test(aLower + ' ' + qLower)) {
        return false;
      }
      if (/^database includes table/i.test(aLower)) return false;

      return true;
    }

    // --- UNIVERSAL TYPO-TOLERANT & WORD-ORDER-INDEPENDENT NLU ENGINE (ALL 10 WEBSITE ARCHETYPES) ---
    function damerauLevenshtein(a, b) {
      const s = String(a || '');
      const t = String(b || '');
      const m = s.length;
      const n = t.length;
      if (m === 0) return n;
      if (n === 0) return m;
      if (s === t) return 0;
      if (Math.abs(m - n) > 3) return Math.abs(m - n);
      const d = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
      for (let i = 0; i <= m; i++) d[i][0] = i;
      for (let j = 0; j <= n; j++) d[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          const cost = s[i - 1] === t[j - 1] ? 0 : 1;
          let val = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
          if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) {
            val = Math.min(val, d[i - 2][j - 2] + 1);
          }
          d[i][j] = val;
        }
      }
      return d[m][n];
    }

    function bigramSimilarity(a, b) {
      const s = String(a || '');
      const t = String(b || '');
      if (s === t) return 1;
      if (s.length < 2 || t.length < 2) return 0;
      const map = new Map();
      for (let i = 0; i < s.length - 1; i++) {
        const bg = s.slice(i, i + 2);
        map.set(bg, (map.get(bg) || 0) + 1);
      }
      let overlap = 0;
      for (let i = 0; i < t.length - 1; i++) {
        const bg = t.slice(i, i + 2);
        const c = map.get(bg) || 0;
        if (c > 0) { overlap++; map.set(bg, c - 1); }
      }
      return (2 * overlap) / (s.length - 1 + t.length - 1);
    }

    function nluStemWord(w) {
      const s = String(w || '').toLowerCase();
      if (s.length <= 3) return s;
      if (s.endsWith('ies') && s.length > 4) return s.slice(0, -3) + 'y';
      if (s.endsWith('es') && s.length > 4 && /(ch|sh|x|z|o|ss)es$/.test(s)) return s.slice(0, -2);
      if (s.endsWith('s') && !s.endsWith('ss')) return s.slice(0, -1);
      return s;
    }

    function fuzzyTokenMatch(inputTok, targetTok) {
      const a = String(inputTok || '').toLowerCase().trim();
      const b = String(targetTok || '').toLowerCase().trim();
      if (!a || !b) return 0;
      if (a === b) return 4;
      const sa = nluStemWord(a);
      const sb = nluStemWord(b);
      if (sa === sb) return 3;
      if (/\d/.test(a) || /\d/.test(b)) {
        const digA = a.replace(/\D/g, '');
        const digB = b.replace(/\D/g, '');
        if (digA !== digB) return 0;
        if (a.length >= 4 && b.length >= 4 && damerauLevenshtein(a, b) <= 1) return 2;
        return 0;
      }
      const maxLen = Math.max(a.length, b.length);
      const minLen = Math.min(a.length, b.length);
      if (minLen <= 2) return 0;
      if (minLen >= 4 && (b.startsWith(a) || a.startsWith(b)) && (maxLen - minLen) <= 4) return 3;
      if (minLen === 3) {
        if (maxLen <= 4 && a[0] === b[0] && damerauLevenshtein(a, b) === 1) return 2;
        return 0;
      }
      const dist = Math.min(damerauLevenshtein(a, b), damerauLevenshtein(sa, sb));
      if (maxLen <= 5) return dist <= 1 ? 2 : 0;
      if (maxLen <= 8) {
        if (dist <= 1) return 2;
        if (dist === 2 && (a[0] === b[0] || bigramSimilarity(a, b) >= 0.45)) return 2;
        return 0;
      }
      if (maxLen <= 10) return dist <= 2 ? 2 : 0;
      return dist <= 3 && bigramSimilarity(a, b) >= 0.45 ? 2 : 0;
    }

    const NLU_SHORTHAND_MAP = {
      u: 'you', ur: 'your', r: 'are', pls: 'please', plz: 'please',
      wat: 'what', wht: 'what', whch: 'which', hw: 'how', abt: 'about',
      bcoz: 'because', cuz: 'because', info: 'information', amt: 'amount',
      prce: 'price', prise: 'price', fess: 'fees', feess: 'fees',
      avail: 'available', avilable: 'available', avlbl: 'available',
      reg: 'registration', elig: 'eligibility', elgibility: 'eligibility',
      doc: 'documents', docs: 'documents', req: 'required', dept: 'department',
      thx: 'thanks', ty: 'thanks', thnks: 'thanks', hv: 'have', shw: 'show',
      nxt: 'next', prvide: 'provide', dtls: 'details', detals: 'details',
      wanna: 'want', gonna: 'going', gimme: 'give', tellme: 'tell',
      rx: 'prescription', cod: 'cash on delivery', qty: 'quantity',
      med: 'medicine', meds: 'medicines', roms: 'rooms', hotl: 'hotel',
      helo: 'hello', hlo: 'hello', namste: 'namaste', byee: 'bye', secnd: 'second'
    };

    const NLU_CONCEPT_VOCAB = [
      'hello', 'hey', 'hi', 'morning', 'afternoon', 'evening', 'namaste', 'namaskar', 'thanks', 'thank', 'goodbye', 'bye',
      'yes', 'sure', 'okay', 'more', 'next', 'continue', 'first', 'second', 'third', 'fourth', 'fifth', 'last',
      'what', 'which', 'where', 'when', 'who', 'how', 'tell', 'show', 'give', 'list', 'all', 'details', 'information',
      'overview', 'about', 'know', 'want', 'need', 'provide', 'offer', 'have', 'available', 'availability', 'stock',
      'sell', 'serve', 'teach', 'study', 'learn', 'eat', 'drink', 'browse', 'explore', 'options', 'catalog', 'catalogue', 'inventory',
      'price', 'prices', 'pricing', 'fee', 'fees', 'cost', 'costs', 'rate', 'rates', 'charge', 'charges', 'structure',
      'tuition', 'pay', 'payment', 'money', 'budget', 'rent', 'tariff', 'mrp', 'amount', 'discount', 'expensive', 'cheap', 'much',
      'course', 'courses', 'program', 'programs', 'stream', 'streams', 'class', 'classes', 'subject', 'subjects', 'degree', 'diploma', 'syllabus', 'curriculum', 'college', 'school', 'academy',
      'product', 'products', 'item', 'items', 'shoes', 'sneakers', 'laptop', 'phone', 'watch', 'clothing',
      'medicine', 'medicines', 'drug', 'drugs', 'tablet', 'tablets', 'capsule', 'syrup', 'pharmacy', 'clinic', 'hospital', 'doctor',
      'dish', 'dishes', 'food', 'meal', 'meals', 'menu', 'restaurant', 'pizza', 'burger', 'biryani', 'paneer',
      'plan', 'plans', 'tier', 'tiers', 'subscription', 'software', 'trial', 'billing', 'invoice', 'feature', 'features',
      'room', 'rooms', 'suite', 'suites', 'stay', 'hotel', 'resort', 'checkin', 'checkout', 'amenities',
      'vehicle', 'vehicles', 'car', 'cars', 'bike', 'bikes', 'model', 'models', 'showroom', 'drive', 'test', 'servicing',
      'property', 'properties', 'flat', 'flats', 'apartment', 'apartments', 'plot', 'plots', 'visit', 'site', 'floor',
      'service', 'services', 'loan', 'loans', 'tax', 'gst', 'audit', 'consultation', 'account', 'policy', 'policies', 'package', 'packages',
      'admission', 'admissions', 'apply', 'application', 'join', 'enroll', 'enrollment', 'register', 'registration',
      'order', 'buy', 'purchase', 'book', 'booking', 'reserve', 'reservation', 'reservations', 'schedule', 'process', 'procedure', 'steps', 'form', 'started',
      'eligibility', 'eligible', 'criteria', 'qualify', 'qualification', 'requirement', 'requirements', 'marks', 'percentage', 'score', 'cutoff', 'prerequisite', 'pass', 'allowed',
      'document', 'documents', 'paper', 'papers', 'certificate', 'marksheet', 'leaving', 'bring', 'submit', 'required', 'needed',
      'prescription', 'dosage', 'note', 'return', 'returns', 'refund', 'exchange', 'replace', 'back', 'send', 'warranty', 'guarantee',
      'shipping', 'delivery', 'deliver', 'arrive', 'cancel', 'cancellation', 'scholarship', 'emi', 'installment', 'parking', 'wifi', 'dietary', 'vegetarian', 'vegan',
      'address', 'location', 'located', 'map', 'directions', 'phone', 'call', 'number', 'mobile', 'contact', 'email', 'hours', 'timing', 'timings', 'open', 'close',
      'scroll', 'take', 'navigate', 'redirect', 'jump', 'section', 'page', 'fill', 'find', 'visit', 'link', 'button', 'click', 'go', 'checkout', 'enquiry', 'inquiry', 'login', 'signup', 'demo', 'brochure',
      'science', 'commerce', 'arts', 'engineering', 'medical', 'foundation', 'integrated', 'standard'
    ];

    const NLU_CONCEPT_GROUPS = {
      catalog: new Set([
        'course', 'program', 'programme', 'stream', 'class', 'subject', 'degree', 'diploma', 'teach', 'study', 'learn',
        'product', 'item', 'good', 'shoe', 'sneaker', 'laptop', 'phone', 'watch', 'clothing', 'sell', 'shop', 'catalog', 'catalogue', 'inventory',
        'medicine', 'med', 'drug', 'tablet', 'capsule', 'syrup', 'pharmacy',
        'dish', 'food', 'meal', 'menu', 'eat', 'drink', 'serve', 'pizza', 'burger',
        'plan', 'tier', 'subscription', 'software', 'feature',
        'room', 'suite', 'stay', 'villa',
        'vehicle', 'car', 'bike', 'model',
        'property', 'flat', 'apartment', 'plot', 'listing',
        'service', 'offering', 'option', 'package', 'loan', 'treatment', 'test'
      ]),
      explore: new Set([
        'what', 'which', 'list', 'all', 'show', 'give', 'tell', 'know', 'detail', 'info', 'information', 'overview',
        'available', 'availability', 'provide', 'offer', 'have', 'sell', 'serve', 'teach', 'run', 'see', 'view', 'browse', 'explore', 'study', 'eat'
      ]),
      money: new Set([
        'price', 'pricing', 'fee', 'cost', 'rate', 'charge', 'pay', 'payment', 'money', 'budget', 'tuition',
        'rent', 'tariff', 'mrp', 'amount', 'expensive', 'cheap', 'structure', 'much', 'discount'
      ]),
      procedure: new Set([
        'apply', 'application', 'join', 'enroll', 'enrollment', 'admission', 'register', 'registration', 'signup',
        'order', 'buy', 'purchase', 'checkout', 'book', 'booking', 'reserve', 'reservation', 'schedule', 'visit',
        'start', 'started', 'process', 'procedure', 'step', 'form', 'drive'
      ]),
      eligibility: new Set([
        'eligibility', 'eligible', 'criteria', 'qualify', 'qualification', 'requirement', 'mark', 'percentage',
        'score', 'cutoff', 'prerequisite', 'allowed', 'pass', 'passing'
      ]),
      policyDocs: new Set([
        'document', 'paper', 'certificate', 'marksheet', 'leaving', 'lc', 'bring', 'submit',
        'prescription', 'doctor', 'note', 'dosage',
        'return', 'refund', 'exchange', 'replace', 'back', 'send',
        'warranty', 'guarantee', 'shipping', 'delivery', 'deliver', 'arrive',
        'checkin', 'checkout', 'cancel', 'cancellation', 'billing', 'invoice', 'emi', 'installment',
        'scholarship', 'parking', 'wifi', 'dietary', 'vegetarian', 'vegan', 'amenitie', 'amenity'
      ]),
      contact: new Set([
        'address', 'location', 'located', 'where', 'map', 'direction', 'phone', 'call', 'number', 'mobile', 'contact', 'email', 'mail', 'hour', 'timing', 'open', 'close'
      ])
    };

    const NLU_GRAMMAR_STOPWORDS = new Set([
      'the', 'a', 'an', 'and', 'or', 'for', 'of', 'in', 'on', 'at', 'to', 'from', 'with', 'by', 'is', 'are', 'was', 'were',
      'be', 'been', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should', 'am', 'i', 'me', 'my', 'we', 'us', 'our',
      'you', 'your', 'they', 'them', 'it', 'its', 'this', 'that', 'these', 'those', 'here', 'there', 'if', 'doesnt', 'dont',
      'please', 'just', 'some', 'any', 'also', 'very', 'really', 'so', 'too', 'about', 'into', 'like'
    ]);

    function normalizeUserQuery(rawText, catalogItems = null, kbList = null) {
      const str = String(rawText || '').trim();
      if (!str) return '';
      if (/[\u0900-\u097F]/.test(str)) return str; // Preserve Marathi/Hindi Devanagari intact

      const vocabSet = new Set(NLU_CONCEPT_VOCAB);
      const addWords = (txt) => {
        const toks = String(txt || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
        for (const t of toks) {
          if (t.length >= 3 && !/^\d+$/.test(t)) vocabSet.add(t);
        }
      };
      const items = Array.isArray(catalogItems) ? catalogItems : (typeof getAllCatalogItems === 'function' && typeof agentConfig !== 'undefined' ? getAllCatalogItems(agentConfig) : []);
      for (const it of items.slice(0, 120)) {
        addWords(it?.name || it?.title || it?.product || '');
        addWords(it?.category || '');
        addWords(it?.dosage || it?.description || '');
      }
      const kbs = Array.isArray(kbList) ? kbList : (typeof agentConfig !== 'undefined' && Array.isArray(agentConfig.knowledgeBase) ? agentConfig.knowledgeBase : []);
      for (const k of kbs.slice(0, 60)) {
        addWords(k?.q || '');
      }
      const bp = (typeof agentConfig !== 'undefined' && agentConfig && agentConfig.siteBlueprint) ? agentConfig.siteBlueprint : null;
      if (bp) {
        (bp.forms || []).slice(0, 20).forEach(f => {
          addWords(f?.title || '');
          addWords(f?.submitLabel || '');
          (f?.keywords || []).forEach(addWords);
        });
        (bp.sections || []).slice(0, 30).forEach(s => {
          addWords(s?.label || '');
          (s?.keywords || []).forEach(addWords);
        });
        (bp.routes || []).slice(0, 20).forEach(r => {
          addWords(r?.label || '');
          (r?.keywords || []).forEach(addWords);
        });
      }
      const vocabList = Array.from(vocabSet);

      const tokens = str
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9\s-]/g, ' ')
        .replace(/-/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

      const out = tokens.map(rawTok => {
        const tok = rawTok.replace(/(.)\1{2,}/g, '$1$1');
        if (NLU_SHORTHAND_MAP[tok]) return NLU_SHORTHAND_MAP[tok];
        const collapsed = rawTok.replace(/(.)\1+/g, '$1');
        if (NLU_SHORTHAND_MAP[collapsed]) return NLU_SHORTHAND_MAP[collapsed];
        if (vocabSet.has(tok) || NLU_GRAMMAR_STOPWORDS.has(tok) || /\d/.test(tok) || tok.length <= 2) return tok;
        if (vocabSet.has(collapsed)) return collapsed;

        let bestWord = tok;
        let bestDist = 99;
        let bestSim = 0;
        for (const cand of vocabList) {
          if (Math.abs(cand.length - tok.length) > 2) continue;
          if (fuzzyTokenMatch(tok, cand) >= 2) {
            const d = damerauLevenshtein(tok, cand);
            const sim = bigramSimilarity(tok, cand) + (tok[0] === cand[0] ? 0.15 : 0);
            if (d < bestDist || (d === bestDist && sim > bestSim)) {
              bestDist = d;
              bestSim = sim;
              bestWord = cand;
            }
          }
        }
        return bestWord;
      });
      return out.join(' ').replace(/\s+/g, ' ').trim();
    }

    function classifyIntentConcepts(normalizedText) {
      const lower = String(normalizedText || '').toLowerCase().trim();
      const rawTokens = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
      const stems = rawTokens.map(nluStemWord);
      const stemSet = new Set(stems);
      const countHits = (g) => {
        let c = 0;
        for (const s of stemSet) if (g.has(s)) c++;
        return c;
      };

      const hasPronounRef = /\b(in that|in this|in it|for that|for this|for it|of that|of this|about that|about this|about it)\b/i.test(lower);
      const catalogHits = countHits(NLU_CONCEPT_GROUPS.catalog);
      const exploreHits = countHits(NLU_CONCEPT_GROUPS.explore);
      const moneyHits = countHits(NLU_CONCEPT_GROUPS.money);
      const procedureHits = countHits(NLU_CONCEPT_GROUPS.procedure);
      const eligibilityHits = countHits(NLU_CONCEPT_GROUPS.eligibility);
      const policyDocsHits = countHits(NLU_CONCEPT_GROUPS.policyDocs);
      const contactHits = countHits(NLU_CONCEPT_GROUPS.contact);

      const isWhoCanJoin = stemSet.has('who') && (stemSet.has('apply') || stemSet.has('join') || stemSet.has('enroll') || stemSet.has('eligible') || stemSet.has('admission'));
      const isBringNeed = (stemSet.has('bring') || stemSet.has('paper') || stemSet.has('submit')) && (stemSet.has('need') || stemSet.has('required') || stemSet.has('what') || stemSet.has('which'));
      const isSendBack = stemSet.has('back') && (stemSet.has('send') || stemSet.has('give') || stemSet.has('take') || stemSet.has('money'));
      const isHowLongShip = (stemSet.has('long') || stemSet.has('day') || stemSet.has('time')) && (stemSet.has('shipping') || stemSet.has('delivery') || stemSet.has('deliver') || stemSet.has('arrive') || stemSet.has('warranty'));

      const isAllConceptWord = (st) => (
        NLU_CONCEPT_GROUPS.catalog.has(st) ||
        NLU_CONCEPT_GROUPS.explore.has(st) ||
        NLU_CONCEPT_GROUPS.money.has(st) ||
        NLU_CONCEPT_GROUPS.procedure.has(st) ||
        NLU_CONCEPT_GROUPS.eligibility.has(st) ||
        NLU_CONCEPT_GROUPS.policyDocs.has(st) ||
        NLU_CONCEPT_GROUPS.contact.has(st) ||
        ['want', 'need', 'can', 'could', 'would', 'will', 'please', 'kind', 'type', 'sort', 'store', 'shop', 'college', 'school', 'academy', 'clinic', 'hospital', 'restaurant', 'hotel', 'resort', 'showroom', 'portal', 'website', 'site', 'page', 'today', 'right', 'now', 'currently'].includes(st)
      );
      const unknownSpecificTokens = stems.filter(st => st.length >= 4 && !NLU_GRAMMAR_STOPWORDS.has(st) && !isAllConceptWord(st));

      const isEligibility = eligibilityHits > 0 || isWhoCanJoin;
      const isPolicyDocs = policyDocsHits > 0 || isBringNeed || isSendBack || isHowLongShip;
      const isPriceOverview = !hasPronounRef && moneyHits > 0 && !isEligibility && !isPolicyDocs && unknownSpecificTokens.length === 0;
      const isProcedure = procedureHits > 0 && !isEligibility && !isPolicyDocs && !isPriceOverview;
      const isCatalogList = !hasPronounRef && !isEligibility && !isPolicyDocs && !isPriceOverview && !isProcedure && unknownSpecificTokens.length === 0 && (
        (catalogHits > 0 && (exploreHits > 0 || rawTokens.length <= 3)) ||
        (stemSet.has('menu') || stemSet.has('catalog') || stemSet.has('catalogue') || stemSet.has('inventory')) ||
        (exploreHits >= 2 && (stemSet.has('provide') || stemSet.has('offer') || stemSet.has('sell') || stemSet.has('serve') || stemSet.has('teach') || stemSet.has('available')))
      );
      const isContact = contactHits > 0 && !isCatalogList && !isPriceOverview && !isEligibility && !isPolicyDocs;

      return { isCatalogList, isPriceOverview, isProcedure, isEligibility, isPolicyDocs, isContact, hasPronounRef, stems };
    }

    function isCatalogListQuery(text) {
      const normalized = (typeof normalizeUserQuery === 'function') ? normalizeUserQuery(text) : String(text || '');
      const lower = String(normalized || text || '')
        .toLowerCase()
        .replace(/^(hi+|hello+|hey+|howdy|namaste|namaskar)[,!.\s]+/i, '')
        .trim();
      if (!lower) return false;

      // Never treat a pronoun follow-up ("what subjects are in that", "what features in this") as a full catalog list query
      if (/\b(in that|in this|in it|for that|for this|for it|of that|of this|about that|about this|about it)\b/i.test(lower)) {
        return false;
      }

      const nouns = '(?:meds?|medicines?|drugs?|products?|items?|goods|services?|dishes?|foods?|meals?|drinks?|menu|plans?|tiers?|subscriptions?|packages?|courses?|programs?|programmes?|streams?|classes?|degrees?|diplomas?|subjects?|branches?|departments?|rooms?|suites?|stays?|villas?|vehicles?|cars?|bikes?|models?|properties|property|flats?|apartments?|plots?|listings?|loans?|policies|accounts?|treatments?|tests?|offerings?|options?|catalog|catalogue|inventory)';
      const pluralOrCategoryNouns = '(?:meds|medicines|drugs|products|items|goods|services|dishes|foods|meals|drinks|menu|plans|tiers|subscriptions|packages|courses|programs|programmes|streams|classes|degrees|diplomas|subjects|branches|departments|rooms|suites|stays|villas|vehicles|cars|bikes|models|properties|flats|apartments|plots|listings|loans|policies|accounts|treatments|tests|offerings|options|catalog|catalogue|inventory)';

      const rxList = new RegExp(`\\b(list of (all |the |your )?${nouns}|list all|give (me )?(a )?list|show (me )?(the |all |your )?(list|${pluralOrCategoryNouns})|all ${pluralOrCategoryNouns}|available ${pluralOrCategoryNouns}|full list|catalog|catalogue|inventory|menu|see all|view all)\\b`, 'i');
      const rxWhatWhichVerb = new RegExp(`\\b(what|which)\\s+(all\\s+)?(${nouns})\\s+(do you|are|can you|you)\\s+(have|offer|provide|sell|serve|teach|run|support|give|available)\\b`, 'i');
      const rxWhatWhichBare = new RegExp(`^(what|which)\\s+(all\\s+)?${pluralOrCategoryNouns}\\s*[?.!]*$`, 'i');
      const rxWhatAre = new RegExp(`\\b(what|which)\\s+are\\s+(the|your|all)\\s+${pluralOrCategoryNouns}\\b`, 'i');
      const rxWhatDoYou = /\b(what|which)\s+(all\s+)?do\s+you\s+(sell|have|offer|provide|serve|teach|run)\b/i;
      const rxKnowAbout = new RegExp(`\\b(want\\s+(to\\s+)?know|know|tell\\s+me|info|information|details|learn|ask|inquire|enquire)\\s+(more\\s+)?(about|on|of|regarding)\\s+(the\\s+|your\\s+|all\\s+|available\\s+)?${pluralOrCategoryNouns}\\s*[?.!]*$`, 'i');
      const rxNounDetails = new RegExp(`^(?:(?:give\\s+me|show\\s+me|tell\\s+me|get|need|want|see)\\s+)?(?:the\\s+|your\\s+|all\\s+)?${nouns}\\s+(?:details|info|information|overview|options|list|catalog|catalogue)\\s*[?.!]*$`, 'i');
      const rxAllList = new RegExp(`\\b(all\\s+${nouns}\\s+list|${nouns}\\s+list)\\b`, 'i');

      if (rxList.test(lower) ||
          rxWhatWhichVerb.test(lower) ||
          rxWhatWhichBare.test(lower) ||
          rxWhatAre.test(lower) ||
          rxWhatDoYou.test(lower) ||
          rxKnowAbout.test(lower) ||
          rxNounDetails.test(lower) ||
          rxAllList.test(lower) ||
          /\b(what is available|show inventory|inventory table|list inventory)\b/i.test(lower) ||
          /(सर्व औषध|औषधांची यादी|सर्व प्रॉडक्ट|कॅटलॉग|काय काय उपलब्ध|सर्व वस्तू|सर्व सेवा|मेन्यू|कोणते कोर्स|कोणते अभ्यासक्रम|अभ्यासक्रमांची माहिती|कोर्सची यादी|कोर्सेस बद्दल)/i.test(text) ||
          /(सभी दवा|दवाइयों की लिस्ट|सारे प्रोडक्ट्स|कैटलॉग|क्या क्या उपलब्ध|लिस्ट दो|सूची दो|सारे आइटम|मेन्यू दिखाओ|कौन से कोर्स|कोर्स की जानकारी|कोर्स की लिस्ट|सभी कोर्स)/i.test(text)) {
        return true;
      }

      // Word-order-independent & paraphrase Bag-of-Concepts fallback ("courses provide which", "what do you teach here?", "what can i eat?")
      if (typeof classifyIntentConcepts === 'function') {
        const concepts = classifyIntentConcepts(lower);
        if (concepts.isCatalogList) return true;
      }
      return false;
    }

    function isSectionNavigationQuery(text) {
      const normalized = (typeof normalizeUserQuery === 'function') ? normalizeUserQuery(text) : String(text || '');
      const lower = String(normalized || text || '').toLowerCase().trim();
      return /\b(scroll to|take me to|navigate to|go to|redirect(?: me)? to|show me the section|where is the|jump to|open section|view section|open (?:the )?page|go to (?:the )?page)\b/i.test(lower) ||
             /\b(open|show|go to|take me to|redirect(?: me)? to|where is|fill|find|visit|jump to)\s+(?:the\s+|your\s+|an?\s+)?(?:[a-z0-9-]+\s+){0,3}(form|page|section|checkout|booking|reservation|registration|application|admission|contact|login|signup|sign up|demo|enquiry|inquiry)\b/i.test(lower) ||
             /^(?:the\s+|your\s+)?(?:[a-z0-9-]+\s+){0,3}(form|page|section)\s*[?.!]*$/i.test(lower) ||
             /\b(where is (?:the )?(inventory|table|pricing|contact|how it works|medicines|products|catalog|shop|menu|counter|doctor|appointment|courses|admissions|checkout|booking|form))\b/i.test(lower) ||
             /(विभागावर जा|फॉर्म उघडा|फॉर्म कुठे आहे|दाखवा|नेऊन जा|कुठे आहे)/i.test(text) ||
             /(सेक्शन पर ले जाओ|फॉर्म खोलो|फॉर्म कहाँ है|पेज पर ले जाओ|कहाँ है|दिखाओ|स्क्रॉल करो)/i.test(text);
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

    // Detects general pricing / fee structure / rate overview queries (typo-tolerant & order-independent!)
    function isGeneralPriceOrOverviewQuery(text) {
      const normalized = (typeof normalizeUserQuery === 'function') ? normalizeUserQuery(text) : String(text || '');
      const lower = String(normalized || text || '')
        .toLowerCase()
        .replace(/^(hi+|hello+|hey+|howdy|namaste|namaskar)[,!.\s]+/i, '')
        .trim();
      if (!lower) return false;
      if (/\b(in that|for that|of that|for this|of this|for it|of it)\b/i.test(lower)) return false;

      if (/^(?:what\s+(?:is|are)\s+(?:the|your)\s+|give\s+me\s+(?:the\s+)?|show\s+(?:me\s+)?(?:the\s+)?|tell\s+me\s+(?:about\s+)?(?:the\s+)?)?(?:fee\s*structure|fees?\s*(?:details?|list|chart|overview|info)?|pricing(?:\s*(?:details?|plans?|tiers?|options?|list))?|prices?(?:\s*list)?|rates?(?:\s*list)?|charges?|costs?|tuition\s*fees?|room\s*rates?|menu\s*prices?|plan\s*prices?|subscription\s*(?:cost|price|rates?|fees?))\s*[?.!]*$/i.test(lower) ||
          /\b(fee\s*structure|price\s*list|rate\s*card|pricing\s*tiers?|pricing\s*plans?|all\s*prices|all\s*fees|how\s+much\s+do\s+(?:your|the)\s+(?:courses|products|plans|rooms|dishes|services)\s+cost)\b/i.test(lower) ||
          /(फी स्ट्रक्चर|शुल्क रचना|किंमती|सर्व किंमती|दरपत्रक|फीस कितनी है|फीस स्ट्रक्चर|सभी कीमतें)/i.test(text)) {
        return true;
      }
      if (typeof classifyIntentConcepts === 'function') {
        return classifyIntentConcepts(lower).isPriceOverview;
      }
      return false;
    }

    // Detects general policy / process / requirement questions so they NEVER falsely trigger ITEM_NOT_FOUND
    function isPolicyOrProcessQuery(text) {
      const normalized = (typeof normalizeUserQuery === 'function') ? normalizeUserQuery(text) : String(text || '');
      const lower = String(normalized || text || '').toLowerCase().trim();
      if (/\b(eligibility|criteria|requirements?|qualification|admission\s*(?:process|procedure|steps?|criteria|rules?)|how\s+to\s+(?:apply|order|buy|book|enroll|register|subscribe|cancel|return)|documents?\s*(?:required|needed|list)?|return\s*policy|refund\s*policy|shipping|delivery\s*(?:time|charges?|policy|available)|warranty|guarantee|scholarship|emi|installment|payment\s*(?:options?|methods?)|cash\s*on\s*delivery|cod|free\s*trial|billing|cancellation|check-?in|check-?out|amenities|parking|wifi|table\s*reservations?|reservations?|dietary|vegetarian|vegan|allergen|test\s*drives?|financing|servicing|prescription\s*(?:required|needed|policy)|dosage|side\s*effects|site\s*visits?|floor\s*plans?|consultation|hours|timings|location|address|contact|phone|email)\b/i.test(lower) ||
          /(पात्रता|प्रवेश प्रक्रिया|कागदपत्रे|अर्ज कसा करावा|रिटर्न पॉलिसी|डिलिव्हरी|वॉरंटी|पात्रता मानदंड|एडमिशन प्रक्रिया|दस्तावेज|कैसे आवेदन|कैसे ऑर्डर|डिलीवरी|वारंटी)/i.test(text)) {
        return true;
      }
      if (typeof classifyIntentConcepts === 'function') {
        const c = classifyIntentConcepts(lower);
        return c.isEligibility || c.isPolicyDocs || c.isProcedure || c.isContact;
      }
      return false;
    }

    // Detects ordinal references ("the first one", "2nd one", "secnd", "last one", "number 3") against previously displayed catalog items
    function resolveOrdinalFromList(text, itemsList) {
      if (!Array.isArray(itemsList) || itemsList.length === 0) return null;
      const normalized = (typeof normalizeUserQuery === 'function') ? normalizeUserQuery(text) : String(text || '');
      const lower = String(normalized || text || '').toLowerCase().trim();
      if (/\b(first|1st|number\s*1|#1|first\s*one)\b/i.test(lower)) return itemsList[0] || null;
      if (/\b(second|2nd|number\s*2|#2)\b/i.test(lower)) return itemsList[1] || null;
      if (/\b(third|3rd|number\s*3|#3)\b/i.test(lower)) return itemsList[2] || null;
      if (/\b(fourth|4th|number\s*4|#4)\b/i.test(lower)) return itemsList[3] || null;
      if (/\b(fifth|5th|number\s*5|#5)\b/i.test(lower)) return itemsList[4] || null;
      if (/\b(last\s*one|the\s*last)\b/i.test(lower)) return itemsList[itemsList.length - 1] || null;
      return null;
    }

    // Detects short conversational affirmations / pagination / continuation prompts ("yes", "yess", "sure", "ok", "tell me more", "show more", "next")
    function isAffirmationOrMoreQuery(text) {
      const normalized = (typeof normalizeUserQuery === 'function') ? normalizeUserQuery(text) : String(text || '');
      const t = String(normalized || text || '').toLowerCase().replace(/[!?.,;:]+$/g, '').replace(/\s+/g, ' ').trim();
      if (!t) return false;
      return /^(yes|yeah|yep|yup|sure|ok|okay|alright|go\s*ahead|please|yes\s*please|tell\s*me\s*more|more|more\s*details|show\s*more|see\s*more|next|continue|explain|explain\s*more|elaborate|details\s*please|haan|han|ji|ho|हो|होय|हाँ|जी|आणखी\s*सांगा|और\s*बताएं|और\s*दिखाएं)$/i.test(t);
    }

    function findHostSection(topic) {
      if (typeof document === 'undefined') return null;
      const t = String(topic || '').toLowerCase().trim();

      const idCandidates = [];
      if (/\b(med|medicine|medicines|drug|pharmacy|pill|tablet|prescription|inventory|stock|product|products|catalog|item|items|shop|store|menu|course|courses|program|programs|stream|streams|admission|admissions|room|rooms|vehicle|vehicles|car|cars|property|properties|service|services)\b/i.test(t)) {
        idCandidates.push('inventory-section', 'inventory', 'medicines', 'meds', 'products', 'catalog', 'shop', 'store', 'menu', 'courses', 'programs', 'admissions', 'rooms', 'vehicles', 'properties', 'services', 'inventory-table-container', 'inventory-tbody');
      }
      if (/\b(price|pricing|plan|plans|cost|rate|subscription|fee|fees)\b/i.test(t)) {
        idCandidates.push('pricing-section', 'pricing', 'plans', 'costs', 'rates', 'fees', 'pricing-table');
      }
      if (/\b(how it works|guide|demo|integration|setup|features|overview)\b/i.test(t)) {
        idCandidates.push('how-it-works-section', 'how-it-works', 'guide', 'features', 'overview', 'demo');
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
        if (/\b(med|medicine|medicines|inventory|stock|product|products|catalog|shop|menu|course|courses|program|programs|admission|admissions|room|rooms|vehicle|vehicles|property|properties)\b/i.test(t) &&
            /\b(inventory|medicine|medicines|product|products|catalog|stock|menu|shop|course|courses|program|programs|streams|admissions|rooms|vehicles|properties)\b/i.test(hText)) {
          const container = h.closest('.card, section, article, div[class*="section"], div[class*="container"]') || h;
          return { element: container, id: container.id || '', label: h.textContent.trim().replace(/^[^\w]+/, '') };
        }
        if (/\b(how it works|features|overview|guide)\b/i.test(t) &&
            /\b(how|work|works|features|overview|guide)\b/i.test(hText)) {
          const container = h.closest('.card, section, article, div[class*="section"]') || h;
          return { element: container, id: container.id || '', label: h.textContent.trim().replace(/^[^\w]+/, '') };
        }
        if (/\b(pricing|price|plans|fees)\b/i.test(t) && /\b(pricing|price|plans|fees)\b/i.test(hText)) {
          const container = h.closest('.card, section, article, div[class*="section"]') || h;
          return { element: container, id: container.id || '', label: h.textContent.trim().replace(/^[^\w]+/, '') };
        }
        if (/\b(contact|support)\b/i.test(t) && /\b(contact|support|help)\b/i.test(hText)) {
          const container = h.closest('.card, section, article, div[class*="section"]') || h;
          return { element: container, id: container.id || '', label: h.textContent.trim().replace(/^[^\w]+/, '') };
        }
      }

      // Universal fallback to any table or product container if looking for catalog/inventory
      if (/\b(med|medicine|inventory|stock|product|catalog|item|menu|course|courses|program|room|vehicle)\b/i.test(t)) {
        const table = document.querySelector('#inventory-tbody, table, .inventory, .products-grid, .menu-grid, .courses-grid');
        if (table) {
          const container = table.closest('.card, section, article') || table;
          return { element: container, id: container.id || '', label: 'Live Catalog Table' };
        }
      }

      return null;
    }

    function formatSectionLabel(id) {
      if (/inventory/i.test(id)) return 'Live Inventory Table';
      if (/medicine|meds/i.test(id)) return 'Medicines Catalog';
      if (/product/i.test(id)) return 'Products Catalog';
      if (/course|program|stream/i.test(id)) return 'Courses & Programs';
      if (/admission/i.test(id)) return 'Admissions Section';
      if (/room/i.test(id)) return 'Rooms & Stays';
      if (/vehicle|car/i.test(id)) return 'Vehicles Showroom';
      if (/propert/i.test(id)) return 'Property Listings';
      if (/menu/i.test(id)) return 'Menu Section';
      if (/how-it-works/i.test(id)) return 'How It Works Guide';
      if (/pricing|plan|fee/i.test(id)) return 'Pricing & Plans';
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
        }, 3500);
        return true;
      } catch (err) {
        console.warn('[Echo AI Navigation] Failed smooth scroll:', err);
        return false;
      }
    }

    // --- EXACT FORM, SECTION & ROUTE REDIRECTION ENGINE (UNIVERSAL ACROSS ALL WEBSITES) ---
    function resolveExactRedirectTarget(query, blueprint = null) {
      const bp = blueprint || (typeof agentConfig !== 'undefined' ? agentConfig?.siteBlueprint : null);
      const rawQ = String(query || '').trim();
      if (!rawQ) return null;

      const normQ = (typeof normalizeUserQuery === 'function') ? (normalizeUserQuery(rawQ) || rawQ) : rawQ;
      const lower = normQ.toLowerCase();

      const navNoise = new Set([
        'take', 'me', 'to', 'open', 'show', 'go', 'redirect', 'scroll', 'jump', 'where', 'is', 'are',
        'the', 'a', 'an', 'please', 'can', 'you', 'want', 'fill', 'find', 'visit', 'navigate', 'view',
        'for', 'of', 'on', 'in', 'at', 'your', 'our', 'my', 'i', 'how', 'do', 'does', 'get', 'need', 'click', 'link'
      ]);
      const rawTokens = lower.replace(/[^a-z0-9\s-]/g, ' ').replace(/-/g, ' ').split(/\s+/).filter(Boolean);
      const queryTokens = rawTokens.filter(t => t.length >= 2 && !navNoise.has(t));
      const subjectTokens = queryTokens.filter(t => !['form', 'page', 'section', 'tab', 'screen', 'area'].includes(t));

      const wantsForm = /\b(form|apply|application|register|registration|submit|fill|signup|sign up|book|booking|reserve|reservation|checkout|order|enquiry|inquiry|demo|login|contact)\b/i.test(lower);
      const wantsPage = /\b(page|url|route|portal|screen)\b/i.test(lower);

      const normalizePath = (p) => {
        const clean = String(p || '').split('#')[0].split('?')[0].trim().replace(/\/+$/, '');
        if (!clean || clean === '/index.html' || clean === 'index.html') return '/';
        return clean.startsWith('/') ? clean : '/' + clean;
      };

      const currentPath = (typeof window !== 'undefined' && window.location && window.location.pathname)
        ? normalizePath(window.location.pathname)
        : '/';

      const tokenScoreAgainst = (qToks, targetStrings) => {
        const candToks = targetStrings
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, ' ')
          .replace(/-/g, ' ')
          .split(/\s+/)
          .filter(t => t.length >= 2);
        if (candToks.length === 0) return 0;
        let total = 0;
        let matchedCount = 0;
        for (const qt of qToks) {
          let best = 0;
          for (const ct of candToks) {
            const m = (typeof fuzzyTokenMatch === 'function') ? fuzzyTokenMatch(qt, ct) : (qt === ct ? 4 : 0);
            if (m > best) best = m;
          }
          if (best >= 4) { total += 12; matchedCount++; }
          else if (best === 3) { total += 10; matchedCount++; }
          else if (best === 2) { total += 8; matchedCount++; }
        }
        return { total, matchedCount };
      };

      const findDomElementForCandidate = (cand) => {
        if (typeof document === 'undefined') return null;
        try {
          if (cand.formId) {
            const el = document.getElementById(cand.formId);
            if (el) return el;
          }
          if (cand.formName) {
            const el = document.querySelector(`form[name="${cand.formName}"]`);
            if (el) return el;
          }
          if (cand.sectionId) {
            const el = document.getElementById(cand.sectionId);
            if (el) return el;
          }
          if (cand.id && !/^form_\d+$/.test(cand.id)) {
            const el = document.getElementById(cand.id);
            if (el) return el;
          }
          if (cand.action && cand.action.length > 2) {
            const el = document.querySelector(`form[action*="${cand.action.replace(/"/g, '')}"]`);
            if (el) return el;
          }
        } catch (_) {}
        return null;
      };

      const candidates = [];

      // 1. Score Blueprint Forms
      if (bp && Array.isArray(bp.forms)) {
        bp.forms.forEach((f, idx) => {
          const fieldLabels = Array.isArray(f.fields)
            ? f.fields.map(fl => (typeof fl === 'string' ? fl : (fl?.label || fl?.name || ''))).filter(Boolean)
            : [];
          const { total, matchedCount } = tokenScoreAgainst(subjectTokens, [
            f.title, f.formId, f.formName, f.sectionId, f.submitLabel, f.page, f.path,
            ...(Array.isArray(f.keywords) ? f.keywords : []),
            ...fieldLabels
          ]);
          let score = total;
          if (wantsForm && matchedCount > 0) score += 10;
          else if (wantsForm && subjectTokens.length === 0 && idx === 0) score = 14;
          if (score > 0) {
            const domEl = findDomElementForCandidate(f);
            const candPath = normalizePath(f.path || '');
            const isCrossPage = domEl ? false : Boolean(f.path && candPath !== currentPath);
            const fallbackHash = f.sectionId ? `#${f.sectionId}` : (f.formId ? `#${f.formId}` : '');
            const redirectUrl = isCrossPage ? (f.href || f.path) : (f.href || fallbackHash || null);
            candidates.push({
              targetType: 'form',
              id: f.formId || f.sectionId || f.id || `form_${idx + 1}`,
              formId: f.formId || '',
              sectionId: f.sectionId || '',
              label: f.title || 'Website Form',
              submitLabel: f.submitLabel || 'Submit',
              fields: fieldLabels.slice(0, 6),
              page: f.page || '',
              path: f.path || '/',
              href: f.href || redirectUrl || '',
              isCrossPage,
              redirectUrl,
              element: domEl,
              score
            });
          }
        });
      }

      // 2. Score Blueprint Sections
      if (bp && Array.isArray(bp.sections)) {
        bp.sections.forEach((s) => {
          const { total, matchedCount } = tokenScoreAgainst(subjectTokens, [
            s.label, s.id, s.page, s.path,
            ...(Array.isArray(s.keywords) ? s.keywords : [])
          ]);
          let score = total;
          if (matchedCount > 0 && !wantsPage) score += 3;
          if (score > 0) {
            const domEl = findDomElementForCandidate(s);
            const candPath = normalizePath(s.path || '');
            const isCrossPage = domEl ? false : Boolean(s.path && candPath !== currentPath);
            const redirectUrl = isCrossPage ? (s.href || `${s.path}#${s.id}`) : (s.href || `#${s.id}`);
            candidates.push({
              targetType: 'section',
              id: s.id || '',
              sectionId: s.id || '',
              label: s.label || formatSectionLabel(s.id || 'section'),
              fields: [],
              page: s.page || '',
              path: s.path || '/',
              href: s.href || redirectUrl || '',
              isCrossPage,
              redirectUrl,
              element: domEl,
              score
            });
          }
        });
      }

      // 3. Score Blueprint Routes / Pages
      if (bp && Array.isArray(bp.routes)) {
        bp.routes.forEach((r) => {
          const { total, matchedCount } = tokenScoreAgainst(subjectTokens, [
            r.label, r.path, r.file,
            ...(Array.isArray(r.keywords) ? r.keywords : [])
          ]);
          let score = total;
          if (wantsPage && matchedCount > 0) score += 8;
          if (score > 0) {
            const candPath = normalizePath(r.path || '');
            const isCrossPage = Boolean(r.path && candPath !== currentPath);
            candidates.push({
              targetType: 'route',
              id: r.path || r.label,
              sectionId: '',
              label: r.label || r.path,
              fields: [],
              page: r.file || '',
              path: r.path || '/',
              href: r.path || '/',
              isCrossPage,
              redirectUrl: r.path || '/',
              element: null,
              score
            });
          }
        });
      }

      // 4. Live DOM Form & Section Scan (Works even for websites without an uploaded blueprint!)
      if (typeof document !== 'undefined') {
        try {
          const liveForms = document.querySelectorAll('form');
          liveForms.forEach((formEl, idx) => {
            if (formEl.closest('#voice-helpdesk-root')) return;
            const secParent = formEl.closest('section[id], div[id]');
            const hEl = (secParent || formEl).querySelector('h1, h2, h3, h4, legend');
            const submitEl = formEl.querySelector('button[type="submit"], input[type="submit"], button:not([type="button"])');
            const title = (hEl ? hEl.textContent : '') || formEl.getAttribute('aria-label') || formEl.id || formEl.name || `Form ${idx + 1}`;
            const cleanTitle = title.replace(/\s+/g, ' ').trim().slice(0, 60);
            const fieldLabels = Array.from(formEl.querySelectorAll('input, select, textarea'))
              .filter(el => el.type !== 'hidden' && el.type !== 'submit' && el.type !== 'button')
              .map(el => {
                const lbl = el.id ? document.querySelector(`label[for="${el.id}"]`) : null;
                return (lbl ? lbl.textContent : '') || el.getAttribute('placeholder') || el.getAttribute('aria-label') || el.name || '';
              })
              .map(s => s.replace(/\s+/g, ' ').replace(/[:*]+$/, '').trim())
              .filter(s => s.length >= 2)
              .slice(0, 6);

            const { total, matchedCount } = tokenScoreAgainst(subjectTokens, [
              cleanTitle, formEl.id, formEl.name, secParent?.id, submitEl?.textContent, ...fieldLabels
            ]);
            let score = total + (wantsForm && matchedCount > 0 ? 11 : 0);
            if (wantsForm && subjectTokens.length === 0 && idx === 0) score = Math.max(score, 13);
            if (score > 0) {
              candidates.push({
                targetType: 'form',
                id: formEl.id || secParent?.id || `dom_form_${idx + 1}`,
                formId: formEl.id || '',
                sectionId: secParent?.id || '',
                label: cleanTitle,
                submitLabel: submitEl ? submitEl.textContent.trim().slice(0, 40) : 'Submit',
                fields: fieldLabels,
                page: currentPath,
                path: currentPath,
                href: formEl.id ? `#${formEl.id}` : (secParent?.id ? `#${secParent.id}` : ''),
                isCrossPage: false,
                redirectUrl: null,
                element: formEl,
                score: score + 2 // Slight boost for verified live DOM element
              });
            }
          });
        } catch (_) {}
      }

      candidates.sort((a, b) => b.score - a.score);
      if (candidates.length > 0 && candidates[0].score >= 8) {
        return candidates[0];
      }

      // Final fallback to host section finder
      const hostSec = findHostSection(normQ);
      if (hostSec) {
        return {
          targetType: 'section',
          id: hostSec.id || '',
          sectionId: hostSec.id || '',
          label: hostSec.label || 'Section',
          fields: [],
          page: currentPath,
          path: currentPath,
          href: hostSec.id ? `#${hostSec.id}` : '',
          isCrossPage: false,
          redirectUrl: null,
          element: hostSec.element || null,
          score: 8
        };
      }
      return null;
    }

    function executeRedirectAction(target, isExplicitNav = false) {
      if (!target) return { executed: 'none' };

      // Resolve DOM element on demand if not already attached
      let el = target.element || null;
      if (!el && typeof document !== 'undefined') {
        try {
          if (target.formId) el = document.getElementById(target.formId);
          if (!el && target.sectionId) el = document.getElementById(target.sectionId);
          if (!el && target.id && !/^form_\d+$/.test(target.id)) el = document.getElementById(target.id);
        } catch (_) {}
      }

      // 1. Same-page smooth scroll + luminous highlight + auto-focus first input for forms
      if (el) {
        scrollToHostSection({ element: el, id: target.id, label: target.label });
        const isForm = target.targetType === 'form' || el.tagName === 'FORM' || Boolean(el.querySelector && el.querySelector('form'));
        if (isForm && typeof el.querySelector === 'function') {
          setTimeout(() => {
            try {
              const firstInput = el.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([disabled]), select:not([disabled]), textarea:not([disabled])');
              if (firstInput && typeof firstInput.focus === 'function') {
                firstInput.focus({ preventScroll: true });
              }
            } catch (_) {}
          }, 480);
        }
        return { executed: isForm ? 'scroll_and_focus' : 'scroll', target };
      }

      // 2. Cross-page navigation (e.g. /apply.html#admission-form or /checkout)
      if (target.isCrossPage && target.redirectUrl) {
        if (isExplicitNav && typeof window !== 'undefined' && window.location && typeof window.location.assign === 'function') {
          setTimeout(() => {
            try {
              window.location.assign(target.redirectUrl);
            } catch (_) {}
          }, 900);
          return { executed: 'scheduled_redirect', redirectUrl: target.redirectUrl, target };
        }
        return { executed: 'pill_only', redirectUrl: target.redirectUrl, target };
      }

      // 3. Same-page hash fallback
      if (target.sectionId && typeof window !== 'undefined' && window.location) {
        try {
          window.location.hash = `#${target.sectionId}`;
          return { executed: 'hash_jump', redirectUrl: `#${target.sectionId}`, target };
        } catch (_) {}
      }

      return { executed: 'none', target };
    }

    // Autonomous Host Page Knowledge Harvester (Universal for any website)
    function extractHostPageKnowledge() {
      if (typeof document === 'undefined') {
        return {
          businessName: '',
          metaDesc: '',
          phone: '',
          email: '',
          address: '',
          hours: '',
          sections: [],
          faqs: [],
          services: []
        };
      }

      const knowledge = {
        businessName: '',
        metaDesc: '',
        phone: '',
        email: '',
        address: '',
        hours: '',
        sections: [],
        faqs: [],
        services: []
      };

      try {
        const ogSite = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
        const logoEl = document.querySelector('.logo, #logo, header h1, nav h1, a[class*="brand"], a[class*="logo"]');
        const pageTitle = document.title ? document.title.split(/[-|•–:]/)[0].trim() : '';
        knowledge.businessName = ogSite || (logoEl ? logoEl.textContent.trim() : pageTitle) || agentConfig?.name || 'our store';

        knowledge.metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') ||
                             document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';

        const telLink = document.querySelector('a[href^="tel:"]');
        if (telLink) {
          knowledge.phone = telLink.getAttribute('href').replace(/^tel:/, '').trim() || telLink.textContent.trim();
        } else {
          const bodyText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
          const phoneMatch = bodyText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
          if (phoneMatch) knowledge.phone = phoneMatch[0].trim();
        }

        const mailLink = document.querySelector('a[href^="mailto:"]');
        if (mailLink) {
          knowledge.email = mailLink.getAttribute('href').replace(/^mailto:/, '').split('?')[0].trim() || mailLink.textContent.trim();
        } else {
          const bodyText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
          const emailMatch = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
          if (emailMatch) knowledge.email = emailMatch[0].trim();
        }

        const addrEl = document.querySelector('address, [itemprop="address"], .address, #address, .contact-address, [class*="address"]');
        if (addrEl) {
          knowledge.address = addrEl.textContent.replace(/\s+/g, ' ').trim();
        }

        const hoursEl = document.querySelector('#hours, .hours, .business-hours, [itemprop="openingHours"], .timings, #timings, [class*="timing"], [class*="hours"]');
        if (hoursEl) {
          knowledge.hours = hoursEl.textContent.replace(/\s+/g, ' ').trim();
        }

        const details = document.querySelectorAll('details, .faq-item, .accordion-item, .faq');
        details.forEach(d => {
          const qEl = d.querySelector('summary, .faq-question, .accordion-header, h3, h4');
          const aEl = d.querySelector('.faq-answer, .accordion-content, p');
          if (qEl && aEl) {
            const q = qEl.textContent.replace(/\s+/g, ' ').trim();
            const a = aEl.textContent.replace(/\s+/g, ' ').trim();
            if (q.length > 3 && a.length > 5 && !knowledge.faqs.some(f => f.q === q)) {
              knowledge.faqs.push({ q, a });
            }
          }
        });

        const serviceSection = document.querySelector('#services, .services, #features, .features');
        if (serviceSection) {
          const serviceHeadings = serviceSection.querySelectorAll('h3, h4, .service-title');
          serviceHeadings.forEach(sh => {
            const t = sh.textContent.replace(/\s+/g, ' ').trim();
            if (t && t.length > 2 && t.length < 50 && !knowledge.services.includes(t)) {
              knowledge.services.push(t);
            }
          });
        }

        const sectionElements = document.querySelectorAll('section[id], div[id][class*="section"], [id*="section"]');
        sectionElements.forEach(s => {
          const heading = s.querySelector('h1, h2, h3, h4');
          const hText = heading ? heading.textContent.replace(/\s+/g, ' ').trim() : '';
          const id = s.id;
          if (id && (hText || id.length > 2)) {
            knowledge.sections.push({
              id,
              label: hText || formatSectionLabel(id),
              element: s
            });
          }
        });
      } catch (e) {
        console.warn('[Echo AI Knowledge] Host page extraction warning:', e);
      }

      return knowledge;
    }

    // Live Host Page Content Snippet Indexer: harvests clean visible heading/paragraph/list blocks on ANY website
    // so customer questions about policies, eligibility, shipping, warranty, timings, etc. are grounded directly on the live page!
    let _pageSnippetCache = { timestamp: 0, snippets: [] };
    function extractHostPageSnippets() {
      if (typeof document === 'undefined' || !document.body) return [];
      const now = Date.now();
      if (_pageSnippetCache.snippets.length > 0 && (now - _pageSnippetCache.timestamp < 8000)) {
        return _pageSnippetCache.snippets;
      }
      const snippets = [];
      const seen = new Set();
      try {
        const blocks = document.querySelectorAll('main p, main li, section p, section li, article p, article li, .card p, .card li, [class*="info"] p, [class*="detail"] p, [class*="policy"] p, [class*="eligibility"] p, [class*="faq"] p');
        blocks.forEach(el => {
          if (el.closest('#voice-helpdesk-root, script, style, noscript, nav, footer, header')) return;
          const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (txt.length < 25 || txt.length > 400) return;
          if (/^(copyright|©|all rights reserved|privacy policy|terms of use)/i.test(txt)) return;
          if (/\{[\s\S]*\}|function\s*\(|const\s+\w+\s*=|import\s+\w+/i.test(txt)) return;
          const parentSec = el.closest('section, article, .card, div[id], div[class*="section"]');
          const hEl = parentSec ? parentSec.querySelector('h1, h2, h3, h4') : null;
          const heading = hEl ? (hEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
          const key = txt.slice(0, 80).toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          snippets.push({ heading, text: txt });
        });
      } catch (_) {}
      _pageSnippetCache = { timestamp: now, snippets: snippets.slice(0, 60) };
      return _pageSnippetCache.snippets;
    }

    const UNIVERSAL_STOPWORDS = new Set([
      // English grammatical & common words
      'the', 'a', 'an', 'and', 'or', 'for', 'of', 'in', 'on', 'at', 'to', 'from', 'with', 'by', 'is', 'are', 'was', 'were',
      'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should',
      // Question & intent words
      'what', 'which', 'who', 'how', 'where', 'when', 'why', 'give', 'show', 'tell', 'check', 'get', 'see', 'find', 'me', 'us',
      'price', 'cost', 'rate', 'rates', 'fee', 'fees', 'mrp', 'charges', 'howmuch', 'much',
      'stock', 'stocks', 'available', 'availability', 'quantity', 'count', 'units', 'many',
      'buy', 'sell', 'order', 'please', 'details', 'detail', 'info', 'information',
      // Packaging & unit words across all domains (medical, grocery, retail, tech)
      'item', 'items', 'product', 'products', 'model', 'models', 'piece', 'pieces', 'pcs', 'pack', 'packs', 'package',
      'tablet', 'tablets', 'capsule', 'capsules', 'syrup', 'syrups', 'injection', 'injections', 'drops', 'ointment', 'cream',
      'strip', 'strips', 'box', 'boxes', 'bottle', 'bottles', 'pouch', 'pouches', 'bag', 'bags', 'packet', 'packets',
      'kg', 'gm', 'g', 'mg', 'ml', 'ltr', 'liter', 'liters', 'cm', 'mm', 'inch', 'size', 'color', 'brand',
      // Marathi / Hindi common words
      'आहे', 'नाही', 'काय', 'कशी', 'किती', 'द्या', 'सांगा', 'दाखवा', 'पाहिजे', 'किंमत', 'भाव', 'दर', 'साठा', 'स्टॉक',
      'है', 'नहीं', 'क्या', 'कितना', 'कितने', 'दीजिए', 'बताइए', 'दिखाइए', 'चाहिए', 'कीमत', 'दाम', 'रेट'
    ]);

    const GENERIC_PRODUCT_NOUNS = new Set([
      'pizza', 'burger', 'sandwich', 'pasta', 'salad', 'coffee', 'tea', 'drink', 'beverage', 'cake', 'bread',
      'phone', 'mobile', 'laptop', 'computer', 'watch', 'headphone', 'headphones', 'earbuds', 'case', 'cover', 'charger',
      'shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots', 'shirt', 'tshirt', 'pant', 'pants', 'jeans', 'jacket', 'dress',
      'medicine', 'medicines', 'med', 'meds', 'drug', 'drugs', 'pill', 'pills', 'tablet', 'tablets', 'capsule', 'capsules',
      'syrup', 'syrups', 'injection', 'injections', 'drops', 'ointment', 'cream', 'gel',
      'plan', 'plans', 'service', 'services', 'treatment', 'consultation', 'appointment', 'course', 'room'
    ]);

    function cleanScrapedItemTitle(raw) {
      if (!raw) return { name: '', desc: '' };
      let str = String(raw).trim();
      // Disentangle jammed words (e.g. "TabletParacetamol" or "(650mg)Micro")
      // Requires at least 3 lowercase letters or closing paren before capital to prevent splitting "iPhone", "eBay", etc.
      str = str.replace(/([a-z]{3,}|\))([A-Z][a-z])/g, '$1 $2').replace(/\s+/g, ' ').trim();

      let cleanName = str;
      let secondary = '';

      const m = str.match(/^(.+?\b(?:Tablet|Tablets|Capsule|Capsules|Syrup|Injection|Drops|Ointment|Cream|Gel|Suspension|Pill|Soap|Lotion|Shampoo))\s+([A-Z][a-z]+.*)$/);
      if (m) {
        cleanName = m[1].trim();
        secondary = m[2].trim();
      } else if (str.includes('(')) {
        const idx = str.indexOf('(');
        const beforeParen = str.substring(0, idx).trim();
        const words = beforeParen.split(' ');
        const formIdx = words.findIndex(w => /^(Tablet|Tablets|Capsule|Capsules|Syrup|Injection|Drops|Ointment|Cream|Gel)$/i.test(w));
        if (formIdx >= 0) {
          cleanName = words.slice(0, formIdx + 1).join(' ');
          secondary = words.slice(formIdx + 1).join(' ') + ' ' + str.substring(idx).trim();
        } else {
          cleanName = beforeParen;
          secondary = str.substring(idx).trim();
        }
      }

      return { name: cleanName, desc: secondary };
    }

    let _catalogCache = { timestamp: 0, items: [] };
    function getAllCatalogItems(agentConfig, forceRefresh = false) {
      const now = Date.now();
      if (!forceRefresh && _catalogCache.items.length > 0 && (now - _catalogCache.timestamp < 4000)) {
        return _catalogCache.items;
      }
      const items = [];
      const seen = new Set();

      function addItem(it) {
        if (!it) return;
        const rawName = String(it.name || it.product || it.title || it.item || '').trim();
        if (!isValidCustomerCatalogName(rawName, it)) return;

        const rawDesc = String(it.description || it.details || it.desc || '').trim();
        if (!it.price && (it.stock === null || it.stock === undefined || isNaN(it.stock)) && /^(we offer:|welcome to)/i.test(rawDesc)) return;

        const cleaned = cleanScrapedItemTitle(rawName);
        const name = cleaned.name || rawName;
        if (!isValidCustomerCatalogName(name, it)) return;
        if (seen.has(name.toLowerCase())) return;

        const extraDesc = cleaned.desc;
        const combDesc = [it.description, it.details, extraDesc].filter(Boolean).join(' ');
        const combDosage = [it.dosage, it.composition, it.salt, extraDesc].filter(Boolean).join(' ');

        seen.add(name.toLowerCase());
        items.push({
          id: it.id || `rec_${items.length + 1}`,
          name,
          price: it.price !== undefined ? (typeof it.price === 'number' ? `₹${it.price}` : String(it.price).trim()) : '',
          stock: it.stock !== undefined ? (typeof it.stock === 'number' ? it.stock : parseInt(it.stock, 10)) : (it.quantity !== undefined ? parseInt(it.quantity, 10) : (it.qty !== undefined ? parseInt(it.qty, 10) : null)),
          unit: it.unit || 'units',
          rx: Boolean(it.rx || it.prescriptionRequired),
          category: it.category || '',
          dosage: combDosage,
          description: combDesc
        });
      }

      // Tier 1: Host Page JavaScript Database State (window.EchoAIData / window.echoLiveInventory / window.EchoInventory / window.products / window.inventory)
      if (typeof window !== 'undefined') {
        const hostObj = window.EchoAIData || window.echoLiveInventory || window.EchoInventory || window.productsData || window.catalogData;
        const currentArch = detectCurrentArchetype(agentConfig);
        const isPharmaHost = hostObj && (hostObj.type === 'pharmacy' || /pharmacy/i.test(hostObj.storeName || ''));
        // If current agent is academic, DO NOT inject pharmacy items from demo or other sites!
        if (!(currentArch === 'academic' && isPharmaHost)) {
          const inv = hostObj?.liveInventory || hostObj?.inventory || hostObj?.products || hostObj?.database || hostObj?.items || hostObj?.catalog || hostObj?.menu || hostObj?.courses;
          if (inv) {
            if (Array.isArray(inv)) {
              inv.forEach(addItem);
            } else if (typeof inv === 'object') {
              for (const [key, val] of Object.entries(inv)) {
                if (val && typeof val === 'object') {
                  addItem({ name: val.name || val.title || key, ...val });
                } else if (val !== undefined) {
                  addItem({ name: key, stock: val });
                }
              }
            }
          }
          if (Array.isArray(window.products)) window.products.forEach(addItem);
          if (Array.isArray(window.inventory)) window.inventory.forEach(addItem);
          if (Array.isArray(window.catalog)) window.catalog.forEach(addItem);
          if (Array.isArray(window.courses)) window.courses.forEach(addItem);
        }
      }

      // Tier 2: Agent's Structured Database Records from Firestore
      if (agentConfig && Array.isArray(agentConfig.databaseRecords) && agentConfig.databaseRecords.length > 0) {
        agentConfig.databaseRecords.forEach(addItem);
      }

      // Tier 3: Structured JSON-LD / Schema.org (Universal for e-commerce, restaurants, healthcare)
      if (typeof document !== 'undefined') {
        try {
          const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
          jsonLdScripts.forEach(s => {
            try {
              const parsed = JSON.parse(s.textContent || '{}');
              const entries = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed]);
              entries.forEach(entry => {
                const type = entry['@type'];
                if (type === 'Product' || type === 'IndividualProduct' || type === 'MenuItem' || type === 'Service' || type === 'Course' || type === 'EducationalOccupationalProgram' || type === 'HotelRoom' || type === 'Vehicle') {
                  const offer = Array.isArray(entry.offers) ? entry.offers[0] : entry.offers;
                  const price = offer ? (offer.price ? `${offer.priceCurrency || '$'}${offer.price}` : '') : '';
                  const avail = offer?.availability || '';
                  const inStock = /InStock/i.test(avail) ? 50 : (/OutOfStock/i.test(avail) ? 0 : null);
                  addItem({
                    name: entry.name,
                    price: price,
                    stock: inStock,
                    description: entry.description || '',
                    category: entry.category || ''
                  });
                } else if (type === 'ItemList' && Array.isArray(entry.itemListElement)) {
                  entry.itemListElement.forEach(itemEl => {
                    const item = itemEl.item || itemEl;
                    if (item && item.name) {
                      const offer = item.offers;
                      const price = offer ? (offer.price ? `${offer.priceCurrency || '$'}${offer.price}` : '') : '';
                      addItem({ name: item.name, price, description: item.description || '' });
                    }
                  });
                }
              });
            } catch (_) {}
          });
        } catch (_) {}
      }

      // Tier 4: Autonomous Universal DOM Scraper (Tables, Cards, Grids across any industry)
      if (typeof document !== 'undefined') {
        // A. Table row scraper with header inspection & column awareness
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
          const headerCells = Array.from(table.querySelectorAll('thead th, tr:first-child th')).map(th => th.textContent.trim().toLowerCase());
          let nameColIdx = -1;
          let priceColIdx = -1;
          let stockColIdx = -1;
          let descColIdx = -1;

          headerCells.forEach((h, idx) => {
            if (/name|product|item|title|medicine|dish|service|plan/i.test(h) && nameColIdx === -1) nameColIdx = idx;
            else if (/price|cost|rate|mrp|fee/i.test(h) && priceColIdx === -1) priceColIdx = idx;
            else if (/stock|qty|quantity|units|available|status/i.test(h) && stockColIdx === -1) stockColIdx = idx;
            else if (/desc|composition|dosage|details|category/i.test(h) && descColIdx === -1) descColIdx = idx;
          });

          const rows = table.querySelectorAll('tbody tr, tr');
          rows.forEach((row, rowIdx) => {
            if (row.querySelector('th') && rowIdx === 0) return;

            const tds = Array.from(row.querySelectorAll('td'));
            if (tds.length >= 2) {
              // Find clean title cell: use header index if valid, else first non-numeric non-checkbox cell
              let titleTd = nameColIdx >= 0 && nameColIdx < tds.length ? tds[nameColIdx] : null;
              if (!titleTd) {
                for (let i = 0; i < Math.min(tds.length, 3); i++) {
                  const cellText = tds[i].textContent.trim();
                  if (!cellText || /^[#\d]{1,4}$/.test(cellText) || cellText.length < 2) continue;
                  titleTd = tds[i];
                  break;
                }
                if (!titleTd) titleTd = tds[0];
              }

              // Extract clean primary title from first line or title element
              const titleEl = titleTd.querySelector('.name, .title, [class*="name"], [class*="title"], strong, b, h1, h2, h3, h4, h5, a');
              let rawTitle = '';
              let secondaryDesc = '';

              if (titleEl && titleEl.textContent.trim().length >= 2) {
                rawTitle = titleEl.textContent.trim();
                const otherChildren = Array.from(titleTd.children).filter(c => c !== titleEl && !titleEl.contains(c));
                if (otherChildren.length > 0) {
                  secondaryDesc = otherChildren.map(c => c.textContent.trim()).filter(Boolean).join(' ');
                }
              } else if (titleTd.children.length > 0) {
                rawTitle = titleTd.firstElementChild.textContent.trim();
                if (titleTd.children.length > 1) {
                  secondaryDesc = Array.from(titleTd.children).slice(1).map(c => c.textContent.trim()).filter(Boolean).join(' ');
                }
              } else {
                const lines = titleTd.innerText ? titleTd.innerText.split('\n').map(l => l.trim()).filter(Boolean) : [titleTd.textContent.trim()];
                rawTitle = lines[0] || '';
              }

              // Disentangle jammed text and composition
              const cleaned = cleanScrapedItemTitle(rawTitle);
              rawTitle = cleaned.name;
              if (cleaned.desc) {
                secondaryDesc = secondaryDesc ? `${cleaned.desc} ${secondaryDesc}` : cleaned.desc;
              }

              // Extract secondary lines / composition / details from description column if present
              if (!secondaryDesc && descColIdx >= 0 && descColIdx < tds.length) {
                secondaryDesc = tds[descColIdx].textContent.trim();
              }

              // Extract price
              let priceMatch = '';
              if (priceColIdx >= 0 && priceColIdx < tds.length) {
                priceMatch = tds[priceColIdx].textContent.trim();
              } else {
                for (let i = 0; i < tds.length; i++) {
                  if (tds[i] === titleTd) continue;
                  const t = tds[i].textContent.trim();
                  if (/[₹$€£]|rs\.?|usd|eur/i.test(t) || /^\s*\d+([.,]\d{1,2})?\s*$/.test(t)) {
                    priceMatch = t;
                    break;
                  }
                }
              }

              // Extract stock
              let stockVal = null;
              let unitVal = 'units';
              if (stockColIdx >= 0 && stockColIdx < tds.length) {
                const t = tds[stockColIdx].textContent.trim();
                const m = t.match(/^(\d+)\s*([a-zA-Z]+)?/);
                if (m) {
                  stockVal = parseInt(m[1], 10);
                  if (m[2]) unitVal = m[2];
                } else if (/in stock|available/i.test(t)) {
                  stockVal = 100;
                } else if (/out of stock|sold out|unavailable/i.test(t)) {
                  stockVal = 0;
                }
              } else {
                for (let i = 0; i < tds.length; i++) {
                  if (tds[i] === titleTd) continue;
                  const t = tds[i].textContent.trim();
                  const m = t.match(/^(\d+)\s*([a-zA-Z]+)?/);
                  if (m && !/[₹$€£]|rs\.?/i.test(t)) {
                    stockVal = parseInt(m[1], 10);
                    if (m[2]) unitVal = m[2];
                    break;
                  } else if (/in stock|available/i.test(t)) {
                    stockVal = 100;
                    break;
                  } else if (/out of stock|sold out/i.test(t)) {
                    stockVal = 0;
                    break;
                  }
                }
              }

              if (rawTitle && rawTitle.length >= 2 && !/^(name|item|product|price|stock|action|sr\.?no|total|status|select|delete|edit)$/i.test(rawTitle) && !rawTitle.includes('?')) {
                addItem({
                  name: rawTitle,
                  price: priceMatch,
                  stock: stockVal,
                  unit: unitVal,
                  description: secondaryDesc,
                  dosage: secondaryDesc
                });
              }
            }
          });
        });

        // B. Card / Grid / List items scraper (Universal across ALL website archetypes)
        const cardElements = document.querySelectorAll('.product-card, .item-card, .shop-item, .product-item, .medicine-item, [data-product], .menu-item, article.product, .pricing-card, .plan-card, .course-card, .program-card, .stream-card, .room-card, .service-card, .vehicle-card, .car-card, .property-card, [class*="product-card"], [class*="menu-item"], [class*="course-card"], [class*="program-card"], [class*="plan-card"], [class*="pricing-card"], [class*="room-card"], [class*="service-card"], div[role="row"]');
        cardElements.forEach(card => {
          const titleEl = card.querySelector('.name, .title, [class*="name"], [class*="title"], h2, h3, h4, h5, [data-title], a[class*="title"], a[class*="name"]');
          const rawTitle = titleEl ? titleEl.textContent.trim() : (card.getAttribute('data-product') || card.getAttribute('data-name') || '');
          const priceEl = card.querySelector('.price, [data-price], .cost, .amount, .fee, [class*="price"], [class*="fee"]');
          const priceMatch = priceEl ? priceEl.textContent.trim() : (card.getAttribute('data-price') || '');
          const stockEl = card.querySelector('.stock, [data-stock], .quantity, .availability, .seats, [class*="stock"], [class*="seat"]');
          const stockText = stockEl ? stockEl.textContent.trim() : (card.getAttribute('data-stock') || '');
          const m = stockText.match(/^(\d+)\s*([a-zA-Z]+)?/);

          if (rawTitle && rawTitle.length >= 2 && !rawTitle.includes('?')) {
            const cleaned = cleanScrapedItemTitle(rawTitle);
            addItem({
              name: cleaned.name || rawTitle,
              price: priceMatch,
              stock: m ? parseInt(m[1], 10) : (/in stock|open|available/i.test(stockText) ? 100 : (/out of stock|closed|full/i.test(stockText) ? 0 : null)),
              unit: m && m[2] ? m[2] : 'units',
              description: cleaned.desc || ''
            });
          }
        });

        // C. Form <select> dropdown scraper for admission/booking/service portals (only if catalog is still empty)
        if (items.length === 0) {
          const selects = document.querySelectorAll('select');
          selects.forEach(sel => {
            const labelEl = sel.id ? document.querySelector(`label[for="${sel.id}"]`) : sel.closest('label');
            const metaText = `${sel.id || ''} ${sel.name || ''} ${sel.getAttribute('aria-label') || ''} ${labelEl ? labelEl.textContent : ''}`.toLowerCase();
            if (/\b(course|courses|program|programme|stream|class|standard|std|branch|degree|department|subject|admission|service|plan|room|vehicle|model|package)\b/i.test(metaText)) {
              Array.from(sel.options || []).forEach(opt => {
                const label = (opt.textContent || '').replace(/\s+/g, ' ').trim();
                const val = (opt.value || '').trim();
                if (!label || !val || /^(-+|select|choose|none|please|--)/i.test(label)) return;
                addItem({
                  name: label,
                  price: '',
                  stock: null,
                  unit: 'seats',
                  description: ''
                });
              });
            }
          });
        }
      }

      // STRICT ACCURACY: Never fabricate fake catalog items from FAQs or general text.
      _catalogCache = { timestamp: now, items };
      return items;
    }

    // Strip leading conversational greeting when followed by a real question (e.g. "hey i want know about the courses" -> "i want know about the courses")
    function stripLeadingGreeting(text) {
      return String(text || '')
        .trim()
        .replace(/^(hi+|hello+|hey+|hii+|helo+|hlo|howdy|greetings|yo|sup|hola|good\s*(?:morning|afternoon|evening|day)|namaste|namste|namaskar|pranam|नमस्कार|नमस्ते|प्रणाम|हाय|हॅलो|हेलो)(?:\s+(?:there|everyone|sir|ma'?am|mam|bot|assistant|team))?[,!.\s]+/i, '')
        .trim();
    }

    // Conversational & Greeting Filter: ONLY returns true for STANDALONE greetings / small-talk / thanks / farewells!
    // Typo-tolerant ("helo", "thnks", "byee", "namste") while NEVER swallowing greeting-prefixed questions!
    function isGreetingOrConversational(text) {
      const raw = String(text || '').trim();
      if (!raw) return false;
      const norm = (typeof normalizeUserQuery === 'function' && !/[\u0900-\u097F]/.test(raw)) ? normalizeUserQuery(raw) : raw;
      const t = norm.toLowerCase().replace(/[!?.,;:]+$/g, '').replace(/\s+/g, ' ').trim();
      if (!t) return false;

      // Exact standalone English greetings / small talk / thanks / farewells
      if (/^(hi+|hello+|hey+|hii+|helo+|hlo|howdy|greetings|yo|sup|hola|good\s*(morning|afternoon|evening|day|night))(\s+(there|everyone|all|team|sir|ma'?am|mam|bot|assistant|agent|friend|guys))?$/i.test(t)) {
        return true;
      }
      if (/^(how\s+are\s+you|how\s+is\s+it\s+going|whats?\s*up|how\s+do\s+you\s+do|thank\s*you|thanks|thx|ty|thnks|many\s+thanks|thanks\s+a\s+lot|ok\s+thanks|bye+|goodbye|see\s+you|take\s+care|ok\s*bye)$/i.test(t)) {
        return true;
      }
      // Exact standalone Hinglish / Marathish greetings / thanks / farewells
      if (/^(namaste|namste|namaskar|pranam|ram\s*ram|kasa\s*ahes|kase\s*ahat|kaise\s*ho|kya\s*haal(\s*hai)?|dhanyavad|dhanyavaad|aabhar|shukriya|alvida)(\s+(sir|ji|mam|bot))?$/i.test(t)) {
        return true;
      }
      // Exact standalone Devanagari greetings / thanks / farewells
      const rawClean = raw.replace(/[!?.,।;:]+$/g, '').replace(/\s+/g, ' ').trim();
      if (/^(नमस्कार|नमस्ते|प्रणाम|हाय|हॅलो|हेलो|शुभ\s*प्रभात|शुभ\s*सकाळ|शुभ\s*दुपार|शुभ\s*संध्याकाळ|कसे\s*आहात|कसा\s*आहेस|कैसे\s*हो|क्या\s*हाल\s*है|धन्यवाद|आभार|शुक्रिया|बाय|अलविदा)(\s+(जी|सर|मॅडम))?$/i.test(rawClean)) {
        return true;
      }

      return false;
    }

    function extractTargetItem(text, history = [], context = null, catalogItems = null) {
      const strippedRaw = isGreetingOrConversational(text) ? '' : (stripLeadingGreeting(text) || String(text || '').trim());
      if (!strippedRaw) return '';
      const strippedInput = (typeof normalizeUserQuery === 'function') ? (normalizeUserQuery(strippedRaw, catalogItems) || strippedRaw) : strippedRaw;

      let cleaned = strippedInput
        .replace(/\b(available stock|current stock number|stock number|avilable stock|available|avilable|stock|in stock|out of stock|is there any|is there|do you have|do you sell|can i get|i want to buy|i want to know about|i want know about|looking for|tell me about|details of|info on|do you carry|any|what is the price of|price of|price|how much for|how much is|give me|just give me|check|tell me|show me|status of|order|current|number|forget that|instead of that|instead of it|what about|how about)\b/gi, ' ')
        .replace(/(ची किंमत काय आहे|काय किंमत आहे|भाव काय आहे|दर काय आहे|कीमत क्या है|क्या कीमत है|दाम क्या है|रेट क्या है)/gi, ' ')
        .replace(/[?!.,;]/g, '')
        .trim();
      cleaned = cleaned.replace(/\s+/g, ' ');

      // Never treat conversational greetings as a catalog search item
      if (isGreetingOrConversational(cleaned)) {
        return '';
      }

      // 0. Context-Switch First: If user explicitly names a DIFFERENT item from the catalog (e.g. "forget that, what about Commerce?" or "instead of it, Adidas Ultraboost"), switch immediately!
      const liveCatalog = Array.isArray(catalogItems) && catalogItems.length > 0
        ? catalogItems
        : (typeof getAllCatalogItems === 'function' && typeof agentConfig !== 'undefined' ? getAllCatalogItems(agentConfig) : []);
      if (liveCatalog.length > 0 && cleaned.length >= 3) {
        const cleanedNoPronouns = cleaned
          .replace(/\b(in that|for that|about that|of that|in this|for this|about this|of this|for it|about it|in it|this|that|it|these|those|the|and|or|but|with|also|please)\b/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleanedNoPronouns.length >= 3) {
          const directSwitchMatch = matchInInventory(liveCatalog, cleanedNoPronouns);
          if (directSwitchMatch) {
            return directSwitchMatch.name || directSwitchMatch.title || cleanedNoPronouns;
          }
        }
      }

      // 1. Universal Follow-up Pronoun & Reference Resolution (English, Hindi, Marathi across ALL website types)
      const isReferenceQuery =
        /\b(in that|for that|about that|of that|in this|for this|about this|of this|for it|about it|in it|on this|on that|on it|this|that|it|these|those|the course|the program|the item|the medicine|the product|the dish|the meal|the plan|the tier|the room|the suite|the car|the vehicle|the service|the property|the flat|the package|the school|the college|what do you provide|what is included|tell me more)\b/i.test(cleaned) ||
        /(यात|त्यात|याबद्दल|त्याबद्दल|याचे|त्याचे|याची|त्याची|यामध्ये|त्यामध्ये|इसमें|उसमें|इसके बारे में|उसके बारे में|इसका|उसका|इसकी|उसकी)/i.test(text);

      if (isReferenceQuery) {
        if (context && context.activeItem) {
          return context.activeItem.name || context.activeItem.title || '';
        }
        if (Array.isArray(history) && history.length > 0) {
          for (let i = history.length - 1; i >= 0; i--) {
            const hText = history[i]?.content || history[i]?.text || '';
            if (hText && hText !== text) {
              const hClean = hText
                .replace(/\b(is currently in stock|seats available at|available stock|current stock|we have|give me details of|details of|tell me about)\b/gi, ' ')
                .replace(/[?!.,;]/g, '')
                .trim();
              if (hClean.length >= 3 && !isGreetingOrConversational(hClean)) {
                return hClean;
              }
            }
          }
        }
      }

      // If user said e.g. "just give me current stock number", resolve item from previous user messages
      if (cleaned.length < 3 && Array.isArray(history) && history.length > 0) {
        for (let i = history.length - 1; i >= 0; i--) {
          const prevMsg = history[i];
          const prevRole = prevMsg?.role;
          const prevText = prevMsg?.content || prevMsg?.text || '';
          if (prevRole === 'user' && prevText && prevText !== text) {
            const prevClean = prevText
              .replace(/\b(available stock|current stock number|stock number|avilable stock|available|avilable|stock|in stock|out of stock|is there any|is there|do you have|do you sell|can i get|i want to buy|looking for|tell me about|details of|info on|do you carry|any|what is the price of|price of|price|how much for|how much is|give me|just give me|check|tell me|show me|status of|order|current|number)\b/gi, ' ')
              .replace(/(ची किंमत काय आहे|काय किंमत आहे|भाव काय आहे|दर काय आहे|कीमत क्या है|क्या कीमत है|दाम क्या है|रेट क्या है)/gi, ' ')
              .replace(/[?!.,;]/g, '')
              .trim();
            if (prevClean.length >= 3 && !isGreetingOrConversational(prevClean)) {
              return prevClean.replace(/\s+/g, ' ');
            }
          }
        }

        // Fallback to any previous turn if no user message yielded an item
        for (let i = history.length - 1; i >= 0; i--) {
          const prevText = history[i]?.content || history[i]?.text || '';
          if (prevText && prevText !== text) {
            const prevClean = prevText
              .replace(/\b(we have|strips of|in stock at|available stock|current stock number|stock number|avilable stock|available|avilable|stock|in stock|out of stock|is there any|is there|do you have|do you sell|can i get|i want to buy|looking for|tell me about|details of|info on|do you carry|any|what is the price of|price of|price|how much for|how much is|give me|just give me|check|tell me|show me|status of|order|current|number)\b/gi, ' ')
              .replace(/(ची किंमत काय आहे|काय किंमत आहे|भाव काय आहे|दर काय आहे|कीमत क्या है|क्या कीमत है|दाम क्या है|रेट क्या है)/gi, ' ')
              .replace(/[?!.,;]/g, '')
              .trim();
            if (prevClean.length >= 3 && !isGreetingOrConversational(prevClean)) {
              return prevClean.replace(/\s+/g, ' ');
            }
          }
        }
      }

      return isGreetingOrConversational(cleaned) ? '' : cleaned;
    }

    function matchInInventory(inventorySource, rawTarget) {
      if (!inventorySource) return null;
      const itemsList = Array.isArray(inventorySource)
        ? inventorySource
        : Object.entries(inventorySource).map(([k, v]) => (typeof v === 'object' && v !== null ? { name: v.name || k, ...v } : { name: k, stock: v }));

      const normTarget = (typeof normalizeUserQuery === 'function')
        ? (normalizeUserQuery(rawTarget, itemsList) || String(rawTarget || ''))
        : String(rawTarget || '');
      const target = normTarget.toLowerCase().trim();
      if (!target || isGreetingOrConversational(target)) return null;

      const cleanTarget = target.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!cleanTarget || cleanTarget.length < 2) return null;
      const allTokens = cleanTarget.split(' ').filter(w => w.length >= 2);

      // Filter out universal stopwords and unit/packaging stopwords
      const distinctiveTokens = allTokens.filter(tok => !UNIVERSAL_STOPWORDS.has(tok) && (typeof NLU_GRAMMAR_STOPWORDS === 'undefined' || !NLU_GRAMMAR_STOPWORDS.has(tok)));
      const searchTokens = distinctiveTokens.length > 0 ? distinctiveTokens : allTokens;

      // Specific entity tokens: tokens that are NOT generic nouns or pure intent verbs
      const specificTokens = searchTokens.filter(tok => {
        if (GENERIC_PRODUCT_NOUNS.has(tok)) return false;
        const st = typeof nluStemWord === 'function' ? nluStemWord(tok) : tok;
        if (typeof NLU_CONCEPT_GROUPS !== 'undefined') {
          if (NLU_CONCEPT_GROUPS.explore.has(st) || NLU_CONCEPT_GROUPS.money.has(st) || NLU_CONCEPT_GROUPS.procedure.has(st) || NLU_CONCEPT_GROUPS.eligibility.has(st) || NLU_CONCEPT_GROUPS.policyDocs.has(st) || NLU_CONCEPT_GROUPS.contact.has(st)) {
            return false;
          }
          // Also exclude pure plural/singular category nouns ("courses", "programs", "plans", "rooms", "products", "dishes", "vehicles", "properties", "services")
          if (['course', 'program', 'programme', 'stream', 'class', 'subject', 'degree', 'diploma', 'product', 'item', 'shoe', 'sneaker', 'medicine', 'med', 'drug', 'dish', 'food', 'meal', 'menu', 'plan', 'tier', 'subscription', 'room', 'suite', 'stay', 'vehicle', 'car', 'bike', 'model', 'property', 'flat', 'apartment', 'service', 'offering', 'option', 'catalog', 'catalogue', 'inventory'].includes(st)) {
            return false;
          }
        }
        return true;
      });

      // If the query ONLY has generic category/intent words (e.g. "courses details give me", "plan pricing"), DO NOT match a single item!
      if (specificTokens.length === 0) {
        return null;
      }

      // Phase 1: Exact normalized match or safe word-boundary match
      for (const item of itemsList) {
        const name = String(item.name || item.product || item.title || '').toLowerCase().trim();
        const cleanName = name.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

        if (name === target || cleanName === cleanTarget) {
          return item;
        }
        if (cleanTarget.length < 4) {
          const wordRegex = new RegExp('\\b' + cleanTarget.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
          if (wordRegex.test(cleanName)) {
            return item;
          }
          continue;
        }
        if (cleanName.includes(cleanTarget) && cleanTarget.length >= 4) {
          return item;
        }
      }

      // Phase 2: Order-Independent, Typo-Tolerant Fuzzy Token Overlap with Strict Entity Verification
      let best = null;
      let maxScore = 0;

      for (const item of itemsList) {
        const name = String(item.name || item.product || item.title || '').toLowerCase().trim();
        const cleanName = name.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const details = String(item.description || item.dosage || item.composition || item.category || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const nameTokens = cleanName.split(' ').filter(w => w.length >= 2);
        const detailTokens = details.split(' ').filter(w => w.length >= 2);

        let specificNameMatches = 0;
        let specificDetailMatches = 0;
        let strongDetailMatch = false;
        let score = 0;

        for (const qTok of specificTokens) {
          let bestNameQ = 0;
          for (const nTok of nameTokens) {
            const q = (typeof fuzzyTokenMatch === 'function')
              ? fuzzyTokenMatch(qTok, nTok)
              : (nTok === qTok ? 4 : (nTok.includes(qTok) && qTok.length >= 4 ? 3 : 0));
            if (q > bestNameQ) bestNameQ = q;
          }
          if (bestNameQ > 0) {
            specificNameMatches++;
            score += bestNameQ * 3;
          } else {
            let bestDetQ = 0;
            for (const dTok of detailTokens) {
              const q = (typeof fuzzyTokenMatch === 'function')
                ? fuzzyTokenMatch(qTok, dTok)
                : (dTok === qTok ? 4 : (dTok.includes(qTok) && qTok.length >= 4 ? 3 : 0));
              if (q > bestDetQ) bestDetQ = q;
            }
            if (bestDetQ > 0) {
              specificDetailMatches++;
              if ((bestDetQ >= 3 && qTok.length >= 5) || (bestDetQ >= 2 && qTok.length >= 6)) strongDetailMatch = true;
              score += bestDetQ * 2;
            }
          }
        }

        // Entity Guard: Prevent "Augmentin" from matching "Dolo 650", and "Pepperoni" from matching "Margherita"
        if (specificNameMatches === 0 && specificDetailMatches < 2 && !strongDetailMatch) {
          continue;
        }

        // Bonus for secondary context tokens also matching the item name (e.g. "pro plan")
        for (const tok of searchTokens) {
          if (specificTokens.includes(tok)) continue;
          if (nameTokens.some(nTok => (typeof fuzzyTokenMatch === 'function' ? fuzzyTokenMatch(tok, nTok) >= 3 : nTok === tok))) {
            score += 2;
          }
        }

        if (score > maxScore) {
          maxScore = score;
          best = item;
        }
      }

      if (best && maxScore >= 4) {
        return best;
      }

      // Item genuinely not in database -> return null (NO FALSE POSITIVES!)
      return null;
    }

    function formatRealtimeStockResponse(itemData, queryLang = 'en-US', queryText = '') {
      const name = itemData.name || itemData.product || itemData.title || 'The requested item';
      const cleanTitle = name.split(/[\(\n,]/)[0].trim() || name;
      const stock = itemData.stock !== undefined ? itemData.stock : (itemData.quantity !== undefined ? itemData.quantity : null);
      const price = itemData.price ? (typeof itemData.price === 'number' ? `₹${itemData.price}` : String(itemData.price).trim()) : '';
      const currentArchetype = (typeof detectCurrentArchetype === 'function' && typeof agentConfig !== 'undefined') ? detectCurrentArchetype(agentConfig) : 'general';
      const profile = (typeof getArchetypeProfile === 'function')
        ? getArchetypeProfile(currentArchetype)
        : { itemUnit: 'units', priceLabelEn: 'price', priceLabelHi: 'कीमत', priceLabelMr: 'किंमत', defaultDesc: 'high quality offerings and support' };
      const unit = itemData.unit || profile.itemUnit || 'units';
      const rx = itemData.rx || itemData.prescriptionRequired;

      const lowerQ = String(queryText || '').toLowerCase();
      const isPriceQuery = /\b(price|cost|rate|rates|how much|fee|fees|mrp|charges)\b/i.test(lowerQ) || /(किंमत|भाव|दर|कीमत|दाम)/i.test(lowerQ);
      const isStockQuery = /\b(stock|available|quantity|how many|count|units|seats|rooms|portions|slots)\b/i.test(lowerQ) || /(साठा|शिल्लक|स्टॉक|जागा|उपलब्ध)/i.test(lowerQ);
      const isDetailsQuery = /\b(what do you provide|what is provided|what is included|what subjects?|tell me more|features?|details?|syllabus|curriculum|what about|in that|for that|specs|specifications|ingredients)\b/i.test(lowerQ);

      // 0. Specific Details Intent (Adapts to ANY Archetype)
      if (isDetailsQuery) {
        const desc = itemData.description || itemData.dosage || itemData.details || profile.defaultDesc;
        const priceSuffix = price ? ` The ${profile.priceLabelEn} is ${price}.` : '';
        const stockSuffix = (stock !== null && stock > 0) ? ` Currently ${stock} ${unit} are available.` : '';
        if (queryLang === 'mr-IN') {
          return `${cleanTitle} मध्ये आम्ही प्रदान करतो: ${desc}.${price ? ` ${profile.priceLabelMr}: ${price}.` : ''}${stockSuffix ? ` सध्या ${stock} ${unit} उपलब्ध.` : ''}`;
        }
        if (queryLang === 'hi-IN') {
          return `${cleanTitle} में हम प्रदान करते हैं: ${desc}।${price ? ` ${profile.priceLabelHi}: ${price}।` : ''}${stockSuffix ? ` वर्तमान में ${stock} ${unit} उपलब्ध हैं।` : ''}`;
        }
        return `In ${cleanTitle}, we provide: ${desc}.${priceSuffix}${stockSuffix}`;
      }

      // 1. Specific Price Intent
      if (isPriceQuery) {
        if (queryLang === 'mr-IN') {
          return price 
            ? `${cleanTitle} ची ${profile.priceLabelMr} ${price}${unit ? ` प्रति ${unit}` : ''} आहे.${stock !== null && stock > 0 ? ` (सध्या ${stock} ${unit} उपलब्ध).` : ''}`
            : `${cleanTitle} आमच्या डेटाबेसमध्ये उपलब्ध आहे. ताज्या किंमतीसाठी कृपया आमच्याशी संपर्क साधा.`;
        }
        if (queryLang === 'hi-IN') {
          return price 
            ? `${cleanTitle} की ${profile.priceLabelHi} ${price}${unit ? ` प्रति ${unit}` : ''} है।${stock !== null && stock > 0 ? ` (वर्तमान में ${stock} ${unit} उपलब्ध)।` : ''}`
            : `${cleanTitle} हमारे डेटाबेस में उपलब्ध है। नवीनतम कीमत के लिए कृपया संपर्क करें।`;
        }
        return price
          ? `The ${profile.priceLabelEn} for ${cleanTitle} is ${price}${unit ? ` per ${unit}` : ''}.${stock !== null && stock > 0 ? ` (Currently available: ${stock} ${unit}).` : ''}`
          : `${cleanTitle} is listed in our database${stock !== null ? ` with ${stock} ${unit} available` : ''}. Please check with support for live rates.`;
      }

      // 2. Specific Stock / Availability Intent
      if (queryLang === 'mr-IN') {
        if (stock !== null && stock > 0) {
          if (currentArchetype === 'academic') {
            return `${cleanTitle} साठी सध्या प्रवेश सुरू आहेत! आमच्याकडे ${price ? `${price} शुल्कावर ` : ''}${stock} ${unit} उपलब्ध आहेत.`;
          }
          return `${cleanTitle} सध्या उपलब्ध आहे! आमच्याकडे ${stock} ${unit} उपलब्ध आहेत${price ? ` (किंमत: ${price})` : ''}.${rx ? ' (डॉक्टरांचे प्रिस्क्रिप्शन आवश्यक).' : ''}`;
        } else if (stock === 0) {
          return `क्षमस्व, ${cleanTitle} सध्या उपलब्ध नाही. नवीन पर्याय लवकरच उपलब्ध होतील!`;
        }
      }

      if (queryLang === 'hi-IN') {
        if (stock !== null && stock > 0) {
          if (currentArchetype === 'academic') {
            return `${cleanTitle} में वर्तमान में एडमिशन खुले हैं! हमारे पास ${price ? `${price} की फीस पर ` : ''}${stock} ${unit} उपलब्ध हैं।`;
          }
          return `${cleanTitle} वर्तमान में उपलब्ध है! हमारे पास ${stock} ${unit} उपलब्ध हैं${price ? ` (कीमत: ${price})` : ''}।${rx ? ' (डॉक्टर का पर्चा आवश्यक है)।' : ''}`;
        } else if (stock === 0) {
          return `क्षमा करें, ${cleanTitle} अभी उपलब्ध नहीं है। जल्द ही नया स्टॉक उपलब्ध होगा!`;
        }
      }

      // English default (Archetype-Tailored Availability)
      if (stock !== null && stock > 0) {
        if (currentArchetype === 'academic') {
          return `${cleanTitle} admissions are currently open! We have ${stock} ${unit} available${price ? ` at ${price}` : ''}.`;
        }
        if (currentArchetype === 'food') {
          return `${cleanTitle} is freshly available on our menu${price ? ` at ${price}` : ''}!`;
        }
        if (currentArchetype === 'hospitality') {
          return `${cleanTitle} is available for booking at ${price || 'standard rates'}! We have ${stock} ${unit} open.`;
        }
        if (currentArchetype === 'saas') {
          return `${cleanTitle} is active and available${price ? ` starting from ${price}` : ''}.`;
        }
        if (currentArchetype === 'automotive') {
          return `${cleanTitle} is available in our showroom starting from ${price}! We have ${stock} ${unit} ready for immediate booking or test drive.`;
        }
        return `${cleanTitle} is currently available in stock! We have ${stock} ${unit} available${price ? ` at ${price} each` : ''}.${rx ? ' Please note a valid doctor prescription is required.' : ''}`;
      } else if (stock === 0) {
        if (currentArchetype === 'academic') {
          return `We are sorry, but seats for ${cleanTitle} are currently filled for this session.`;
        }
        return `I'm sorry, ${cleanTitle} is currently out of stock. We can notify you once new inventory arrives!`;
      }

      if (itemData.message) return itemData.message;
      return `${cleanTitle} is available on our website.${price ? ` Price: ${price}.` : ''}`;
    }

    // --- REAL-TIME LIVE WEBSITE DATABASE BRIDGE ---
    async function resolveDatabaseBridge(query, agentConfig, context = null) {
      if (!query || isGreetingOrConversational(query)) {
        return null; // NEVER query database for standalone conversational greetings or small talk!
      }

      const strippedQuery = stripLeadingGreeting(query) || String(query).trim();
      const liveCatalog = getAllCatalogItems(agentConfig);
      const effectiveQuery = (typeof normalizeUserQuery === 'function')
        ? (normalizeUserQuery(strippedQuery, liveCatalog, agentConfig?.knowledgeBase) || strippedQuery)
        : strippedQuery;
      const isList = isCatalogListQuery(effectiveQuery);
      const isNav = isSectionNavigationQuery(effectiveQuery);
      const isPriceOverview = isGeneralPriceOrOverviewQuery(effectiveQuery);

      // 0. Ordinal Reference Selection (e.g. "tell me about the first one", "2nd one", "secnd one", "last one")
      if (context && Array.isArray(context.lastDisplayedItems) && context.lastDisplayedItems.length > 0) {
        const ordItem = resolveOrdinalFromList(effectiveQuery, context.lastDisplayedItems);
        if (ordItem) {
          context.activeItem = ordItem;
          context.turnCount = (context.turnCount || 0) + 1;
          return {
            status: 'FOUND_IN_HOST_STATE',
            item: ordItem.name || ordItem.title || effectiveQuery,
            data: ordItem
          };
        }
      }

      // 0.15 Explicit Form, Section & Route Navigation FIRST (e.g. "take me to admission form", "scroll to fee structure", "open checkout")
      if (isNav) {
        const exactTarget = resolveExactRedirectTarget(effectiveQuery, agentConfig?.siteBlueprint) || findHostSection(effectiveQuery);
        if (exactTarget) {
          return {
            status: 'NAVIGATE_SECTION',
            item: exactTarget.label || 'section',
            data: exactTarget
          };
        }
      }

      // 0.25 Specific Item Fuzzy Match (typo-tolerant & word-order-independent: "fess for scince 11th", "cost pro plan how much", "paracetmol avilable")
      // Generic-only queries ("courses details give me", "fess structre", "plan details") return null here and flow cleanly to Price Overview / Catalog List!
      if (liveCatalog.length > 0) {
        const directFuzzyMatch = matchInInventory(liveCatalog, effectiveQuery);
        if (directFuzzyMatch) {
          if (context) {
            context.activeItem = directFuzzyMatch;
            context.turnCount = (context.turnCount || 0) + 1;
          }
          return {
            status: 'FOUND_IN_HOST_STATE',
            item: directFuzzyMatch.name || effectiveQuery,
            data: directFuzzyMatch
          };
        }
      }

      // 0.5 General Pricing / Fee Structure Overview (e.g. "fess structre", "how much do i have to pay?", "pricing", "room rates", "menu prices")
      if (isPriceOverview) {
        return {
          status: 'FOUND_PRICE_OVERVIEW',
          item: 'pricing',
          data: liveCatalog
        };
      }

      // 1. Handle Catalog List query (e.g. "wat cources u prvide", "courses details give me", "what do you teach here?", "show menu", "what products do you sell")
      if (isList) {
        const allItems = [...liveCatalog];
        const scriptEl = getWidgetScript();
        const dbEndpoint = agentConfig?.databaseHookUrl || (scriptEl && scriptEl.getAttribute('data-database-url')) || (scriptEl && scriptEl.getAttribute('data-api-endpoint')) || agentConfig?.apiEndpoint;
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

      // 2. Fallback Section Navigation if no explicit target matched above
      if (isNav) {
        return {
          status: 'NAVIGATE_SECTION',
          item: 'section',
          data: null
        };
      }

      const targetItem = extractTargetItem(query, conversationHistory, context);

      // 3. Search all catalog sources (Live DOM Scraper, Host JS State, Firestore records, Webhooks)
      // Tier 1: Live DOM Table & Card Scraper (Direct access to webpage data)
      if (typeof document !== 'undefined') {
        const domItems = getAllCatalogItems(agentConfig);
        if (domItems.length > 0) {
          const match = matchInInventory(domItems, targetItem || query);
          if (match) {
            if (context) {
              context.activeItem = match;
              context.turnCount = (context.turnCount || 0) + 1;
            }
            return {
              status: 'FOUND_IN_HOST_STATE',
              item: targetItem,
              data: match
            };
          }
        }
      }

      // Tier 2: Host Page JavaScript State (window.EchoAIData / window.products / window.inventory)
      if (typeof window !== 'undefined') {
        const hostObj = window.EchoAIData || window.echoLiveInventory || window.EchoInventory || window.productsData || window.catalogData;
        if (hostObj) {
          if (typeof hostObj.queryDatabase === 'function') {
            try {
              const hostResult = await hostObj.queryDatabase(query);
              if (hostResult) {
                if (context) {
                  context.activeItem = hostResult;
                  context.turnCount = (context.turnCount || 0) + 1;
                }
                return { status: 'FOUND_IN_HOST_STATE', item: targetItem, data: hostResult };
              }
            } catch (err) {}
          }
          const inv = hostObj.inventory || hostObj.liveInventory || hostObj.products || hostObj.database || hostObj.items || hostObj.catalog || hostObj.menu;
          if (inv) {
            const match = matchInInventory(inv, targetItem || query);
            if (match) {
              if (context) {
                context.activeItem = match;
                context.turnCount = (context.turnCount || 0) + 1;
              }
              return { status: 'FOUND_IN_HOST_STATE', item: targetItem, data: match };
            }
          }
        }
        if (Array.isArray(window.products)) {
          const match = matchInInventory(window.products, targetItem || query);
          if (match) {
            if (context) {
              context.activeItem = match;
              context.turnCount = (context.turnCount || 0) + 1;
            }
            return { status: 'FOUND_IN_HOST_STATE', item: targetItem, data: match };
          }
        }
        if (Array.isArray(window.inventory)) {
          const match = matchInInventory(window.inventory, targetItem || query);
          if (match) {
            if (context) {
              context.activeItem = match;
              context.turnCount = (context.turnCount || 0) + 1;
            }
            return { status: 'FOUND_IN_HOST_STATE', item: targetItem, data: match };
          }
        }
        if (Array.isArray(window.catalog)) {
          const match = matchInInventory(window.catalog, targetItem || query);
          if (match) {
            if (context) {
              context.activeItem = match;
              context.turnCount = (context.turnCount || 0) + 1;
            }
            return { status: 'FOUND_IN_HOST_STATE', item: targetItem, data: match };
          }
        }
      }

      // Tier 3: Agent's Structured Database Records from Firestore
      if (agentConfig && Array.isArray(agentConfig.databaseRecords) && agentConfig.databaseRecords.length > 0) {
        const match = matchInInventory(agentConfig.databaseRecords, targetItem || query);
        if (match) {
          if (context) {
            context.activeItem = match;
            context.turnCount = (context.turnCount || 0) + 1;
          }
          return {
            status: 'FOUND_IN_HOST_STATE',
            item: targetItem,
            data: match
          };
        }
      }

      // Helper to parse Firestore REST documents
      function parseFirestoreFields(fields) {
        if (!fields || typeof fields !== 'object') return {};
        const res = {};
        for (const [key, val] of Object.entries(fields)) {
          if (!val || typeof val !== 'object') {
            res[key] = val;
            continue;
          }
          if ('stringValue' in val) res[key] = val.stringValue;
          else if ('integerValue' in val) res[key] = parseInt(val.integerValue, 10);
          else if ('doubleValue' in val) res[key] = parseFloat(val.doubleValue);
          else if ('booleanValue' in val) res[key] = val.booleanValue;
          else if ('timestampValue' in val) res[key] = val.timestampValue;
          else if ('nullValue' in val) res[key] = null;
          else if ('mapValue' in val) res[key] = parseFirestoreFields(val.mapValue.fields);
          else res[key] = Object.values(val)[0];
        }
        return res;
      }

      // Tier 3.5: Live External Database Bridge (Parallelized via Promise.allSettled: max ~1.8s instead of 22.5s!)
      if (agentConfig && agentConfig.databaseConfig) {
        const dbConf = agentConfig.databaseConfig;
        if (dbConf.type === 'firebase' && dbConf.projectId && targetItem) {
          try {
            const probeCollections = ['products', 'inventory', 'medicines', 'items', 'catalog', 'services', 'menu', 'store', 'shop'];
            const targetLower = targetItem.toLowerCase();
            const settled = await Promise.allSettled(
              probeCollections.map(async (col) => {
                const url = `https://firestore.googleapis.com/v1/projects/${dbConf.projectId}/databases/(default)/documents/${col}${dbConf.apiKey ? `?key=${dbConf.apiKey}` : ''}`;
                const res = await fetch(url, { signal: AbortSignal.timeout(1800) });
                if (!res.ok) return null;
                const data = await res.json();
                if (data && Array.isArray(data.documents)) {
                  const flatDocs = data.documents.map(doc => parseFirestoreFields(doc.fields));
                  const matched = matchInInventory(flatDocs, targetItem) || matchInInventory(flatDocs, strippedQuery);
                  if (matched) return matched;
                  for (const flat of flatDocs) {
                    if (flat.name && (flat.name.toLowerCase().includes(targetLower) || targetLower.includes(flat.name.toLowerCase()))) {
                      return flat;
                    }
                  }
                }
                return null;
              })
            );
            for (const outcome of settled) {
              if (outcome.status === 'fulfilled' && outcome.value) {
                return {
                  status: 'FOUND_IN_LIVE_API',
                  item: targetItem,
                  data: outcome.value
                };
              }
            }
          } catch (e) {
            // Ignore live Firestore probe error
          }
        } else if (dbConf.type === 'supabase' && dbConf.supabaseUrl && dbConf.supabaseKey && targetItem) {
          try {
            const probeTables = ['products', 'inventory', 'medicines', 'items', 'catalog', 'services', 'menu'];
            const settled = await Promise.allSettled(
              probeTables.map(async (tbl) => {
                const url = `${dbConf.supabaseUrl}/rest/v1/${tbl}?name=ilike.*${encodeURIComponent(targetItem)}*&limit=1`;
                const res = await fetch(url, {
                  headers: {
                    'apikey': dbConf.supabaseKey,
                    'Authorization': `Bearer ${dbConf.supabaseKey}`
                  },
                  signal: AbortSignal.timeout(1800)
                });
                if (!res.ok) return null;
                const rows = await res.json();
                return Array.isArray(rows) && rows[0] ? rows[0] : null;
              })
            );
            for (const outcome of settled) {
              if (outcome.status === 'fulfilled' && outcome.value) {
                return {
                  status: 'FOUND_IN_LIVE_API',
                  item: targetItem,
                  data: outcome.value
                };
              }
            }
          } catch (e) {
            // Ignore live Supabase probe error
          }
        }
      }

      // Tier 4: Live API / Webhook (data-database-url / databaseHookUrl)
      const scriptEl = getWidgetScript();
      const apiEndpoint = (scriptEl && (scriptEl.getAttribute('data-database-url') || scriptEl.getAttribute('data-api-endpoint'))) ||
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

      // 4. Check if query is looking for a specific item that is genuinely NOT in the database
      // NEVER trigger ITEM_NOT_FOUND for general policy/process questions ("eligibility", "return policy", "delivery", "scholarship") or affirmations ("yes", "more")
      const lower = effectiveQuery.toLowerCase();
      const isDynamic = isDynamicDataQuery(effectiveQuery) ||
                        /\b(do you have|is there any|price of|cost of|stock of|available|check)\b/i.test(lower) ||
                        /(साठा|स्टॉक|उपलब्ध|शिल्लक|किंमत|भाव|दर|कीमत|दाम)/i.test(effectiveQuery);

      const cleanTargetCheck = String(targetItem || '').toLowerCase()
        .replace(/\b(the|a|an|is|are|for|of|in|on|at|to|your|our|any|some|price|cost|fee|fees|structure|rate|rates|stock|available|availability|details|info|information|check|status|list|all|more)\b/gi, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();

      if (isDynamic && !isPolicyOrProcessQuery(effectiveQuery) && !isAffirmationOrMoreQuery(effectiveQuery) && cleanTargetCheck.length >= 2) {
        return {
          status: 'ITEM_NOT_FOUND',
          item: targetItem || effectiveQuery,
          data: null
        };
      }

      // 5. Host Page Knowledge Query (Contact, Address, Phone, Email, Hours, Services)
      const hostKnowledge = extractHostPageKnowledge();
      if (/\b(location|address|where are you|where is the (store|shop|clinic|office)|directions|map)\b/i.test(lower) || /(कुठे आहे|पत्ता|स्थान|कहाँ है|पता)/i.test(query)) {
        if (hostKnowledge.address) {
          return { status: 'HOST_KNOWLEDGE_QUERY', topic: 'location', data: hostKnowledge };
        }
      }
      if (/\b(phone|phone number|call|contact number|mobile|telephone)\b/i.test(lower) || /(फोन|नंबर|कॉल)/i.test(query)) {
        if (hostKnowledge.phone) {
          return { status: 'HOST_KNOWLEDGE_QUERY', topic: 'phone', data: hostKnowledge };
        }
      }
      if (/\b(email|mail|write to you|contact email)\b/i.test(lower) || /(ईमेल|मेल)/i.test(query)) {
        if (hostKnowledge.email) {
          return { status: 'HOST_KNOWLEDGE_QUERY', topic: 'email', data: hostKnowledge };
        }
      }
      if (/\b(hours|timings|opening hours|working hours|when do you open|closing time|schedule)\b/i.test(lower) || /(वेळ|वेळापत्रक|समय|कब खुलता)/i.test(query)) {
        if (hostKnowledge.hours) {
          return { status: 'HOST_KNOWLEDGE_QUERY', topic: 'hours', data: hostKnowledge };
        }
      }
      if (/\b(services|what do you do|what services|specialties|offerings)\b/i.test(lower) || /(सेवा|सुविधा)/i.test(query)) {
        if (hostKnowledge.services.length > 0 || hostKnowledge.metaDesc) {
          return { status: 'HOST_KNOWLEDGE_QUERY', topic: 'services', data: hostKnowledge };
        }
      }

      return { status: 'NOT_DYNAMIC_QUERY', item: null, data: null };
    }

    // --- STRICT LIVE CUSTOMER SUPPORT SYSTEM PROMPT BUILDER ---
    function buildCustomerSystemPrompt(agentConfig, bridgeResult, queryLang = 'en-US', context = null) {
      const businessName = agentConfig.businessName || agentConfig.companyName || agentConfig.name || 'our store';
      const rawKb = agentConfig.knowledgeBase || [];
      const cleanFaqs = rawKb.filter(item => isCustomerSafeFaq(item.q, item.a)).slice(0, 25);
      const cleanFaqBlock = cleanFaqs.length > 0
        ? cleanFaqs.map(k => `Q: ${k.q}\nA: ${k.a}`).join('\n\n')
        : 'General customer support assistance.';

      let bridgeBlock = '';
      if (bridgeResult && (bridgeResult.status === 'FOUND_IN_HOST_STATE' || bridgeResult.status === 'FOUND_IN_LIVE_API')) {
        const item = bridgeResult.data;
        bridgeBlock = `STATUS: FOUND_IN_DATABASE
ITEM_NAME: ${item.name || 'Unknown'}
PRICE: ${item.price || 'Not listed'}
STOCK: ${item.stock !== undefined && item.stock !== null ? item.stock : 'Available'} ${item.unit || 'units'}
DETAILS: ${item.composition || item.details || item.dosage || item.description || 'Standard item'}
PRESCRIPTION_REQUIRED: ${item.rx ? 'Yes' : 'No'}`;
      } else if (bridgeResult && bridgeResult.status === 'FOUND_CATALOG_LIST') {
        bridgeBlock = `STATUS: FOUND_CATALOG_LIST
ITEMS_COUNT: ${Array.isArray(bridgeResult.data) ? bridgeResult.data.length : 0}
SAMPLE_ITEMS: ${JSON.stringify((bridgeResult.data || []).slice(0, 8))}`;
      } else if (bridgeResult && bridgeResult.status === 'FOUND_PRICE_OVERVIEW') {
        bridgeBlock = `STATUS: FOUND_PRICE_OVERVIEW
ITEMS_WITH_PRICES: ${JSON.stringify((bridgeResult.data || []).slice(0, 10).map(i => ({ name: i.name, price: i.price || 'On request', stock: i.stock })))}`;
      } else if (bridgeResult && bridgeResult.status === 'NAVIGATE_SECTION') {
        const target = bridgeResult.data || {};
        bridgeBlock = `STATUS: NAVIGATE_SECTION
TARGET_TYPE: ${target.targetType || 'section'}
TARGET_LABEL: ${target.label || 'Target section'}
IS_CROSS_PAGE: ${target.isCrossPage ? 'Yes' : 'No'}
REDIRECT_URL: ${target.redirectUrl || target.href || 'Current page section'}${Array.isArray(target.fields) && target.fields.length > 0 ? `\nFORM_FIELDS: ${target.fields.join(', ')}` : ''}`;
      } else if (bridgeResult && bridgeResult.topic) {
        bridgeBlock = `STATUS: HOST_KNOWLEDGE_QUERY
TOPIC: ${bridgeResult.topic}
DETAILS: ${JSON.stringify(bridgeResult.data)}`;
      } else if (bridgeResult && bridgeResult.status === 'ITEM_NOT_FOUND') {
        bridgeBlock = `STATUS: ITEM_NOT_FOUND
REQUESTED_ITEM: "${bridgeResult.item || 'The requested item'}"`;
      } else {
        bridgeBlock = `STATUS: NO_SPECIFIC_ITEM_FILTER`;
      }

      // Active Multi-Turn Conversation Context (Active Item + Last Displayed List + Active Topic)
      const activeContextLines = [];
      if (context && context.activeItem) {
        const it = context.activeItem;
        activeContextLines.push(`CURRENTLY_DISCUSSED_ITEM: "${it.name || 'Current Item'}"`);
        activeContextLines.push(`PRICE: "${it.price || 'Available on request'}"`);
        activeContextLines.push(`SEATS_OR_STOCK: "${it.stock !== undefined && it.stock !== null ? it.stock : 'Available'} ${it.unit || 'units'}"`);
        activeContextLines.push(`DESCRIPTION_AND_DETAILS: "${it.description || it.dosage || it.details || 'Standard offering'}"`);
      }
      if (context && Array.isArray(context.lastDisplayedItems) && context.lastDisplayedItems.length > 0) {
        activeContextLines.push(`LAST_DISPLAYED_LIST: ${context.lastDisplayedItems.slice(0, 6).map((x, idx) => `${idx + 1}. ${x.name}${x.price ? ` (${x.price})` : ''}`).join(', ')}`);
      }
      if (context && context.activeTopic) {
        activeContextLines.push(`ACTIVE_TOPIC: "${context.activeTopic}"`);
      }
      const activeContextBlock = activeContextLines.length > 0
        ? `\n[ACTIVE_CONVERSATION_CONTEXT]\n${activeContextLines.join('\n')}\nNOTE: If the customer asks a follow-up ("what do you provide in that", "the first one", "fees", "yes", "tell me more", "how to apply/order"), resolve it directly from this context and NEVER ask a generic welcome prompt!\n`
        : '';

      let langDirective = 'Speak in clear, natural English.';
      if (queryLang === 'mr-IN') {
        langDirective = 'Reply strictly in natural, polite Marathi (मराठी).';
      } else if (queryLang === 'hi-IN') {
        langDirective = 'Reply strictly in natural, polite Hindi (हिंदी).';
      }

      const hostKnowledge = extractHostPageKnowledge();
      const hostContextBlock = [
        hostKnowledge.businessName ? `Business: ${hostKnowledge.businessName}` : '',
        hostKnowledge.metaDesc ? `About: ${hostKnowledge.metaDesc}` : '',
        hostKnowledge.phone ? `Phone: ${hostKnowledge.phone}` : '',
        hostKnowledge.email ? `Email: ${hostKnowledge.email}` : '',
        hostKnowledge.address ? `Address: ${hostKnowledge.address}` : '',
        hostKnowledge.hours ? `Hours: ${hostKnowledge.hours}` : '',
        hostKnowledge.services.length > 0 ? `Key Services: ${hostKnowledge.services.join(', ')}` : ''
      ].filter(Boolean).join('\n');

      const rawDbRecords = (agentConfig && Array.isArray(agentConfig.databaseRecords) && agentConfig.databaseRecords.length > 0)
        ? agentConfig.databaseRecords.filter(r => r && isValidCustomerCatalogName(r.name || r.title || r.product, r))
        : [];
      const allDbRecords = rawDbRecords.length > 0 ? rawDbRecords : getAllCatalogItems(agentConfig);
      const catalogSummary = allDbRecords.slice(0, 30).map(r => `${r.name}${r.price ? ` (${r.price})` : ''}${r.stock !== null && r.stock !== undefined ? ` [${r.stock} ${r.unit || 'units'} in stock]` : ''}`).join('; ');

      const liveDbBlock = (agentConfig && agentConfig.databaseConfig)
        ? `[LIVE_DATABASE_INTEGRATION]\nCONNECTED_PROVIDER: ${agentConfig.databaseProvider || agentConfig.databaseConfig.type || 'Cloud Database'}\nPROJECT: ${agentConfig.databaseConfig.projectId || agentConfig.databaseConfig.supabaseUrl || 'Connected'}\nAUTHORITY: You have direct real-time database access using the store's verified database credentials.\n\n`
        : '';

      const currentArch = detectCurrentArchetype(agentConfig);
      const profile = getArchetypeProfile(currentArch);
      const roleDescription = `${profile.roleDesc} for ${businessName}`;
      const audienceDescription = profile.audience;
      const consumerDeclineText = `"I can help you with our ${profile.nounEn}. How can I assist you with our catalog today?"`;
      const catalogSectionLabel = profile.catalogLabel;

      const bp = agentConfig?.siteBlueprint || null;
      const blueprintLines = [];
      if (bp) {
        if (bp.roleSummary) blueprintLines.push(`WEBSITE_ROLE: ${bp.roleSummary}`);
        if (Array.isArray(bp.workflows) && bp.workflows.length > 0) {
          if (bp.workflows[0]?.steps) {
            bp.workflows.slice(0, 4).forEach(w => {
              const stepsStr = Array.isArray(w.steps) ? w.steps.map(s => s.detail || s.title).filter(Boolean).join(' -> ') : '';
              blueprintLines.push(`WORKFLOW (${w.name}): ${stepsStr}`);
            });
          } else {
            const flatSteps = bp.workflows.slice(0, 6).map((w, i) => `${w.step || i + 1}. ${w.title}${w.action ? ` (${w.action})` : ''}`).join(' -> ');
            blueprintLines.push(`CUSTOMER_WORKFLOW: ${flatSteps}`);
          }
        }
        if (Array.isArray(bp.forms) && bp.forms.length > 0) {
          bp.forms.slice(0, 6).forEach(f => {
            const fNames = Array.isArray(f.fields)
              ? f.fields.map(fl => (typeof fl === 'string' ? fl : (fl?.label || fl?.name || ''))).filter(Boolean).slice(0, 6).join(', ')
              : '';
            blueprintLines.push(`FORM: "${f.title}" at ${f.href || f.path || '#'} (Submit: "${f.submitLabel || 'Submit'}")${fNames ? ` | Fields: ${fNames}` : ''}`);
          });
        }
        if (Array.isArray(bp.sections) && bp.sections.length > 0) {
          blueprintLines.push(`SECTIONS: ${bp.sections.slice(0, 10).map(s => `${s.label} (${s.href || '#' + s.id})`).join(', ')}`);
        }
        if (Array.isArray(bp.routes) && bp.routes.length > 0) {
          blueprintLines.push(`PAGES: ${bp.routes.slice(0, 10).map(r => `${r.label} (${r.path})`).join(', ')}`);
        }
      }
      const blueprintBlock = blueprintLines.length > 0
        ? `\n[WEBSITE_WORKFLOW_AND_NAVIGATION_BLUEPRINT]\n${blueprintLines.join('\n')}\n`
        : '';

      return `You are the official live customer support voice & chat assistant embedded on ${businessName}'s website (${roleDescription}), trained like Flipkart and Amazon customer support specialists with high accuracy, deep database grounding, and fast conversational etiquette. You are speaking directly to a visitor browsing the website.
CRITICAL RULES:
- NEVER ask the user how to implement code, configure APIs, set up webhooks, or provide database schemas. You are already live in production.
- AUDIENCE IS CONSUMER / CUSTOMER ONLY: You are speaking to ${audienceDescription}, NOT developers. Only answer user questions (${profile.topicsList}). NEVER mention technical details, setup guides, Apps Script, toolbars, CSS/responsive specs, database schemas, SQL, or developer notes. If asked about database internals or queries, politely decline: ${consumerDeclineText}
- WARM, POLITE & WELL-MANNERED TONE: Always respond with genuine warmth, courtesy, and respect (e.g., "I would be happy to help!", "Certainly!", "Please let me know if you'd like any further details!"). Keep answers crisp, helpful, and focused strictly on what the visitor actually needs.
- STRICT DOMAIN LOCK: You are exclusively the live support assistant for ${businessName}. You must NEVER reference other businesses, car companies, pharmacies, or unrelated websites.
- CONVERSATION CONTINUITY: If the customer asks a follow-up question (e.g. "what do you provide in that", "fees for this", "details", "how to apply/order"), use [ACTIVE_CONVERSATION_CONTEXT] to answer specifically for that item without asking what they mean.
- EXACT FORM & SECTION REDIRECTION: When [LIVE_BRIDGE_DATA] has STATUS: NAVIGATE_SECTION, confirm you are taking the visitor directly to that exact form, section, or page (mention key fields if it is a form). When asked how to apply/order/book/register, guide them using [WEBSITE_WORKFLOW_AND_NAVIGATION_BLUEPRINT].
- Answer strictly using the injected [LIVE_BRIDGE_DATA], ${catalogSectionLabel}, [ACTIVE_CONVERSATION_CONTEXT], [WEBSITE_WORKFLOW_AND_NAVIGATION_BLUEPRINT], [LIVE_HOST_WEBSITE_CONTEXT], and [CLEAN_CUSTOMER_FAQ_KB] provided below with zero hallucination.
- If [LIVE_BRIDGE_DATA] contains STATUS: FOUND_IN_DATABASE or exact stock, price, order status, or availability, state the exact details directly, naturally, and concisely in 1-2 spoken-friendly sentences.
- If [LIVE_BRIDGE_DATA] returns STATUS: FOUND_CATALOG_LIST, summarize available items concisely in 1-2 sentences and confirm you have opened them.
- If [LIVE_BRIDGE_DATA] returns STATUS: ITEM_NOT_FOUND, politely inform the visitor that the requested item is not currently listed, mention available options if present, and offer guidance.
- Keep responses plain-text, conversational, professional, and under 35 words so Web Speech API TTS reads them smoothly without reading markdown symbols (*, #, \`).
- LANGUAGE: ${langDirective}

${liveDbBlock}[LIVE_BRIDGE_DATA]
${bridgeBlock}
${activeContextBlock}${blueprintBlock}
${catalogSectionLabel}
${catalogSummary || 'Catalog empty or not loaded.'}

[LIVE_HOST_WEBSITE_CONTEXT]
${hostContextBlock || 'Customer website live interface.'}

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

        // Keep responses concise (up to 75 words) and trim cleanly at a sentence boundary
        const words = cleaned.split(' ');
        if (words.length > 75) {
          const sliced = words.slice(0, 75).join(' ');
          const lastEnd = Math.max(sliced.lastIndexOf('.'), sliced.lastIndexOf('!'), sliced.lastIndexOf('?'), sliced.lastIndexOf('।'));
          cleaned = lastEnd > 40 ? sliced.slice(0, lastEnd + 1) : (sliced + '.');
        }
        return cleaned;
      }

      try {
        // 1. Groq Provider (gsk_...) - High-speed enterprise inference (<200ms) with automatic fallback
        if (trimmedKey.startsWith('gsk_')) {
          let targetModel = 'llama-3.1-8b-instant';
          if (model) {
            const m = String(model).toLowerCase();
            if (m.includes('70b')) targetModel = 'llama-3.3-70b-versatile';
            else if (m.includes('mixtral')) targetModel = 'mixtral-8x7b-32768';
            else if (m.startsWith('llama-') || m.startsWith('mixtral-') || m.startsWith('gemma')) targetModel = model;
          }
          const historySlice = conversationHistory.slice(-8);
          const messagesPayload = [
            { role: 'system', content: systemPrompt },
            ...historySlice.map(m => ({
              role: (m.role === 'assistant' || m.role === 'agent') ? 'assistant' : 'user',
              content: m.content || m.text || ''
            }))
          ];
          const lastMsg = historySlice[historySlice.length - 1];
          if (!lastMsg || (lastMsg.content !== cleanUser && lastMsg.text !== cleanUser)) {
            messagesPayload.push({ role: 'user', content: cleanUser });
          }

          const groqCandidates = targetModel === 'llama-3.1-8b-instant'
            ? ['llama-3.1-8b-instant']
            : [targetModel, 'llama-3.1-8b-instant'];

          for (let gIdx = 0; gIdx < groqCandidates.length; gIdx++) {
            const gModel = groqCandidates[gIdx];
            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${trimmedKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: gModel,
                messages: messagesPayload,
                temperature: 0.2,
                max_tokens: 220
              }),
              signal: AbortSignal.timeout(gIdx === 0 ? 5500 : 4000)
            });

            if (groqRes.ok) {
              const data = await groqRes.json();
              const content = data.choices?.[0]?.message?.content;
              if (content) return sanitizeSpokenOutput(content);
            } else if (![400, 404, 429].includes(groqRes.status)) {
              break;
            }
          }
        }

        // 2. Google Gemini Provider (AIza...) with automatic model fallback
        if (trimmedKey.startsWith('AIza')) {
          let geminiModel = 'gemini-2.5-flash';
          if (model) {
            const m = String(model).toLowerCase();
            if (m.includes('1.5')) geminiModel = 'gemini-1.5-flash';
            else if (m.startsWith('gemini-')) geminiModel = model;
          }

          const geminiHistory = conversationHistory.slice(-8);
          const contents = geminiHistory.map(m => ({
            role: (m.role === 'assistant' || m.role === 'agent') ? 'model' : 'user',
            parts: [{ text: m.content || m.text || '' }]
          }));
          const lastGemini = geminiHistory[geminiHistory.length - 1];
          if (!lastGemini || (lastGemini.content !== cleanUser && lastGemini.text !== cleanUser)) {
            contents.push({ role: 'user', parts: [{ text: cleanUser }] });
          }

          const geminiCandidates = Array.from(new Set([geminiModel, 'gemini-2.0-flash', 'gemini-1.5-flash']));
          for (let gIdx = 0; gIdx < geminiCandidates.length; gIdx++) {
            const gModel = geminiCandidates[gIdx];
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${gModel}:generateContent?key=${trimmedKey}`;
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
                  maxOutputTokens: 220
                }
              }),
              signal: AbortSignal.timeout(gIdx === 0 ? 5500 : 4000)
            });

            if (geminiRes.ok) {
              const data = await geminiRes.json();
              const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (candidateText) return sanitizeSpokenOutput(candidateText);
            } else {
              console.warn('[Echo AI BYOK] Gemini API error status:', geminiRes.status, 'for model:', gModel);
              if (![400, 404, 429].includes(geminiRes.status)) break;
            }
          }
        }

        // 3. OpenAI / Compatible Provider (sk-...)
        if (trimmedKey.startsWith('sk-')) {
          const openAiHistory = conversationHistory.slice(-8);
          const openAiMessages = [
            { role: 'system', content: systemPrompt },
            ...openAiHistory.map(m => ({
              role: (m.role === 'assistant' || m.role === 'agent') ? 'assistant' : 'user',
              content: m.content || m.text || ''
            }))
          ];
          const lastOpenAi = openAiHistory[openAiHistory.length - 1];
          if (!lastOpenAi || (lastOpenAi.content !== cleanUser && lastOpenAi.text !== cleanUser)) {
            openAiMessages.push({ role: 'user', content: cleanUser });
          }

          const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${trimmedKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: model || 'gpt-4o-mini',
              messages: openAiMessages,
              temperature: 0.3,
              max_tokens: 150
            }),
            signal: AbortSignal.timeout(8000)
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

    // Autonomous Zero-API-Key Local Reasoning Engine with Conversational Memory & Context
    async function inferLocalAgentResponse(userText, bridgeResult = null, history = [], context = null) {
      const text = userText.trim();
      const queryLang = detectTextLanguage(text);

      // 0. Immediate STANDALONE Greeting, Gratitude & Farewell Handler (English, Hindi, Marathi)
      // Never triggers when user writes a greeting followed by an actual question (e.g. "hey i want know about the courses")
      if (isGreetingOrConversational(text)) {
        const lowerRaw = text.toLowerCase();
        if (/\b(thank\s*you|thanks|thx|ty|dhanyavad|dhanyavaad|aabhar|shukriya)\b/i.test(lowerRaw) || /(धन्यवाद|आभार|शुक्रिया)/i.test(text)) {
          if (queryLang === 'mr-IN') return 'आपले मनःपूर्वक स्वागत आहे! मी आपल्याला आणखी काही मदत करू शकतो का?';
          if (queryLang === 'hi-IN') return 'आपका बहुत-बहुत स्वागत है! क्या मैं आपकी किसी अन्य चीज़ में सहायता कर सकता हूँ?';
          return "You're very welcome! Let me know if there's anything else I can help you with.";
        }
        if (/\b(bye+|goodbye|see\s+you|take\s+care|alvida)\b/i.test(lowerRaw) || /(अलविदा|बाय)/i.test(text)) {
          if (queryLang === 'mr-IN') return 'धन्यवाद! काळजी घ्या आणि आपला दिवस चांगला जावो.';
          if (queryLang === 'hi-IN') return 'धन्यवाद! आपका दिन शुभ हो, फिर मिलेंगे।';
          return 'Goodbye! Have a great day, and feel free to reach out anytime.';
        }

        const currentArchetype = detectCurrentArchetype(agentConfig);
        const profile = getArchetypeProfile(currentArchetype);

        if (queryLang === 'mr-IN') {
          return `नमस्कार! मी ${agentConfig.name} आहे. मी आज आपल्याला ${profile.nounMr}बद्दल कशी मदत करू शकतो?`;
        } else if (queryLang === 'hi-IN') {
          return `नमस्ते! मैं ${agentConfig.name} हूँ। मैं आज आपकी ${profile.nounHi} में क्या सहायता कर सकता हूँ?`;
        } else {
          return `Hello! Welcome to ${agentConfig.name}. How can I assist you with ${profile.nounEn} today?`;
        }
      }

      const strippedForLocal = stripLeadingGreeting(text) || text;
      const liveItemsForNorm = getAllCatalogItems(agentConfig);
      const effectiveText = (typeof normalizeUserQuery === 'function')
        ? (normalizeUserQuery(strippedForLocal, liveItemsForNorm, agentConfig?.knowledgeBase) || strippedForLocal)
        : strippedForLocal;
      const lower = effectiveText.toLowerCase();
      const cleanWords = lower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
      const stopWords = new Set(['the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'are', 'what', 'which', 'your', 'about', 'can', 'you', 'want', 'know', 'tell', 'give', 'please', 'does', 'will', 'would', 'could', 'there', 'provide', 'offer', 'hey', 'hello', 'just', 'some', 'more', 'here', 'need', 'how']);
      const meaningfulWords = cleanWords.filter(w => !stopWords.has(w));
      const stemWord = (w) => {
        if (!w || w.length <= 3) return w;
        if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
        if (w.endsWith('es') && w.length > 4 && /(ch|sh|x|z|o|ss)es$/.test(w)) return w.slice(0, -2);
        if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
        return w;
      };
      const stemmedWords = meaningfulWords.map(stemWord);
      const currentArchetype = detectCurrentArchetype(agentConfig);
      const profile = getArchetypeProfile(currentArchetype);
      const intentConcepts = (typeof classifyIntentConcepts === 'function') ? classifyIntentConcepts(lower) : {};

      // Helper to search KB + Host Page Snippets for a grounded answer (Typo-Tolerant & Word-Order-Independent)
      const findGroundedKbOrSnippet = (extraTerms = '') => {
        const hostK = extractHostPageKnowledge();
        const combinedKb = [...(agentConfig.knowledgeBase || []), ...hostK.faqs].filter(item => isCustomerSafeFaq(item.q, item.a));
        const queryTokens = [...meaningfulWords, ...extraTerms.toLowerCase().split(/\s+/).filter(w => w.length > 2)];

        let bestKb = null;
        let bestKbScore = 0;
        for (const item of combinedKb) {
          const qL = (item.q || '').toLowerCase();
          const aL = (item.a || '').toLowerCase();
          const qToks = qL.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
          const aToks = aL.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
          let sc = 0;
          if (lower.length >= 4 && (lower.includes(qL) || qL.includes(lower))) sc += 80;
          for (const w of queryTokens) {
            let bestQ = 0;
            for (const kt of qToks) {
              const m = typeof fuzzyTokenMatch === 'function' ? fuzzyTokenMatch(w, kt) : (kt.includes(w) ? 3 : 0);
              if (m > bestQ) bestQ = m;
            }
            if (bestQ >= 3) sc += 20;
            else if (bestQ === 2) sc += 14;

            let bestA = 0;
            for (const at of aToks) {
              const m = typeof fuzzyTokenMatch === 'function' ? fuzzyTokenMatch(w, at) : (at.includes(w) ? 3 : 0);
              if (m > bestA) bestA = m;
            }
            if (bestA >= 3) sc += 8;
            else if (bestA === 2) sc += 5;
          }
          if (sc > bestKbScore) {
            bestKbScore = sc;
            bestKb = item;
          }
        }
        if (bestKb && bestKbScore >= 20) {
          return { source: 'kb', topic: bestKb.q, answer: bestKb.a };
        }

        // Check Live Host Page Content Snippets (fuzzy token scoring)
        const snippets = extractHostPageSnippets();
        let bestSnip = null;
        let bestSnipScore = 0;
        for (const snip of snippets) {
          const hToks = (snip.heading || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
          const tToks = (snip.text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
          let sc = 0;
          for (const w of queryTokens) {
            let bestH = 0;
            for (const ht of hToks) {
              const m = typeof fuzzyTokenMatch === 'function' ? fuzzyTokenMatch(w, ht) : (ht.includes(w) ? 3 : 0);
              if (m > bestH) bestH = m;
            }
            if (bestH >= 2) sc += (bestH >= 3 ? 22 : 15);

            let bestT = 0;
            for (const tt of tToks) {
              const m = typeof fuzzyTokenMatch === 'function' ? fuzzyTokenMatch(w, tt) : (tt.includes(w) ? 3 : 0);
              if (m > bestT) bestT = m;
            }
            if (bestT >= 2) sc += (bestT >= 3 ? 12 : 8);
          }
          if (sc > bestSnipScore) {
            bestSnipScore = sc;
            bestSnip = snip;
          }
        }
        if (bestSnip && bestSnipScore >= 24) {
          return { source: 'page', topic: bestSnip.heading || effectiveText, answer: bestSnip.text };
        }
        return null;
      };

      // 0.05 Conversational Affirmation & Pagination Handler ("yes", "sure", "ok", "tell me more", "show more", "next")
      if (isAffirmationOrMoreQuery(effectiveText)) {
        if (context && context.activeItem) {
          const act = context.activeItem;
          const desc = act.description || act.dosage || act.details || profile.defaultDesc;
          const unit = act.unit || profile.itemUnit || 'units';
          const priceStr = act.price ? ` The ${profile.priceLabelEn} is ${act.price}.` : '';
          const stockStr = (act.stock !== null && act.stock !== undefined && act.stock > 0) ? ` Currently ${act.stock} ${unit} are available.` : '';
          if (queryLang === 'mr-IN') return `${act.name} बद्दल अधिक माहिती: ${desc}.${act.price ? ` ${profile.priceLabelMr}: ${act.price}.` : ''} ${profile.actionMr}.`;
          if (queryLang === 'hi-IN') return `${act.name} के बारे में और जानकारी: ${desc}।${act.price ? ` ${profile.priceLabelHi}: ${act.price}।` : ''} ${profile.actionHi}।`;
          return `Here is more about ${act.name}: ${desc}.${priceStr}${stockStr} To proceed: ${profile.actionEn}.`;
        }
        if (context && Array.isArray(context.lastDisplayedItems) && context.lastDisplayedItems.length > 0) {
          const offset = context.catalogOffset || 0;
          if (offset < context.lastDisplayedItems.length) {
            const nextBatch = context.lastDisplayedItems.slice(offset, offset + 5);
            context.catalogOffset = offset + nextBatch.length;
            const summary = nextBatch.map(i => `${i.name}${i.price ? ` (${i.price})` : ''}`).join(', ');
            const rem = context.lastDisplayedItems.length - context.catalogOffset;
            if (queryLang === 'mr-IN') return `पुढील उपलब्ध ${profile.itemNounMr}: ${summary}${rem > 0 ? ` (अजून ${rem} पर्याय उपलब्ध)` : ''}. कोणत्या पर्यायाबद्दल अधिक माहिती हवी आहे?`;
            if (queryLang === 'hi-IN') return `अगले उपलब्ध ${profile.itemNounHi}: ${summary}${rem > 0 ? ` (और ${rem} विकल्प उपलब्ध)` : ''}। आप किसके बारे में विस्तार से जानना चाहेंगे?`;
            return `Here are more available ${profile.itemNounEn}: ${summary}${rem > 0 ? `, plus ${rem} more` : ''}. Which one would you like details on?`;
          }
          const topDetails = context.lastDisplayedItems.slice(0, 3).map(i => `${i.name}${i.price ? ` at ${i.price}` : ''}${i.description ? ` (${i.description.slice(0, 60)})` : ''}`).join('; ');
          return `Here is a quick breakdown of our top ${profile.itemNounEn}: ${topDetails}. Just name any one or say "the first one" for full details!`;
        }
        const allAvailable = getAllCatalogItems(agentConfig);
        if (allAvailable.length > 0) {
          if (context) {
            context.lastDisplayedItems = allAvailable;
            context.catalogOffset = Math.min(5, allAvailable.length);
          }
          const sum = allAvailable.slice(0, 5).map(i => `${i.name}${i.price ? ` (${i.price})` : ''}`).join(', ');
          return `Here are our available ${profile.itemNounEn}: ${sum}. Which one would you like to explore in detail?`;
        }
      }

      // 0.1 Universal Context-Aware Follow-Up Query Handler (When a specific activeItem is locked in memory)
      if (context && context.activeItem && !isCatalogListQuery(effectiveText) && !isGeneralPriceOrOverviewQuery(effectiveText)) {
        const active = context.activeItem;
        const unit = active.unit || profile.itemUnit || 'units';

        // Check if user is switching to a DIFFERENT item first
        const allCatItems = getAllCatalogItems(agentConfig);
        const ordSwitch = resolveOrdinalFromList(effectiveText, context.lastDisplayedItems || allCatItems);
        const cleanedNoPronouns = lower
          .replace(/\b(what do you provide|what is provided|what is included|in that|for that|about that|of that|in this|for this|about this|of this|for it|about it|in it|this|that|it|what about|how about|and|or|the|tell me more|details|fees|price|cost|documents|eligibility|how to apply|how to buy|how to order|how to book)\b/gi, ' ')
          .replace(/[^a-z0-9\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        const switchedItem = ordSwitch || (cleanedNoPronouns.length >= 3 ? matchInInventory(allCatItems, cleanedNoPronouns) : null);

        if (!switchedItem || switchedItem.name === active.name) {
          const isFollowUpDetails = /\b(what do you provide|what is provided|what is included|what subjects?|tell me more|features?|details?|syllabus|curriculum|specs?|specifications?|ingredients?|amenities|dosage|what about|in that|for that|of that|in this|for this|of this)\b/i.test(lower) || /(यात काय|त्यात काय|इसमें क्या|उसमें क्या|तपशील|विवरण)/i.test(text);
          const isFollowUpFee = Boolean(intentConcepts.isPriceOverview) || /\b(price|cost|fee|fees|how much|charges|rate|rent|mrp)\b/i.test(lower) || /(किंमत|भाव|दर|कीमत|दाम|फी|शुल्क)/i.test(text);
          const isFollowUpEligibility = Boolean(intentConcepts.isEligibility) || /\b(eligibility|criteria|requirements?|qualification|percentage|marks|prerequisites?)\b/i.test(lower);
          const isFollowUpApply = Boolean(intentConcepts.isProcedure) || /\b(how to apply|how to order|how to buy|how to book|how to get|how to subscribe|admission process|admission procedure|procedure|steps|apply online|order online|registration|enroll|reserve|test drive)\b/i.test(lower);
          const isFollowUpDocs = Boolean(intentConcepts.isPolicyDocs) || /\b(documents?|papers?|certificates?|mark\s*sheet|lc|leaving certificate|prescription|id proof|warranty|return policy|refund|shipping|delivery)\b/i.test(lower);

          // First check if the agent's own Knowledge Base or Live Page has a specific policy/answer for this follow-up
          if (isFollowUpDocs || isFollowUpEligibility || isFollowUpApply) {
            const grounded = findGroundedKbOrSnippet(active.name || '');
            if (grounded) {
              context.activeTopic = grounded.topic;
              return grounded.answer;
            }
          }

          if (isFollowUpDetails && !isFollowUpFee && !isFollowUpEligibility && !isFollowUpApply && !isFollowUpDocs) {
            const desc = active.description || active.dosage || active.details || profile.defaultDesc;
            const pricePartEn = active.price ? ` The ${profile.priceLabelEn} is ${active.price}.` : '';
            const pricePartHi = active.price ? ` ${profile.priceLabelHi} ${active.price} है।` : '';
            const pricePartMr = active.price ? ` ${profile.priceLabelMr} ${active.price} आहे.` : '';
            const stockPartEn = active.stock !== null && active.stock !== undefined ? ` Currently ${active.stock} ${unit} are available.` : '';
            const stockPartHi = active.stock !== null && active.stock !== undefined ? ` वर्तमान में ${active.stock} ${unit} उपलब्ध हैं।` : '';
            const stockPartMr = active.stock !== null && active.stock !== undefined ? ` सध्या ${active.stock} ${unit} उपलब्ध आहेत.` : '';
            if (queryLang === 'mr-IN') {
              return `${active.name} मध्ये आम्ही प्रदान करतो: ${desc}.${pricePartMr}${stockPartMr}`;
            } else if (queryLang === 'hi-IN') {
              return `${active.name} में हम प्रदान करते हैं: ${desc}।${pricePartHi}${stockPartHi}`;
            } else {
              return `In ${active.name}, we provide: ${desc}.${pricePartEn}${stockPartEn}`;
            }
          }

          if (isFollowUpFee) {
            if (queryLang === 'mr-IN') {
              return `${active.name} ची ${profile.priceLabelMr} ${active.price || 'उपलब्ध'} आहे.${active.stock ? ` (सध्या ${active.stock} ${unit} उपलब्ध).` : ''}`;
            } else if (queryLang === 'hi-IN') {
              return `${active.name} की ${profile.priceLabelHi} ${active.price || 'उपलब्ध'} है।${active.stock ? ` (वर्तमान में ${active.stock} ${unit} उपलब्ध)।` : ''}`;
            } else {
              return `The ${profile.priceLabelEn} for ${active.name} is ${active.price || 'available on request'}.${active.stock ? ` Currently ${active.stock} ${unit} are available.` : ''}`;
            }
          }

          if (isFollowUpApply) {
            const formTarget = resolveExactRedirectTarget(`${effectiveText} form`, agentConfig?.siteBlueprint);
            if (formTarget && formTarget.targetType === 'form') {
              executeRedirectAction(formTarget, false);
              const fieldsNote = Array.isArray(formTarget.fields) && formTarget.fields.length > 0
                ? ` (${formTarget.fields.slice(0, 4).join(', ')})`
                : '';
              const replyText = queryLang === 'mr-IN'
                ? `${active.name} साठी आमचा ${formTarget.label}${fieldsNote} भरा आणि "${formTarget.submitLabel || 'Submit'}" वर क्लिक करा.`
                : queryLang === 'hi-IN'
                  ? `${active.name} के लिए हमारा ${formTarget.label}${fieldsNote} भरें और "${formTarget.submitLabel || 'Submit'}" पर क्लिक करें।`
                  : `To proceed with ${active.name}, complete our ${formTarget.label}${fieldsNote} and click "${formTarget.submitLabel || 'Submit'}".`;
              return {
                reply: replyText,
                navAction: {
                  label: `Open ${formTarget.label}`,
                  sectionInfo: formTarget.element ? formTarget : null,
                  redirectTarget: formTarget,
                  redirectUrl: formTarget.isCrossPage ? formTarget.redirectUrl : null,
                  isCrossPage: Boolean(formTarget.isCrossPage),
                  targetType: 'form'
                }
              };
            }
            if (queryLang === 'mr-IN') {
              return `${active.name} साठी: ${profile.actionMr}.`;
            } else if (queryLang === 'hi-IN') {
              return `${active.name} के लिए: ${profile.actionHi}।`;
            } else {
              return `To proceed with ${active.name}: ${profile.actionEn}.`;
            }
          }

          if (isFollowUpEligibility) {
            if (currentArchetype === 'academic') {
              if (queryLang === 'mr-IN') return `${active.name} च्या प्रवेशासाठी पात्रता परीक्षेत आवश्यक गुण असणे गरजेचे आहे.`;
              if (queryLang === 'hi-IN') return `${active.name} के एडमिशन के लिए पात्रता परीक्षा में न्यूनतम आवश्यक अंक होना जरूरी है।`;
              return `For ${active.name}, candidates must have passed the qualifying board examination with the required merit percentage.`;
            }
            if (currentArchetype === 'healthcare') {
              return `${active.name} may require a valid doctor prescription or consultation before dispensing.`;
            }
            return `${active.name} is available for all eligible customers with quick confirmation on our website.`;
          }

          if (isFollowUpDocs) {
            if (currentArchetype === 'academic') {
              if (queryLang === 'mr-IN') return `${active.name} च्या प्रवेशासाठी लागणारी कागदपत्रे: मागील इयत्तेची मार्कशीट, मूळ शाळा सोडल्याचा दाखला (LC), आधार कार्ड आणि पासपोर्ट फोटो.`;
              if (queryLang === 'hi-IN') return `${active.name} के एडमिशन के लिए आवश्यक दस्तावेज: पिछली कक्षा की मार्कशीट, मूल स्कूल छोड़ने का प्रमाण पत्र (LC), आधार कार्ड और पासपोर्ट फोटो।`;
              return `Required documents for ${active.name}: previous marksheet, original School Leaving Certificate (LC), identity proof, and passport photographs.`;
            }
            if (currentArchetype === 'ecommerce') {
              return `For ${active.name}, we provide standard shipping, manufacturer warranty, and hassle-free returns as listed in our store policy.`;
            }
            if (currentArchetype === 'healthcare') {
              return `For ${active.name}, please keep a valid doctor prescription and patient ID ready if required.`;
            }
            if (currentArchetype === 'hospitality') {
              return `For ${active.name}, a valid government photo ID is required at check-in; full check-in and cancellation terms are shown in our reservation section.`;
            }
            if (currentArchetype === 'saas') {
              return `For ${active.name}, flexible monthly and annual billing with instant activation and invoice support are included.`;
            }
            if (currentArchetype === 'automotive') {
              return `For ${active.name}, manufacturer warranty, servicing support, and financing options are included—carry a valid driving license for test drives.`;
            }
            if (currentArchetype === 'financial') {
              return `For ${active.name}, typically PAN card, identity proof, and relevant financial statements are required.`;
            }
            return `For ${active.name}, please check our website policy section or reach out to support for exact details.`;
          }
        }
      }

      // 1. Direct Catalog List Query Handler (e.g. "can you give me details of courses", "course details", "which courses do you provide", "give list of all meds", "show all products", "show menu")
      const bridge = bridgeResult || await resolveDatabaseBridge(text, agentConfig, context);
      if (bridge && bridge.status === 'FOUND_CATALOG_LIST') {
        const allItems = Array.isArray(bridge.data) && bridge.data.length > 0 ? bridge.data : getAllCatalogItems(agentConfig);
        const sec = findHostSection('courses') || findHostSection('inventory') || findHostSection('products') || findHostSection('menu') || findHostSection('pricing');
        if (sec) scrollToHostSection(sec);

        const nounEn = profile.itemNounEn;
        const nounHi = profile.itemNounHi;
        const nounMr = profile.itemNounMr;

        let replyText = '';
        if (allItems.length > 0) {
          if (context) {
            context.activeTopic = 'catalog_list';
            context.lastDisplayedItems = allItems;
            context.catalogOffset = Math.min(5, allItems.length);
            context.fallbackCount = 0;
          }
          const displayedItems = allItems.slice(0, 5);
          const itemSummary = displayedItems.map(i => `${i.name}${i.price ? ` (${i.price})` : ''}`).join(', ');
          const moreSuffixEn = allItems.length > 5 ? `, and ${allItems.length - 5} more` : '';
          const moreSuffixHi = allItems.length > 5 ? ` और अन्य ${allItems.length - 5} विकल्प` : '';
          const moreSuffixMr = allItems.length > 5 ? ` आणि इतर ${allItems.length - 5} पर्याय` : '';

          if (queryLang === 'mr-IN') {
            replyText = `नक्कीच! आमच्याकडे सध्या ${allItems.length} ${nounMr} उपलब्ध आहेत: ${itemSummary}${moreSuffixMr}. कृपया कोणत्या पर्यायाबद्दल अधिक माहिती हवी आहे ते सांगा, मला मदत करायला नक्की आवडेल!`;
          } else if (queryLang === 'hi-IN') {
            replyText = `ज़रूर! हमारे पास अभी ${allItems.length} ${nounHi} उपलब्ध हैं: ${itemSummary}${moreSuffixHi}। कृपया बताएं आप किस विकल्प के बारे में विस्तार से जानना चाहेंगे, मुझे आपकी सहायता करके खुशी होगी!`;
          } else {
            replyText = `I would be happy to help! We currently have ${allItems.length} ${nounEn} available: ${itemSummary}${moreSuffixEn}. Please let me know which one you would like more details on!`;
          }
        } else {
          // Check Agent Knowledge Base & Live Host Page Snippets BEFORE falling back
          const groundedCat = findGroundedKbOrSnippet('course program product menu plan room service catalog list offer');
          const hk = extractHostPageKnowledge();
          if (groundedCat) {
            if (context) context.activeTopic = groundedCat.topic;
            replyText = groundedCat.answer;
          } else if (hk.services && hk.services.length > 0) {
            const servList = hk.services.slice(0, 5).join(', ');
            replyText = `I would be happy to share! We offer: ${servList}.${sec ? ` I have also scrolled your screen to our ${sec.label} section for your convenience.` : ' Please let me know which one you would like to explore!'}`;
          } else if (sec) {
            if (queryLang === 'mr-IN') {
              replyText = `नक्कीच! आमची संपूर्ण माहिती खालील ${sec.label} विभागात उपलब्ध आहे. मी आपल्या सोयीसाठी स्क्रीन थेट तेथे नेली आहे!`;
            } else if (queryLang === 'hi-IN') {
              replyText = `ज़रूर! हमारी पूरी जानकारी नीचे ${sec.label} सेक्शन में उपलब्ध है। मैंने आपकी सुविधा के लिए स्क्रीन को सीधे वहीं स्क्रॉल कर दिया है!`;
            } else {
              replyText = `Certainly! You can view all our ${nounEn} directly in the ${sec.label} section right here. I have scrolled your screen to it for your convenience!`;
            }
          } else {
            if (queryLang === 'mr-IN') {
              replyText = `माफ करा, सध्या ${nounMr}ची सविस्तर यादी येथे उपलब्ध नाही. कृपया आमच्या ${profile.followUpMr}बद्दल विचारा — मला आपल्याला मदत करायला आनंद होईल!`;
            } else if (queryLang === 'hi-IN') {
              replyText = `क्षमा करें, अभी ${nounHi} की पूरी सूची यहाँ उपलब्ध नहीं है। कृपया हमारे ${profile.followUpHi} के बारे में पूछें — मुझे आपकी मदद करके खुशी होगी!`;
            } else {
              replyText = `I would be glad to help! Our full ${nounEn} list isn't published right here at the moment, so please feel free to ask me about our ${profile.followUpEn} or contact our team directly.`;
            }
          }
        }

        return {
          reply: replyText,
          navAction: sec ? { label: `View ${sec.label}`, sectionInfo: sec } : null
        };
      }

      // 1.5 General Pricing / Fee Structure Overview Handler (Works across ALL website types even when activeItem is null!)
      if (bridge && bridge.status === 'FOUND_PRICE_OVERVIEW') {
        const allItems = Array.isArray(bridge.data) && bridge.data.length > 0 ? bridge.data : getAllCatalogItems(agentConfig);
        const pricedItems = allItems.filter(i => i.price);
        const sec = findHostSection('pricing') || findHostSection('fees') || findHostSection('courses') || findHostSection('products');
        if (sec) scrollToHostSection(sec);

        if (pricedItems.length > 0) {
          if (context) {
            context.lastDisplayedItems = pricedItems;
            context.catalogOffset = Math.min(5, pricedItems.length);
            context.activeTopic = 'pricing';
            context.fallbackCount = 0;
          }
          const summary = pricedItems.slice(0, 5).map(i => `${i.name}: ${i.price}`).join(', ');
          const moreEn = pricedItems.length > 5 ? `, and ${pricedItems.length - 5} more` : '';
          let priceReply = `Certainly! Here is our ${profile.priceLabelEn} overview: ${summary}${moreEn}. Please let me know which option you would like full details on!`;
          if (queryLang === 'mr-IN') {
            priceReply = `नक्कीच! आमची ${profile.priceLabelMr} रचना खालीलप्रमाणे आहे: ${summary}. कृपया कोणत्याही पर्यायाबद्दल अधिक माहितीसाठी विचारा!`;
          } else if (queryLang === 'hi-IN') {
            priceReply = `ज़रूर! हमारी ${profile.priceLabelHi} की जानकारी इस प्रकार है: ${summary}। कृपया किसी विशेष विकल्प के बारे में विस्तार से पूछें!`;
          }
          return {
            reply: priceReply,
            navAction: sec ? { label: `View ${sec.label}`, sectionInfo: sec } : null
          };
        }

        const groundedPrice = findGroundedKbOrSnippet('fee fees price pricing cost rate tuition charges');
        if (groundedPrice) {
          if (context) context.activeTopic = groundedPrice.topic;
          return groundedPrice.answer;
        }
        if (allItems.length > 0) {
          const names = allItems.slice(0, 5).map(i => i.name).join(', ');
          return `Our available ${profile.itemNounEn} include ${names}. Please tell me which one you're interested in or contact our team for exact ${profile.priceLabelEn} details!`;
        }
      }

      // 2. Direct Exact Form, Section & Route Navigation Handler (e.g. "take me to admission form", "open checkout", "where is contact")
      if (bridge && bridge.status === 'NAVIGATE_SECTION') {
        const sec = bridge.data || resolveExactRedirectTarget(effectiveText, agentConfig?.siteBlueprint) || findHostSection(effectiveText);
        if (sec) {
          executeRedirectAction(sec, true);
          const fieldsHint = (sec.targetType === 'form' && Array.isArray(sec.fields) && sec.fields.length > 0)
            ? ` (fields: ${sec.fields.slice(0, 4).join(', ')})`
            : '';
          let navReply = '';
          if (sec.isCrossPage && sec.redirectUrl) {
            navReply = queryLang === 'mr-IN'
              ? `नक्कीच! मी आपल्याला थेट आमच्या ${sec.label} (${sec.redirectUrl}) वर नेत आहे.`
              : queryLang === 'hi-IN'
                ? `ज़रूर! मैं आपको सीधे हमारे ${sec.label} (${sec.redirectUrl}) पर ले जा रहा हूँ।`
                : `Certainly! Redirecting you directly to our ${sec.label}${fieldsHint} now.`;
          } else if (sec.targetType === 'form') {
            navReply = queryLang === 'mr-IN'
              ? `नक्कीच! मी आपल्या स्क्रीनला थेट आमच्या ${sec.label}${fieldsHint} वर नेले आहे — आपण आता थेट फॉर्म भरू शकता.`
              : queryLang === 'hi-IN'
                ? `ज़रूर! मैंने स्क्रीन को सीधे हमारे ${sec.label}${fieldsHint} पर स्क्रॉल कर दिया है — आप अभी फॉर्म भर सकते हैं।`
                : `Certainly! I have taken you directly to our ${sec.label}${fieldsHint} and focused the form for you.`;
          } else {
            navReply = queryLang === 'mr-IN'
              ? `नक्कीच! मी आपल्या स्क्रीनला थेट आमच्या ${sec.label} विभागावर नेले आहे.`
              : queryLang === 'hi-IN'
                ? `ज़रूर! मैंने स्क्रीन को सीधे हमारे ${sec.label} सेक्शन पर स्क्रॉल कर दिया है।`
                : `Certainly! I have scrolled your screen directly to our ${sec.label} section right here.`;
          }
          return {
            reply: navReply,
            navAction: {
              label: sec.isCrossPage ? `Go to ${sec.label}` : (sec.targetType === 'form' ? `Open ${sec.label}` : `Jump to ${sec.label}`),
              sectionInfo: sec.element ? sec : null,
              redirectTarget: sec,
              redirectUrl: sec.isCrossPage ? sec.redirectUrl : null,
              isCrossPage: Boolean(sec.isCrossPage),
              targetType: sec.targetType || 'section'
            }
          };
        }
      }

      // 3. Exact Database Item Found in Host State / Live API
      if (bridge && (bridge.status === 'FOUND_IN_HOST_STATE' || bridge.status === 'FOUND_IN_LIVE_API')) {
        const formatted = formatRealtimeStockResponse(bridge.data, queryLang, effectiveText || text);
        const sec = findHostSection('inventory') || findHostSection('products') || findHostSection('menu') || findHostSection('pricing');
        if (sec) scrollToHostSection(sec);
        const cleanBtnName = cleanScrapedItemTitle(bridge.data.name || 'Item').name.substring(0, 30);
        return {
          reply: formatted,
          navAction: sec ? { label: `View ${cleanBtnName}`, sectionInfo: sec } : null
        };
      }

      // 4. Item Not Listed in Catalog
      if (bridge && bridge.status === 'ITEM_NOT_FOUND') {
        const item = bridge.item || 'The requested item';
        const cleanItem = String(item).split(/[\(\n,]/)[0].trim();
        const allItems = getAllCatalogItems(agentConfig);
        const topAvailable = allItems.slice(0, 3).map(i => i.name.split(/[\(\n,]/)[0].trim()).filter(Boolean);
        const sec = findHostSection('inventory') || findHostSection('products') || findHostSection('menu') || findHostSection('pricing');
        if (sec) scrollToHostSection(sec);

        const currentArchetype = detectCurrentArchetype(agentConfig);
        const profile = getArchetypeProfile(currentArchetype);
        const nounEn = profile.itemNounEn;
        const nounHi = profile.itemNounHi;
        const nounMr = profile.itemNounMr;

        let replyText = '';
        if (queryLang === 'mr-IN') {
          replyText = `क्षमस्व, "${cleanItem}" सध्या उपलब्ध नाही.${topAvailable.length > 0 ? ` आमच्याकडे उपलब्ध ${nounMr}: ${topAvailable.join(', ')}.` : ''} आपण उपलब्ध यादी पाहू इच्छिता?`;
        } else if (queryLang === 'hi-IN') {
          replyText = `क्षमा करें, "${cleanItem}" अभी उपलब्ध नहीं है।${topAvailable.length > 0 ? ` हमारे पास उपलब्ध ${nounHi}: ${topAvailable.join(', ')}।` : ''} क्या आप उपलब्ध सूची देखना चाहेंगे?`;
        } else {
          replyText = `Sorry, "${cleanItem}" is not available right now.${topAvailable.length > 0 ? ` In stock ${nounEn} include: ${topAvailable.join(', ')}.` : ''} Would you like to check our available ${nounEn}?`;
        }

        return {
          reply: replyText,
          navAction: sec ? { label: `View ${sec.label}`, sectionInfo: sec } : null
        };
      }

      // 5. Host Page Live Knowledge Query (Contact, Location, Phone, Email, Hours, Services)
      if (bridge && bridge.status === 'HOST_KNOWLEDGE_QUERY') {
        const hk = bridge.data || extractHostPageKnowledge();
        const contactSec = findHostSection('contact');
        if (bridge.topic === 'location' && hk.address) {
          if (contactSec) scrollToHostSection(contactSec);
          let rep = `We are located at ${hk.address}.${contactSec ? ' I have scrolled your screen down to our location section!' : ''}`;
          if (queryLang === 'mr-IN') rep = `आमचा पत्ता: ${hk.address}.${contactSec ? ' मी स्क्रीन थेट संपर्क विभागावर नेली आहे!' : ''}`;
          if (queryLang === 'hi-IN') rep = `हमारा पता है: ${hk.address}।${contactSec ? ' मैंने स्क्रीन को सीधे लोकेशन सेक्शन पर स्क्रॉल कर दिया है!' : ''}`;
          return {
            reply: rep,
            navAction: contactSec ? { label: `View ${contactSec.label}`, sectionInfo: contactSec } : null
          };
        }
        if (bridge.topic === 'phone' && hk.phone) {
          if (contactSec) scrollToHostSection(contactSec);
          let rep = `You can reach us directly at ${hk.phone}.${contactSec ? ' Full contact details are also available below.' : ''}`;
          if (queryLang === 'mr-IN') rep = `आपण थेट ${hk.phone} वर संपर्क करू शकता.`;
          if (queryLang === 'hi-IN') rep = `आप सीधे ${hk.phone} पर कॉल कर सकते हैं।`;
          return {
            reply: rep,
            navAction: contactSec ? { label: `View ${contactSec.label}`, sectionInfo: contactSec } : null
          };
        }
        if (bridge.topic === 'email' && hk.email) {
          if (contactSec) scrollToHostSection(contactSec);
          let rep = `You can email us at ${hk.email} anytime.`;
          if (queryLang === 'mr-IN') rep = `आपण ${hk.email} वर ईमेल पाठवू शकता.`;
          if (queryLang === 'hi-IN') rep = `आप हमें ${hk.email} पर ईमेल कर सकते हैं।`;
          return {
            reply: rep,
            navAction: contactSec ? { label: `View ${contactSec.label}`, sectionInfo: contactSec } : null
          };
        }
        if (bridge.topic === 'hours' && hk.hours) {
          let rep = `Our business hours are: ${hk.hours}.`;
          if (queryLang === 'mr-IN') rep = `आमची कामाची वेळ: ${hk.hours}.`;
          if (queryLang === 'hi-IN') rep = `हमारे खुलने का समय है: ${hk.hours}।`;
          return rep;
        }
        if (bridge.topic === 'services' && (hk.services.length > 0 || hk.metaDesc)) {
          const servList = hk.services.length > 0 ? hk.services.slice(0, 6).join(', ') : hk.metaDesc;
          const servSec = findHostSection('how it works') || findHostSection('pricing') || findHostSection('services');
          if (servSec) scrollToHostSection(servSec);
          let rep = `We offer: ${servList}.${servSec ? ` I have scrolled your screen to our ${servSec.label}!` : ''}`;
          if (queryLang === 'mr-IN') rep = `आमच्या मुख्य सेवा: ${servList}.`;
          if (queryLang === 'hi-IN') rep = `हमारी मुख्य सुविधाएं: ${servList}।`;
          return {
            reply: rep,
            navAction: servSec ? { label: `View ${servSec.label}`, sectionInfo: servSec } : null
          };
        }
      }

      // Marathi Identity & Capability Queries (standalone greetings already handled at Step 0)
      if (/(तुम्ही कोण आहात|तुमचे नाव काय|ओळख द्या)/i.test(text) || /\b(tumhi kon ahat)\b/i.test(lower)) {
        return `मी ${agentConfig.name} आहे, या वेबसाइटचा अधिकृत एआय व्हॉइस असिस्टंट.`;
      }
      if (/(तुम्ही काय करू शकता|मदत करा|वैशिष्ट्ये)/i.test(text) || /\b(tumhi kay karu shakta|madat kara)\b/i.test(lower)) {
        return "मी आपल्या सर्व शंकांचे निरसन करू शकतो आणि आमच्या सेवांबद्दल माहिती देऊ शकतो. आपल्याला काय जाणून घ्यायचे आहे?";
      }

      // Hindi Identity & Capability Queries (standalone greetings already handled at Step 0)
      if (/(आप कौन हैं|तुम्हारा नाम क्या|अपना परिचय)/i.test(text) || /\b(aap kaun hain)\b/i.test(lower)) {
        return `मैं ${agentConfig.name} हूँ, आपकी वेबसाइट का आधिकारिक एआई वॉइस गाइड।`;
      }
      if (/(आप क्या कर सकते हैं|मदद करो|सुविधाएं)/i.test(text) || /\b(aap kya kar sakte hain|madad karo)\b/i.test(lower)) {
        return "मैं आपको हमारी सेवाओं, उत्पादों और जानकारी के बारे में विस्तृत सहायता प्रदान कर सकता हूँ। आप क्या जानना चाहते हैं?";
      }

      // 2. Identity & Role Inquiries
      if (/\b(who are you|what is your name|what do you do|introduce yourself)\b/i.test(lower)) {
        const hk = extractHostPageKnowledge();
        const biz = hk.businessName || agentConfig.name;
        return `I am ${agentConfig.name}, the official customer support voice and chat guide for ${biz}. I can help you check live inventory, prices, services, or navigate anywhere on this site!`;
      }

      // 3. Capabilities & Help Inquiries
      if (/\b(what can you do|help me|capabilities)\b/i.test(lower)) {
        const hk = extractHostPageKnowledge();
        const servSummary = hk.services.length > 0 ? `including ${hk.services.slice(0, 4).join(', ')}. ` : '';
        return `I can guide you through our services ${servSummary}and check our live database catalog for availability and pricing. What would you like to explore?`;
      }

      // 4.1 Technical/Developer Query Protection (Customer Assistant Boundary)
      if (/\b(?:(?:how\s+(?:do\s+i|can\s+i|to)\s+)?(?:get|find|obtain|create|generate|acquire|setup|add|enter|use)\s+.*(?:api\s*key|groq\s*key|gemini\s*key|google\s*key|key)|(?:where|how)\s+(?:do\s+i|can\s+i|to)\s+(?:get|find|obtain|create)\s+.*key|(?:groq|gemini|google)\s+(?:api\s*)?key|api\s*key\s*(?:of|for|from)\s*(?:google|groq|gemini)|key\s+(?:of|for|from)\s*(?:the\s*)?(?:google|groq|gemini)|embed|integrate|script tag|widget\.js)\b/i.test(lower)) {
        return `I am ${agentConfig.name}, your live customer support assistant. How can I assist you with our catalog, services, or inquiries today?`;
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

      // 6. Semantic Knowledge Base, On-Page FAQs & Live Host Page Content Snippet Matching
      const hostKnowledge = extractHostPageKnowledge();
      const groundedHit = findGroundedKbOrSnippet();
      if (groundedHit) {
        if (context) {
          context.activeTopic = groundedHit.topic;
          context.fallbackCount = 0;
        }
        return groundedHit.answer;
      }

      // 6.8 Universal Archetype Intent Handlers (Order-Independent, Typo-Tolerant & Works EVEN WHEN activeItem is null across ALL 10 website types!)
      const isGeneralEligibility = Boolean(intentConcepts.isEligibility) || /\b(eligibility|criteria|requirements?|qualification|percentage|marks|prerequisites?)\b/i.test(lower) || /(पात्रता|पात्रता मानदंड)/i.test(text);
      const isGeneralProcedure = Boolean(intentConcepts.isProcedure) || /\b(how to apply|how to order|how to buy|how to book|how to get|how to subscribe|admission\s*(?:process|procedure|steps?)|booking\s*(?:process|procedure)|order\s*(?:process|procedure)|getting\s*started|steps|apply online|order online|registration|enroll|table\s*reservations?|reservations?|reserve|test\s*drives?|site\s*visits?|book\s*(?:a\s*)?consultation)\b/i.test(lower) || /(प्रवेश प्रक्रिया|अर्ज कसा करावा|एडमिशन प्रक्रिया|कैसे आवेदन|कैसे ऑर्डर|बुकिंग)/i.test(text);
      const isGeneralDocsOrPolicy = Boolean(intentConcepts.isPolicyDocs) || /\b(documents?|papers?|certificates?|mark\s*sheet|lc|leaving certificate|prescription|id proof|warranty|return\s*policy|refund|shipping|delivery|cancellation|check-?in|check-?out|billing|dietary|amenities)\b/i.test(lower) || /(कागदपत्रे|रिटर्न पॉलिसी|डिलिव्हरी|वॉरंटी|दस्तावेज|डिलीवरी|वारंटी)/i.test(text);

      if (isGeneralProcedure) {
        if (context) {
          context.activeTopic = 'procedure';
          context.fallbackCount = 0;
        }
        const formTarget = resolveExactRedirectTarget(`${effectiveText} form`, agentConfig?.siteBlueprint);
        if (formTarget && formTarget.targetType === 'form') {
          executeRedirectAction(formTarget, false);
          const fieldsNote = Array.isArray(formTarget.fields) && formTarget.fields.length > 0
            ? ` (${formTarget.fields.slice(0, 4).join(', ')})`
            : '';
          const replyText = queryLang === 'mr-IN'
            ? `पुढे जाण्यासाठी आमचा ${formTarget.label}${fieldsNote} भरा आणि "${formTarget.submitLabel || 'Submit'}" वर क्लिक करा.`
            : queryLang === 'hi-IN'
              ? `आगे बढ़ने के लिए हमारा ${formTarget.label}${fieldsNote} भरें और "${formTarget.submitLabel || 'Submit'}" पर क्लिक करें।`
              : `To get started, complete our ${formTarget.label}${fieldsNote} and click "${formTarget.submitLabel || 'Submit'}". Click the button below to open it directly!`;
          return {
            reply: replyText,
            navAction: {
              label: `Open ${formTarget.label}`,
              sectionInfo: formTarget.element ? formTarget : null,
              redirectTarget: formTarget,
              redirectUrl: formTarget.isCrossPage ? formTarget.redirectUrl : null,
              isCrossPage: Boolean(formTarget.isCrossPage),
              targetType: 'form'
            }
          };
        }
        if (queryLang === 'mr-IN') return `पुढे जाण्यासाठी: ${profile.actionMr}.`;
        if (queryLang === 'hi-IN') return `आगे बढ़ने के लिए: ${profile.actionHi}।`;
        return `To get started: ${profile.actionEn}.`;
      }

      if (isGeneralEligibility) {
        if (context) {
          context.activeTopic = 'eligibility';
          context.fallbackCount = 0;
        }
        if (currentArchetype === 'academic') {
          if (queryLang === 'mr-IN') return `प्रवेशासाठी विद्यार्थ्यांनी मागील पात्रता परीक्षा आवश्यक गुणांसह उत्तीर्ण केलेली असावी. विशिष्ट अभ्यासक्रमाचे नाव सांगितल्यास मी अधिक तपशील देऊ शकतो.`;
          if (queryLang === 'hi-IN') return `एडमिशन के लिए छात्रों को पिछली पात्रता परीक्षा आवश्यक अंकों के साथ उत्तीर्ण करनी होती है। किसी विशेष कोर्स का नाम बताएं ताकि मैं सटीक विवरण दे सकूँ।`;
          return `For admissions, applicants must have passed the qualifying board examination with the required merit marks. Tell me which course you are interested in for exact details!`;
        }
        if (currentArchetype === 'healthcare') {
          return `Prescription medicines require a valid doctor prescription; over-the-counter items are available directly. Ask about any specific medicine for details!`;
        }
        if (currentArchetype === 'financial') {
          return `Eligibility depends on your profile, KYC verification (PAN/ID), and income documents. Let me know which financial service you need!`;
        }
        return `Our ${profile.nounEn} are available to all customers directly through this website. Tell me which option you'd like to explore!`;
      }

      if (isGeneralDocsOrPolicy) {
        if (context) {
          context.activeTopic = 'policy_docs';
          context.fallbackCount = 0;
        }
        if (currentArchetype === 'academic') {
          if (queryLang === 'mr-IN') return `प्रवेशासाठी लागणारी कागदपत्रे: मागील इयत्तेची मार्कशीट, मूळ शाळा सोडल्याचा दाखला (LC), आधार कार्ड आणि पासपोर्ट आकाराचे फोटो.`;
          if (queryLang === 'hi-IN') return `एडमिशन के लिए आवश्यक दस्तावेज: पिछली कक्षा की मार्कशीट, मूल स्कूल छोड़ने का प्रमाण पत्र (LC), आधार कार्ड और पासपोर्ट फोटो।`;
          return `Required admission documents typically include your previous marksheet, original School Leaving Certificate (LC), identity proof, and passport photographs.`;
        }
        if (currentArchetype === 'ecommerce') {
          return `We provide authentic products with standard shipping, manufacturer warranty, and hassle-free returns as listed on our store policy. Ask about any specific product for exact details!`;
        }
        if (currentArchetype === 'healthcare') {
          return `Please keep a valid doctor prescription and patient ID ready for prescription items. Over-the-counter healthcare items do not require a prescription.`;
        }
        if (currentArchetype === 'hospitality') {
          return `Standard government photo ID is required at check-in. Check-in, check-out, and cancellation terms are shown on our reservation section—ask about any room for full details!`;
        }
        if (currentArchetype === 'saas') {
          return `Flexible monthly and annual billing options are available with instant activation. Ask about any specific plan to compare features and pricing!`;
        }
        if (currentArchetype === 'food') {
          return `We offer fresh dine-in, takeaway, and delivery options with clear dietary details. Ask about any dish on our menu for ingredients and pricing!`;
        }
        if (currentArchetype === 'automotive') {
          return `Manufacturer warranty, financing, and servicing support are included. Please carry a valid driving license for showroom test drives!`;
        }
        if (currentArchetype === 'financial') {
          return `Standard KYC documents (PAN card, Aadhaar/ID proof, and relevant financial statements) are typically required. Ask about a specific service for an exact checklist!`;
        }
        return `You can review full policy and requirement details on our website or ask me about any specific ${profile.itemNounEn} option!`;
      }

      // 7. Polite Universal Catalog Guidance Fallback (Plural-Safe Across All 10 Website Archetypes)
      const allItems = getAllCatalogItems(agentConfig);
      if (allItems.length > 0 && /\b(medicines?|meds?|products?|items?|drugs?|tables?|catalogs?|catalogues?|stocks?|prices?|fees?|dishes?|foods?|pizzas?|burgers?|menus?|plans?|tiers?|services?|courses?|programs?|programmes?|streams?|classes?|degrees?|admissions?|rooms?|suites?|bookings?|vehicles?|cars?|bikes?|properties|property|flats?|apartments?|loans?|packages?)\b/i.test(lower)) {
        if (context) {
          context.lastDisplayedItems = allItems;
          context.catalogOffset = Math.min(5, allItems.length);
          context.fallbackCount = 0;
        }
        const itemSummary = allItems.slice(0, 5).map(i => `${i.name}${i.price ? ` (${i.price})` : ''}`).join(', ');
        const sec = findHostSection('courses') || findHostSection('inventory') || findHostSection('products') || findHostSection('menu') || findHostSection('pricing');
        if (sec) scrollToHostSection(sec);
        let catReply = `We currently offer: ${itemSummary}.${sec ? ` I have scrolled your screen down to the ${sec.label}!` : ' Let me know which one you would like details on!'}`;
        if (queryLang === 'mr-IN') {
          catReply = `आमच्याकडे उपलब्ध पर्याय: ${itemSummary}.${sec ? ` मी स्क्रीन थेट ${sec.label}वर नेली आहे!` : ''}`;
        } else if (queryLang === 'hi-IN') {
          catReply = `हमारे पास उपलब्ध विकल्प: ${itemSummary}।${sec ? ` मैंने स्क्रीन को सीधे ${sec.label} पर स्क्रॉल कर दिया है!` : ''}`;
        }
        return {
          reply: catReply,
          navAction: sec ? { label: `View ${sec.label}`, sectionInfo: sec } : null
        };
      }

      // 8. Anti-Loop / Stuck-State Recovery Guard: NEVER repeat the exact same vague fallback message twice!
      const itemContextName = context?.activeItem?.name ? ` regarding ${context.activeItem.name}` : '';
      let genericFallback = `I am here to assist you${itemContextName}. Would you like to know more about our ${profile.followUpEn}?`;
      if (queryLang === 'mr-IN') {
        genericFallback = `मी आपल्या सेवेसाठी तत्पर आहे${itemContextName}. आपल्याला ${profile.followUpMr}बद्दल अधिक माहिती हवी आहे का?`;
      } else if (queryLang === 'hi-IN') {
        genericFallback = `मैं आपकी सहायता के लिए उपस्थित हूँ${itemContextName}। क्या आप ${profile.followUpHi} के बारे में और जानना चाहते हैं?`;
      }

      const wouldLoop = Boolean(context && (context.lastReply === genericFallback || (context.fallbackCount || 0) >= 1));
      if (wouldLoop) {
        if (context) context.fallbackCount = (context.fallbackCount || 0) + 1;
        // Proactively break out of any loop with REAL concrete options from this website!
        if (allItems.length > 0) {
          if (context) {
            context.lastDisplayedItems = allItems;
            context.catalogOffset = Math.min(5, allItems.length);
          }
          const topList = allItems.slice(0, 4).map(i => `${i.name}${i.price ? ` (${i.price})` : ''}`).join(', ');
          if (queryLang === 'mr-IN') return `मी थेट मदत करू शकतो! आमचे प्रमुख पर्याय: ${topList}. यापैकी कोणाचेही नाव किंवा "पहिला" असे सांगा!`;
          if (queryLang === 'hi-IN') return `मैं सीधे मदद कर सकता हूँ! हमारे प्रमुख विकल्प हैं: ${topList}। किसी का भी नाम बताएं या "पहला" कहें!`;
          return `Let me show you concrete options right away: ${topList}. Just name any of these or say "the first one" for full details!`;
        }
        const safeKbTopics = (agentConfig.knowledgeBase || []).filter(item => isCustomerSafeFaq(item.q, item.a)).slice(0, 3).map(k => k.q);
        if (safeKbTopics.length > 0) {
          return `I can answer questions right away such as: ${safeKbTopics.join(' | ')}. Which topic would you like me to explain?`;
        }
        if (hostKnowledge.phone || hostKnowledge.email) {
          const contactParts = [hostKnowledge.phone ? `call ${hostKnowledge.phone}` : '', hostKnowledge.email ? `email ${hostKnowledge.email}` : ''].filter(Boolean).join(' or ');
          return `I want to make sure you get the exact answer you need. You can ask me about ${profile.followUpEn}, or reach our team directly via ${contactParts}.`;
        }
      }

      if (history && history.length > 0) {
        if (context) context.fallbackCount = (context.fallbackCount || 0) + 1;
        return genericFallback;
      }

      if (queryLang === 'mr-IN') {
        return `मी ${agentConfig.name} आहे. मी आपल्या प्रश्नाचे स्वागत करतो. आपण आमच्या ${profile.nounMr}बद्दल विचारू शकता. मी कशी मदत करू?`;
      }
      if (queryLang === 'hi-IN') {
        return `मैं ${agentConfig.name} हूँ। आप हमारी ${profile.nounHi} के बारे में कुछ भी पूछ सकते हैं। मैं आपकी क्या मदद करूँ?`;
      }

      return `Hello, I'm ${agentConfig.name}! You can ask me about our ${profile.nounEn}, ${profile.followUpEn}, or ask me to jump to any section on this page.`;
    }

    // Maintain multi-turn conversation memory & session logs
    const conversationHistory = [];
    const conversationContext = {
      activeItem: null,
      activeTopic: null,
      lastDisplayedItems: [],
      catalogOffset: 0,
      lastIntent: null,
      lastReply: '',
      fallbackCount: 0,
      turnCount: 0
    };
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

        // 3. Persist / Update visitor in user_info collection
        try {
          const cleanVis = visitorId.replace(/[^a-zA-Z0-9_-]/g, '_');
          const userDocId = `${cleanAgentTitle}_${cleanVis}`;
          await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/user_info/${encodeURIComponent(userDocId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                id: { stringValue: userDocId },
                visitorId: { stringValue: visitorId },
                caller: { stringValue: visitorId },
                name: { stringValue: visitorId },
                agentId: { stringValue: cleanAgentTitle },
                agentName: { stringValue: cleanAgentTitle },
                userType: { stringValue: 'website_visitor' },
                lastActiveAt: { timestampValue: new Date().toISOString() },
                sessionDuration: { stringValue: durationStr },
                totalMessagesSent: { integerValue: String(msgs.filter(m => m.role === 'user').length) },
                lastInquiryTopic: { stringValue: summaryText.substring(0, 85) },
                lastUserMessage: { stringValue: (msgs.filter(m => m.role === 'user').pop()?.text || '').substring(0, 150) },
                lastAgentReply: { stringValue: (msgs.filter(m => m.role === 'agent' || m.role === 'assistant').pop()?.text || '').substring(0, 150) },
                leadStatus: { stringValue: 'Active Inquiry' },
                conversationRef: { stringValue: `conversations/${cleanAgentTitle}` }
              }
            })
          });
        } catch (_) {}

        // 4. Update agent_info live metrics
        try {
          await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agent_info/${encodeURIComponent(cleanAgentTitle)}?updateMask.fieldPaths=lastActiveAt&updateMask.fieldPaths=status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                status: { stringValue: 'Online' },
                lastActiveAt: { timestampValue: new Date().toISOString() }
              }
            })
          });
        } catch (_) {}
      }, 400);
    }

    let isHandlingMessage = false;

    // Process Message with 0ms Instant UI Feedback, Animated Typing Indicator & Progressive Delay Messages
    async function handleUserMessage(userText) {
      const cleanInput = String(userText || '').trim();
      if (!cleanInput || isHandlingMessage) return;

      isHandlingMessage = true;
      if (sendBtn) sendBtn.disabled = true;

      // 0ms Instant Optimistic UI: Show visitor question & animated typing bubble BEFORE any network await!
      const detectedQueryLang = detectTextLanguage(cleanInput);
      appendMsg(cleanInput, 'user');
      conversationHistory.push({ role: 'user', content: cleanInput });
      sessionLogMessages.push({ role: 'user', text: cleanInput, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
      orb.className = 'vhd-orb-btn listening';
      voiceLabel.textContent = detectedQueryLang === 'mr-IN' ? 'विचार करत आहे…' : detectedQueryLang === 'hi-IN' ? 'सोच रहा हूँ…' : 'Thinking…';

      const typingLoader = showTypingIndicator(detectedQueryLang);

      if (recognition && currentSpeechLang === 'auto') {
        recognition.lang = detectedQueryLang;
      }

      // Non-blocking background config/deletion sync (never delays the visitor's question!)
      let agentDeleted = false;
      fetchAgentConfig().then((stillActive) => {
        if (stillActive === false) {
          agentDeleted = true;
          typingLoader.remove();
          const existing = document.getElementById('voice-helpdesk-root');
          if (existing) existing.remove();
        }
      }).catch(() => {});

      let reply = '';
      let navAction = null;

      try {
        const apiKey = (currentScript && (currentScript.getAttribute('data-api-key') || currentScript.getAttribute('data-key'))) ||
                       agentConfig.apiKey ||
                       window.AI_AGENT_API_KEY ||
                       '';

        // 1. Deterministically resolve Live Real-Time Website Database Bridge first
        const bridgeResult = await resolveDatabaseBridge(cleanInput, agentConfig, conversationContext);
        if (agentDeleted) return;

        // Determine interactive navigation or highlight action
        if (bridgeResult) {
          if (bridgeResult.status === 'NAVIGATE_SECTION') {
            const sec = bridgeResult.data || resolveExactRedirectTarget(cleanInput, agentConfig?.siteBlueprint) || findHostSection(cleanInput);
            if (sec) {
              executeRedirectAction(sec, true);
              navAction = {
                label: sec.isCrossPage ? `Go to ${sec.label}` : (sec.targetType === 'form' ? `Open ${sec.label}` : `Jump to ${sec.label}`),
                sectionInfo: sec.element ? sec : null,
                redirectTarget: sec,
                redirectUrl: sec.isCrossPage ? sec.redirectUrl : null,
                isCrossPage: Boolean(sec.isCrossPage),
                targetType: sec.targetType || 'section'
              };
            }
          } else if (bridgeResult.status === 'FOUND_IN_HOST_STATE' || bridgeResult.status === 'FOUND_IN_LIVE_API') {
            if (bridgeResult.data) conversationContext.activeItem = bridgeResult.data;
            const sec = findHostSection('inventory') || findHostSection('products') || findHostSection('menu') || findHostSection('pricing');
            if (sec) scrollToHostSection(sec);
            const cleanBtnName = cleanScrapedItemTitle(bridgeResult.data?.name || 'Item').name.substring(0, 25);
            navAction = sec ? { label: `View ${cleanBtnName}`, sectionInfo: sec } : null;
          } else if (bridgeResult.status === 'FOUND_CATALOG_LIST' || bridgeResult.status === 'FOUND_PRICE_OVERVIEW') {
            if (Array.isArray(bridgeResult.data) && bridgeResult.data.length > 0) {
              conversationContext.lastDisplayedItems = bridgeResult.data;
              conversationContext.catalogOffset = Math.min(5, bridgeResult.data.length);
              conversationContext.activeTopic = bridgeResult.status === 'FOUND_PRICE_OVERVIEW' ? 'pricing' : 'catalog_list';
            }
            const sec = findHostSection('courses') || findHostSection('inventory') || findHostSection('products') || findHostSection('menu') || findHostSection('pricing');
            if (sec) scrollToHostSection(sec);
            navAction = sec ? { label: `View ${sec.label}`, sectionInfo: sec } : null;
          }
        }

        // 2. Call BYOK LLM (Groq / Gemini / OpenAI) with live database & website context
        if (apiKey) {
          const customerSystemPrompt = buildCustomerSystemPrompt(agentConfig, bridgeResult, detectedQueryLang, conversationContext);
          reply = await callLLMWithBYOK(cleanInput, customerSystemPrompt, conversationHistory, apiKey, agentConfig.model);
          if (reply) conversationContext.fallbackCount = 0;
        }

        // 3. Fallback to Local Semantic Knowledge Reasoner ONLY if BYOK failed or API key missing
        if (!reply) {
          const localRes = await inferLocalAgentResponse(cleanInput, bridgeResult, conversationHistory, conversationContext);
          if (typeof localRes === 'object' && localRes !== null) {
            reply = localRes.reply || '';
            if (!navAction) navAction = localRes.navAction || null;
          } else {
            reply = localRes;
          }
        }

        if (agentDeleted) return;

        typingLoader.remove();

        conversationContext.lastReply = reply;
        conversationContext.turnCount = (conversationContext.turnCount || 0) + 1;
        conversationHistory.push({ role: 'assistant', content: reply });
        sessionLogMessages.push({ role: 'agent', text: reply, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        recordSessionLogToAgentFolder(sessionLogMessages);

        orb.className = 'vhd-orb-btn speaking';
        voiceLabel.textContent = 'Speaking...';
        appendMsg(reply, 'agent', navAction);
        speakReply(reply);
      } catch (err) {
        console.warn('[Echo AI Widget] Error handling message:', err);
        typingLoader.remove();
        const fallbackMsg = detectedQueryLang === 'mr-IN'
          ? 'क्षमस्व, उत्तर तयार करताना थोडी तांत्रिक अडचण आली. कृपया पुन्हा विचारा!'
          : detectedQueryLang === 'hi-IN'
            ? 'क्षमा करें, उत्तर तैयार करने में थोड़ी समस्या आई। कृपया पुनः पूछें!'
            : 'Sorry, I ran into a quick hiccup preparing that answer. Please try asking again!';
        appendMsg(fallbackMsg, 'agent');
        orb.className = 'vhd-orb-btn';
        voiceLabel.textContent = 'Tap to Speak';
      } finally {
        typingLoader.remove();
        isHandlingMessage = false;
        if (sendBtn) sendBtn.disabled = false;
      }
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

      let cleanSpoken = String(text).replace(/[*#_`]/g, '').trim();
      if (!cleanSpoken) return;

      // Smart TTS brevity: If text is a long catalog listing, summarize concisely for spoken audio (< 25 words)
      const catalogMatch = cleanSpoken.match(/^We currently have (\d+) ([\w\s]+?) in our live database: (.*?)\.(.*)$/i);
      if (catalogMatch) {
        const count = catalogMatch[1];
        const noun = catalogMatch[2];
        const items = catalogMatch[3].split(',').map(s => s.trim());
        const sample = items.slice(0, 3).join(', ');
        const ending = catalogMatch[4] ? catalogMatch[4].trim() : '';
        cleanSpoken = `We have ${count} ${noun} in our live database, including ${sample}. ${ending}`.trim();
      }
      const mrCatalogMatch = cleanSpoken.match(/^आमच्या लाइव्ह डेटाबेसमध्ये सध्या उपलब्ध ([\w\s]+?): (.*?)\.(.*)$/i);
      if (mrCatalogMatch) {
        const noun = mrCatalogMatch[1];
        const items = mrCatalogMatch[2].split(',').map(s => s.trim());
        const sample = items.slice(0, 3).join(', ');
        const ending = mrCatalogMatch[3] ? mrCatalogMatch[3].trim() : '';
        cleanSpoken = `आमच्या डेटाबेसमध्ये उपलब्ध ${noun}: ${sample}. ${ending}`.trim();
      }
      const hiCatalogMatch = cleanSpoken.match(/^हमारे लाइव डेटाबेस में उपलब्ध ([\w\s]+?): (.*?)\.(.*)$/i);
      if (hiCatalogMatch) {
        const noun = hiCatalogMatch[1];
        const items = hiCatalogMatch[2].split(',').map(s => s.trim());
        const sample = items.slice(0, 3).join(', ');
        const ending = hiCatalogMatch[3] ? hiCatalogMatch[3].trim() : '';
        cleanSpoken = `हमारे डेटाबेस में उपलब्ध ${noun}: ${sample}। ${ending}`.trim();
      }

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
