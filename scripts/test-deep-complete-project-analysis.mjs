/**
 * Comprehensive Verification Suite:
 * Deep and Complete Project Analysis Without Missing Any Components
 *
 * Tests:
 * 1. Full Project Coverage (45+ files across nested folders — zero silent 30-file cap!)
 * 2. Explicit Coverage Verification & Omission Manifest (skipped binary/ignored + inaccessible files)
 * 3. Deep Frontend Analysis (Components, Layouts, Child Tree, State/Hooks, UI Interactions, Routes)
 * 4. Deep Backend Analysis (Routes, Middleware Chains, Services, Controllers, Server Ops)
 * 5. Deep Database Analysis (SQL Columns/PK/FK, Prisma @relation, Mongoose refs, CRUD call sites)
 * 6. Cross-Module Dependency Graph (Resolved Imports, Reverse importedBy, Cycles, Unresolved, Orphans, E2E Chains)
 * 7. Continuous Incremental Re-Indexing (modify 1, add 1, delete 1 -> reuses unchanged files in O(1))
 * 8. Context-Budget-Safe 1-Hop Query Retrieval & Studio aiCompletionService + Strict Customer Mode Isolation
 */

import assert from 'assert';
import {
  buildDeepProjectIndex,
  updateDeepProjectIndexIncremental,
  queryDeepProjectIndex,
  resolveDeepProjectQuery,
  compactDeepProjectIndexForStorage
} from '../src/utils/deepProjectIndexer.js';
import { analyzeFullStackFiles } from '../src/utils/codebaseAnalyzer.js';
import { classifyIgnoredZipPath } from '../src/utils/zipHandler.js';
import { generateAIResponse } from '../src/services/aiCompletionService.js';

let passed = 0;
function check(label, fn) {
  fn();
  passed++;
  console.log(`  ✓ ${label}`);
}
async function checkAsync(label, fn) {
  await fn();
  passed++;
  console.log(`  ✓ ${label}`);
}

console.log('=== DEEP & COMPLETE PROJECT ANALYSIS VERIFICATION SUITE ===\n');

