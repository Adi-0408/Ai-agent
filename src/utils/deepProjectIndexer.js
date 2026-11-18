/**
 * Deep & Complete Project Indexer, Cross-Module Dependency Graph,
 * Incremental Change Tracker & Context-Budget-Safe Query Retriever.
 *
 * Systematically analyzes 100% of relevant project files (Frontend, Backend,
 * Database, Configs, Dependencies, Styles, Tests, Docs) without silent omissions,
 * tracks file coverage & skipped/inaccessible files explicitly, updates incrementally
 * when files change, and performs 1-hop graph retrieval at query time instead of
 * loading the entire project into LLM context at once.
 */

import { fuzzyTokenMatch, NLU_STOPWORDS } from './fuzzyNlu.js';

const CODE_EXT_RE = /\.(jsx?|tsx?|mjs|cjs|vue|svelte|py|go|java|php|rb|rs|cs|kt|swift)$/i;
const FRONTEND_EXT_RE = /\.(html?|jsx|tsx|vue|svelte|css|scss|sass|less)$/i;
const DB_EXT_RE = /\.(sql|prisma|graphql|gql)$/i;
const CONFIG_NAME_RE = /^(package\.json|tsconfig\.json|jsconfig\.json|vite\.config\.\w+|next\.config\.\w+|webpack\.config\.\w+|tailwind\.config\.\w+|postcss\.config\.\w+|firebase\.json|vercel\.json|netlify\.toml|requirements\.txt|pyproject\.toml|go\.mod|cargo\.toml|docker-compose\.ya?ml|dockerfile|\.env(\.example|\.sample|\.template)?)$/i;
const TEST_FILE_RE = /(?:^|\/)(?:__tests__|tests?|spec|e2e)\/|\.(?:test|spec)\.[a-z0-9]+$/i;
const STYLE_EXT_RE = /\.(css|scss|sass|less|styl)$/i;
const DOC_EXT_RE = /\.(md|markdown|txt|rst)$/i;
const ENTRY_POINT_RE = /(?:^|\/)(?:index|main|app|server|entry|bootstrap|start|layout|page|_app|_document)\.[a-z0-9]+$/i;

const QUERY_STOPWORDS = new Set([
  ...NLU_STOPWORDS,
  'project', 'code', 'file', 'files', 'module', 'modules', 'show', 'list', 'explain',
  'tell', 'give', 'find', 'check', 'analyze', 'analysis', 'system', 'application', 'app',
  'does', 'work', 'works', 'using', 'used', 'inside', 'about', 'every', 'complete', 'entire'
]);

/**
 * Fast deterministic FNV-1a 32-bit hash for incremental change detection.
 */
export function hashFileContent(content = '') {
  const str = String(content || '');
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + '_' + str.length;
}

