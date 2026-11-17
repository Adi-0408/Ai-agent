// Sanitize Firestore 'agents/test' document: Purge 318 code lines and replace with clean academic admissions data
const FIREBASE_PROJECT_ID = 'ai-agent-11df2';
const agentId = 'test';

async function sanitizeTestAgent() {
  console.log(`Connecting to Firestore for agent "${agentId}"...`);
  const getUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agents/${agentId}`;
  
  try {
    const res = await fetch(getUrl);
    if (!res.ok) {
      console.log(`Agent "${agentId}" not found in Firestore (Status: ${res.status}). Nothing to clean.`);
      return;
    }

    const doc = await res.json();
    console.log(`Successfully fetched "${agentId}" from Firestore.`);

    // Clean Academic Admissions Records for Sangli Shikshan Sanstha
    const cleanAdmissionsRecords = [
      {
        id: "rec_1",
        name: "Std 11th - 12th Science (State Board)",
        price: "₹25,000 / year",
        stock: 120,
        unit: "seats",
        category: "Higher Secondary",
        description: "Comprehensive PCB/PCM curriculum with state-of-the-art laboratory facilities and expert faculty."
      },
      {
        id: "rec_2",
        name: "MHT-CET / JEE / NEET Foundation Program",
        price: "₹45,000 / year",
        stock: 80,
        unit: "seats",
        category: "Competitive Coaching",
        description: "Intensive daily practice problems, mock examinations, and rank-oriented mentorship for engineering and medical entrance."
      },
      {
        id: "rec_3",
        name: "Std 11th - 12th Commerce",
        price: "₹20,000 / year",
        stock: 150,
        unit: "seats",
        category: "Higher Secondary",
        description: "Focus on Accountancy, Economics, Business Studies, and Foundation CA mentorship."
      },
      {
        id: "rec_4",
        name: "English Medium High School (Class 5-10)",
        price: "₹22,000 / year",
        stock: 90,
        unit: "seats",
        category: "Secondary School",
        description: "Semi-English and Full English divisions with smart classrooms, sports arena, and holistic cultural activities."
      },
      {
        id: "rec_5",
        name: "English Medium Primary School (Class 1-4)",
        price: "₹18,000 / year",
        stock: 60,
        unit: "seats",
        category: "Primary School",
        description: "Activity-based experiential learning fostering creativity, foundational mathematics, and linguistic fluency."
      }
    ];

    // Convert JS array to Firestore arrayValue format
    const firestoreDbRecords = {
      arrayValue: {
        values: cleanAdmissionsRecords.map(r => ({
          mapValue: {
            fields: {
              id: { stringValue: r.id },
              name: { stringValue: r.name },
              price: { stringValue: r.price },
              stock: { integerValue: String(r.stock) },
              unit: { stringValue: r.unit },
              category: { stringValue: r.category },
              description: { stringValue: r.description }
            }
          }
        }))
      }
    };

    const cleanGreeting = "Welcome to Sangli Shikshan Sanstha Admissions! I am test, your dedicated academic admissions assistant. How can I assist you with our courses, eligibility, fees, or application procedures today?";

    const patchUrl = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/agents/${agentId}?updateMask.fieldPaths=databaseRecords&updateMask.fieldPaths=greeting&updateMask.fieldPaths=archetype&updateMask.fieldPaths=role`;

    const patchPayload = {
      fields: {
        databaseRecords: firestoreDbRecords,
        greeting: { stringValue: cleanGreeting },
        archetype: { stringValue: "academic" },
        role: { stringValue: "Academic Admissions Assistant" }
      }
    };

    const patchRes = await fetch(patchUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchPayload)
    });

    if (patchRes.ok) {
      console.log(`🎉 Successfully sanitized agent "${agentId}" in Firestore! Replaced 318 code lines with 5 clean admissions courses.`);
    } else {
      const errText = await patchRes.text();
      console.error(`Failed to patch agent: ${patchRes.status}`, errText);
    }
  } catch (err) {
    console.error("Sanitize script error:", err);
  }
}

sanitizeTestAgent();
