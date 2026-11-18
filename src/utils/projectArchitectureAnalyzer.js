/**
 * Complete Project Architecture, Frontend ↔ Backend Data-Flow, Code-Level Diagnostics,
 * Multi-Step Contextual Reasoning & Pre-Response Answer Verification Engine.
 *
 * Analyzes uploaded full-stack projects (Frontend, Backend, APIs, Database, Configs & Dependencies)
 * to map how components communicate, detect missing endpoints/issues, answer multi-step questions,
 * and verify responses against actual project implementation before returning them.
 */

import { fuzzyTokenMatch, NLU_STOPWORDS } from './fuzzyNlu.js';
import { resolveDeepProjectQuery } from './deepProjectIndexer.js';
import { decomposeComplexQuestion } from './answerDepthAndNavigationEngine.js';
import { verifyAnswerAccuracy } from './accuracyVerificationEngine.js';

function baseFileName(p = '') {
  return String(p || '').split(/[\\/]/).pop() || '';
}

function normalizeEndpointPath(raw = '') {
  const clean = String(raw || '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .split('?')[0]
    .split('#')[0]
    .replace(/\$\{[^}]+\}/g, ':param')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
  return clean || '/';
}

function endpointMatchesRoute(callPath, routePath) {
  const c = normalizeEndpointPath(callPath).toLowerCase();
  const r = normalizeEndpointPath(routePath).toLowerCase();
  if (c === r) return true;
  // Convert Express/FastAPI params (:id, {id}, <id>) to regex wildcard
  const pattern = '^' + r
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\:([a-z0-9_]+)/gi, '[^/]+')
    .replace(/\\\{([a-z0-9_]+)\\\}/gi, '[^/]+')
    .replace(/<([a-z0-9_:]+)>/gi, '[^/]+') + '$';
  try {
    return new RegExp(pattern, 'i').test(c);
  } catch (_) {
    return false;
  }
}

/**
 * Analyze dependencies & config files (package.json, vite.config, firebase.json, vercel.json, .env.example)
 * NEVER reads or exposes secret values — only config structure & env variable names.
 */