// Construct a rich 45-file multi-folder full-stack project with real frontend, backend, DB, configs, tests & edge cases
const projectFiles = [
  {
    name: 'package.json',
    relativePath: 'package.json',
    content: JSON.stringify({
      name: 'edupulse-platform',
      dependencies: {
        react: '^19.0.0',
        express: '^4.21.0',
        zustand: '^5.0.0',
        prisma: '^6.0.0',
        stripe: '^17.0.0',
        jsonwebtoken: '^9.0.0'
      },
      devDependencies: { vite: '^6.0.0', tailwindcss: '^4.0.0' },
      scripts: { dev: 'vite', build: 'vite build', start: 'node server/server.js' }
    })
  },
  {
    name: '.env.example',
    relativePath: '.env.example',
    content: 'DATABASE_URL=postgres://localhost/edu\nJWT_SECRET=changeme\n'
  },
  {
    name: 'MainLayout.jsx',
    relativePath: 'src/layouts/MainLayout.jsx',
    content: `
      import React from 'react';
      import Navbar from '../components/Navbar';
      import Footer from '../components/Footer';
      export default function MainLayout({ children }) {
        return <div className="layout"><Navbar /><main>{children}</main><Footer /></div>;
      }
    `
  },
  {
    name: 'Navbar.jsx',
    relativePath: 'src/components/Navbar.jsx',
    content: `
      import React, { useContext } from 'react';
      import { AuthContext } from '../store/AuthContext';
      export default function Navbar() {
        const { user } = useContext(AuthContext);
        return <nav><button onClick={handleLogout}>Logout</button></nav>;
      }
    `
  },
  {
    name: 'Footer.jsx',
    relativePath: 'src/components/Footer.jsx',
    content: `export default function Footer() { return <footer>© EduPulse</footer>; }`
  },
  {
    name: 'AuthContext.jsx',
    relativePath: 'src/store/AuthContext.jsx',
    content: `
      import React, { createContext, useState } from 'react';
      export const AuthContext = createContext('auth');
      export function AuthProvider({ children }) {
        const [user, setUser] = useState(null);
        return <AuthContext.Provider value={{ user, setUser }}>{children}</AuthContext.Provider>;
      }
    `
  },
  {
    name: 'useCourseStore.js',
    relativePath: 'src/store/useCourseStore.js',
    content: `
      import { create } from 'zustand';
      export const useCourseStore = create((set) => ({
        courses: [],
        setCourses: (courses) => set({ courses })
      }));
    `
  },
  {
    name: 'AdmissionPage.jsx',
    relativePath: 'src/pages/AdmissionPage.jsx',
    content: `
      import React, { useState, useEffect } from 'react';
      import MainLayout from '../layouts/MainLayout';
      import CourseCard from '../components/CourseCard';
      import { submitAdmission } from '../services/admissionClient';
      export default function AdmissionPage() {
        const [studentName, setStudentName] = useState('');
        useEffect(() => { fetch('/api/courses'); }, []);
        const handleSubmit = async (e) => {
          e.preventDefault();
          await submitAdmission({ studentName });
        };
        return (
          <MainLayout>
            <CourseCard />
            <form id="admission-form" onSubmit={handleSubmit}>
              <input onChange={(e) => setStudentName(e.target.value)} />
              <button onClick={handleSubmit}>Apply</button>
            </form>
          </MainLayout>
        );
      }
    `
  },
  {
    name: 'CourseCard.jsx',
    relativePath: 'src/components/CourseCard.jsx',
    content: `
      import React from 'react';
      import { formatCurrency } from '../utils/formatters';
      export default function CourseCard({ course }) {
        return <div>{formatCurrency(course.fee)}</div>;
      }
    `
  },
  {
    name: 'admissionClient.js',
    relativePath: 'src/services/admissionClient.js',
    content: `
      import axios from 'axios';
      export async function submitAdmission(payload) {
        return axios.post('/api/admissions', payload);
      }
      export async function checkMissingEndpoint() {
        return fetch('/api/legacy-ghost-check', { method: 'POST' });
      }
    `
  },
  {
    name: 'formatters.js',
    relativePath: 'src/utils/formatters.js',
    content: `export function formatCurrency(n) { return '₹' + Number(n || 0).toLocaleString(); }`
  },
  {
    name: 'cycleA.js',
    relativePath: 'src/utils/cycleA.js',
    content: `import { helperB } from './cycleB'; export function helperA() { return helperB(); }`
  },
  {
    name: 'cycleB.js',
    relativePath: 'src/utils/cycleB.js',
    content: `import { helperA } from './cycleA'; export function helperB() { return helperA(); }`
  },
  {
    name: 'orphanHelper.js',
    relativePath: 'src/utils/orphanHelper.js',
    content: `export function unusedOldUtility() { return 42; }`
  },
  {
    name: 'brokenImport.js',
    relativePath: 'src/utils/brokenImport.js',
    content: `import { ghost } from './doesNotExistModule'; export const runGhost = () => ghost();`
  },
  {
    name: 'server.js',
    relativePath: 'server/server.js',
    content: `
      import express from 'express';
      import cors from 'cors';
      import authMiddleware from './middleware/authMiddleware';
      import admissionsRouter from './routes/admissionsRoutes';
      const app = express();
      app.use(cors());
      app.use('/api/admissions', admissionsRouter);
      app.get('/api/courses', async (req, res) => {
        try {
          const rows = await db.query('SELECT * FROM courses');
          res.json(rows);
        } catch (err) { res.status(500).json({ error: err.message }); }
      });
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
    `
  },
  {
    name: 'authMiddleware.js',
    relativePath: 'server/middleware/authMiddleware.js',
    content: `
      import jwt from 'jsonwebtoken';
      export default function authMiddleware(req, res, next) {
        const token = req.headers.authorization;
        jwt.verify(token, process.env.JWT_SECRET);
        next();
      }
    `
  },
  {
    name: 'admissionsRoutes.js',
    relativePath: 'server/routes/admissionsRoutes.js',
    content: `
      import express from 'express';
      import authMiddleware from '../middleware/authMiddleware';
      import { createAdmission } from '../controllers/admissionsController';
      const router = express.Router();
      router.post('/api/admissions', authMiddleware, validateAdmission, async (req, res) => {
        try {
          const saved = await createAdmission(req.body);
          res.json(saved);
        } catch (err) { res.status(500).json({ error: err.message }); }
      });
      export default router;
    `
  },
  {
    name: 'admissionsController.js',
    relativePath: 'server/controllers/admissionsController.js',
    content: `
      import nodemailer from 'nodemailer';
      import Stripe from 'stripe';
      export async function createAdmission(data) {
        const sql = 'INSERT INTO admissions (student_id, course_id) VALUES ($1, $2)';
        await sendMail(data.email);
        return sql;
      }
    `
  },
  {
    name: 'schema.sql',
    relativePath: 'database/schema.sql',
    content: `
      CREATE TABLE students (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(120) NOT NULL,
        email VARCHAR(160) UNIQUE
      );
      CREATE TABLE courses (
        id SERIAL PRIMARY KEY,
        title VARCHAR(120) NOT NULL,
        fee INTEGER NOT NULL
      );
      CREATE TABLE admissions (
        id SERIAL PRIMARY KEY,
        student_id INTEGER NOT NULL REFERENCES students(id),
        course_id INTEGER NOT NULL,
        FOREIGN KEY (course_id) REFERENCES courses(id)
      );
    `
  },
  {
    name: 'schema.prisma',
    relativePath: 'prisma/schema.prisma',
    content: `
      model Enrollment {
        id Int @id
        studentId Int
        student Student @relation(fields: [studentId], references: [id])
      }
    `
  },
  {
    name: 'PaymentModel.js',
    relativePath: 'database/models/PaymentModel.js',
    content: `
      import mongoose from 'mongoose';
      const PaymentSchema = new mongoose.Schema({
        admissionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admission' },
        amount: Number
      });
      export default mongoose.model('Payment', PaymentSchema);
    `
  },
  {
    name: 'corrupted.txt',
    relativePath: 'src/data/corrupted.txt',
    content: '[Failed to read text entry: CRC mismatch]'
  },
  {
    name: 'admission.test.js',
    relativePath: 'tests/admission.test.js',
    content: `import { formatCurrency } from '../src/utils/formatters'; test('fmt', () => expect(formatCurrency(100)).toBe('₹100'));`
  }
];

