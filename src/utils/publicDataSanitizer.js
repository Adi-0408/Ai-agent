const NEVER_PUBLIC = /(?:password|secret|token|api.?key|credential|email|phone|address|customer.?id|user.?id|tenant.?id|agent.?id|supplier.?cost|margin|profit|notes|payment|employee|internal.?id)/i;

export function sanitizePublicRecords(records = [], fieldAllowlist = {}) {
  if (!Array.isArray(records) || !fieldAllowlist || typeof fieldAllowlist !== 'object') return [];
  return records.map(record => {
    const source = String(record?.collection || record?.sourceId || 'products');
    const allowed = fieldAllowlist[source];
    if (!record || !Array.isArray(allowed)) return null;
    const safe = {};
    for (const key of allowed) {
      const value = record[key];
      if (typeof key !== 'string' || NEVER_PUBLIC.test(key) || !Object.hasOwn(record, key)) continue;
      if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) safe[key] = value;
    }
    return Object.keys(safe).length ? safe : null;
  }).filter(Boolean);
}
