const FIREBASE_PROJECT_ID = 'ai-agent-11df2';
const agentId = 'test';

async function main() {
  const getUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agents/${agentId}`;
  const res = await fetch(getUrl);
  const data = await res.json();
  console.log('apiKey:', data.fields?.apiKey);
  console.log('model:', data.fields?.model);
  const kb = data.fields?.knowledgeBase?.arrayValue?.values || [];
  console.log(`Total KB entries: ${kb.length}`);
  kb.forEach((v, i) => {
    const q = v.mapValue?.fields?.q?.stringValue || '';
    const a = v.mapValue?.fields?.a?.stringValue || '';
    if (q.toLowerCase().includes('generate') || q.toLowerCase().includes('high') || q.toLowerCase().includes('fidelity') || i < 15) {
      console.log(`[KB ${i}] Q: ${q} | A: ${a.slice(0, 100)}`);
    }
  });

  const db = data.fields?.database?.arrayValue?.values || [];
  console.log(`Total DB entries: ${db.length}`);
  db.forEach((v, i) => {
    const name = v.mapValue?.fields?.name?.stringValue || '';
    if (name.toLowerCase().includes('generate') || name.toLowerCase().includes('high') || name.toLowerCase().includes('fidelity') || i < 15) {
      console.log(`[DB ${i}] Name: ${name}`);
    }
  });

  const dbr = data.fields?.databaseRecords?.arrayValue?.values || [];
  console.log(`Total databaseRecords entries: ${dbr.length}`);
  dbr.forEach((v, i) => {
    const name = v.mapValue?.fields?.name?.stringValue || '';
    console.log(`[DBR ${i}] Name: ${name}`);
  });
}

main();