// Add 24 extra modular UI components across nested folders to exceed 45 total files (proving zero 30-file truncation!)
const widgetImports = [];
for (let i = 1; i <= 24; i++) {
  widgetImports.push(`import FeatureWidget${i} from './components/widgets/FeatureWidget${i}';`);
  projectFiles.push({
    name: `FeatureWidget${i}.jsx`,
    relativePath: `src/components/widgets/FeatureWidget${i}.jsx`,
    content: `import React from 'react'; import { formatCurrency } from '../../utils/formatters'; export default function FeatureWidget${i}() { return <div>{formatCurrency(${i * 100})}</div>; }`
  });
}
projectFiles.push({
  name: 'App.jsx',
  relativePath: 'src/App.jsx',
  content: `import React from 'react';\nimport AdmissionPage from './pages/AdmissionPage';\n${widgetImports.join('\n')}\nexport default function App() { return <AdmissionPage />; }`
});

// Simulate ZIP omission manifest (ignored dirs, lockfiles, binary assets)
projectFiles.omissionReport = [
  { path: 'node_modules/react/index.js', reason: 'ignored_directory' },
  { path: 'package-lock.json', reason: 'lockfile' },
  { path: 'public/hero-banner.png', reason: 'binary_asset' }
];

// 1. Full Project Coverage & Omission Verification
console.log('1. Full Project Coverage & Verification Manifest (49 files):');
const fullResult = analyzeFullStackFiles(projectFiles);
const deepIndex = fullResult.deepProjectIndex;

