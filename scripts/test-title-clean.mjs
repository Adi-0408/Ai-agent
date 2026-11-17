import assert from 'node:assert';

function cleanScrapedItemTitle(raw) {
  if (!raw) return { name: '', desc: '' };
  let str = String(raw).trim();
  // Step 1: Disentangle jammed words (e.g. "TabletParacetamol" or "(650mg)Micro")
  // Requires at least 3 lowercase letters before the capital to prevent splitting "iPhone", "eBay", "macOS"
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
    const formIdx = words.findIndex(w => /^(Tablet|Tablets|Capsule|Capsules|Syrup|Injection|Drops|Ointment|Cream|Gel|Duo)$/i.test(w));
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

const tests = [
  {
    input: 'Dolo 650 TabletParacetamol (650mg)Micro Labs Ltd',
    expectedName: 'Dolo 650 Tablet',
    domain: 'Pharma jammed cell'
  },
  {
    input: 'Margherita Pizza (Fresh Mozzarella, Basil, Olive Oil)',
    expectedName: 'Margherita Pizza',
    domain: 'Restaurant / Pizza'
  },
  {
    input: 'Nike Air Max 270 (Running Shoes - Black/White)',
    expectedName: 'Nike Air Max 270',
    domain: 'E-commerce Sneakers'
  },
  {
    input: 'Pro Plan ($49/month billed annually)',
    expectedName: 'Pro Plan',
    domain: 'SaaS Subscription'
  },
  {
    input: 'iPhone 15 Pro 256GB Natural Titanium',
    expectedName: 'iPhone 15 Pro 256GB Natural Titanium',
    domain: 'Electronics'
  },
  {
    input: 'Teeth Whitening Treatment (Includes Consultation)',
    expectedName: 'Teeth Whitening Treatment',
    domain: 'Dental Clinic'
  },
  {
    input: 'Augmentin 625 Duo Tablet',
    expectedName: 'Augmentin 625 Duo Tablet',
    domain: 'Pharma clean'
  }
];

tests.forEach(t => {
  const res = cleanScrapedItemTitle(t.input);
  console.log(`[${t.domain}] Input: "${t.input}" -> Clean Name: "${res.name}"`);
  assert.strictEqual(res.name, t.expectedName);
});

console.log('\nAll title cleaning tests passed across ALL domains! 🎯');

// Test matching accuracy and zero false positives
const inventory = [
  { name: 'Dolo 650 Tablet', stock: 15, unit: 'Strip', price: '₹32.00', dosage: 'Paracetamol (650mg) Micro Labs Ltd' },
  { name: 'Margherita Pizza', stock: 50, price: '$14.99' },
  { name: 'Pro Plan', price: '$49/mo' }
];

const UNIVERSAL_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'for', 'of', 'in', 'on', 'at', 'to', 'from', 'with', 'by', 'is', 'are', 'was', 'were',
  'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could', 'will', 'would', 'should',
  'what', 'which', 'who', 'how', 'where', 'when', 'why', 'give', 'show', 'tell', 'check', 'get', 'see', 'find', 'me', 'us',
  'price', 'cost', 'rate', 'rates', 'fee', 'fees', 'mrp', 'charges', 'howmuch', 'much',
  'stock', 'stocks', 'available', 'availability', 'quantity', 'count', 'units', 'many',
  'buy', 'sell', 'order', 'please', 'details', 'detail', 'info', 'information',
  'item', 'items', 'product', 'products', 'model', 'models', 'piece', 'pieces', 'pcs', 'pack', 'packs', 'package',
  'tablet', 'tablets', 'capsule', 'capsules', 'syrup', 'syrups', 'injection', 'injections', 'drops', 'ointment', 'cream',
  'strip', 'strips', 'box', 'boxes', 'bottle', 'bottles', 'pouch', 'pouches', 'bag', 'bags', 'packet', 'packets'
]);

const GENERIC_PRODUCT_NOUNS = new Set([
  'pizza', 'burger', 'sandwich', 'pasta', 'salad', 'coffee', 'tea', 'drink', 'beverage', 'cake', 'bread',
  'phone', 'mobile', 'laptop', 'computer', 'watch', 'headphone', 'headphones', 'earbuds', 'case', 'cover', 'charger',
  'shoe', 'shoes', 'sneaker', 'sneakers', 'boot', 'boots', 'shirt', 'tshirt', 'pant', 'pants', 'jeans', 'jacket', 'dress',
  'medicine', 'medicines', 'med', 'meds', 'drug', 'drugs', 'pill', 'pills', 'tablet', 'tablets', 'capsule', 'capsules',
  'syrup', 'syrups', 'injection', 'injections', 'drops', 'ointment', 'cream', 'gel',
  'plan', 'plans', 'service', 'services', 'treatment', 'consultation', 'appointment', 'course', 'room'
]);

