/**
 * Universal Whole-Website & Frontend Data Intelligence Extractor
 * Extracts KPI cards, summary statistics, charts/graphs (Chart.js, Recharts, inline datasets),
 * analytical report tables, and cross-page knowledge from uploaded frontend files AND live DOM snapshots.
 * Zero external dependencies — works universally across all website types.
 */

import { fuzzyTokenMatch, stemWord, NLU_STOPWORDS } from './fuzzyNlu.js';
import { parseNumericPrice, formatCurrencyAmount } from './dataAnalyticsEngine.js';

function stripHtml(html = '') {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanizePageName(fileName = '') {
  const base = String(fileName || '').split(/[\\/]/).pop() || 'Home';
  if (/^index\.html?$/i.test(base)) return 'Home';
  return base
    .replace(/\.(html?|jsx|tsx|vue|svelte|js|ts)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase()) || 'Home';
}

function isFrontendLikeFile(file) {
  const name = String(file?.name || file?.relativePath || '').toLowerCase();
  const content = String(file?.content || '');
  if (/\.(html?|jsx|tsx|vue|svelte)$/i.test(name)) return true;
  if (/\.(js|ts)$/i.test(name) && /(new\s+Chart\s*\(|chartData|datasets\s*:|labels\s*:|<BarChart|<LineChart|<PieChart|<AreaChart|stat-card|kpi-card|dashboard|report)/i.test(content)) {
    return true;
  }
  return /<!doctype html>|<html|<section|<table|<canvas|<svg/i.test(content);
}

/**
 * Compute summary analytics (min, max, total, average, trend) for a labeled numeric series.
 */
export function summarizeChartSeries(title, labels = [], values = [], unit = '') {
  const cleanPoints = [];
  const len = Math.min(labels.length, values.length);
  for (let i = 0; i < len; i++) {
    const num = Number(values[i]);
    if (isFinite(num)) {
      cleanPoints.push({ label: String(labels[i]).trim(), value: num });
    }
  }
  if (cleanPoints.length === 0) return null;

  let minPt = cleanPoints[0];
  let maxPt = cleanPoints[0];
  let total = 0;
  for (const pt of cleanPoints) {
    total += pt.value;
    if (pt.value < minPt.value) minPt = pt;
    if (pt.value > maxPt.value) maxPt = pt;
  }
  const avg = Math.round((total / cleanPoints.length) * 100) / 100;
  let trend = 'steady';
  if (cleanPoints.length >= 2) {
    const first = cleanPoints[0].value;
    const last = cleanPoints[cleanPoints.length - 1].value;
    if (last > first * 1.03) trend = 'increasing';
    else if (last < first * 0.97) trend = 'decreasing';
  }

  const fmtVal = (v) => {
    if (unit === '₹' || unit === '$' || unit === '€' || unit === '£') return formatCurrencyAmount(v, unit);
    if (unit === '%') return `${v}%`;
    return unit ? `${v.toLocaleString('en-US')} ${unit}` : v.toLocaleString('en-US');
  };

  const pointsPreview = cleanPoints.slice(0, 8).map(p => `${p.label}: ${fmtVal(p.value)}`).join(', ');
  const summary = `${title} shows ${cleanPoints.length} data points (${pointsPreview}). The highest is ${maxPt.label} at ${fmtVal(maxPt.value)}, the lowest is ${minPt.label} at ${fmtVal(minPt.value)}, and the overall trend is ${trend}.`;

  return {
    title,
    points: cleanPoints.slice(0, 20),
    min: minPt,
    max: maxPt,
    total: Math.round(total * 100) / 100,
    average: avg,
    trend,
    unit,
    summary
  };
}

/**
 * Extract KPI cards, summary metrics & progress indicators from uploaded HTML/JSX/Vue source code.
 */
export function extractFrontendMetricsFromSource(content = '', pageLabel = 'Home', pagePath = '/') {
  const metrics = [];
  const seen = new Set();
  const safeHtml = String(content || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  const addMetric = (rawLabel, rawValue, rawDelta = '') => {
    const label = stripHtml(rawLabel).replace(/[:\-–—]+$/, '').trim();
    const value = stripHtml(rawValue).trim();
    const delta = stripHtml(rawDelta).trim();
    if (!label || !value || label.length < 2 || label.length > 65 || value.length > 50) return;
    if (!/\d/.test(value)) return;
    // Reject CSS/code noise or generic dates/copyright years
    if (/^(?:copyright|©|20\d\d|19\d\d|step\s*\d+|page\s*\d+|px|rem|em|rgb|rgba|#)/i.test(value)) return;
    if (/[{}();=]|const\s+|let\s+|var\s+|function\s*\(|className/i.test(`${label} ${value}`)) return;
    const key = `${label.toLowerCase()}::${pagePath}`;
    if (seen.has(key)) return;
    seen.add(key);
    metrics.push({
      label,
      value,
      delta: delta && delta.length <= 40 ? delta : '',
      pageLabel,
      pagePath
    });
  };

  // 1. Explicit data attributes: data-kpi / data-metric / data-stat
  const dataAttrRegex = /data-(?:kpi|metric|stat|summary-label)=["']([^"']+)["'][^>]*data-(?:value|metric-value|stat-value)=["']([^"']+)["']/gi;
  let m;
  while ((m = dataAttrRegex.exec(safeHtml)) !== null) {
    addMetric(m[1], m[2]);
  }

  // 2. Semantic KPI / Stat / Metric / Summary / Counter cards
  const cardRegex = /<(?:div|article|section|li)\b[^>]*class=["'][^"']*(?:kpi|stat|metric|summary|counter|analytics|highlight|dashboard-card|overview-card|score-card|report-card)[^"']*["'][^>]*>([\s\S]{8,700}?)<\/(?:div|article|section|li)>/gi;
  while ((m = cardRegex.exec(safeHtml)) !== null) {
    const inner = m[1];
    // Extract compact text fragments inside the card
    const fragments = Array.from(inner.matchAll(/<(?:span|p|div|h[1-6]|strong|b|small|label|dt|dd)[^>]*>([^<]{1,80})<\/(?:span|p|div|h[1-6]|strong|b|small|label|dt|dd)>/gi))
      .map(x => stripHtml(x[1]))
      .filter(Boolean);
    if (fragments.length >= 2) {
      const valueIdx = fragments.findIndex(f => /^(?:₹|\$|€|£|rs\.?\s*)?\d[\d,.]*\s*(?:%|k|m|b|l|cr|lakh|lakhs|crore|\+|\/[a-z]+|hrs?|days?|mins?|users?|students?|orders?)?$/i.test(f));
      if (valueIdx >= 0) {
        const val = fragments[valueIdx];
        const lbl = fragments.find((f, idx) => idx !== valueIdx && /[a-zA-Z]{2,}/.test(f) && !/^[+\-▲▼]\s*\d/.test(f));
        const delta = fragments.find((f, idx) => idx !== valueIdx && f !== lbl && /(?:[+\-▲▼]\s*\d|%|\bvs\b|\bup\b|\bdown\b)/i.test(f)) || '';
        if (lbl) addMetric(lbl, val, delta);
      }
    }
  }

  // 3. Progress bars (<progress> or role="progressbar" with aria-label & aria-valuenow)
  const progRegex = /<[^>]+(?:role=["']progressbar["']|<progress)[^>]*aria-label=["']([^"']+)["'][^>]*aria-valuenow=["']([^"']+)["'][^>]*(?:aria-valuemax=["']([^"']+)["'])?/gi;
  while ((m = progRegex.exec(safeHtml)) !== null) {
    const maxVal = m[3] ? `/${m[3]}` : '%';
    addMetric(m[1], `${m[2]}${maxVal === '/100' ? '%' : maxVal}`);
  }

  return metrics.slice(0, 30);
}

/**
 * Extract Chart.js, Recharts, inline JS chart arrays & labeled chart figures from uploaded frontend files.
 */
export function extractFrontendChartsFromSource(content = '', pageLabel = 'Home', pagePath = '/') {
  const charts = [];
  const seenTitles = new Set();
  const src = String(content || '');

  const pushChart = (series) => {
    if (!series || !series.title) return;
    const key = `${series.title.toLowerCase()}::${pagePath}`;
    if (seenTitles.has(key)) return;
    seenTitles.add(key);
    charts.push({ ...series, pageLabel, pagePath });
  };

  // 1. Chart.js style configs: labels: ['Jan', 'Feb', ...], datasets: [{ label: 'Revenue', data: [10, 20, ...] }]
  const chartJsRegex = /labels\s*:\s*\[([^\]]{3,400})\][\s\S]{0,350}?datasets\s*:\s*\[\s*\{[\s\S]{0,250}?(?:label\s*:\s*['"`]([^'"`]+)['"`][\s\S]{0,120}?)?data\s*:\s*\[([^\]]{3,400})\]/gi;
  let m;
  while ((m = chartJsRegex.exec(src)) !== null) {
    const labels = m[1].split(',').map(s => s.replace(/['"`\s]/g, '').trim()).filter(Boolean);
    const labelName = (m[2] || '').trim() || `${pageLabel} Chart`;
    const values = m[3].split(',').map(s => parseFloat(s.replace(/[^0-9.-]/g, ''))).filter(n => isFinite(n));
    const unit = /₹|rs\.?|inr/i.test(labelName) ? '₹' : (/\$|usd/i.test(labelName) ? '$' : (/%|rate|percent/i.test(labelName) ? '%' : ''));
    const series = summarizeChartSeries(labelName, labels, values, unit);
    if (series) pushChart(series);
  }

  // 2. Recharts / React / Vue inline object arrays: const monthlyRevenueData = [{ month: 'Jan', revenue: 12000 }, ...]
  const objArrayRegex = /(?:const|let|var|export\s+const)\s+([a-zA-Z0-9_]*(?:chart|graph|sales|revenue|growth|trend|stats|metrics|performance|analytics|report|monthly|weekly|yearly|enrollment|attendance)[a-zA-Z0-9_]*)\s*=\s*\[([\s\S]{15,2500}?)\];/gi;
  while ((m = objArrayRegex.exec(src)) !== null) {
    const varName = m[1].replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
    const arrBody = m[2];
    const objMatches = Array.from(arrBody.matchAll(/\{([^{}]{5,300})\}/g));
    if (objMatches.length < 2) continue;

    const parsedRows = [];
    for (const om of objMatches.slice(0, 20)) {
      const pairs = {};
      const kvRe = /['"`]?([a-zA-Z0-9_]+)['"`]?\s*:\s*(?:['"`]([^'"`]+)['"`]|(-?\d+(?:\.\d+)?))/g;
      let kv;
      while ((kv = kvRe.exec(om[1])) !== null) {
        pairs[kv[1]] = kv[2] !== undefined ? kv[2] : parseFloat(kv[3]);
      }
      if (Object.keys(pairs).length >= 2) parsedRows.push(pairs);
    }

    if (parsedRows.length >= 2) {
      const sampleKeys = Object.keys(parsedRows[0]);
      const labelKey = sampleKeys.find(k => typeof parsedRows[0][k] === 'string') || sampleKeys[0];
      const numKeys = sampleKeys.filter(k => k !== labelKey && typeof parsedRows[0][k] === 'number');
      for (const nk of numKeys.slice(0, 2)) {
        const labels = parsedRows.map(r => String(r[labelKey] || ''));
        const values = parsedRows.map(r => Number(r[nk]));
        const metricTitle = `${varName} (${nk.replace(/([a-z])([A-Z])/g, '$1 $2')})`;
        const unit = /percent|rate|pct/i.test(nk) ? '%' : '';
        const series = summarizeChartSeries(metricTitle, labels, values, unit);
        if (series) pushChart(series);
      }
    }
  }

  // 3. Semantic <figure> / chart containers with <figcaption> or aria-label descriptions
  const figRegex = /<figure[^>]*>([\s\S]{15,1500}?)<\/figure>/gi;
  while ((m = figRegex.exec(src)) !== null) {
    const figCap = m[1].match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i);
    const svgAria = m[1].match(/<(?:svg|canvas)[^>]*aria-label=["']([^"']+)["']/i);
    const caption = figCap ? stripHtml(figCap[1]) : (svgAria ? stripHtml(svgAria[1]) : '');
    if (caption && caption.length >= 10 && /chart|graph|trend|report|revenue|sales|growth|performance|distribution|percentage|rate|\d/i.test(caption)) {
      pushChart({
        title: caption.slice(0, 70),
        points: [],
        min: null,
        max: null,
        total: null,
        average: null,
        trend: 'reported',
        unit: '',
        summary: caption
      });
    }
  }

  return charts.slice(0, 12);
}

/**
 * Extract analytical / report HTML tables (sales, regional breakdown, exam results, schedules, summaries).
 */
export function extractReportTablesFromSource(content = '', pageLabel = 'Home', pagePath = '/') {
  const tables = [];
  const safeHtml = String(content || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');

  const tableRegex = /(?:<h[1-4][^>]*>([\s\S]{2,90}?)<\/h[1-4]>[\s\S]{0,160}?)?<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let m;
  let idx = 0;
  while ((m = tableRegex.exec(safeHtml)) !== null) {
    idx++;
    const captionMatch = m[2].match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
    const title = (captionMatch ? stripHtml(captionMatch[1]) : '') || (m[1] ? stripHtml(m[1]) : '') || `${pageLabel} Table ${idx}`;
    const headers = Array.from(m[2].matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)).map(x => stripHtml(x[1])).filter(Boolean);
    const rows = [];
    const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(m[2])) !== null) {
      if (/<th\b/i.test(rm[1]) && !/<td\b/i.test(rm[1])) continue;
      const cells = Array.from(rm[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)).map(x => stripHtml(x[1]));
      if (cells.length >= 2) rows.push(cells);
    }

    if (rows.length >= 2 && (headers.length >= 2 || rows[0].length >= 2)) {
      const effectiveHeaders = headers.length >= 2 ? headers : rows[0].map((_, i) => `Column ${i + 1}`);
      const structuredRows = rows.slice(0, 20).map(r => {
        const obj = {};
        effectiveHeaders.forEach((h, i) => {
          obj[h] = r[i] !== undefined ? r[i] : '';
        });
        return obj;
      });
      const preview = rows.slice(0, 4).map(r => `${r[0]}: ${r.slice(1, 3).join(', ')}`).join('; ');
      tables.push({
        title,
        headers: effectiveHeaders.slice(0, 8),
        rowCount: rows.length,
        rows: structuredRows,
        pageLabel,
        pagePath,
        summary: `${title} (${rows.length} rows — columns: ${effectiveHeaders.slice(0, 5).join(', ')}): ${preview}.`
      });
    }
  }
  return tables.slice(0, 10);
}

/**
 * Build a unified Cross-Page Frontend Knowledge Graph across ALL uploaded frontend files/components.
 */
export function buildCrossPageFrontendIndex(fileList = [], routes = []) {
  const frontendFiles = (Array.isArray(fileList) ? fileList : []).filter(isFrontendLikeFile);
  const pages = [];
  const allMetrics = [];
  const allCharts = [];
  const allTables = [];
  const faqs = [];

  for (const file of frontendFiles) {
    const fName = String(file.name || file.relativePath || '').split(/[\\/]/).pop() || 'index.html';
    const content = String(file.content || '');
    const titleMatch = content.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const h1Match = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const pageLabel = stripHtml(h1Match?.[1] || '') || stripHtml(titleMatch?.[1] || '').split(/[|–—-]/)[0].trim() || humanizePageName(fName);

    let pagePath = '/';
    if (/\.html?$/i.test(fName)) {
      pagePath = fName.toLowerCase() === 'index.html' ? '/' : `/${fName}`;
    } else {
      const slug = fName.replace(/\.(jsx|tsx|vue|svelte|js|ts)$/i, '').replace(/page$/i, '').toLowerCase();
      const matchedRoute = (routes || []).find(r => {
        const rp = String(r.path || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return rp === slug || String(r.label || '').toLowerCase().includes(slug);
      });
      pagePath = matchedRoute?.path || (slug && slug !== 'app' && slug !== 'index' ? `/${slug}` : '/');
    }

    const metrics = extractFrontendMetricsFromSource(content, pageLabel, pagePath);
    const charts = extractFrontendChartsFromSource(content, pageLabel, pagePath);
    const reportTables = extractReportTablesFromSource(content, pageLabel, pagePath);

    // Extract clean headings & top visible paragraph summaries for this page
    const safeHtml = content.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
    const headings = Array.from(safeHtml.matchAll(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi))
      .map(m => stripHtml(m[1]))
      .filter(h => h.length >= 3 && h.length <= 80)
      .slice(0, 6);
    const topParas = Array.from(safeHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
      .map(m => stripHtml(m[1]))
      .filter(p => p.length >= 25 && p.length <= 260 && !/[{}();]|const\s+|function\s*\(/i.test(p))
      .slice(0, 3);

    const summaryParts = [];
    if (topParas[0]) summaryParts.push(topParas[0]);
    if (metrics.length > 0) summaryParts.push(`Displayed stats: ${metrics.slice(0, 5).map(mt => `${mt.label} is ${mt.value}${mt.delta ? ` (${mt.delta})` : ''}`).join(', ')}.`);
    if (charts.length > 0) summaryParts.push(`Charts: ${charts.slice(0, 3).map(c => c.title).join(', ')}.`);
    if (reportTables.length > 0) summaryParts.push(`Tables: ${reportTables.slice(0, 2).map(t => t.title).join(', ')}.`);

    pages.push({
      fileName: fName,
      pagePath,
      pageLabel,
      headings,
      summary: summaryParts.join(' ').trim() || `${pageLabel} page with sections: ${headings.join(', ') || 'Main content'}.`,
      metricsCount: metrics.length,
      chartsCount: charts.length,
      tablesCount: reportTables.length
    });

    allMetrics.push(...metrics);
    allCharts.push(...charts);
    allTables.push(...reportTables);

    // Generate clean customer-facing FAQs from extracted metrics & charts
    if (metrics.length > 0) {
      faqs.push({
        q: `What are the key statistics on ${pageLabel}?`,
        a: `On ${pageLabel}, the key displayed metrics are: ${metrics.slice(0, 6).map(mt => `${mt.label}: ${mt.value}${mt.delta ? ` (${mt.delta})` : ''}`).join(', ')}.`
      });
    }
    for (const ch of charts.slice(0, 3)) {
      if (ch.summary) {
        faqs.push({
          q: `What does ${ch.title} show?`,
          a: ch.summary
        });
      }
    }
  }

  return {
    pages: pages.slice(0, 20),
    metrics: allMetrics.slice(0, 40),
    charts: allCharts.slice(0, 15),
    reportTables: allTables.slice(0, 12),
    faqs: faqs.slice(0, 25),
    summary: `Analyzed ${pages.length} frontend page(s): ${allMetrics.length} displayed KPIs/stats, ${allCharts.length} charts/graphs, and ${allTables.length} report tables.`
  };
}

/**
 * Deterministic Frontend + Cross-Page Query Resolver.
 * Answers questions about displayed KPIs, statistics, charts, graphs, report tables, page summaries,
 * and cross-page insights — preventing false ITEM_NOT_FOUND errors when data is on the frontend rather than the DB!
 */
export function resolveFrontendDataQuery(query, liveSnapshot = null, crossPageIndex = null, queryLang = 'en-US') {
  const rawQ = String(query || '').trim();
  const lower = rawQ.toLowerCase();
  if (!lower) return null;

  const tokenize = (s) => String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !NLU_STOPWORDS.has(w));

  const queryToks = tokenize(lower);
  const genericUiWords = new Set(['what', 'which', 'show', 'tell', 'give', 'check', 'display', 'displayed', 'shown', 'current', 'page', 'website', 'site', 'frontend', 'screen', 'dashboard', 'summary', 'summarize', 'overview', 'report', 'reports', 'chart', 'charts', 'graph', 'graphs', 'table', 'tables', 'stat', 'stats', 'statistics', 'metric', 'metrics', 'data', 'value', 'number', 'total', 'count', 'much', 'many', 'how', 'does', 'say', 'about']);
  const distinctiveToks = queryToks.filter(t => !genericUiWords.has(t) && !genericUiWords.has(stemWord(t)));

  // Merge Live Snapshot (highest priority — fresh dynamic data!) + Cross-Page Index (other pages!)
  const liveMetrics = Array.isArray(liveSnapshot?.metrics) ? liveSnapshot.metrics : [];
  const crossMetrics = Array.isArray(crossPageIndex?.metrics) ? crossPageIndex.metrics : [];
  const mergedMetrics = [];
  const seenM = new Set();
  for (const mt of [...liveMetrics, ...crossMetrics]) {
    if (!mt || !mt.label || !mt.value) continue;
    const k = `${mt.label.toLowerCase()}::${mt.pagePath || '/'}`;
    if (seenM.has(k)) continue;
    seenM.add(k);
    mergedMetrics.push(mt);
  }

  const liveCharts = Array.isArray(liveSnapshot?.charts) ? liveSnapshot.charts : [];
  const crossCharts = Array.isArray(crossPageIndex?.charts) ? crossPageIndex.charts : [];
  const mergedCharts = [];
  const seenC = new Set();
  for (const ch of [...liveCharts, ...crossCharts]) {
    if (!ch || !ch.title) continue;
    const k = `${ch.title.toLowerCase()}::${ch.pagePath || '/'}`;
    if (seenC.has(k)) continue;
    seenC.add(k);
    mergedCharts.push(ch);
  }

  const liveTables = Array.isArray(liveSnapshot?.reportTables) ? liveSnapshot.reportTables : [];
  const crossTables = Array.isArray(crossPageIndex?.reportTables) ? crossPageIndex.reportTables : [];
  const mergedTables = [];
  const seenT = new Set();
  for (const tb of [...liveTables, ...crossTables]) {
    if (!tb || !tb.title) continue;
    const k = `${tb.title.toLowerCase()}::${tb.pagePath || '/'}`;
    if (seenT.has(k)) continue;
    seenT.add(k);
    mergedTables.push(tb);
  }

  const allPages = [];
  if (liveSnapshot && liveSnapshot.pageLabel) {
    allPages.push({
      pageLabel: liveSnapshot.pageLabel,
      pagePath: liveSnapshot.pagePath || '/',
      summary: liveSnapshot.summary || '',
      isLiveCurrent: true
    });
  }
  for (const p of (Array.isArray(crossPageIndex?.pages) ? crossPageIndex.pages : [])) {
    if (p && !allPages.some(x => x.pagePath === p.pagePath)) {
      allPages.push({ ...p, isLiveCurrent: false });
    }
  }

  const hasAnyFrontendData = mergedMetrics.length > 0 || mergedCharts.length > 0 || mergedTables.length > 0 || allPages.length > 0;
  if (!hasAnyFrontendData) return null;

  const scoreMatch = (targetText, tokens) => {
    const tToks = tokenize(targetText);
    if (tToks.length === 0 || tokens.length === 0) return { score: 0, matched: 0 };
    let score = 0;
    let matched = 0;
    for (const qt of tokens) {
      let best = 0;
      for (const tt of tToks) {
        const m = fuzzyTokenMatch(qt, tt);
        if (m > best) best = m;
      }
      if (best >= 3) { score += 16; matched++; }
      else if (best === 2) { score += 10; matched++; }
    }
    return { score, matched };
  };

  // 1. Explicit Chart / Graph Query ("what does the sales chart show?", "highest month in the graph", "is revenue trending up?")
  const isChartQuery = /\b(chart|charts|graph|graphs|plot|trend|trending|visualization|bar\s*chart|line\s*chart|pie\s*chart)\b/i.test(lower) || /(चार्ट|ग्राफ|आलेख|ट्रेंड)/i.test(rawQ);
  if (isChartQuery && mergedCharts.length > 0) {
    let bestChart = mergedCharts[0];
    let bestScore = -1;
    if (distinctiveToks.length > 0) {
      for (const ch of mergedCharts) {
        const s = scoreMatch(`${ch.title} ${ch.summary || ''} ${(ch.points || []).map(p => p.label).join(' ')}`, distinctiveToks).score;
        if (s > bestScore) { bestScore = s; bestChart = ch; }
      }
    }

    const wantsHighest = /\b(highest|maximum|max|peak|top|best)\b/i.test(lower);
    const wantsLowest = /\b(lowest|minimum|min|worst|bottom)\b/i.test(lower);
    const wantsTrend = /\b(trend|trending|increasing|decreasing|growing|going\s+up|going\s+down|direction)\b/i.test(lower);

    let reply = bestChart.summary;
    const fmt = (v, unit) => {
      if (unit === '₹' || unit === '$' || unit === '€' || unit === '£') return formatCurrencyAmount(v, unit);
      if (unit === '%') return `${v}%`;
      return unit ? `${v.toLocaleString('en-US')} ${unit}` : v.toLocaleString('en-US');
    };

    if (wantsHighest && bestChart.max) {
      reply = `In ${bestChart.title}, the highest point is ${bestChart.max.label} at ${fmt(bestChart.max.value, bestChart.unit)} (overall trend is ${bestChart.trend}).`;
    } else if (wantsLowest && bestChart.min) {
      reply = `In ${bestChart.title}, the lowest point is ${bestChart.min.label} at ${fmt(bestChart.min.value, bestChart.unit)} (overall trend is ${bestChart.trend}).`;
    } else if (wantsTrend && bestChart.points && bestChart.points.length >= 2) {
      const first = bestChart.points[0];
      const last = bestChart.points[bestChart.points.length - 1];
      reply = `${bestChart.title} is ${bestChart.trend}, moving from ${first.label} (${fmt(first.value, bestChart.unit)}) to ${last.label} (${fmt(last.value, bestChart.unit)}), with a peak at ${bestChart.max.label} (${fmt(bestChart.max.value, bestChart.unit)}).`;
    }

    return {
      status: 'FOUND_IN_FRONTEND',
      matchType: 'chart',
      summaryText: reply,
      matchedMetrics: [],
      matchedCharts: [bestChart],
      matchedTables: [],
      pageRefs: [bestChart.pageLabel || 'Current Page']
    };
  }

  // 2. Check Specific Report Table Row FIRST when query explicitly asks about a report/table/region OR matches a specific row strongly
  const isReportTableQuery = /\b(report|table|breakdown|regional|region|quarterly|monthly|results?|attendance|summary\s+table)\b/i.test(lower);
  let bestRowHit = null;
  let bestRowScore = 0;
  if (mergedTables.length > 0 && distinctiveToks.length > 0) {
    for (const tb of mergedTables) {
      const titleRes = scoreMatch(`${tb.title} ${(tb.headers || []).join(' ')}`, distinctiveToks);
      for (const row of (tb.rows || [])) {
        const rowText = Object.entries(row).map(([k, v]) => `${k} ${v}`).join(' ');
        const rowRes = scoreMatch(rowText, distinctiveToks);
        const totalSc = rowRes.score * 1.5 + titleRes.score * 0.6;
        if (rowRes.matched >= 1 && totalSc > bestRowScore) {
          bestRowScore = totalSc;
          bestRowHit = { table: tb, row, matched: rowRes.matched };
        }
      }
    }
  }
  if (bestRowHit && ((isReportTableQuery && bestRowScore >= 16) || (bestRowHit.matched >= 2 && bestRowScore >= 32))) {
    const rowDesc = Object.entries(bestRowHit.row).map(([k, v]) => `${k}: ${v}`).join(', ');
    const pageNote = bestRowHit.table.pageLabel ? ` from ${bestRowHit.table.title} (${bestRowHit.table.pageLabel})` : ` from ${bestRowHit.table.title}`;
    return {
      status: 'FOUND_IN_FRONTEND',
      matchType: 'report_table_row',
      summaryText: `Here is the matching record${pageNote}: ${rowDesc}. Let me know if you would like to see the full table summary!`,
      matchedMetrics: [],
      matchedCharts: [],
      matchedTables: [bestRowHit.table],
      pageRefs: [bestRowHit.table.pageLabel || 'Current Page']
    };
  }

  // 3. Specific KPI / Statistic Lookup ("what is the total revenue?", "pass percentage", "conversion rate", "active students")
  if (mergedMetrics.length > 0 && queryToks.length > 0) {
    const scoredMetrics = mergedMetrics.map(mt => {
      const labelLower = mt.label.toLowerCase();
      let bonus = 0;
      if (lower.includes(labelLower) && labelLower.length >= 4) bonus += 40;
      const distRes = distinctiveToks.length > 0 ? scoreMatch(mt.label, distinctiveToks) : { score: 0, matched: 0 };
      const allRes = scoreMatch(mt.label, queryToks);
      const coverage = distinctiveToks.length > 0 ? distRes.matched / distinctiveToks.length : 0;
      return {
        mt,
        score: bonus + distRes.score * 1.5 + allRes.score * 0.5,
        distMatched: distRes.matched,
        coverage
      };
    }).sort((a, b) => b.score - a.score);

    const topM = scoredMetrics[0];
    if (topM && (topM.score >= 30 || (topM.distMatched >= 1 && topM.coverage >= 0.5 && topM.score >= 22))) {
      const strongMatches = scoredMetrics.filter(x => x.score >= Math.max(22, topM.score * 0.7)).slice(0, 3);
      const details = strongMatches.map(x => {
        const pageNote = x.mt.pageLabel && x.mt.pagePath !== (liveSnapshot?.pagePath || '/') ? ` (on ${x.mt.pageLabel})` : '';
        return `${x.mt.label} is ${x.mt.value}${x.mt.delta ? ` (${x.mt.delta})` : ''}${pageNote}`;
      });
      const filterNote = liveSnapshot?.activeFilter ? ` (active view: ${liveSnapshot.activeFilter})` : '';
      const reply = queryLang === 'mr-IN'
        ? `सध्या वेबसाइटवर दिसणारी माहिती${filterNote}: ${details.join('; ')}.`
        : queryLang === 'hi-IN'
          ? `वर्तमान में वेबसाइट पर दिखाई गई जानकारी${filterNote}: ${details.join('; ')}।`
          : `Based on the live website data${filterNote}, ${details.join('; ')}. Please let me know if you'd like a full summary of the other metrics!`;

      return {
        status: 'FOUND_IN_FRONTEND',
        matchType: 'metric',
        summaryText: reply,
        matchedMetrics: strongMatches.map(x => x.mt),
        matchedCharts: [],
        matchedTables: [],
        pageRefs: Array.from(new Set(strongMatches.map(x => x.mt.pageLabel || 'Current Page')))
      };
    }
  }

  // 3B. Secondary Report Table Row / General Table Summary Lookup
  if (mergedTables.length > 0) {
    if (bestRowHit && bestRowScore >= 24) {
      const rowDesc = Object.entries(bestRowHit.row).map(([k, v]) => `${k}: ${v}`).join(', ');
      const pageNote = bestRowHit.table.pageLabel ? ` from ${bestRowHit.table.title} (${bestRowHit.table.pageLabel})` : ` from ${bestRowHit.table.title}`;
      return {
        status: 'FOUND_IN_FRONTEND',
        matchType: 'report_table_row',
        summaryText: `Here is the matching record${pageNote}: ${rowDesc}. Let me know if you would like to see the full table summary!`,
        matchedMetrics: [],
        matchedCharts: [],
        matchedTables: [bestRowHit.table],
        pageRefs: [bestRowHit.table.pageLabel || 'Current Page']
      };
    }

    if (isReportTableQuery) {
      let bestTable = mergedTables[0];
      if (distinctiveToks.length > 0) {
        let bestSc = -1;
        for (const tb of mergedTables) {
          const sc = scoreMatch(`${tb.title} ${(tb.headers || []).join(' ')} ${tb.summary}`, distinctiveToks).score;
          if (sc > bestSc) { bestSc = sc; bestTable = tb; }
        }
      }
      return {
        status: 'FOUND_IN_FRONTEND',
        matchType: 'report_table',
        summaryText: bestTable.summary,
        matchedMetrics: [],
        matchedCharts: [],
        matchedTables: [bestTable],
        pageRefs: [bestTable.pageLabel || 'Current Page']
      };
    }
  }

  // 4. Cross-Page Specific Page Query ("what is on the reports page?", "summary of analytics page", "combine dashboard and reports")
  const isCrossPageQuery = /\b(across\s+(?:all\s+)?pages|other\s+pages|all\s+pages|on\s+the\s+[a-z0-9-]+\s+page|from\s+the\s+[a-z0-9-]+\s+page|dashboard\s+and\s+report|connect|overall\s+website|entire\s+website|whole\s+website)\b/i.test(lower);
  if (isCrossPageQuery && allPages.length > 0) {
    const matchedPages = allPages.filter(p => {
      if (distinctiveToks.length === 0) return true;
      const sc = scoreMatch(`${p.pageLabel} ${p.pagePath} ${p.summary}`, distinctiveToks).score;
      return sc >= 10;
    });
    const targetPages = matchedPages.length > 0 ? matchedPages.slice(0, 3) : allPages.slice(0, 3);
    const pageSummaries = targetPages.map(p => `${p.pageLabel} (${p.pagePath}): ${p.summary}`);
    return {
      status: 'FOUND_IN_FRONTEND',
      matchType: 'cross_page_summary',
      summaryText: `Here is the connected overview across the website: ${pageSummaries.join(' ')}`,
      matchedMetrics: mergedMetrics.slice(0, 6),
      matchedCharts: mergedCharts.slice(0, 3),
      matchedTables: mergedTables.slice(0, 2),
      pageRefs: targetPages.map(p => p.pageLabel)
    };
  }

  // 5. Explicit Page / Dashboard Summary Query ("summarize this page", "what stats are shown here?", "give me a dashboard overview")
  const isSummaryQuery = /\b(summarize|summary|overview|highlights?|key\s+(?:stats?|metrics?|numbers?|figures?|findings?)|what\s+(?:is|are)\s+(?:shown|displayed)\s+(?:here|on\s+this\s+page|on\s+the\s+dashboard|on\s+the\s+screen)|dashboard\s+(?:summary|stats?|metrics?|overview|report))\b/i.test(lower) ||
                         /(सारांश|आढावा|डॅशबोर्ड|डैशबोर्ड|सारांश बताएं|आंकड़े)/i.test(rawQ);
  if (isSummaryQuery) {
    const parts = [];
    const activeLabel = liveSnapshot?.pageLabel || allPages[0]?.pageLabel || 'this page';
    if (liveSnapshot?.activeFilter) parts.push(`Active filter: ${liveSnapshot.activeFilter}.`);
    if (mergedMetrics.length > 0) {
      const topStats = mergedMetrics.slice(0, 5).map(mt => `${mt.label}: ${mt.value}${mt.delta ? ` (${mt.delta})` : ''}`).join(', ');
      parts.push(`Key metrics on ${activeLabel} include ${topStats}.`);
    }
    if (mergedCharts.length > 0) {
      parts.push(mergedCharts[0].summary);
    }
    if (mergedTables.length > 0 && parts.length < 3) {
      parts.push(mergedTables[0].summary);
    }
    if (parts.length === 0 && allPages[0]?.summary) {
      parts.push(allPages[0].summary);
    }
    if (parts.length > 0) {
      return {
        status: 'FOUND_IN_FRONTEND',
        matchType: 'page_summary',
        summaryText: parts.join(' '),
        matchedMetrics: mergedMetrics.slice(0, 6),
        matchedCharts: mergedCharts.slice(0, 3),
        matchedTables: mergedTables.slice(0, 2),
        pageRefs: [activeLabel]
      };
    }
  }

  return null;
}