check('Analyzes ALL 48 readable files without any 30-file truncation cap', () => {
  assert.strictEqual(deepIndex.coverage.analyzedFilesCount, 48, `Expected 48 analyzed files, got ${deepIndex.coverage.analyzedFilesCount}`);
  assert.strictEqual(deepIndex.coverage.inaccessibleFilesCount, 1, 'Must flag corrupted.txt as inaccessible');
  assert.strictEqual(deepIndex.coverage.skippedFilesCount, 3, 'Must record all 3 skipped ZIP items (node_modules, lockfile, png)');
  assert(deepIndex.coverage.coveragePercent === 98, `Expected 98% source coverage (48/49), got ${deepIndex.coverage.coveragePercent}`);
  assert(Object.keys(deepIndex.fileEntries).includes('src/components/widgets/FeatureWidget24.jsx'), 'Deep nested 48th file must be indexed');
  assert(deepIndex.coverage.folderTree['src/components/widgets'].count === 24, 'Nested folder tree counts must be exact');
});

check('ZIP path classifier accurately categorizes ignored dirs, lockfiles, developer docs & binary assets', () => {
  assert.strictEqual(classifyIgnoredZipPath('node_modules/lodash/index.js'), 'ignored_directory');
  assert.strictEqual(classifyIgnoredZipPath('package-lock.json'), 'lockfile');
  assert.strictEqual(classifyIgnoredZipPath('assets/logo.png'), 'binary_asset');
  assert.strictEqual(classifyIgnoredZipPath('SETUP_GUIDE.md'), 'developer_doc');
  assert.strictEqual(classifyIgnoredZipPath('src/pages/AdmissionPage.jsx'), null);
});

// 2. Deep Frontend Analysis
console.log('\n2. Deep Frontend Analysis (Components, Layouts, Child Tree, State & Interactions):');
check('Extracts React components, layouts, rendered child trees, hooks/Zustand/Context & UI interactions', () => {
  const adm = deepIndex.fileEntries['src/pages/AdmissionPage.jsx'];
  assert(adm.frontend.components.includes('AdmissionPage'), 'Must extract AdmissionPage component');
  assert(adm.frontend.childComponents.includes('MainLayout') && adm.frontend.childComponents.includes('CourseCard'), 'Must extract child JSX tree');
  assert(adm.frontend.stateHooks.includes('useState') && adm.frontend.stateHooks.includes('useEffect'), 'Must extract React hooks');
  assert(adm.frontend.stateStores.includes('studentName'), 'Must extract state variables');
  assert(adm.frontend.uiInteractions.some(u => u.includes('onSubmit') || u.includes('form:#admission-form')), 'Must extract form/UI interactions');

  const layout = deepIndex.fileEntries['src/layouts/MainLayout.jsx'];
  assert.strictEqual(layout.frontend.isLayout, true, 'Must detect MainLayout as a layout component');

  const zustand = deepIndex.fileEntries['src/store/useCourseStore.js'];
  assert(zustand.frontend.stateHooks.includes('Zustand Store'), 'Must detect Zustand store');
});

// 3. Deep Backend Analysis
console.log('\n3. Deep Backend Analysis (Routes, Middleware, Controllers, Services & Server Ops):');
check('Extracts Express routes, middleware chains, controllers, services & business operations', () => {
  assert(deepIndex.backendRoutes.some(r => r.method === 'POST' && r.path === '/api/admissions'), 'Must extract POST /api/admissions');
  assert(deepIndex.backendRoutes.some(r => r.method === 'GET' && r.path === '/api/courses'), 'Must extract GET /api/courses');
  assert(deepIndex.middlewares.includes('authMiddleware') && deepIndex.middlewares.includes('validateAdmission'), 'Must extract middleware chain');
  const ctrl = deepIndex.fileEntries['server/controllers/admissionsController.js'];
  assert(ctrl.backend.services.includes('createAdmission'), 'Must extract controller service createAdmission');
  assert(ctrl.backend.serverOps.includes('Email/Notifications') && ctrl.backend.serverOps.includes('Payments/Billing'), 'Must detect server ops');
});

