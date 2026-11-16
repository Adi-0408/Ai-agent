import JSZip from 'jszip';
import { isZipFile, extractFilesFromZip, expandFileList } from '../src/utils/zipHandler.js';
import { detectFileType, analyzeFullStackFiles } from '../src/utils/codebaseAnalyzer.js';

async function runTest() {
  console.log('Testing JSZip archive creation and zipHandler extraction...');

  // Create an in-memory zip archive with frontend, backend, database files, and junk folders
  const zip = new JSZip();

  // Database files
  zip.file('database/schema.sql', 'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(100));\nCREATE TABLE products (id INT PRIMARY KEY, title VARCHAR(100), price DECIMAL);');
  zip.file('database/faq.json', JSON.stringify([
    { question: 'What payment methods are supported?', answer: 'We accept Credit Cards, PayPal, and UPI.' },
    { question: 'Where are products shipped from?', answer: 'Orders are shipped from our central warehouse.' }
  ]));
  zip.file('data/catalog.csv', 'id,name,price\n1,Pro Widget,29.99\n2,Enterprise Hub,99.99');

  // Frontend files
  zip.file('src/components/Header.jsx', 'export default function Header() {\n  return <header><h1>Awesome Store</h1></header>;\n}');
  zip.file('src/App.jsx', 'import React from "react";\nexport default function App() {\n  return <div>Welcome to Awesome Store</div>;\n}');

  // Backend files
  zip.file('server/api.py', 'from fastapi import FastAPI\napp = FastAPI()\n@app.get("/api/products")\ndef get_products():\n    return []');

  // Junk entries that should be ignored
  zip.file('node_modules/dummy/index.js', 'console.log("ignore me");');
  zip.file('.git/config', 'dummy git config');
  zip.file('__MACOSX/._schema.sql', 'binary mac junk');
  zip.file('.DS_Store', 'mac ds store');
  zip.file('dist/bundle.js', 'compiled bundle');

  const zipContentBuffer = await zip.generateAsync({ type: 'uint8array' });
  const mockZipFile = {
    name: 'test_project.zip',
    type: 'application/zip',
    size: zipContentBuffer.length
  };
  // Polyfill loadAsync on the mock file or pass buffer
  const unpacked = await extractFilesFromZip(zipContentBuffer);

  console.log(`Extracted ${unpacked.length} files from zip.`);
  const extractedPaths = unpacked.map(f => f.relativePath);
  console.log('Extracted paths:', extractedPaths);

  // Assertions
  const hasJunk = extractedPaths.some(p => p.includes('node_modules') || p.includes('.git') || p.includes('__MACOSX') || p.includes('.DS_Store') || p.includes('dist/'));
  if (hasJunk) {
    throw new Error('Junk files were not filtered out!');
  }

  const expectedPaths = [
    'database/schema.sql',
    'database/faq.json',
    'data/catalog.csv',
    'src/components/Header.jsx',
    'src/App.jsx',
    'server/api.py'
  ];

  for (const exp of expectedPaths) {
    if (!extractedPaths.includes(exp)) {
      throw new Error(`Expected path ${exp} was not found in extracted files!`);
    }
  }

  // Test full-stack classification
  const processedFiles = unpacked.map(f => {
    const tier = detectFileType(f.name, f.textContent);
    return {
      id: f.name,
      name: f.name,
      type: tier,
      content: f.textContent,
      relativePath: f.relativePath
    };
  });

  const fullStack = analyzeFullStackFiles(processedFiles);
  console.log('Classified summary:', {
    frontendCount: fullStack.frontend.length,
    backendCount: fullStack.backend.length,
    databaseCount: fullStack.database.length,
    knowledgeItems: fullStack.combinedKnowledge.length
  });

  if (fullStack.database.length < 3) {
    throw new Error('Database files were not properly categorized!');
  }
  if (fullStack.frontend.length < 2) {
    throw new Error('Frontend files were not properly categorized!');
  }
  if (fullStack.backend.length < 1) {
    throw new Error('Backend files were not properly categorized!');
  }

  console.log('✓ All zipHandler tests passed successfully!');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