function matchInInventory(inventorySource, rawTarget) {
  if (!inventorySource) return null;
  const target = String(rawTarget || '').toLowerCase().trim();
  if (!target) return null;

  const cleanTarget = target.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const allTokens = cleanTarget.split(' ').filter(w => w.length >= 2);
  const distinctiveTokens = allTokens.filter(tok => !UNIVERSAL_STOPWORDS.has(tok));
  const searchTokens = distinctiveTokens.length > 0 ? distinctiveTokens : allTokens;

  // Specific entity tokens: tokens that are NOT generic nouns
  const specificTokens = searchTokens.filter(tok => !GENERIC_PRODUCT_NOUNS.has(tok));

  // Phase 1: Exact normalized substring match on clean name
  for (const item of inventorySource) {
    const name = String(item.name || '').toLowerCase().trim();
    const cleanName = name.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (name && (name === target || cleanName === cleanTarget || name.includes(target) || cleanName.includes(cleanTarget))) {
      return item;
    }
  }

  // Phase 2: Token Overlap with Entity Verification
  let best = null;
  let maxScore = 0;
  for (const item of inventorySource) {
    const name = String(item.name || '').toLowerCase().trim();
    const cleanName = name.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const details = String(item.description || item.dosage || '').toLowerCase().trim();
    const combined = `${name} ${details}`.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const itemTokens = new Set(combined.split(' '));

    // If query has specific entity tokens (e.g. 'pepperoni', 'augmentin', 'dolo'),
    // at least ONE specific entity token MUST match in the item name or details!
    if (specificTokens.length > 0) {
      const hasSpecificMatch = specificTokens.some(tok => cleanName.includes(tok) || itemTokens.has(tok));
      if (!hasSpecificMatch) {
        continue; // REJECT: Only generic noun matched, specific entity did not match!
      }
    }

    let matchCount = 0;
    let nameMatchCount = 0;

    for (const tok of searchTokens) {
      if (cleanName.includes(tok)) {
        nameMatchCount += 2;
        matchCount++;
      } else if (itemTokens.has(tok) || combined.includes(tok)) {
        matchCount++;
      }
    }

    const score = nameMatchCount + matchCount;
    if (nameMatchCount > 0 && score > maxScore) {
      maxScore = score;
      best = item;
    }
  }

  if (best && maxScore >= 2) {
    return best;
  }

  return null;
}

// 1. Asking for Augmentin when only Dolo exists MUST return null (ZERO FALSE POSITIVE)
const matchAugmentin = matchInInventory(inventory, 'Augmentin 625 Duo Tablet');
console.log('Match Augmentin in Dolo-only inventory:', matchAugmentin);
assert.strictEqual(matchAugmentin, null, 'Augmentin MUST NOT match Dolo 650!');

// 2. Asking for Dolo 650 MUST return Dolo 650
const matchDolo = matchInInventory(inventory, 'Dolo 650');
console.log('Match Dolo 650:', matchDolo.name);
assert.strictEqual(matchDolo.name, 'Dolo 650 Tablet');

// 3. Asking for Pizza MUST return Margherita Pizza
const matchPizza = matchInInventory(inventory, 'Margherita Pizza');
console.log('Match Margherita Pizza:', matchPizza.name);
assert.strictEqual(matchPizza.name, 'Margherita Pizza');

// 4. Asking for Pepperoni Pizza MUST return null
const matchPepperoni = matchInInventory(inventory, 'Pepperoni Pizza');
console.log('Match Pepperoni Pizza:', matchPepperoni);
assert.strictEqual(matchPepperoni, null, 'Pepperoni MUST NOT match Margherita!');

// 5. Asking for Pro Plan MUST return Pro Plan
const matchPro = matchInInventory(inventory, 'Pro Plan');
console.log('Match Pro Plan:', matchPro.name);
assert.strictEqual(matchPro.name, 'Pro Plan');

console.log('\nAll zero-false-positive and domain matching assertions passed! 🏆');