// 4. Deep Database Analysis
console.log('\n4. Deep Database Analysis (SQL Columns/PK/FK, Prisma @relation, Mongoose refs):');
check('Extracts SQL tables, columns, primary keys, foreign keys, Prisma relations & Mongoose refs', () => {
  const admSchema = deepIndex.databaseSchemas.find(s => s.name === 'admissions');
  assert(admSchema && admSchema.columns.some(c => c.startsWith('student_id:')), 'Must extract SQL columns for admissions');
  assert(deepIndex.databaseRelationships.some(r => r.fromTable === 'admissions' && r.toTable === 'students' && r.kind === 'sql_foreign_key'), 'Must extract inline SQL FK admissions -> students');
  assert(deepIndex.databaseRelationships.some(r => r.fromTable === 'admissions' && r.toTable === 'courses' && r.kind === 'sql_foreign_key'), 'Must extract table-level SQL FK admissions -> courses');
  assert(deepIndex.databaseRelationships.some(r => r.fromTable === 'Enrollment' && r.toTable === 'Student' && r.kind === 'prisma_relation'), 'Must extract Prisma @relation');
  assert(deepIndex.databaseRelationships.some(r => r.fromTable === 'Payment' && r.toTable === 'Admission' && r.kind === 'mongoose_ref'), 'Must extract Mongoose ref');
});

// 5. Cross-Module Dependency Graph & Diagnostics
console.log('\n5. Cross-Module Dependency Graph, Reverse Importers & Diagnostics:');
check('Resolves internal imports, reverse importedBy, cycles, unresolved imports, orphans & E2E flows', () => {
  const fmt = deepIndex.fileEntries['src/utils/formatters.js'];
  assert(fmt.importedBy.length >= 25, `formatters.js must be importedBy >= 25 files (CourseCard + test + 24 widgets), got ${fmt.importedBy.length}`);
  const authMw = deepIndex.fileEntries['server/middleware/authMiddleware.js'];
  assert(authMw.importedBy.includes('server/routes/admissionsRoutes.js') && authMw.importedBy.includes('server/server.js'), 'Must compute reverse importedBy for authMiddleware');
  assert(deepIndex.diagnostics.circularDependencies.some(c => c.cycle.includes('src/utils/cycleA.js')), 'Must detect circular dependency cycleA <-> cycleB');
  assert(deepIndex.diagnostics.unresolvedImports.some(u => u.fromFile === 'src/utils/brokenImport.js' && u.importSpec === './doesNotExistModule'), 'Must detect unresolved internal import');
  assert(deepIndex.diagnostics.orphanedModules.includes('src/utils/orphanHelper.js'), 'Must detect orphaned module orphanHelper.js');
  assert(deepIndex.diagnostics.missingBackendEndpoints.some(m => m.endpoint === '/api/legacy-ghost-check'), 'Must detect missing backend endpoint');
  assert(deepIndex.crossModuleChains.some(c => c.fromFile === 'src/services/admissionClient.js' && c.backendFile === 'server/routes/admissionsRoutes.js'), 'Must trace E2E frontend -> backend chain');
});

// 6. Continuous Incremental Re-Indexing
console.log('\n6. Continuous Incremental Project Re-Indexing:');
check('Reuses unchanged files in O(1) and updates only added, modified & removed files', () => {
  const nextFiles = projectFiles
    .filter(f => f.relativePath !== 'src/utils/orphanHelper.js') // remove 1 file
    .map(f => f.relativePath === 'src/utils/formatters.js'
      ? { ...f, content: `${f.content}\nexport function formatDate(d) { return String(d); }` } // modify 1 file
      : f);
  nextFiles.push({
    name: 'NotificationBell.jsx',
    relativePath: 'src/components/NotificationBell.jsx',
    content: `import React, { useState } from 'react'; import { formatDate } from '../utils/formatters'; export default function NotificationBell() { const [open, setOpen] = useState(false); return <button onClick={() => setOpen(!open)}>{formatDate(Date.now())}</button>; }`
  }); // add 1 file

  const updated = updateDeepProjectIndexIncremental(deepIndex, nextFiles);
  const stats = updated.coverage.incrementalStats;
  assert.strictEqual(stats.mode, 'incremental');
  assert.strictEqual(stats.added, 1, `Expected 1 added file, got ${stats.added}`);
  assert.strictEqual(stats.modified, 1, `Expected 1 modified file, got ${stats.modified}`);
  assert.strictEqual(stats.removed, 1, `Expected 1 removed file, got ${stats.removed}`);
  assert.strictEqual(stats.reused, projectFiles.length - 2, `Expected ${projectFiles.length - 2} reused files, got ${stats.reused}`);
  assert(updated.fileEntries['src/utils/formatters.js'].exports.includes('formatDate'), 'Modified file exports must update');
  assert(updated.fileEntries['src/utils/formatters.js'].importedBy.includes('src/components/NotificationBell.jsx'), 'Reverse edges must update for newly added importer');
  assert(!updated.fileEntries['src/utils/orphanHelper.js'], 'Deleted file must be removed from index');
});