export function normalizeProjectPath(rawPath = '') {
  return String(rawPath || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .trim();
}

function getBaseName(p = '') {
  const norm = normalizeProjectPath(p);
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

function getFolderPath(p = '') {
  const norm = normalizeProjectPath(p);
  const idx = norm.lastIndexOf('/');
  return idx >= 0 ? norm.slice(0, idx) : '(root)';
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
 * Classifies a file into its primary architectural area so coverage reports are accurate.
 */
export function classifyProjectArea(relPath = '', content = '') {
  const norm = normalizeProjectPath(relPath);
  const base = getBaseName(norm).toLowerCase();
  const lowerPath = norm.toLowerCase();

  if (TEST_FILE_RE.test(lowerPath)) return 'tests';
  if (CONFIG_NAME_RE.test(base)) return 'config';
  if (STYLE_EXT_RE.test(base)) return 'styles';
  if (DOC_EXT_RE.test(base)) return 'docs';
  if (DB_EXT_RE.test(base) || /(?:^|\/)(?:migrations?|schemas?|models?|prisma|db)\//i.test(lowerPath)) {
    if (DB_EXT_RE.test(base) || /\b(CREATE\s+TABLE|new\s+(?:mongoose\.)?Schema|model\s+\w+\s*\{)/i.test(content)) {
      return 'database';
    }
  }

  const hasBackendSignals =
    /(?:^|\/)(?:server|backend|api|routes?|controllers?|middlewares?|services?|workers?|jobs?)\//i.test(lowerPath) ||
    /(?:server|route|controller|middleware|backend|app\.py|main\.py|wsgi\.py)/i.test(base) ||
    /\b(?:app|router|fastify|server)\.(?:get|post|put|delete|patch|use)\s*\(|@(?:app|router)\.(?:get|post|put|delete|patch)|express\s*\(\s*\)|FastAPI\s*\(\s*\)|Flask\s*\(/i.test(content);

  const hasFrontendSignals =
    FRONTEND_EXT_RE.test(base) ||
    /(?:^|\/)(?:components?|pages?|views?|layouts?|screens?|hooks?|context|store|stores|ui|frontend|client|public)\//i.test(lowerPath) ||
    /\b(?:useState|useEffect|useContext|ReactDOM|createRoot|document\.querySelector|document\.getElementById|<[A-Z][A-Za-z0-9]*[\s/>])/.test(content);

  if (hasBackendSignals && !/\.(html?|jsx|tsx|vue|svelte)$/i.test(base)) return 'backend';
  if (hasFrontendSignals) return 'frontend';
  if (/\.(json|csv|tsv|xml|ya?ml)$/i.test(base)) return 'database';
  if (CODE_EXT_RE.test(base)) return hasBackendSignals ? 'backend' : 'frontend';
  return 'other';
}

/**
 * Extract raw module imports (internal relative/alias + external packages) and exported symbols.
 */
function extractModuleImportsAndExports(content = '', relPath = '') {
  const internalImports = new Set();
  const externalPackages = new Set();
  const exportsList = new Set();

  // ES imports: import X from 'spec', import 'spec', export { X } from 'spec'
  for (const m of content.matchAll(/(?:import|export)\s+(?:[\s\S]{1,180}?\s+from\s+)?['"]([^'"\n]+)['"]/g)) {
    const spec = (m[1] || '').trim();
    if (!spec) continue;
    if (spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('~/') || spec.startsWith('/src/')) {
      internalImports.add(spec);
    } else if (!spec.startsWith('http://') && !spec.startsWith('https://')) {
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (pkg && pkg.length <= 60) externalPackages.add(pkg);
    }
  }

  // CommonJS require('...') & dynamic import('...')
  for (const m of content.matchAll(/(?:require|import)\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g)) {
    const spec = (m[1] || '').trim();
    if (!spec) continue;
    if (spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('~/')) {
      internalImports.add(spec);
    } else if (!spec.startsWith('http')) {
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (pkg && pkg.length <= 60) externalPackages.add(pkg);
    }
  }

  // Python imports: from foo.bar import baz / import foo
  if (/\.py$/i.test(relPath)) {
    for (const m of content.matchAll(/^\s*from\s+(\.[a-zA-Z0-9_.]*|[a-zA-Z0-9_.]+)\s+import\s+/gm)) {
      const mod = (m[1] || '').trim();
      if (mod.startsWith('.')) internalImports.add(mod);
      else if (mod) externalPackages.add(mod.split('.')[0]);
    }
    for (const m of content.matchAll(/^\s*import\s+([a-zA-Z0-9_]+)/gm)) {
      if (m[1]) externalPackages.add(m[1]);
    }
  }

  // HTML <script src="..."> & <link href="...">
  if (/\.html?$/i.test(relPath)) {
    for (const m of content.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/gi)) {
      const src = (m[1] || '').trim();
      if (src && !/^https?:\/\//i.test(src) && !src.startsWith('//')) {
        internalImports.add(src.startsWith('.') ? src : `./${src.replace(/^\//, '')}`);
      }
    }
  }

  // Exported JS/TS symbols
  for (const m of content.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    if (m[1]) exportsList.add(m[1]);
  }
  for (const m of content.matchAll(/module\.exports\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=|exports\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g)) {
    const sym = m[1] || m[2];
    if (sym) exportsList.add(sym);
  }
  // Python top-level def/class
  if (/\.py$/i.test(relPath)) {
    for (const m of content.matchAll(/^(?:async\s+)?(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)) {
      if (m[1] && !m[1].startsWith('_')) exportsList.add(m[1]);
    }
  }

  return {
    internalImports: Array.from(internalImports),
    externalPackages: Array.from(externalPackages),
    exports: Array.from(exportsList)
  };
}

/**
 * Deep Frontend Analysis: components, layouts, child component tree, state/hooks, UI events & routes.
 */
function analyzeFrontendModule(relPath, content) {
  const base = getBaseName(relPath);
  const components = new Set();
  const childComponents = new Set();
  const stateHooks = new Set();
  const stateStores = new Set();
  const uiInteractions = new Set();
  const clientRoutes = new Set();
  const apiCalls = [];
  let isLayout = /(?:layout|shell|navbar|header|sidebar|footer|wrapper)/i.test(base);

  // Declared React / UI components (PascalCase functions/consts/classes)
  for (const m of content.matchAll(/(?:export\s+(?:default\s+)?)?(?:function|class)\s+([A-Z][A-Za-z0-9_]*)\b/g)) {
    components.add(m[1]);
  }
  for (const m of content.matchAll(/(?:export\s+)?const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:React\.(?:memo|forwardRef)\s*\(\s*)?(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/g)) {
    components.add(m[1]);
  }
  if (/\.(vue|svelte)$/i.test(base)) {
    components.add(base.replace(/\.(vue|svelte)$/i, ''));
  }

  // JSX / template rendered child components (<Header />, <OrderModal ...>)
  for (const m of content.matchAll(/<([A-Z][A-Za-z0-9_]*)(?:\s|\/?>)/g)) {
    const tag = m[1];
    if (tag && !['Fragment', 'StrictMode', 'Suspense', 'Provider', 'Router', 'BrowserRouter', 'Routes', 'Route', 'Switch', 'Link', 'NavLink', 'Outlet', 'Navigate'].includes(tag)) {
      if (!components.has(tag)) childComponents.add(tag);
    }
  }

  // React / Vue / Zustand / Redux state management & hooks
  const hookPatterns = [
    ['useState', /\buseState\s*[<(]/],
    ['useReducer', /\buseReducer\s*[<(]/],
    ['useEffect', /\buseEffect\s*\(/],
    ['useContext', /\buseContext\s*\(/],
    ['useMemo', /\buseMemo\s*\(/],
    ['useCallback', /\buseCallback\s*\(/],
    ['useRef', /\buseRef\s*[<(]/],
    ['useSelector/Redux', /\b(?:useSelector|useDispatch|createSlice|configureStore)\b/],
    ['Zustand Store', /\bcreate\s*\(\s*\(\s*set\b|\bzustand\b/],
    ['React Context', /\bcreateContext\s*[<(]/],
    ['Pinia/Vuex', /\b(?:defineStore|createStore)\s*\(/],
    ['React Query / SWR', /\b(?:useQuery|useMutation|useSWR)\s*\(/]
  ];
  for (const [label, re] of hookPatterns) {
    if (re.test(content)) stateHooks.add(label);
  }
  for (const m of content.matchAll(/\b(?:const|let)\s+\[\s*([a-zA-Z0-9_]+)\s*,\s*set[A-Z][a-zA-Z0-9_]*\s*\]\s*=\s*useState/g)) {
    if (m[1]) stateStores.add(m[1]);
  }
  for (const m of content.matchAll(/\b(?:createContext|createSlice|defineStore)\s*\(\s*(?:\{\s*name\s*:\s*['"]([^'"]+)['"]|['"]([^'"]+)['"])/g)) {
    const sName = m[1] || m[2];
    if (sName) stateStores.add(sName);
  }

  // UI user interactions & DOM event handlers
  for (const m of content.matchAll(/\b(onClick|onSubmit|onChange|onInput|onKeyDown|onFocus|onBlur|onScroll|onDrop)\s*=\s*\{?\s*([a-zA-Z0-9_$.]+)?/g)) {
    const evt = m[1];
    const handler = m[2] && !['e', 'ev', 'event', 'async'].includes(m[2]) ? `${evt}:${m[2]}` : evt;
    uiInteractions.add(handler);
  }
  for (const m of content.matchAll(/addEventListener\s*\(\s*['"]([a-zA-Z]+)['"]/g)) {
    if (m[1]) uiInteractions.add(`event:${m[1]}`);
  }
  for (const m of content.matchAll(/<form\b([^>]*)>/gi)) {
    const idM = (m[1] || '').match(/\bid=["']([^"']+)["']/i);
    const actM = (m[1] || '').match(/\baction=["']([^"']+)["']/i);
    uiInteractions.add(idM ? `form:#${idM[1]}` : 'form');
    if (actM && actM[1] && !actM[1].startsWith('#') && !/^javascript:/i.test(actM[1])) {
      apiCalls.push({ method: 'POST', path: normalizeEndpointPath(actM[1]), rawUrl: actM[1], via: 'html_form' });
    }
  }

  // Client-side routes (<Route path="/checkout" ...> or Next.js pages/app folders)
  for (const m of content.matchAll(/<Route\b[^>]*\bpath=["']([^"']+)["']/gi)) {
    if (m[1]) clientRoutes.add(m[1]);
  }
  const nextRouteM = normalizeProjectPath(relPath).match(/(?:^|\/)(?:pages|app)\/(.+?)\.(?:jsx?|tsx?)$/i);
  if (nextRouteM && !/(?:^|\/)api\//i.test(relPath)) {
    let rp = '/' + nextRouteM[1].replace(/\/page$/i, '').replace(/\/index$/i, '').replace(/^index$/i, '');
    clientRoutes.add(rp || '/');
  }
  if (/\.html?$/i.test(base)) {
    clientRoutes.add(base.toLowerCase() === 'index.html' ? '/' : `/${base}`);
  }

  // Frontend API calls (fetch / axios)
  for (const m of content.matchAll(/fetch\s*\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*\{([\s\S]{0,260}?)\})?/gi)) {
    const rawUrl = m[1];
    if (!rawUrl || /^(data:|blob:)/i.test(rawUrl)) continue;
    const methM = (m[2] || '').match(/method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
    const method = methM ? methM[1].toUpperCase() : 'GET';
    const normPath = normalizeEndpointPath(rawUrl);
    if (normPath.startsWith('/api') || /^https?:\/\//i.test(rawUrl) || normPath.startsWith('/')) {
      apiCalls.push({ method, path: normPath, rawUrl, via: 'fetch', isExternal: /^https?:\/\//i.test(rawUrl) && !rawUrl.includes('localhost') });
    }
  }
  for (const m of content.matchAll(/axios\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi)) {
    apiCalls.push({
      method: m[1].toUpperCase(),
      path: normalizeEndpointPath(m[2]),
      rawUrl: m[2],
      via: 'axios',
      isExternal: /^https?:\/\//i.test(m[2]) && !m[2].includes('localhost')
    });
  }

  if (/\b(?:Outlet|children)\b/.test(content) && components.size > 0 && /(?:nav|sidebar|header|footer|layout)/i.test(content)) {
    isLayout = true;
  }

  return {
    components: Array.from(components),
    childComponents: Array.from(childComponents),
    isLayout,
    stateHooks: Array.from(stateHooks),
    stateStores: Array.from(stateStores),
    uiInteractions: Array.from(uiInteractions).slice(0, 20),
    clientRoutes: Array.from(clientRoutes),
    apiCalls
  };
}

/**
 * Deep Backend Analysis: routes, middleware pipelines, controllers, services & server-side operations.
 */
function analyzeBackendModule(relPath, content) {
  const routes = [];
  const middlewares = new Set();
  const services = new Set();
  const serverOps = new Set();

  // Global / router middleware registrations: app.use(cors()), router.use(authMiddleware), app.use('/api/orders', ordersRouter)
  const mountedRouters = [];
  for (const m of content.matchAll(/\b(?:app|router|server)\s*\.use\s*\(([^)\n]{1,140})\)/g)) {
    const args = (m[1] || '').trim();
    const mountM = args.match(/^['"`]([^'"`]+)['"`]\s*,\s*([a-zA-Z0-9_$.]+)/);
    if (mountM) {
      mountedRouters.push({ prefix: normalizeEndpointPath(mountM[1]), target: mountM[2] });
      middlewares.add(`${mountM[1]} -> ${mountM[2]}`);
    } else if (args) {
      const mwName = args.split(',')[0].replace(/\([\s\S]*$/, '').trim();
      if (mwName && mwName.length <= 50) middlewares.add(mwName);
    }
  }

  // Express / Fastify / Hono / Koa / FastAPI / Flask routes
  const routeRegex = /(?:(?:app|router|fastify|server)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]([^;\n{]{0,180})|@(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`])/gi;
  let rm;
  while ((rm = routeRegex.exec(content)) !== null) {
    const method = (rm[1] || rm[4] || 'GET').toUpperCase();
    const rPath = normalizeEndpointPath(rm[2] || rm[5] || '');
    const argsTail = (rm[3] || '').trim();
    const rawSlice = content.slice(rm.index, rm.index + 1400);
    const nextRouteOffset = rawSlice.slice(rm[0].length).search(/\n\s*(?:(?:app|router|fastify|server)\.(?:get|post|put|delete|patch)\s*\(|@(?:app|router)\.(?:get|post|put|delete|patch))/i);
    const bodySlice = nextRouteOffset >= 0 ? rawSlice.slice(0, rm[0].length + nextRouteOffset) : rawSlice;

    // Extract per-route middleware identifiers & handler/controller name
    const routeMw = [];
    const argTokens = argsTail.replace(/^,/, '').split(',').map(s => s.trim()).filter(Boolean);
    for (const tok of argTokens) {
      const idM = tok.match(/^([a-zA-Z_$][a-zA-Z0-9_$.]*)/);
      if (idM && !['async', 'function', 'req', 'res', 'next'].includes(idM[1])) {
        routeMw.push(idM[1]);
        middlewares.add(idM[1]);
      }
    }

    const routeTables = new Set();
    for (const tm of bodySlice.matchAll(/(?:collection\s*\(\s*[^,)]+,\s*['"`]([^'"`]+)['"`]|\.(?:collection|from)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)|\b(?:FROM|INTO|UPDATE|JOIN)\s+[`"']?([a-zA-Z_][a-zA-Z0-9_]{1,40})[`"']?|\bprisma\.([a-zA-Z_][a-zA-Z0-9_]+)\.)/gi)) {
      const t = tm[1] || tm[2] || tm[3] || tm[4];
      if (t && !/^(select|where|values|set|table|req|res|null|true|false)$/i.test(t)) routeTables.add(t);
    }

    const hasAuth = /\b(auth|verifyToken|requireAuth|authenticate|jwt|protect|session|rbac|isAdmin)\b/i.test(argsTail + ' ' + bodySlice.slice(0, 320));
    const hasValidation = /\b(validate|zod|joi|yup|schema|if\s*\(\s*!req\.body|required|status\(\s*400\s*\))/i.test(argsTail + ' ' + bodySlice);
    const hasErrorHandling = /\btry\s*\{|\.catch\s*\(|catch\s*\(|except\s+/i.test(bodySlice);

    routes.push({
      file: relPath,
      method,
      path: rPath,
      middlewares: routeMw,
      tables: Array.from(routeTables),
      hasAuth,
      hasValidation,
      hasErrorHandling
    });
  }

  // Next.js API Route Handlers (export async function GET/POST/PUT/DELETE in pages/api or app/api)
  const nextApiM = normalizeProjectPath(relPath).match(/(?:^|\/)(?:pages|app)\/(api\/.+?)\.(?:jsx?|tsx?)$/i);
  if (nextApiM) {
    const apiPath = '/' + nextApiM[1].replace(/\/route$/i, '').replace(/\/index$/i, '');
    const foundMethods = Array.from(content.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)).map(m => m[1]);
    const methods = foundMethods.length > 0 ? foundMethods : ['ALL'];
    for (const meth of methods) {
      routes.push({
        file: relPath,
        method: meth,
        path: normalizeEndpointPath(apiPath),
        middlewares: [],
        tables: [],
        hasAuth: /\b(auth|getSession|verifyToken|jwt)\b/i.test(content),
        hasValidation: /\b(zod|joi|validate|400)\b/i.test(content),
        hasErrorHandling: /\btry\s*\{/i.test(content)
      });
    }
  }

  // Services / Controllers / Business Logic Functions
  for (const m of content.matchAll(/(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    if (m[1]) services.add(m[1]);
  }
  for (const m of content.matchAll(/(?:export\s+const|exports\.)\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?(?:\(|function)/g)) {
    if (m[1]) services.add(m[1]);
  }
  if (/\.py$/i.test(relPath)) {
    for (const m of content.matchAll(/^(?:async\s+)?(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/gm)) {
      if (m[1] && !m[1].startsWith('_')) services.add(m[1]);
    }
  }

  // Server-side business operations
  const opDetectors = [
    ['Authentication/JWT', /\b(jwt\.sign|jwt\.verify|bcrypt|passport|firebase-admin|verifyIdToken|createSession)\b/i],
    ['Payments/Billing', /\b(stripe|razorpay|paypal|checkout\.sessions|createOrder|paymentIntent)\b/i],
    ['Email/Notifications', /\b(nodemailer|sendgrid|resend|twilio|sendMail|fcm|messaging\(\)\.send)\b/i],
    ['File/Cloud Storage', /\b(multer|s3Client|PutObjectCommand|getStorage|bucket\.file|DriveApp|uploadBytes)\b/i],
    ['Background/Cron Jobs', /\b(node-cron|cron\.schedule|bullmq|Queue\(|setInterval|celery)\b/i],
    ['Real-Time/WebSockets', /\b(socket\.io|WebSocketServer|new\s+WebSocket|onSnapshot)\b/i]
  ];
  for (const [label, re] of opDetectors) {
    if (re.test(content)) serverOps.add(label);
  }

  return {
    routes,
    middlewares: Array.from(middlewares),
    mountedRouters,
    services: Array.from(services).slice(0, 25),
    serverOps: Array.from(serverOps)
  };
}

/**
 * Deep Database Analysis: SQL tables/columns/PK/FK, Prisma models/@relation,
 * Mongoose schemas/refs, Firestore/Supabase collections & per-file CRUD operations.
 */
function analyzeDatabaseModule(relPath, content) {
  const schemas = [];
  const relationships = [];
  const accessedTables = new Set();
  const operations = new Set();

  // 1. SQL CREATE TABLE with columns, PRIMARY KEY, FOREIGN KEY ... REFERENCES
  const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?([a-zA-Z_][a-zA-Z0-9_.]*)[`"']?\s*\(([\s\S]*?)\)\s*;/gi;
  let tm;
  while ((tm = createTableRe.exec(content)) !== null) {
    const tableName = tm[1].split('.').pop();
    const body = tm[2] || '';
    const columns = [];
    const primaryKeys = [];
    const lines = body.split(/,\s*(?![^()]*\))/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      // Table-level FOREIGN KEY (col) REFERENCES other(col)
      const fkM = line.match(/FOREIGN\s+KEY\s*\(\s*[`"']?([a-zA-Z0-9_]+)[`"']?\s*\)\s*REFERENCES\s+[`"']?([a-zA-Z0-9_.]+)[`"']?\s*(?:\(\s*[`"']?([a-zA-Z0-9_]+)[`"']?\s*\))?/i);
      if (fkM) {
        relationships.push({
          fromTable: tableName,
          fromColumn: fkM[1],
          toTable: fkM[2].split('.').pop(),
          toColumn: fkM[3] || 'id',
          kind: 'sql_foreign_key',
          file: relPath
        });
        continue;
      }
      const pkLineM = line.match(/^PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkLineM) {
        pkLineM[1].split(',').forEach(k => primaryKeys.push(k.replace(/[`"'\s]/g, '')));
        continue;
      }
      if (/^(?:CONSTRAINT|UNIQUE|INDEX|KEY|CHECK)\b/i.test(line)) continue;
      const colM = line.match(/^[`"']?([a-zA-Z_][a-zA-Z0-9_]*)[`"']?\s+([A-Za-z0-9_(),\s]{2,32})/);
      if (colM) {
        const colName = colM[1];
        const colType = colM[2].trim().split(/\s+/)[0];
        columns.push(`${colName}:${colType}`);
        if (/\bPRIMARY\s+KEY\b/i.test(line)) primaryKeys.push(colName);
        const inlineRef = line.match(/\bREFERENCES\s+[`"']?([a-zA-Z0-9_.]+)[`"']?\s*(?:\(\s*[`"']?([a-zA-Z0-9_]+)[`"']?\s*\))?/i);
        if (inlineRef) {
          relationships.push({
            fromTable: tableName,
            fromColumn: colName,
            toTable: inlineRef[1].split('.').pop(),
            toColumn: inlineRef[2] || 'id',
            kind: 'sql_foreign_key',
            file: relPath
          });
        }
      }
    }
    accessedTables.add(tableName);
    schemas.push({
      name: tableName,
      kind: 'sql_table',
      file: relPath,
      columns: columns.slice(0, 25),
      primaryKeys
    });
  }

  // 2. Prisma schema models & @relation
  if (/\.prisma$/i.test(relPath) || /\bmodel\s+[A-Z][A-Za-z0-9_]*\s*\{/.test(content)) {
    for (const pm of content.matchAll(/\bmodel\s+([A-Z][A-Za-z0-9_]*)\s*\{([\s\S]*?)\}/g)) {
      const modelName = pm[1];
      const mBody = pm[2] || '';
      const columns = [];
      for (const ln of mBody.split(/\r?\n/)) {
        const clean = ln.trim();
        if (!clean || clean.startsWith('//') || clean.startsWith('@@')) continue;
        const fM = clean.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+([A-Za-z0-9_\[\]?]+)/);
        if (fM) {
          columns.push(`${fM[1]}:${fM[2]}`);
          const relM = clean.match(/@relation\s*\([^)]*fields\s*:\s*\[([^\]]+)\][^)]*references\s*:\s*\[([^\]]+)\]/);
          if (relM) {
            relationships.push({
              fromTable: modelName,
              fromColumn: relM[1].trim(),
              toTable: fM[2].replace(/[\[\]?]/g, ''),
              toColumn: relM[2].trim(),
              kind: 'prisma_relation',
              file: relPath
            });
          }
        }
      }
      accessedTables.add(modelName);
      schemas.push({ name: modelName, kind: 'prisma_model', file: relPath, columns: columns.slice(0, 25), primaryKeys: ['id'] });
    }
  }

  // 3. Mongoose Schema definitions & refs (balanced-brace extraction handles nested field objects cleanly)
  const mongooseStartRe = /(?:const|let|var)\s+([A-Za-z0-9_]+?)(?:Schema)?\s*=\s*new\s+(?:mongoose\.)?Schema\s*\(\s*\{/g;
  let mm;
  while ((mm = mongooseStartRe.exec(content)) !== null) {
    const rawModel = mm[1].replace(/Schema$/i, '');
    let depth = 1;
    let cursor = mm.index + mm[0].length;
    const maxCursor = Math.min(content.length, cursor + 4000);
    while (cursor < maxCursor && depth > 0) {
      const ch = content[cursor];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      cursor++;
    }
    const sBody = content.slice(mm.index + mm[0].length, cursor - 1);
    const columns = [];
    for (const fm of sBody.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(?:\{([^}]{1,220})\}|([A-Z][a-zA-Z]+))/g)) {
      const field = fm[1];
      const fieldBody = fm[2] || '';
      const directType = fm[3] || '';
      const typeM = fieldBody.match(/\btype\s*:\s*([A-Za-z0-9_.]+)/);
      columns.push(`${field}:${typeM ? typeM[1] : (directType || 'Mixed')}`);
      const refM = fieldBody.match(/\bref\s*:\s*['"]([^'"]+)['"]/);
      if (refM) {
        relationships.push({
          fromTable: rawModel,
          fromColumn: field,
          toTable: refM[1],
          toColumn: '_id',
          kind: 'mongoose_ref',
          file: relPath
        });
      }
    }
    accessedTables.add(rawModel);
    schemas.push({ name: rawModel, kind: 'mongoose_schema', file: relPath, columns: columns.slice(0, 25), primaryKeys: ['_id'] });
  }

  // 4. Runtime Database Queries (Firestore, Supabase, SQL, Prisma, Mongoose)
  for (const fm of content.matchAll(/(?:collection\s*\(\s*[^,)]+,\s*['"`]([^'"`]+)['"`]|\.(?:collection|from)\s*\(\s*['"`]([^'"`]+)['"`]\s*\))/gi)) {
    const tbl = (fm[1] || fm[2] || '').trim();
    if (tbl && tbl.length <= 45) accessedTables.add(tbl);
  }
  for (const sm of content.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+[`"']?([a-zA-Z_][a-zA-Z0-9_]{1,40})[`"']?/gi)) {
    const tbl = sm[1];
    if (tbl && !/^(select|where|values|set|table|index|null|true|false|default|primary|foreign|the|this|that|your|our)$/i.test(tbl)) {
      accessedTables.add(tbl);
    }
  }
  for (const pm of content.matchAll(/\bprisma\.([a-zA-Z_][a-zA-Z0-9_]+)\.(?:findMany|findUnique|findFirst|create|update|delete|upsert)/g)) {
    if (pm[1]) accessedTables.add(pm[1]);
  }

  if (/\b(getDocs|getDoc|onSnapshot|SELECT\s+|\.select\(|findMany|findUnique|findOne|find\()/i.test(content)) operations.add('READ');
  if (/\b(addDoc|setDoc|INSERT\s+INTO|\.insert\(|create\(|save\()/i.test(content)) operations.add('CREATE');
  if (/\b(updateDoc|UPDATE\s+|\.update\(|findByIdAndUpdate|upsert)/i.test(content)) operations.add('UPDATE');
  if (/\b(deleteDoc|DELETE\s+FROM|\.delete\(|findByIdAndDelete|remove\()/i.test(content)) operations.add('DELETE');

  return {
    schemas,
    relationships,
    accessedTables: Array.from(accessedTables),
    operations: Array.from(operations)
  };
}

/**
 * Analyze config / manifest files (names & structure only — zero secrets!).
 */
function analyzeConfigModule(relPath, content) {
  const base = getBaseName(relPath).toLowerCase();
  const frameworks = [];
  const dependencies = [];
  const scripts = {};
  const documentedEnvVars = [];
  const referencedEnvVars = [];

  for (const m of content.matchAll(/(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]{2,})/g)) {
    if (!referencedEnvVars.includes(m[1])) referencedEnvVars.push(m[1]);
  }

  if (base === 'package.json') {
    try {
      const pkg = JSON.parse(content);
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      for (const [dep, ver] of Object.entries(allDeps)) {
        dependencies.push(`${dep}@${ver}`);
        const d = dep.toLowerCase();
        if (d === 'react') frameworks.push('React');
        else if (d === 'next') frameworks.push('Next.js');
        else if (d === 'vue') frameworks.push('Vue.js');
        else if (d === 'svelte') frameworks.push('Svelte');
        else if (d === 'express') frameworks.push('Express.js');
        else if (d === 'fastify') frameworks.push('Fastify');
        else if (d === 'vite') frameworks.push('Vite');
        else if (d === 'tailwindcss') frameworks.push('Tailwind CSS');
        else if (d === 'firebase') frameworks.push('Firebase');
        else if (d.includes('supabase')) frameworks.push('Supabase');
        else if (d === 'mongoose' || d === 'mongodb') frameworks.push('MongoDB');
        else if (d === 'prisma' || d === '@prisma/client') frameworks.push('Prisma ORM');
        else if (d === 'pg' || d === 'mysql2' || d === 'sqlite3') frameworks.push('SQL Database');
        else if (d === 'redux' || d === '@reduxjs/toolkit') frameworks.push('Redux');
        else if (d === 'zustand') frameworks.push('Zustand');
      }
      if (pkg.scripts && typeof pkg.scripts === 'object') Object.assign(scripts, pkg.scripts);
    } catch (_) {}
  } else if (/^\.env(\.example|\.sample|\.template)?$/i.test(base)) {
    for (const m of content.matchAll(/^([A-Z][A-Z0-9_]{2,})\s*=/gm)) {
      if (!documentedEnvVars.includes(m[1])) documentedEnvVars.push(m[1]);
    }
  } else if (base === 'requirements.txt' || base === 'pyproject.toml') {
    if (/fastapi/i.test(content)) frameworks.push('FastAPI');
    if (/flask/i.test(content)) frameworks.push('Flask');
    if (/django/i.test(content)) frameworks.push('Django');
    if (/sqlalchemy/i.test(content)) frameworks.push('SQLAlchemy');
    for (const ln of content.split(/\r?\n/)) {
      const m = ln.trim().match(/^([a-zA-Z0-9_-]{2,40})([=<>!~]+[^\s#]+)?/);
      if (m && !ln.trim().startsWith('#') && !ln.trim().startsWith('[')) {
        dependencies.push(`${m[1]}${m[2] || ''}`);
      }
    }
  }

  return { frameworks, dependencies, scripts, documentedEnvVars, referencedEnvVars };
}

/**
 * Analyze a single file into a compact, self-contained index entry.
 */
function analyzeSingleFile(file) {
  const relPath = normalizeProjectPath(file?.relativePath || file?.path || file?.name || '');
  const baseName = getBaseName(relPath);
  const folder = getFolderPath(relPath);
  const rawContent = typeof file?.content === 'string'
    ? file.content
    : (typeof file?.textContent === 'string' ? file.textContent : (typeof file?.contentPreview === 'string' ? file.contentPreview : ''));

  const isBinary = Boolean(file?.isBinary) || /^\[Binary File:/i.test(rawContent.trim());
  const isReadError = /^\[Failed to read/i.test(rawContent.trim());
  const isEmpty = !isBinary && !isReadError && rawContent.trim().length === 0;
  const contentHash = hashFileContent(rawContent);
  const lineCount = rawContent ? rawContent.split(/\r?\n/).length : 0;
  const area = classifyProjectArea(relPath, rawContent);

  if (isBinary || isReadError || isEmpty) {
    return {
      path: relPath,
      name: baseName,
      folder,
      area,
      contentHash,
      sizeBytes: Number(file?.sizeBytes || rawContent.length || 0),
      lineCount,
      status: isBinary ? 'binary_skipped' : (isReadError ? 'inaccessible' : 'empty'),
      reason: isBinary ? 'binary_asset' : (isReadError ? 'read_error' : 'empty_content'),
      internalImports: [],
      resolvedImports: [],
      importedBy: [],
      externalPackages: [],
      exports: [],
      frontend: null,
      backend: null,
      database: null,
      config: null
    };
  }

  const modIO = extractModuleImportsAndExports(rawContent, relPath);
  const frontend = (area === 'frontend' || /\.(html?|jsx?|tsx?|vue|svelte)$/i.test(baseName))
    ? analyzeFrontendModule(relPath, rawContent)
    : null;
  const backend = (area === 'backend' || /\.(m?js|cjs|ts|py|go|java|php|rb)$/i.test(baseName))
    ? analyzeBackendModule(relPath, rawContent)
    : null;
  const database = analyzeDatabaseModule(relPath, rawContent);
  const config = analyzeConfigModule(relPath, rawContent);

  return {
    path: relPath,
    name: baseName,
    folder,
    area,
    contentHash,
    sizeBytes: Number(file?.sizeBytes || rawContent.length || 0),
    lineCount,
    status: 'analyzed',
    reason: null,
    internalImports: modIO.internalImports,
    resolvedImports: [],
    importedBy: [],
    externalPackages: modIO.externalPackages,
    exports: modIO.exports,
    frontend: frontend && (
      frontend.components.length ||
      frontend.childComponents.length ||
      frontend.stateHooks.length ||
      frontend.uiInteractions.length ||
      frontend.clientRoutes.length ||
      frontend.apiCalls.length
    ) ? frontend : null,
    backend: backend && (
      backend.routes.length ||
      backend.middlewares.length ||
      backend.services.length ||
      backend.serverOps.length
    ) ? backend : null,
    database: (database.schemas.length || database.relationships.length || database.accessedTables.length) ? database : null,
    config: (config.frameworks.length || config.dependencies.length || config.documentedEnvVars.length || config.referencedEnvVars.length) ? config : null
  };
}

/**
 * Resolve a relative/alias import specifier from `fromPath` against the indexed file map.
 */
function resolveImportSpec(fromPath, spec, pathLookup) {
  const cleanSpec = String(spec || '').split('?')[0].split('#')[0].trim();
  if (!cleanSpec) return null;

  let candidateBase = '';
  if (cleanSpec.startsWith('@/') || cleanSpec.startsWith('~/')) {
    candidateBase = 'src/' + cleanSpec.slice(2);
  } else if (cleanSpec.startsWith('/')) {
    candidateBase = cleanSpec.replace(/^\/+/, '');
  } else {
    const dir = getFolderPath(fromPath);
    const baseParts = dir === '(root)' ? [] : dir.split('/');
    for (const seg of cleanSpec.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') baseParts.pop();
      else baseParts.push(seg);
    }
    candidateBase = baseParts.join('/');
  }

  const exts = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.vue', '.svelte', '.json', '.css', '.py', '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];
  const basesToTry = [candidateBase];
  if (candidateBase.startsWith('src/')) basesToTry.push(candidateBase.slice(4));

  for (const b of basesToTry) {
    for (const ext of exts) {
      const tryPath = normalizeProjectPath(b + ext).toLowerCase();
      if (pathLookup.has(tryPath)) return pathLookup.get(tryPath);
    }
  }

  // Basename fallback if uploaded flat without directory prefixes
  const specBase = getBaseName(candidateBase).toLowerCase();
  for (const ext of ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.vue', '.svelte', '.py']) {
    if (pathLookup.has(`__base__:${specBase}${ext}`)) {
      return pathLookup.get(`__base__:${specBase}${ext}`);
    }
  }
  return null;
}

/**
 * Builds the complete Cross-Module Graph, End-to-End Chains, Diagnostics & Coverage Manifest
 * from a map of per-file index entries.
 */
function finalizeDeepProjectIndex(fileEntriesMap, externalSkipped = [], incrementalStats = null) {
  const entries = Object.values(fileEntriesMap).sort((a, b) => a.path.localeCompare(b.path));
  const pathLookup = new Map();
  const baseNameCounts = new Map();

  for (const e of entries) {
    pathLookup.set(e.path.toLowerCase(), e.path);
    const bLower = e.name.toLowerCase();
    baseNameCounts.set(bLower, (baseNameCounts.get(bLower) || 0) + 1);
  }
  for (const e of entries) {
    const bLower = e.name.toLowerCase();
    if (baseNameCounts.get(bLower) === 1) {
      pathLookup.set(`__base__:${bLower}`, e.path);
    }
  }

  // Reset graph edges before recomputing cleanly
  for (const e of entries) {
    e.resolvedImports = [];
    e.importedBy = [];
  }

  const unresolvedImports = [];
  const allExternalPackages = new Set();
  const allFrameworks = new Set();
  const allDependencies = new Set();
  const documentedEnvVars = new Set();
  const referencedEnvVars = new Set();
  const allRoutes = [];
  const allMiddlewares = new Set();
  const allDbSchemas = [];
  const allDbRelationships = [];
  const dbTableTouchMap = {}; // tableName -> { readers: Set, writers: Set, schemas: [] }
  const componentMap = {};    // componentName -> { file, children, stateHooks, isLayout }
  const folderTree = {};      // folder -> { count, files: [] }
  const areaBreakdown = {
    frontend: [],
    backend: [],
    database: [],
    config: [],
    styles: [],
    tests: [],
    docs: [],
    other: []
  };

  const entryByPath = {};
  for (const e of entries) entryByPath[e.path] = e;

  for (const e of entries) {
    if (!folderTree[e.folder]) folderTree[e.folder] = { count: 0, files: [] };
    folderTree[e.folder].count++;
    folderTree[e.folder].files.push(e.name);

    if (areaBreakdown[e.area]) areaBreakdown[e.area].push(e.path);
    else areaBreakdown.other.push(e.path);

    if (e.status !== 'analyzed') continue;

    // Resolve imports + populate reverse importedBy
    for (const rawSpec of e.internalImports || []) {
      const target = resolveImportSpec(e.path, rawSpec, pathLookup);
      if (target && target !== e.path) {
        if (!e.resolvedImports.includes(target)) e.resolvedImports.push(target);
        if (entryByPath[target] && !entryByPath[target].importedBy.includes(e.path)) {
          entryByPath[target].importedBy.push(e.path);
        }
      } else if (!target && !/\.(svg|png|jpe?g|gif|webp|ico|woff2?|ttf|mp3|mp4|css|scss|less)$/i.test(rawSpec)) {
        unresolvedImports.push({
          fromFile: e.path,
          importSpec: rawSpec,
          detail: `${e.path} imports "${rawSpec}", which was not found in the indexed project files.`
        });
      }
    }

    (e.externalPackages || []).forEach(p => allExternalPackages.add(p));

    if (e.config) {
      (e.config.frameworks || []).forEach(f => allFrameworks.add(f));
      (e.config.dependencies || []).forEach(d => allDependencies.add(d));
      (e.config.documentedEnvVars || []).forEach(v => documentedEnvVars.add(v));
      (e.config.referencedEnvVars || []).forEach(v => referencedEnvVars.add(v));
    }

    if (e.frontend) {
      for (const comp of e.frontend.components || []) {
        componentMap[comp] = {
          name: comp,
          file: e.path,
          isLayout: Boolean(e.frontend.isLayout),
          children: e.frontend.childComponents || [],
          stateHooks: e.frontend.stateHooks || [],
          stateStores: e.frontend.stateStores || [],
          interactions: (e.frontend.uiInteractions || []).slice(0, 8)
        };
      }
    }

    if (e.backend) {
      (e.backend.routes || []).forEach(r => allRoutes.push(r));
      (e.backend.middlewares || []).forEach(mw => allMiddlewares.add(mw));
    }

    if (e.database) {
      (e.database.schemas || []).forEach(s => allDbSchemas.push(s));
      (e.database.relationships || []).forEach(rel => allDbRelationships.push(rel));
      for (const tbl of e.database.accessedTables || []) {
        if (!dbTableTouchMap[tbl]) dbTableTouchMap[tbl] = { table: tbl, files: new Set(), operations: new Set() };
        dbTableTouchMap[tbl].files.add(e.path);
        (e.database.operations || []).forEach(op => dbTableTouchMap[tbl].operations.add(op));
      }
    }
  }

  // Detect circular dependencies (DFS over resolvedImports)
  const circularDependencies = [];
  const seenCycleKeys = new Set();
  const visiting = new Set();
  const visited = new Set();
  const dfsStack = [];

  const visitCycle = (nodePath) => {
    visiting.add(nodePath);
    dfsStack.push(nodePath);
    const node = entryByPath[nodePath];
    for (const nextPath of (node?.resolvedImports || [])) {
      if (visiting.has(nextPath)) {
        const cycleStart = dfsStack.indexOf(nextPath);
        if (cycleStart >= 0) {
          const cycle = [...dfsStack.slice(cycleStart), nextPath];
          const key = [...cycle].sort().join('->');
          if (!seenCycleKeys.has(key)) {
            seenCycleKeys.add(key);
            circularDependencies.push({
              cycle,
              detail: `Circular dependency detected: ${cycle.join(' -> ')}`
            });
          }
        }
      } else if (!visited.has(nextPath)) {
        visitCycle(nextPath);
      }
    }
    dfsStack.pop();
    visiting.delete(nodePath);
    visited.add(nodePath);
  };
  for (const e of entries) {
    if (e.status === 'analyzed' && !visited.has(e.path)) visitCycle(e.path);
  }

  // Detect orphaned/unreferenced internal code modules (excluding entry points, tests, configs, styles, docs, HTML pages)
  const orphanedModules = [];
  for (const e of entries) {
    if (e.status !== 'analyzed') continue;
    if (!['frontend', 'backend'].includes(e.area)) continue;
    if (ENTRY_POINT_RE.test(e.path) || /\.html?$/i.test(e.name)) continue;
    if ((e.backend?.routes?.length || 0) > 0 || (e.frontend?.clientRoutes?.length || 0) > 0) continue;
    if ((e.importedBy || []).length === 0 && (e.exports || []).length > 0) {
      orphanedModules.push(e.path);
    }
  }

  // Build Cross-Module End-to-End Chains (UI File -> Service/API -> Backend Route/Middleware -> DB Table)
  const crossModuleChains = [];
  const missingBackendEndpoints = [];
  for (const e of entries) {
    if (!e.frontend?.apiCalls?.length) continue;
    for (const call of e.frontend.apiCalls) {
      if (call.isExternal) {
        crossModuleChains.push({
          fromFile: e.path,
          method: call.method,
          endpoint: call.rawUrl,
          backendFile: 'External API',
          middlewares: [],
          dbTables: [],
          description: `${e.path} calls external ${call.method} ${call.rawUrl}`
        });
        continue;
      }
      const match = allRoutes.find(r =>
        (r.method === call.method || r.method === 'ALL') && endpointMatchesRoute(call.path, r.path)
      );
      if (match) {
        const mwNote = match.middlewares?.length ? ` [middleware: ${match.middlewares.join(', ')}]` : '';
        const dbNote = match.tables?.length ? ` -> DB(${match.tables.join(', ')})` : '';
        crossModuleChains.push({
          fromFile: e.path,
          method: call.method,
          endpoint: call.path,
          backendFile: match.file,
          middlewares: match.middlewares || [],
          dbTables: match.tables || [],
          description: `${e.path} -> ${call.method} ${call.path} -> ${match.file}${mwNote}${dbNote}`
        });
      } else if (call.path.startsWith('/api')) {
        missingBackendEndpoints.push({
          fromFile: e.path,
          method: call.method,
          endpoint: call.path,
          detail: `${e.path} calls ${call.method} ${call.path}, which has no matching backend route handler.`
        });
      }
    }
  }

  // Coverage & Omission Verification Manifest
  const analyzedFiles = entries.filter(e => e.status === 'analyzed');
  const inaccessibleFiles = entries
    .filter(e => e.status === 'inaccessible')
    .map(e => ({ path: e.path, reason: e.reason || 'read_error' }));
  const skippedFiles = [
    ...entries
      .filter(e => e.status === 'binary_skipped' || e.status === 'empty')
      .map(e => ({ path: e.path, reason: e.reason })),
    ...(Array.isArray(externalSkipped) ? externalSkipped.map(s => ({
      path: normalizeProjectPath(s.path || s.relativePath || s.name || ''),
      reason: s.reason || 'ignored'
    })) : [])
  ];
  // Deduplicate skippedFiles by path
  const seenSkipped = new Set();
  const uniqueSkipped = skippedFiles.filter(s => {
    const k = `${s.path}::${s.reason}`;
    if (!s.path || seenSkipped.has(k)) return false;
    seenSkipped.add(k);
    return true;
  });

  const analyzableTotal = analyzedFiles.length + inaccessibleFiles.length;
  const totalDiscoveredFiles = analyzedFiles.length + inaccessibleFiles.length + uniqueSkipped.length;
  const coveragePercent = analyzableTotal > 0
    ? Math.round((analyzedFiles.length / analyzableTotal) * 100)
    : 100;

  const missingEnvVars = Array.from(referencedEnvVars)
    .filter(v => !documentedEnvVars.has(v))
    .map(v => ({ variable: v, detail: `Environment variable "${v}" is referenced in code but not documented in .env.example.` }));

  const dbTableSummary = Object.values(dbTableTouchMap).map(item => ({
    table: item.table,
    files: Array.from(item.files),
    operations: Array.from(item.operations)
  }));

  const coverage = {
    totalDiscoveredFiles,
    analyzedFilesCount: analyzedFiles.length,
    inaccessibleFilesCount: inaccessibleFiles.length,
    skippedFilesCount: uniqueSkipped.length,
    coveragePercent,
    areaCounts: {
      frontend: areaBreakdown.frontend.length,
      backend: areaBreakdown.backend.length,
      database: areaBreakdown.database.length,
      config: areaBreakdown.config.length,
      styles: areaBreakdown.styles.length,
      tests: areaBreakdown.tests.length,
      docs: areaBreakdown.docs.length,
      other: areaBreakdown.other.length
    },
    areaBreakdown,
    folderTree,
    inaccessibleFiles,
    skippedFiles: uniqueSkipped.slice(0, 120),
    lastIndexedAt: new Date().toISOString(),
    incrementalStats: incrementalStats || {
      mode: 'full',
      added: entries.length,
      modified: 0,
      removed: 0,
      reused: 0
    }
  };

  const summary = `Indexed ${analyzedFiles.length}/${analyzableTotal} analyzable project files (${coveragePercent}% source coverage across ${Object.keys(folderTree).length} folders; ${uniqueSkipped.length} skipped assets/ignored files, ${inaccessibleFiles.length} inaccessible). Found ${Object.keys(componentMap).length} frontend component(s), ${allRoutes.length} backend route(s), ${allMiddlewares.size} middleware(s), ${allDbSchemas.length} DB schema(s), ${allDbRelationships.length} DB relationship(s), and ${crossModuleChains.length} cross-module flow(s).`;

  return {
    version: 1,
    summary,
    coverage,
    frameworks: Array.from(allFrameworks),
    dependencies: Array.from(allDependencies),
    externalPackages: Array.from(allExternalPackages),
    components: Object.values(componentMap),
    backendRoutes: allRoutes,
    middlewares: Array.from(allMiddlewares),
    databaseSchemas: allDbSchemas,
    databaseRelationships: allDbRelationships,
    databaseTables: dbTableSummary,
    crossModuleChains,
    diagnostics: {
      missingBackendEndpoints,
      unresolvedImports,
      circularDependencies,
      orphanedModules,
      missingEnvVars,
      inaccessibleFiles,
      totalIssuesCount:
        missingBackendEndpoints.length +
        unresolvedImports.length +
        circularDependencies.length +
        missingEnvVars.length +
        inaccessibleFiles.length
    },
    fileEntries: entryByPath
  };
}

/**
 * Full build of the systematic Deep Project Index across ALL uploaded files.
 */
export function buildDeepProjectIndex(fileList = [], options = {}) {
  const safeList = Array.isArray(fileList) ? fileList.filter(f => f && (f.relativePath || f.path || f.name)) : [];
  const entriesMap = {};
  for (const file of safeList) {
    const entry = analyzeSingleFile(file);
    if (entry.path) entriesMap[entry.path] = entry;
  }
  const externalSkipped = Array.isArray(options?.skippedFiles)
    ? options.skippedFiles
    : (Array.isArray(fileList?.omissionReport) ? fileList.omissionReport : []);
  return finalizeDeepProjectIndex(entriesMap, externalSkipped, {
    mode: 'full',
    added: Object.keys(entriesMap).length,
    modified: 0,
    removed: 0,
    reused: 0
  });
}

/**
 * Continuous Incremental Project Re-Indexer:
 * Compares content hashes against `previousIndex.fileEntries`, reuses unchanged files in O(1),
 * re-analyzes ONLY added/modified files, removes deleted files, and rebuilds cross-module edges & coverage.
 */
export function updateDeepProjectIndexIncremental(previousIndex, nextFileList = [], options = {}) {
  if (!previousIndex || !previousIndex.fileEntries || typeof previousIndex.fileEntries !== 'object') {
    return buildDeepProjectIndex(nextFileList, options);
  }

  const prevEntries = previousIndex.fileEntries;
  const safeList = Array.isArray(nextFileList) ? nextFileList.filter(f => f && (f.relativePath || f.path || f.name)) : [];
  const nextEntriesMap = {};
  const seenPaths = new Set();

  let added = 0;
  let modified = 0;
  let reused = 0;

  for (const file of safeList) {
    const relPath = normalizeProjectPath(file?.relativePath || file?.path || file?.name || '');
    if (!relPath) continue;
    seenPaths.add(relPath);

    const rawContent = typeof file?.content === 'string'
      ? file.content
      : (typeof file?.textContent === 'string' ? file.textContent : (typeof file?.contentPreview === 'string' ? file.contentPreview : ''));
    const nextHash = hashFileContent(rawContent);
    const prev = prevEntries[relPath];

    if (prev && prev.contentHash === nextHash) {
      nextEntriesMap[relPath] = { ...prev };
      reused++;
    } else {
      nextEntriesMap[relPath] = analyzeSingleFile(file);
      if (prev) modified++;
      else added++;
    }
  }

  let removed = 0;
  for (const oldPath of Object.keys(prevEntries)) {
    if (!seenPaths.has(oldPath)) removed++;
  }

  const externalSkipped = Array.isArray(options?.skippedFiles)
    ? options.skippedFiles
    : (Array.isArray(nextFileList?.omissionReport)
      ? nextFileList.omissionReport
      : (previousIndex.coverage?.skippedFiles || []).filter(s => s.reason === 'ignored_directory' || s.reason === 'lockfile'));

  return finalizeDeepProjectIndex(nextEntriesMap, externalSkipped, {
    mode: 'incremental',
    added,
    modified,
    removed,
    reused
  });
}

/**
 * Context-Budget-Safe Query-Time Graph Retriever:
 * Scores indexed modules against the user's question, picks top-K matches,
 * and expands 1-hop cross-module neighbors (imports, importedBy, linked routes & DB schemas)
 * so the LLM receives exact deep code intelligence without overloading context!
 */
export function queryDeepProjectIndex(userQuery = '', deepIndex = null, options = {}) {
  if (!deepIndex || !deepIndex.fileEntries) return null;
  const topK = Number(options.topK || 6);
  const maxNeighbors = Number(options.maxNeighbors || 6);
  const qLower = String(userQuery || '').toLowerCase();
  const tokens = qLower
    .replace(/[^a-z0-9_./-\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !QUERY_STOPWORDS.has(t));

  const entries = Object.values(deepIndex.fileEntries);
  const scored = [];

  for (const e of entries) {
    const searchable = [
      e.path,
      e.name,
      e.folder,
      e.area,
      ...(e.exports || []),
      ...(e.externalPackages || []),
      ...(e.frontend?.components || []),
      ...(e.frontend?.childComponents || []),
      ...(e.frontend?.stateHooks || []),
      ...(e.frontend?.stateStores || []),
      ...(e.frontend?.clientRoutes || []),
      ...(e.backend?.routes || []).map(r => `${r.method} ${r.path}`),
      ...(e.backend?.middlewares || []),
      ...(e.backend?.services || []),
      ...(e.database?.accessedTables || []),
      ...(e.database?.schemas || []).map(s => `${s.name} ${(s.columns || []).join(' ')}`)
    ].join(' ').toLowerCase();

    let score = 0;
    if (qLower.includes(e.name.toLowerCase()) || qLower.includes(e.path.toLowerCase())) {
      score += 50;
    }
    for (const tok of tokens) {
      if (e.name.toLowerCase().includes(tok) || e.path.toLowerCase().includes(tok)) {
        score += 18;
      } else if (searchable.includes(tok)) {
        score += 10;
      } else {
        const words = searchable.split(/[^a-z0-9_]+/);
        if (words.some(w => w.length >= 4 && fuzzyTokenMatch(tok, w) >= 2)) {
          score += 5;
        }
      }
    }
    if (score > 0) scored.push({ entry: e, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const matched = scored.slice(0, topK).map(s => s.entry);

  // 1-hop cross-module neighbor expansion (both outgoing imports and incoming importedBy)
  const matchedSet = new Set(matched.map(m => m.path));
  const neighborPaths = [];
  for (const m of matched) {
    for (const nb of [...(m.resolvedImports || []), ...(m.importedBy || [])]) {
      if (!matchedSet.has(nb) && !neighborPaths.includes(nb) && deepIndex.fileEntries[nb]) {
        neighborPaths.push(nb);
      }
      if (neighborPaths.length >= maxNeighbors) break;
    }
    if (neighborPaths.length >= maxNeighbors) break;
  }
  const neighbors = neighborPaths.map(p => deepIndex.fileEntries[p]).filter(Boolean);

  // Build compact context-budget-safe dossier lines
  const formatEntryLine = (e) => {
    const parts = [`${e.path} [${e.area}, ${e.lineCount}L]`];
    if (e.frontend?.components?.length) parts.push(`components: ${e.frontend.components.slice(0, 5).join(', ')}`);
    if (e.frontend?.stateHooks?.length) parts.push(`state: ${e.frontend.stateHooks.slice(0, 4).join(', ')}`);
    if (e.frontend?.childComponents?.length) parts.push(`renders: ${e.frontend.childComponents.slice(0, 5).join(', ')}`);
    if (e.backend?.routes?.length) parts.push(`routes: ${e.backend.routes.slice(0, 5).map(r => `${r.method} ${r.path}`).join(', ')}`);
    if (e.backend?.middlewares?.length) parts.push(`middleware: ${e.backend.middlewares.slice(0, 4).join(', ')}`);
    if (e.backend?.services?.length) parts.push(`services: ${e.backend.services.slice(0, 5).join(', ')}`);
    if (e.database?.schemas?.length) parts.push(`schemas: ${e.database.schemas.map(s => `${s.name}(${s.columns.slice(0, 6).join(', ')})`).join('; ')}`);
    if (e.database?.accessedTables?.length) parts.push(`db: ${e.database.accessedTables.slice(0, 5).join(', ')} [${(e.database.operations || []).join('/')}]`);
    if (e.resolvedImports?.length) parts.push(`imports: ${e.resolvedImports.slice(0, 5).join(', ')}`);
    if (e.importedBy?.length) parts.push(`usedBy: ${e.importedBy.slice(0, 5).join(', ')}`);
    return parts.join(' | ');
  };

  const cov = deepIndex.coverage || {};
  const dossierLines = [
    `COVERAGE: ${cov.analyzedFilesCount || 0} analyzed files (${cov.coveragePercent ?? 100}% of analyzable source), ${cov.skippedFilesCount || 0} skipped assets/ignored, ${cov.inaccessibleFilesCount || 0} inaccessible. Areas: FE=${cov.areaCounts?.frontend || 0}, BE=${cov.areaCounts?.backend || 0}, DB=${cov.areaCounts?.database || 0}, Config=${cov.areaCounts?.config || 0}, Tests=${cov.areaCounts?.tests || 0}.`
  ];
  if (matched.length > 0) {
    dossierLines.push(`MATCHED_MODULES: ${matched.map(formatEntryLine).join(' || ')}`);
  }
  if (neighbors.length > 0) {
    dossierLines.push(`CONNECTED_NEIGHBORS (1-HOP): ${neighbors.map(formatEntryLine).join(' || ')}`);
  }

  return {
    matchedModules: matched,
    neighborModules: neighbors,
    dossierText: dossierLines.join('\n')
  };
}

/**
 * Deterministic Resolver for Deep Project Analysis Questions
 * (Coverage verification, Frontend Components/State/UI, Backend Middleware/Services,
 * Database Schemas/Relationships, Dependency Impact, Circular/Orphaned Modules, File Deep-Dives).
 */
export function resolveDeepProjectQuery(query = '', deepIndex = null, options = {}) {
  if (!query || !deepIndex || !deepIndex.fileEntries) return null;
  if (options?.isCustomerMode) return null;

  const lower = String(query || '').toLowerCase();
  const cov = deepIndex.coverage || {};
  const entries = Object.values(deepIndex.fileEntries);

  // 1. Coverage Verification & Omission Audit ("which files were analyzed", "did you miss any files", "coverage", "skipped files")
  if (/\b(coverage|which\s+files|what\s+files|all\s+files|file\s+list|folder\s+structure|project\s+structure|directory\s+structure|missed\s+(?:any\s+)?files|missing\s+files|skipped\s+files|inaccessible\s+files|unindexed|analysis\s+complete|verified\s+coverage)\b/i.test(lower)) {
    const folders = Object.entries(cov.folderTree || {}).map(([dir, info]) => `${dir} (${info.count})`).slice(0, 12);
    const skippedNote = (cov.skippedFilesCount || 0) > 0
      ? ` Skipped/ignored items (${cov.skippedFilesCount}): ${(cov.skippedFiles || []).slice(0, 6).map(s => `${s.path} [${s.reason}]`).join(', ')}${cov.skippedFilesCount > 6 ? `, and ${cov.skippedFilesCount - 6} more` : ''}.`
      : ' Zero files were skipped.';
    const inaccNote = (cov.inaccessibleFilesCount || 0) > 0
      ? ` Inaccessible/unreadable files (${cov.inaccessibleFilesCount}): ${(cov.inaccessibleFiles || []).map(x => x.path).join(', ')}.`
      : ' Zero files were inaccessible.';
    return {
      status: 'FOUND_IN_DEEP_PROJECT_INDEX',
      matchType: 'coverage_verification',
      summaryText: `Project analysis verified: ${cov.analyzedFilesCount} analyzable files indexed (${cov.coveragePercent}% source coverage) across ${Object.keys(cov.folderTree || {}).length} folders — Frontend: ${cov.areaCounts?.frontend || 0}, Backend: ${cov.areaCounts?.backend || 0}, Database: ${cov.areaCounts?.database || 0}, Config: ${cov.areaCounts?.config || 0}, Styles: ${cov.areaCounts?.styles || 0}, Tests: ${cov.areaCounts?.tests || 0}. Folders: ${folders.join(', ')}.${skippedNote}${inaccNote}`,
      data: cov
    };
  }

  // 2. Database Schemas, Columns, Foreign Keys & Relationships
  if (/\b(database\s+schema|db\s+schema|table\s+schema|foreign\s+keys?|table\s+relations?|relationships?\s+between\s+tables|data\s+models?|prisma\s+models?|mongoose\s+schemas?|which\s+files\s+(?:read|write|use|touch|query)\s+(?:the\s+)?(?:table|collection|database))\b/i.test(lower)) {
    const schemas = deepIndex.databaseSchemas || [];
    const rels = deepIndex.databaseRelationships || [];
    const tables = deepIndex.databaseTables || [];

    const schemaText = schemas.length > 0
      ? `Schemas (${schemas.length}): ${schemas.slice(0, 8).map(s => `${s.name} [${s.columns.slice(0, 6).join(', ')}] in ${s.file}`).join('; ')}.`
      : '';
    const relText = rels.length > 0
      ? ` Relationships (${rels.length}): ${rels.slice(0, 10).map(r => `${r.fromTable}.${r.fromColumn} -> ${r.toTable}.${r.toColumn} (${r.kind})`).join('; ')}.`
      : '';
    const touchText = tables.length > 0
      ? ` Table access map: ${tables.slice(0, 8).map(t => `${t.table} [${t.operations.join('/') || 'REF'} in ${t.files.slice(0, 3).join(', ')}]`).join('; ')}.`
      : '';

    if (schemaText || relText || touchText) {
      return {
        status: 'FOUND_IN_DEEP_PROJECT_INDEX',
        matchType: 'database_schema_and_relations',
        summaryText: `${schemaText}${relText}${touchText}`.trim(),
        data: { schemas, relationships: rels, tables }
      };
    }
  }

  // 3. Frontend Components, Layouts, State Management & UI Interactions
  if (/\b(frontend\s+components?|react\s+components?|list\s+(?:all\s+)?components?|component\s+tree|layouts?|state\s+management|hooks?|redux|zustand|context|user\s+interactions?|ui\s+events?)\b/i.test(lower)) {
    const comps = deepIndex.components || [];
    const layouts = comps.filter(c => c.isLayout).map(c => `${c.name} (${c.file})`);
    const hookSet = new Set();
    const storeSet = new Set();
    comps.forEach(c => {
      (c.stateHooks || []).forEach(h => hookSet.add(h));
      (c.stateStores || []).forEach(s => storeSet.add(s));
    });
    const compPreview = comps.slice(0, 10).map(c =>
      `${c.name} (${c.file}${c.children?.length ? ` -> renders ${c.children.slice(0, 4).join(', ')}` : ''})`
    ).join('; ');

    return {
      status: 'FOUND_IN_DEEP_PROJECT_INDEX',
      matchType: 'frontend_components_and_state',
      summaryText: `Found ${comps.length} frontend component(s): ${compPreview || 'HTML/JS UI modules'}.${layouts.length ? ` Layout components: ${layouts.join(', ')}.` : ''}${hookSet.size ? ` State/hooks used: ${Array.from(hookSet).join(', ')}.` : ''}${storeSet.size ? ` State slices/vars: ${Array.from(storeSet).slice(0, 10).join(', ')}.` : ''}`,
      data: { components: comps, layouts, hooks: Array.from(hookSet), stores: Array.from(storeSet) }
    };
  }

  // 4. Backend Middleware, Services, Controllers & Server Operations
  if (/\b(middleware|middlewares|controllers?|backend\s+services?|server[- ]side\s+operations?|business\s+logic)\b/i.test(lower)) {
    const mws = deepIndex.middlewares || [];
    const routes = deepIndex.backendRoutes || [];
    const backendFiles = entries.filter(e => e.backend);
    const allSvcs = backendFiles.flatMap(e => (e.backend.services || []).map(s => `${s} (${e.path})`)).slice(0, 12);
    const allOps = Array.from(new Set(backendFiles.flatMap(e => e.backend.serverOps || [])));

    return {
      status: 'FOUND_IN_DEEP_PROJECT_INDEX',
      matchType: 'backend_services_and_middleware',
      summaryText: `Backend analysis covers ${backendFiles.length} module(s) with ${routes.length} route(s).${mws.length ? ` Middleware: ${mws.slice(0, 10).join(', ')}.` : ''}${allSvcs.length ? ` Services/controllers: ${allSvcs.slice(0, 8).join(', ')}.` : ''}${allOps.length ? ` Server operations: ${allOps.join(', ')}.` : ''}`,
      data: { middlewares: mws, routes, services: allSvcs, serverOps: allOps }
    };
  }

  // 5. Dependency Impact, Reverse Importers, Circular Dependencies & Orphaned Modules
  if (/\b(depends?\s+on|imported\s+by|who\s+uses|what\s+uses|what\s+imports|dependency\s+graph|circular\s+dependenc|orphaned|unused\s+(?:files?|modules?)|unresolved\s+imports?|impact\s+of\s+changing)\b/i.test(lower)) {
    if (/\b(circular\s+dependenc|unresolved\s+imports?|orphaned|unused\s+(?:files?|modules?))\b/i.test(lower)) {
      const diag = deepIndex.diagnostics || {};
      const parts = [];
      parts.push(`Circular dependencies: ${(diag.circularDependencies || []).length > 0 ? diag.circularDependencies.map(c => c.cycle.join(' -> ')).join('; ') : 'None detected'}.`);
      parts.push(`Unresolved internal imports: ${(diag.unresolvedImports || []).length > 0 ? diag.unresolvedImports.slice(0, 6).map(u => `${u.fromFile} -> ${u.importSpec}`).join('; ') : 'None detected'}.`);
      const orphans = diag.orphanedModules || [];
      parts.push(`Unreferenced/orphaned modules (${orphans.length}): ${orphans.length > 0 ? `${orphans.slice(0, 8).join(', ')}${orphans.length > 8 ? `, and ${orphans.length - 8} more` : ''}` : 'None detected'}.`);
      return {
        status: 'FOUND_IN_DEEP_PROJECT_INDEX',
        matchType: 'dependency_health',
        summaryText: parts.join(' '),
        data: diag
      };
    }

    // Specific module impact lookup (e.g. "what depends on authMiddleware.js")
    const retrieved = queryDeepProjectIndex(query, deepIndex, { topK: 3, maxNeighbors: 8 });
    const target = retrieved?.matchedModules?.[0];
    if (target) {
      const impBy = target.importedBy || [];
      const imps = target.resolvedImports || [];
      return {
        status: 'FOUND_IN_DEEP_PROJECT_INDEX',
        matchType: 'module_dependency_impact',
        summaryText: `Module ${target.path} [${target.area}] imports ${imps.length} internal file(s) (${imps.length ? imps.join(', ') : 'none'}) and is imported/used by ${impBy.length} file(s) (${impBy.length ? impBy.join(', ') : 'none'}).${target.exports?.length ? ` Exports: ${target.exports.slice(0, 10).join(', ')}.` : ''}`,
        data: { target, imports: imps, importedBy: impBy }
      };
    }
  }

  // 6. Specific File / Module Deep-Dive (when user names an exact file or component in the project)
  const directMatch = entries.find(e => {
    const nLow = e.name.toLowerCase();
    const pLow = e.path.toLowerCase();
    const stem = nLow.replace(/\.[a-z0-9]+$/, '');
    return lower.includes(pLow) || lower.includes(nLow) || (stem.length >= 5 && new RegExp(`\\b${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower));
  });
  if (directMatch && /\b(explain|what\s+is\s+in|inspect|analyze|summary\s+of|details\s+of|how\s+does|connects?\s+to|inside)\b/i.test(lower)) {
    const details = [`${directMatch.path} is a ${directMatch.area} module (${directMatch.lineCount} lines).`];
    if (directMatch.exports?.length) details.push(`Exports: ${directMatch.exports.slice(0, 10).join(', ')}.`);
    if (directMatch.frontend?.components?.length) details.push(`Components: ${directMatch.frontend.components.join(', ')}${directMatch.frontend.childComponents?.length ? ` (renders ${directMatch.frontend.childComponents.slice(0, 6).join(', ')})` : ''}.`);
    if (directMatch.frontend?.stateHooks?.length) details.push(`State/hooks: ${directMatch.frontend.stateHooks.join(', ')}.`);
    if (directMatch.backend?.routes?.length) details.push(`Routes: ${directMatch.backend.routes.map(r => `${r.method} ${r.path}`).join(', ')}.`);
    if (directMatch.backend?.middlewares?.length) details.push(`Middleware: ${directMatch.backend.middlewares.join(', ')}.`);
    if (directMatch.database?.accessedTables?.length) details.push(`Database tables/collections: ${directMatch.database.accessedTables.join(', ')} (${(directMatch.database.operations || []).join('/') || 'referenced'}).`);
    if (directMatch.resolvedImports?.length) details.push(`Imports: ${directMatch.resolvedImports.join(', ')}.`);
    if (directMatch.importedBy?.length) details.push(`Used by: ${directMatch.importedBy.join(', ')}.`);

    return {
      status: 'FOUND_IN_DEEP_PROJECT_INDEX',
      matchType: 'module_deep_dive',
      summaryText: details.join(' '),
      data: directMatch
    };
  }

  return null;
}

/**
 * Produces a Firestore-safe compact clone of the Deep Project Index
 * (keeps full file coverage, graph edges, symbols, components, routes, DB schemas & relationships
 * without raw source code blobs so Firestore docs stay well under limits).
 */
export function compactDeepProjectIndexForStorage(deepIndex) {
  if (!deepIndex || !deepIndex.fileEntries) return null;
  const compactEntries = {};
  for (const [p, e] of Object.entries(deepIndex.fileEntries)) {
    compactEntries[p] = {
      path: e.path,
      name: e.name,
      folder: e.folder,
      area: e.area,
      contentHash: e.contentHash,
      lineCount: e.lineCount,
      status: e.status,
      reason: e.reason || null,
      internalImports: (e.internalImports || []).slice(0, 50),
      resolvedImports: (e.resolvedImports || []).slice(0, 50),
      importedBy: (e.importedBy || []).slice(0, 120),
      externalPackages: (e.externalPackages || []).slice(0, 30),
      exports: (e.exports || []).slice(0, 40),
      frontend: e.frontend ? {
        components: (e.frontend.components || []).slice(0, 10),
        childComponents: (e.frontend.childComponents || []).slice(0, 12),
        isLayout: Boolean(e.frontend.isLayout),
        stateHooks: (e.frontend.stateHooks || []).slice(0, 8),
        stateStores: (e.frontend.stateStores || []).slice(0, 10),
        uiInteractions: (e.frontend.uiInteractions || []).slice(0, 10),
        clientRoutes: (e.frontend.clientRoutes || []).slice(0, 8),
        apiCalls: (e.frontend.apiCalls || []).slice(0, 12)
      } : null,
      backend: e.backend ? {
        routes: (e.backend.routes || []).slice(0, 15),
        middlewares: (e.backend.middlewares || []).slice(0, 12),
        services: (e.backend.services || []).slice(0, 15),
        serverOps: (e.backend.serverOps || []).slice(0, 8)
      } : null,
      database: e.database ? {
        schemas: (e.database.schemas || []).slice(0, 10),
        relationships: (e.database.relationships || []).slice(0, 15),
        accessedTables: (e.database.accessedTables || []).slice(0, 12),
        operations: (e.database.operations || []).slice(0, 4)
      } : null,
      config: e.config ? {
        frameworks: (e.config.frameworks || []).slice(0, 10),
        dependencies: (e.config.dependencies || []).slice(0, 40),
        documentedEnvVars: (e.config.documentedEnvVars || []).slice(0, 20),
        referencedEnvVars: (e.config.referencedEnvVars || []).slice(0, 20)
      } : null
    };
  }

  return {
    version: deepIndex.version || 1,
    summary: deepIndex.summary || '',
    coverage: deepIndex.coverage || {},
    frameworks: deepIndex.frameworks || [],
    dependencies: (deepIndex.dependencies || []).slice(0, 80),
    externalPackages: (deepIndex.externalPackages || []).slice(0, 80),
    components: (deepIndex.components || []).slice(0, 120),
    backendRoutes: (deepIndex.backendRoutes || []).slice(0, 120),
    middlewares: (deepIndex.middlewares || []).slice(0, 60),
    databaseSchemas: (deepIndex.databaseSchemas || []).slice(0, 60),
    databaseRelationships: (deepIndex.databaseRelationships || []).slice(0, 80),
    databaseTables: (deepIndex.databaseTables || []).slice(0, 80),
    crossModuleChains: (deepIndex.crossModuleChains || []).slice(0, 80),
    diagnostics: deepIndex.diagnostics || {},
    fileEntries: compactEntries
  };
}