function analyzeConfigsAndDependencies(fileList = []) {
  const frameworks = new Set();
  const dependencies = [];
  const scripts = {};
  const configFiles = [];
  const documentedEnvVars = new Set();
  const referencedEnvVars = new Set();

  for (const file of fileList) {
    const fName = baseFileName(file?.name || file?.relativePath || '');
    const lower = fName.toLowerCase();
    const content = String(file?.content || '');

    // Collect referenced env var names across all code files (names only, zero secrets!)
    for (const m of content.matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]{2,})/g)) {
      referencedEnvVars.add(m[1]);
    }

    if (lower === 'package.json') {
      configFiles.push({ file: fName, kind: 'package_manifest' });
      try {
        const pkg = JSON.parse(content);
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        for (const [dep, ver] of Object.entries(allDeps)) {
          dependencies.push(`${dep}@${ver}`);
          const d = dep.toLowerCase();
          if (d === 'react' || d === 'react-dom') frameworks.add('React');
          else if (d === 'next') frameworks.add('Next.js');
          else if (d === 'vue') frameworks.add('Vue.js');
          else if (d === 'svelte') frameworks.add('Svelte');
          else if (d === 'express') frameworks.add('Express.js');
          else if (d === 'fastify') frameworks.add('Fastify');
          else if (d === 'vite') frameworks.add('Vite');
          else if (d === 'tailwindcss') frameworks.add('Tailwind CSS');
          else if (d === 'firebase') frameworks.add('Firebase');
          else if (d.includes('supabase')) frameworks.add('Supabase');
          else if (d === 'mongoose' || d === 'mongodb') frameworks.add('MongoDB');
          else if (d === 'prisma' || d === '@prisma/client') frameworks.add('Prisma ORM');
          else if (d === 'pg' || d === 'mysql2' || d === 'sqlite3') frameworks.add('SQL Database');
          else if (d === 'axios') frameworks.add('Axios');
          else if (d === 'recharts' || d === 'chart.js') frameworks.add('Charts');
        }
        if (pkg.scripts && typeof pkg.scripts === 'object') {
          Object.assign(scripts, pkg.scripts);
        }
      } catch (_) {}
    } else if (/^(firebase|vercel|netlify|tsconfig|jsconfig|tailwind\.config|vite\.config|next\.config|webpack\.config)\./i.test(lower)) {
      configFiles.push({ file: fName, kind: 'project_config' });
      if (lower.startsWith('firebase')) frameworks.add('Firebase Hosting/Firestore');
      if (lower.startsWith('vite')) frameworks.add('Vite');
      if (lower.startsWith('next')) frameworks.add('Next.js');
      if (lower.startsWith('tailwind')) frameworks.add('Tailwind CSS');
    } else if (/^\.env(\.example|\.sample|\.template)?$/i.test(lower)) {
      configFiles.push({ file: fName, kind: 'env_template' });
      for (const m of content.matchAll(/^([A-Z][A-Z0-9_]{2,})\s*=/gm)) {
        documentedEnvVars.add(m[1]);
      }
    } else if (lower === 'requirements.txt' || lower === 'pyproject.toml') {
      configFiles.push({ file: fName, kind: 'python_manifest' });
      if (/fastapi/i.test(content)) frameworks.add('FastAPI');
      if (/flask/i.test(content)) frameworks.add('Flask');
      if (/django/i.test(content)) frameworks.add('Django');
      if (/sqlalchemy/i.test(content)) frameworks.add('SQLAlchemy');
    }

    // Infer frameworks from source imports when no package.json was uploaded
    if (/\bfrom\s+['"]react['"]/i.test(content)) frameworks.add('React');
    if (/\bexpress\s*\(\s*\)/i.test(content)) frameworks.add('Express.js');
    if (/\bFastAPI\s*\(\s*\)/i.test(content)) frameworks.add('FastAPI');
    if (/\bFlask\s*\(/i.test(content)) frameworks.add('Flask');
    if (/\bfirebase\/firestore|getFirestore|sdkDb\.collection/i.test(content)) frameworks.add('Firebase Firestore');
    if (/\bsupabase\.from\s*\(/i.test(content)) frameworks.add('Supabase');
    if (/\bnew\s+Chart\s*\(|recharts/i.test(content)) frameworks.add('Interactive Charts');
  }

  return {
    frameworks: Array.from(frameworks).slice(0, 12),
    dependencies: dependencies.slice(0, 30),
    scripts,
    configFiles: configFiles.slice(0, 12),
    documentedEnvVars: Array.from(documentedEnvVars).slice(0, 20),
    referencedEnvVars: Array.from(referencedEnvVars).slice(0, 20)
  };
}

/**
 * Extract Frontend → Backend API calls, Direct DB calls, Form actions & Module Imports.
 */
function extractCommunicationAndLogic(fileList = []) {
  const frontendApiCalls = [];
  const formSubmissions = [];
  const backendRoutes = [];
  const dbOperations = [];
  const fileImports = [];
  const potentialIssues = [];

  for (const file of fileList) {
    const fName = baseFileName(file?.name || file?.relativePath || '');
    const lower = fName.toLowerCase();
    const content = String(file?.content || '');
    if (!content) continue;

    const isBackendFile = /(server|route|controller|api|endpoint|backend|app\.py|main\.py)/i.test(lower) ||
      /\b(app|router)\.(get|post|put|delete|patch)\s*\(|@(?:app|router)\.(get|post|put|delete|patch)/i.test(content);

    // 1. Module import graph (internal component/service dependencies)
    const imports = [];
    for (const im of content.matchAll(/(?:import\s+[\s\S]{1,120}?\s+from\s+|require\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
      if (im[1] && !imports.includes(im[1])) imports.push(im[1]);
    }
    if (imports.length > 0) {
      fileImports.push({ file: fName, imports: imports.slice(0, 12) });
    }

    // 2. Database operations (Firestore, Supabase, SQL, Mongoose/Prisma)
    const fileDbTargets = new Set();
    for (const fm of content.matchAll(/(?:collection\s*\(\s*[^,)]+,\s*['"`]([^'"`]+)['"`]|\.(?:collection|from)\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/gi)) {
      const tbl = (fm[1] || fm[2] || '').trim();
      if (tbl && tbl.length <= 45) fileDbTargets.add(tbl);
    }
    for (const sm of content.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+[`"']?([a-zA-Z_][a-zA-Z0-9_]{1,40})[`"']?/gi)) {
      const tbl = sm[1];
      if (tbl && !/^(select|where|values|set|table|index|null|true|false|default|primary|foreign)$/i.test(tbl)) {
        fileDbTargets.add(tbl);
      }
    }
    for (const pm of content.matchAll(/\bprisma\.([a-zA-Z_][a-zA-Z0-9_]+)\.(?:findMany|findUnique|findFirst|create|update|delete|upsert)/g)) {
      if (pm[1]) fileDbTargets.add(pm[1]);
    }
    if (fileDbTargets.size > 0) {
      dbOperations.push({
        file: fName,
        layer: isBackendFile ? 'backend' : 'frontend',
        tables: Array.from(fileDbTargets).slice(0, 12),
        operations: [
          /\b(getDocs|getDoc|SELECT\s+|\.select\(|findMany|findUnique|findOne|find\()/i.test(content) ? 'READ' : '',
          /\b(addDoc|setDoc|INSERT\s+INTO|\.insert\(|create\(|save\()/i.test(content) ? 'CREATE' : '',
          /\b(updateDoc|UPDATE\s+|\.update\(|findByIdAndUpdate|upsert)/i.test(content) ? 'UPDATE' : '',
          /\b(deleteDoc|DELETE\s+FROM|\.delete\(|findByIdAndDelete)/i.test(content) ? 'DELETE' : ''
        ].filter(Boolean)
      });
    }

    // 3. Backend Route Handlers + Middleware + Linked DB Tables
    if (isBackendFile) {
      const routeRegex = /(?:(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]([^;\n{]{0,160})|@(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`])/gi;
      let rm;
      while ((rm = routeRegex.exec(content)) !== null) {
        const method = (rm[1] || rm[4] || 'GET').toUpperCase();
        const rPath = normalizeEndpointPath(rm[2] || rm[5] || '');
        const middlewareText = rm[3] || '';
        const rawSlice = content.slice(rm.index, rm.index + 1200);
        const nextRouteOffset = rawSlice.slice(rm[0].length).search(/\n\s*(?:(?:app|router)\.(?:get|post|put|delete|patch)\s*\(|@(?:app|router)\.(?:get|post|put|delete|patch))/i);
        const bodySlice = nextRouteOffset >= 0 ? rawSlice.slice(0, rm[0].length + nextRouteOffset) : rawSlice;
        const routeTables = new Set();
        for (const tm of bodySlice.matchAll(/(?:collection\s*\(\s*[^,)]+,\s*['"`]([^'"`]+)['"`]|\.(?:collection|from)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|\b(?:FROM|INTO|UPDATE)\s+[`"']?([a-zA-Z_][a-zA-Z0-9_]{1,40})[`"']?)/gi)) {
          const t = tm[1] || tm[2] || tm[3];
          if (t && !/^(select|where|values|set|table|req|res)$/i.test(t)) routeTables.add(t);
        }
        const hasAuth = /\b(auth|verifyToken|requireAuth|authenticate|jwt|protect|session|middleware)\b/i.test(middlewareText + ' ' + bodySlice.slice(0, 260));
        const hasValidation = /\b(validate|zod|joi|schema|if\s*\(\s*!req\.body|required|status\(\s*400\s*\))/i.test(bodySlice);
        const hasErrorHandling = /\btry\s*\{|\.catch\s*\(|catch\s*\(/i.test(bodySlice);

        backendRoutes.push({
          file: fName,
          method,
          path: rPath,
          tables: Array.from(routeTables).slice(0, 6),
          hasAuth,
          hasValidation,
          hasErrorHandling
        });

        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && !hasErrorHandling && bodySlice.length > 80) {
          potentialIssues.push({
            severity: 'warning',
            type: 'missing_error_handling',
            file: fName,
            detail: `${method} ${rPath} in ${fName} does not show try/catch error handling around its handler.`
          });
        }
      }
    }

    // 4. Frontend API calls (fetch / axios)
    if (!isBackendFile || /\.(html?|jsx|tsx|vue|svelte)$/i.test(lower)) {
      // fetch('/api/...') or fetch(`/api/...`, { method: 'POST' })
      const fetchRegex = /fetch\s*\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*\{([\s\S]{0,260}?)\})?/gi;
      let fm;
      while ((fm = fetchRegex.exec(content)) !== null) {
        const rawUrl = fm[1];
        if (!rawUrl || /^(data:|blob:)/i.test(rawUrl)) continue;
        const opts = fm[2] || '';
        const methodM = opts.match(/method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
        const method = methodM ? methodM[1].toUpperCase() : 'GET';
        const normPath = normalizeEndpointPath(rawUrl);
        if (normPath.startsWith('/api') || /^https?:\/\//i.test(rawUrl) || normPath.startsWith('/')) {
          frontendApiCalls.push({
            file: fName,
            method,
            url: rawUrl,
            normalizedPath: normPath,
            isExternal: /^https?:\/\//i.test(rawUrl) && !rawUrl.includes('localhost') && !rawUrl.includes('yourwebsite.com')
          });
        }
      }

      // axios.get/post/put/delete('/api/...')
      const axiosRegex = /axios\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
      let am;
      while ((am = axiosRegex.exec(content)) !== null) {
        const method = am[1].toUpperCase();
        const rawUrl = am[2];
        frontendApiCalls.push({
          file: fName,
          method,
          url: rawUrl,
          normalizedPath: normalizeEndpointPath(rawUrl),
          isExternal: /^https?:\/\//i.test(rawUrl) && !rawUrl.includes('localhost')
        });
      }

      // HTML <form action="/api/..." method="POST">
      const formActionRegex = /<form\b([^>]*)>/gi;
      let formM;
      while ((formM = formActionRegex.exec(content)) !== null) {
        const attrs = formM[1] || '';
        const actM = attrs.match(/\baction=["']([^"']+)["']/i);
        const methM = attrs.match(/\bmethod=["']([^"']+)["']/i);
        const idM = attrs.match(/\bid=["']([^"']+)["']/i);
        if (actM && actM[1] && !actM[1].startsWith('#') && !/^javascript:/i.test(actM[1])) {
          formSubmissions.push({
            file: fName,
            formId: idM ? idM[1] : 'form',
            method: (methM ? methM[1] : 'POST').toUpperCase(),
            action: actM[1],
            normalizedPath: normalizeEndpointPath(actM[1])
          });
        }
      }
    }
  }

  return { frontendApiCalls, formSubmissions, backendRoutes, dbOperations, fileImports, potentialIssues };
}

/**
 * Complete Project Architecture & Code-Level Analyzer.
 * Connects Frontend ↔ Backend APIs ↔ Database ↔ Configs/Dependencies and detects missing/broken links!
 */
export function analyzeProjectArchitecture(fileList = [], existingAnalysis = null) {
  const safeFiles = Array.isArray(fileList) ? fileList.filter(f => f && f.name) : [];
  const configs = analyzeConfigsAndDependencies(safeFiles);
  const comm = extractCommunicationAndLogic(safeFiles);

  // Build Frontend ↔ Backend ↔ Database End-to-End Data Flows
  const dataFlows = [];
  const missingBackendEndpoints = [];
  const matchedBackendKeys = new Set();

  // A. Match Frontend fetch/axios calls to Backend route handlers
  for (const call of comm.frontendApiCalls) {
    if (call.isExternal) {
      dataFlows.push({
        kind: 'external_api',
        fromFile: call.file,
        method: call.method,
        endpoint: call.url,
        toHandler: 'External Service',
        dbTables: [],
        description: `${call.file} sends ${call.method} requests to external API ${call.url}.`
      });
      continue;
    }

    const matchedRoute = comm.backendRoutes.find(
      r => (r.method === call.method || r.method === 'ALL') && endpointMatchesRoute(call.normalizedPath, r.path)
    ) || comm.backendRoutes.find(r => endpointMatchesRoute(call.normalizedPath, r.path));

    if (matchedRoute) {
      matchedBackendKeys.add(`${matchedRoute.method}:${matchedRoute.path}`);
      const dbSuffix = matchedRoute.tables.length > 0 ? ` and interacts with database table(s): ${matchedRoute.tables.join(', ')}` : '';
      dataFlows.push({
        kind: 'frontend_to_backend',
        fromFile: call.file,
        method: call.method,
        endpoint: call.normalizedPath,
        toHandler: matchedRoute.file,
        dbTables: matchedRoute.tables,
        description: `${call.file} calls ${call.method} ${call.normalizedPath} -> handled by ${matchedRoute.file}${dbSuffix}.`
      });
    } else if (comm.backendRoutes.length > 0 && call.normalizedPath.startsWith('/api')) {
      missingBackendEndpoints.push({
        severity: 'error',
        type: 'missing_backend_endpoint',
        file: call.file,
        method: call.method,
        endpoint: call.normalizedPath,
        detail: `${call.file} calls ${call.method} ${call.normalizedPath}, but no matching route handler was found in the backend files.`
      });
    } else {
      dataFlows.push({
        kind: 'frontend_api_call',
        fromFile: call.file,
        method: call.method,
        endpoint: call.normalizedPath,
        toHandler: 'API Endpoint (not uploaded)',
        dbTables: [],
        description: `${call.file} calls ${call.method} ${call.normalizedPath}.`
      });
    }
  }

  // B. Match HTML <form action="..."> to Backend route handlers
  for (const form of comm.formSubmissions) {
    const matchedRoute = comm.backendRoutes.find(r => endpointMatchesRoute(form.normalizedPath, r.path));
    if (matchedRoute) {
      matchedBackendKeys.add(`${matchedRoute.method}:${matchedRoute.path}`);
      const dbSuffix = matchedRoute.tables.length > 0 ? ` -> writes to ${matchedRoute.tables.join(', ')}` : '';
      dataFlows.push({
        kind: 'form_to_backend',
        fromFile: form.file,
        method: form.method,
        endpoint: form.normalizedPath,
        toHandler: matchedRoute.file,
        dbTables: matchedRoute.tables,
        description: `Form "${form.formId}" in ${form.file} submits ${form.method} ${form.normalizedPath} -> handled by ${matchedRoute.file}${dbSuffix}.`
      });
    } else if (comm.backendRoutes.length > 0 && form.normalizedPath.startsWith('/api')) {
      missingBackendEndpoints.push({
        severity: 'error',
        type: 'unmatched_form_action',
        file: form.file,
        method: form.method,
        endpoint: form.normalizedPath,
        detail: `Form "${form.formId}" in ${form.file} submits to ${form.method} ${form.normalizedPath}, which has no matching backend handler.`
      });
    }
  }

  // C. Direct Frontend -> Database flows (e.g., Firebase Firestore / Supabase direct SDK calls)
  for (const dbOp of comm.dbOperations) {
    if (dbOp.layer === 'frontend') {
      dataFlows.push({
        kind: 'frontend_to_database',
        fromFile: dbOp.file,
        method: dbOp.operations.join('/') || 'READ/WRITE',
        endpoint: dbOp.tables.join(', '),
        toHandler: 'Direct Cloud Database SDK',
        dbTables: dbOp.tables,
        description: `${dbOp.file} connects directly to database collection/table(s) ${dbOp.tables.join(', ')} (${dbOp.operations.join(', ') || 'access'}).`
      });
    }
  }

  // D. Detect undocumented env vars & unused/orphan backend routes
  const missingEnvDocs = configs.documentedEnvVars.length > 0
    ? configs.referencedEnvVars
        .filter(v => !configs.documentedEnvVars.includes(v) && !['NODE_ENV', 'MODE', 'BASE_URL', 'DEV', 'PROD'].includes(v))
        .map(v => ({
          severity: 'warning',
          type: 'undocumented_env_var',
          file: '.env.example',
          detail: `Environment variable "${v}" is referenced in project code but missing from .env.example.`
        }))
    : [];

  const orphanRoutes = comm.backendRoutes
    .filter(r => !matchedBackendKeys.has(`${r.method}:${r.path}`) && comm.frontendApiCalls.length > 0)
    .map(r => ({
      severity: 'info',
      type: 'unused_backend_route',
      file: r.file,
      endpoint: `${r.method} ${r.path}`,
      detail: `Backend route ${r.method} ${r.path} in ${r.file} is not currently called by any uploaded frontend file.`
    }));

  const diagnostics = {
    missingBackendEndpoints: missingBackendEndpoints.slice(0, 12),
    missingEnvVars: missingEnvDocs.slice(0, 10),
    potentialIssues: comm.potentialIssues.slice(0, 12),
    orphanRoutes: orphanRoutes.slice(0, 10),
    totalIssuesCount: missingBackendEndpoints.length + missingEnvDocs.length + comm.potentialIssues.length
  };

  // Deduplicate database tables/collections across all layers
  const allDbTables = Array.from(new Set([
    ...comm.dbOperations.flatMap(d => d.tables),
    ...comm.backendRoutes.flatMap(r => r.tables),
    ...(existingAnalysis?.database || []).flatMap(d => d.schema || [])
  ])).slice(0, 25);

  const summary = `Project Architecture (${safeFiles.length} files): Tech stack [${configs.frameworks.join(', ') || 'Web Application'}], ${comm.backendRoutes.length} backend API routes, ${dataFlows.length} mapped frontend-backend/DB data flows, ${allDbTables.length} database tables/collections, and ${diagnostics.totalIssuesCount} detected code/config issue(s).`;

  return {
    fileCount: safeFiles.length,
    files: safeFiles.map(f => baseFileName(f.name || f.relativePath || '')),
    frameworks: configs.frameworks,
    dependencies: configs.dependencies,
    scripts: configs.scripts,
    configFiles: configs.configFiles,
    referencedEnvVars: configs.referencedEnvVars,
    backendRoutes: comm.backendRoutes,
    frontendApiCalls: comm.frontendApiCalls,
    dbOperations: comm.dbOperations,
    dbTables: allDbTables,
    fileImports: comm.fileImports,
    dataFlows,
    diagnostics,
    summary
  };
}

/**
 * Deterministic Project Architecture, Data-Flow & Code-Level Diagnostics Resolver (Studio / Project Mode).
 * Answers complex technical/architectural questions grounded strictly in analyzed project code!
 */
export function resolveProjectArchitectureQuery(query, projectArch = null, options = {}) {
  if (options?.isCustomerMode) return null; // Never expose code internals to live customer-facing widgets!

  const rawQ = String(query || '').trim();
  const lower = rawQ.toLowerCase();
  if (!lower) return null;

  // 0. Check Deep Full-Coverage Project Index first for coverage, schema/relations, component/state, middleware, dependency impact & file deep-dives
  const deepIndex = options?.deepProjectIndex || projectArch?.deepProjectIndex || null;
  if (deepIndex) {
    const deepHit = resolveDeepProjectQuery(rawQ, deepIndex, options);
    if (deepHit) return deepHit;
  }

  if (!projectArch || typeof projectArch !== 'object') return null;

  // 1. Code-Level Diagnostics / Errors / Missing Functionality ("any errors", "missing endpoints", "broken links", "issues in project")
  if (/\b(error|errors|issue|issues|bug|bugs|missing\s+(?:endpoint|endpoints|api|apis|route|routes|functionality|handler|env|config)|broken\s+(?:link|api|endpoint|connection)|audit|diagnostic|diagnostics|potential\s+(?:issue|issues|problem|problems)|validate\s+(?:the\s+)?(?:project|code|apis?))\b/i.test(lower)) {
    const d = projectArch.diagnostics || {};
    const findings = [
      ...(d.missingBackendEndpoints || []).map(x => `Missing Endpoint: ${x.detail}`),
      ...(d.unresolvedImports || []).map(x => `Unresolved Import: ${x.detail}`),
      ...(d.circularDependencies || []).map(x => `Circular Dependency: ${x.detail}`),
      ...(d.missingEnvVars || []).map(x => `Config Warning: ${x.detail}`),
      ...(d.potentialIssues || []).map(x => `Code Warning: ${x.detail}`),
      ...(d.inaccessibleFiles || []).map(x => `Inaccessible File: ${x.path} (${x.reason})`)
    ];
    if (findings.length > 0) {
      return {
        status: 'FOUND_IN_PROJECT_ARCHITECTURE',
        matchType: 'diagnostics',
        summaryText: `Code-level project analysis found ${findings.length} issue(s): ${findings.slice(0, 5).join(' ')}${d.orphanRoutes?.length ? ` Also noted ${d.orphanRoutes.length} unused backend route(s) (${d.orphanRoutes.slice(0, 2).map(r => r.endpoint).join(', ')}).` : ''}`,
        data: d
      };
    }
    return {
      status: 'FOUND_IN_PROJECT_ARCHITECTURE',
      matchType: 'diagnostics_clean',
      summaryText: `Project code analysis verified ${projectArch.fileCount || 0} files, ${projectArch.backendRoutes?.length || 0} backend routes, and ${projectArch.dataFlows?.length || 0} data flows with zero missing API endpoints, unresolved imports, circular dependencies, or unhandled route issues detected.`,
      data: d
    };
  }

  // 2. Tech Stack, Dependencies & Configs ("what tech stack", "dependencies", "frameworks", "package.json", "env variables")
  if (/\b(tech\s*stack|technology\s*stack|frameworks?|dependencies|packages?|libraries|package\.json|env(?:ironment)?\s*var(?:iable)?s?|configs?|configuration|build\s*scripts?)\b/i.test(lower)) {
    const fw = projectArch.frameworks?.length ? projectArch.frameworks.join(', ') : 'Standard HTML/CSS/JavaScript';
    const deps = projectArch.dependencies?.length ? ` Key dependencies include ${projectArch.dependencies.slice(0, 8).join(', ')}.` : '';
    const cfgs = projectArch.configFiles?.length ? ` Configuration files: ${projectArch.configFiles.map(c => c.file).join(', ')}.` : '';
    const envs = projectArch.referencedEnvVars?.length ? ` Referenced environment variables: ${projectArch.referencedEnvVars.slice(0, 8).join(', ')}.` : '';
    return {
      status: 'FOUND_IN_PROJECT_ARCHITECTURE',
      matchType: 'tech_stack',
      summaryText: `This project uses ${fw}.${deps}${cfgs}${envs}`,
      data: { frameworks: projectArch.frameworks, dependencies: projectArch.dependencies, configFiles: projectArch.configFiles, envVars: projectArch.referencedEnvVars }
    };
  }

  // 3. Frontend <-> Backend Communication & Data Flow ("how do frontend and backend communicate", "trace data flow", "which api does X call", "connect to database")
  if (/\b(data\s*flow|how\s+(?:do|does)\s+(?:the\s+)?frontend\s+(?:and\s+)?backend|frontend\s*(?:to|and|&|<->|↔)\s*backend|communicate|communication|connect(?:s|ed)?\s+to\s+(?:the\s+)?(?:backend|api|database)|which\s+(?:api|endpoint|route|table|collection)|trace\s+(?:the\s+)?flow|business\s*logic|end[- ]to[- ]end\s+(?:flow|architecture))\b/i.test(lower)) {
    const flows = Array.isArray(projectArch.dataFlows) ? projectArch.dataFlows : [];
    const tokens = lower.replace(/[^a-z0-9/\s_-]/g, ' ').split(/\s+/).filter(w => w.length >= 3 && !NLU_STOPWORDS.has(w) && !['frontend', 'backend', 'data', 'flow', 'communicate', 'communication', 'connect', 'database', 'trace', 'how', 'does', 'which', 'api', 'endpoint', 'route', 'table', 'project', 'architecture'].includes(w));

    let matchedFlows = flows;
    if (tokens.length > 0 && flows.length > 0) {
      const scored = flows.map(fl => {
        const hay = `${fl.fromFile} ${fl.endpoint} ${fl.toHandler} ${(fl.dbTables || []).join(' ')} ${fl.description}`.toLowerCase();
        let sc = 0;
        for (const t of tokens) {
          if (hay.includes(t)) sc += 10;
          else if (hay.split(/\W+/).some(hw => fuzzyTokenMatch(t, hw) >= 2)) sc += 6;
        }
        return { fl, sc };
      }).filter(x => x.sc > 0).sort((a, b) => b.sc - a.sc);
      if (scored.length > 0) matchedFlows = scored.map(x => x.fl);
    }

    if (matchedFlows.length > 0) {
      const flowDesc = matchedFlows.slice(0, 4).map(f => f.description).join(' ');
      const missingNote = projectArch.diagnostics?.missingBackendEndpoints?.length
        ? ` Note: ${projectArch.diagnostics.missingBackendEndpoints.length} frontend API call(s) have no matching backend route (${projectArch.diagnostics.missingBackendEndpoints.slice(0, 2).map(m => `${m.method} ${m.endpoint}`).join(', ')}).`
        : '';
      return {
        status: 'FOUND_IN_PROJECT_ARCHITECTURE',
        matchType: 'data_flow',
        summaryText: `Here is how the frontend, backend, and database connect in this project: ${flowDesc}${missingNote}`,
        data: { flows: matchedFlows.slice(0, 6) }
      };
    }

    const routesList = (projectArch.backendRoutes || []).slice(0, 5).map(r => `${r.method} ${r.path} (${r.file})`).join(', ');
    const dbList = (projectArch.dbTables || []).slice(0, 6).join(', ');
    return {
      status: 'FOUND_IN_PROJECT_ARCHITECTURE',
      matchType: 'data_flow_overview',
      summaryText: `${projectArch.summary}${routesList ? ` Backend routes: ${routesList}.` : ''}${dbList ? ` Database tables/collections: ${dbList}.` : ''}`,
      data: { routes: projectArch.backendRoutes, dbTables: projectArch.dbTables }
    };
  }

  // 4. Complete Project Architecture / Backend Endpoints Overview
  if (/\b(project\s+architecture|system\s+architecture|complete\s+project|code\s+structure|backend\s+(?:routes?|apis?|endpoints?)|list\s+(?:all\s+)?(?:apis?|endpoints?|routes?)|how\s+does\s+this\s+project\s+work)\b/i.test(lower)) {
    const routesSummary = (projectArch.backendRoutes || []).length > 0
      ? ` Backend exposes ${projectArch.backendRoutes.length} route(s): ${projectArch.backendRoutes.slice(0, 6).map(r => `${r.method} ${r.path}`).join(', ')}.`
      : '';
    const flowSummary = (projectArch.dataFlows || []).length > 0
      ? ` Key flows: ${projectArch.dataFlows.slice(0, 3).map(f => f.description).join(' ')}`
      : '';
    const dbSummary = (projectArch.dbTables || []).length > 0
      ? ` Database tables/collections: ${projectArch.dbTables.slice(0, 6).join(', ')}.`
      : '';
    return {
      status: 'FOUND_IN_PROJECT_ARCHITECTURE',
      matchType: 'architecture_overview',
      summaryText: `${projectArch.summary}${routesSummary}${dbSummary}${flowSummary}`,
      data: projectArch
    };
  }

  return null;
}

/**
 * Split complex multi-step, compound, and comma-separated multi-aspect user questions into independent sub-questions cleanly.
 * Examples:
 *  - "Which course is cheapest? And how do I apply?" -> ["Which course is cheapest?", "how do I apply?"]
 *  - "Explain the fee structure, eligibility criteria, and documents required for Class 11 Science" -> 3 clauses
 * Does NOT split comparisons like "compare Science and Commerce" or "between 100 and 500"!
 */
export function splitMultiStepQuestion(rawQuery = '') {
  return decomposeComplexQuestion(rawQuery);
}

/**
 * Pre-Response Answer Verification & Quality Gate.
 * Validates candidate answers against verified project/frontend/database data before returning:
 *  - Prevents unnecessary "not available / cannot find" errors when a grounded verified answer exists
 *  - Ensures complete sentences (no mid-sentence cutoffs) and strips accidental code artifacts in customer mode
 */
export function verifyAndPolishAnswer(candidateReply = '', verificationContext = {}) {
  let text = String(candidateReply || '').replace(/\s+/g, ' ').trim();
  const {
    verifiedFallback = '',
    isCustomerMode = false,
    wasTruncated = false,
    groundTruth = null,
    catalogItems = null,
    matchedItem = null,
    query = '',
    isGeneralOffTopic = false,
    isGreeting = false,
    isUnclear = false,
    hasVerifiedContext = true,
    queryLang = 'en-US',
    onAuditResult = null
  } = verificationContext;

  // 1. Run deterministic fact-verification & hallucination audit gate when ground truth or catalog context is provided
  if (groundTruth || (Array.isArray(catalogItems) && catalogItems.length > 0)) {
    const audit = verifyAnswerAccuracy(text, {
      query,
      groundTruth,
      catalogItems: catalogItems || [],
      matchedItem,
      verifiedFallback,
      isCustomerMode,
      isGeneralOffTopic,
      isGreeting,
      isUnclear,
      hasVerifiedContext,
      queryLang
    });
    text = String(audit.text || '').replace(/\s+/g, ' ').trim();
    if (typeof onAuditResult === 'function') {
      try { onAuditResult(audit); } catch (_) {}
    }
  } else {
    // 1b. Basic false-error override when called without full ground truth bundle
    const looksLikeFalseError = /\b(not\s+available\s+right\s+now|cannot\s+find|could\s+not\s+find|no\s+information\s+available|i\s+don'?t\s+have\s+(?:exact\s+)?information|unable\s+to\s+find)\b/i.test(text);
    if ((!text || looksLikeFalseError) && verifiedFallback && verifiedFallback.trim().length > 10) {
      text = verifiedFallback.trim();
    }
  }

  if (!text) return '';

  // 2. Customer mode safety strip: never leak raw markdown symbols or anchor fragments
  if (isCustomerMode) {
    text = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/(?:^|\s)#{1,6}\s+/g, ' ')
      .replace(/\s*\(#[-a-z0-9_]+\)/gi, '')
      .replace(/[*#_`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // 3. Ensure complete ending sentence (never leave trailing dangling preposition/conjunction, unclosed paren, trailing comma/dash, or max_tokens cutoff)
  if (!/[.!?।]$/.test(text)) {
    const lastEnd = Math.max(text.lastIndexOf('. '), text.lastIndexOf('! '), text.lastIndexOf('? '), text.lastIndexOf('। '));
    const hasTrailingPunct = /[,:;\-–—\/(]\s*$/.test(text);
    const hasUnclosedParen = (text.split('(').length > text.split(')').length);
    const trailingDangling = /(?:^|\s)(?:with|for|to|and|or|of|in|at|by|from|the|a|an|as|on|into|onto|through|including|that|which|who|where|when|while|because|since|until|unless|between|without|about|per|via|such|plus|also|both|each|every|all|more|not|only|just|this|these|those|featuring|offering|providing|covering|designed|focused|based|using|helping|ensuring|making|giving|has|have|had|is|are|was|were|be|been|being|can|could|will|would|should|may|might|must|our|your|their|आणि|किंवा|साठी|मध्ये|वर|तसेच|और|या|के|की|का|में|पर|को|से|तथा)\s*$/i;
    const trailingFrag = lastEnd >= 0 ? text.slice(lastEnd + 2).trim() : text;
    const looksHalfCut = lastEnd >= 25 && (
      wasTruncated ||
      hasTrailingPunct ||
      hasUnclosedParen ||
      trailingDangling.test(text) ||
      (trailingFrag.length >= 6 && trailingFrag.split(/\s+/).length <= 14 && /[,:-]/.test(trailingFrag))
    );

    if (looksHalfCut) {
      text = text.slice(0, lastEnd + 1).trim();
    } else {
      if (hasUnclosedParen) {
        const openIdx = text.lastIndexOf('(');
        if (openIdx >= 15) text = text.slice(0, openIdx).trim();
      }
      text = text.replace(/[,:;\-–—\/(]+\s*$/, '').trim();
      let guard = 0;
      while (guard < 3 && trailingDangling.test(text) && text.split(/\s+/).length > 3) {
        text = text.replace(trailingDangling, '').replace(/[,:;\-–—\/]+\s*$/, '').trim();
        guard++;
      }
      if (text && !/[.!?।]$/.test(text)) {
        text += '.';
      }
    }
  }

  return text;
}