// 7. Context-Budget-Safe Query-Time Graph Retrieval & Studio AI Integration
console.log('\n7. Context-Budget-Safe 1-Hop Graph Retrieval, Studio Queries & Customer Isolation:');
check('queryDeepProjectIndex stays compact (top-K + 1-hop neighbors) instead of dumping all 48 files', () => {
  const retrieved = queryDeepProjectIndex('How does AdmissionPage connect to authMiddleware and admissions?', deepIndex, { topK: 5, maxNeighbors: 5 });
  assert(retrieved.matchedModules.length <= 5, 'Must cap matched modules to top-K');
  assert(retrieved.neighborModules.length <= 5, 'Must cap 1-hop neighbors');
  assert(retrieved.dossierText.length < 4000, `Compact dossier must stay context-budget safe (got ${retrieved.dossierText.length} chars)`);
  assert(retrieved.dossierText.includes('AdmissionPage.jsx') && retrieved.dossierText.includes('COVERAGE:'), 'Dossier must include matched module & coverage header');
});

await checkAsync('Studio generateAIResponse answers coverage, DB schema/FK, dependency impact & middleware accurately', async () => {
  const compact = compactDeepProjectIndexForStorage(deepIndex);
  const opts = {
    agentName: 'EduPulse Studio',
    projectArchitecture: fullResult.projectArchitecture,
    deepProjectIndex: compact,
    throwOnMissingKey: false
  };

  const covAns = await generateAIResponse('Which files were analyzed and were any skipped or inaccessible?', 'Studio Assistant', [], '', opts);
  assert(/48/.test(covAns) && /corrupted\.txt/.test(covAns) && /node_modules|lockfile|hero-banner\.png/.test(covAns), `Coverage answer must report exact analyzed, skipped & inaccessible files: "${covAns}"`);

  const dbAns = await generateAIResponse('Explain the database schema and foreign key relationships', 'Studio Assistant', [], '', opts);
  assert(/admissions\.student_id\s*->\s*students\.id/i.test(dbAns) && /Enrollment\.studentId\s*->\s*Student\.id/i.test(dbAns), `DB answer must report SQL FK & Prisma relations: "${dbAns}"`);

  const depAns = await generateAIResponse('What depends on authMiddleware.js?', 'Studio Assistant', [], '', opts);
  assert(/admissionsRoutes\.js/.test(depAns) && /server\.js/.test(depAns), `Dependency impact must report exact reverse importers: "${depAns}"`);

  const cycleAns = await generateAIResponse('Check for circular dependencies, unresolved imports, or orphaned modules', 'Studio Assistant', [], '', opts);
  assert(/cycleA\.js/.test(cycleAns) && /doesNotExistModule/.test(cycleAns) && /orphanHelper\.js/.test(cycleAns), `Dependency health must report cycle, unresolved import & orphan: "${cycleAns}"`);

  const mwAns = await generateAIResponse('List the backend middleware and services', 'Studio Assistant', [], '', opts);
  assert(/authMiddleware/.test(mwAns) && /createAdmission/.test(mwAns), `Backend query must list middleware & services: "${mwAns}"`);

  // Strict Customer Mode Isolation Check: live widget visitors NEVER see internal code/schema/coverage dumps!
  const custRes = resolveDeepProjectQuery('Which files were analyzed and what depends on authMiddleware.js?', compact, { isCustomerMode: true });
  assert.strictEqual(custRes, null, 'Customer mode must NEVER expose internal project code or dependency graphs');
});

console.log(`\n🎉 ALL ${passed}/${passed} DEEP & COMPLETE PROJECT ANALYSIS TESTS PASSED!`);
