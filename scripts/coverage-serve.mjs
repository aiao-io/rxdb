#!/usr/bin/env node
/**
 * Serve Vitest/Istanbul HTML coverage reports over HTTP.
 *
 * Istanbul multi-page HTML reports break under file:// in many browsers
 * (and VS Code Simple Browser). Always view them via localhost.
 *
 * Serves the whole coverage/ tree with a table index of package metrics.
 *
 * Usage:
 *   pnpm coverage:serve
 *   pnpm coverage:serve rxdb
 *   pnpm coverage:serve packages/utils --port 9000
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const coverageRoot = join(root, 'coverage');
const METRIC_KEYS = /** @type {const} */ (['statements', 'branches', 'functions', 'lines']);

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function usage(exitCode = 0) {
  console.log(`Usage: pnpm coverage:serve [package] [--port <n>]

Examples:
  pnpm coverage:serve
  pnpm coverage:serve rxdb
  pnpm coverage:serve utils --port 9000

Serves the whole coverage/ tree over HTTP (not file://).
Homepage shows a metrics table + overall totals.
With [package], / redirects to that report; the table stays at /index.html.`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  let pkg = null;
  let port = 8765;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') usage(0);
    if (arg === '--port' || arg === '-p') {
      // 先取原值再判断：`++i` 之后 argv[i] 可能已越界，拿它报错只会打印 undefined。
      const raw = argv[++i];
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1 || value > 65535) {
        console.error(`Invalid port: ${raw ?? '(missing)'}`);
        process.exit(1);
      }
      port = value;
      continue;
    }
    if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`);
      usage(1);
    }
    if (pkg) {
      console.error(`Unexpected argument: ${arg}`);
      usage(1);
    }
    pkg = arg.replace(/^packages\//, '').replace(/\/$/, '');
  }
  return { pkg, port };
}

/** @returns {{ total: number, covered: number, skipped: number, pct: number }} */
function emptyMetric() {
  return { total: 0, covered: 0, skipped: 0, pct: 100 };
}

/** @returns {Record<'statements'|'branches'|'functions'|'lines', ReturnType<typeof emptyMetric>>} */
function emptyTotals() {
  return {
    statements: emptyMetric(),
    branches: emptyMetric(),
    functions: emptyMetric(),
    lines: emptyMetric()
  };
}

/**
 * 计算覆盖率百分比（保留两位小数）。
 * total === 0 时按 100%（无语句也谈不上不达标），避免除零。
 * @param {number} covered
 * @param {number} total
 * @returns {number}
 */
function pctOf(covered, total) {
  if (total === 0) return 100;
  return Math.round((covered / total) * 10000) / 100;
}

/**
 * 把 coverage-summary.json 里的 metric 字段（pct/total/covered/skipped）规整成内部统一结构。
 * 缺 pct 时根据 covered / total 反算。
 * @param {{ total?: number, covered?: number, skipped?: number, pct?: number } | null | undefined} raw
 * @returns {{ total: number, covered: number, skipped: number, pct: number }}
 */
function normalizeMetric(raw) {
  const total = Number(raw?.total) || 0;
  const covered = Number(raw?.covered) || 0;
  const skipped = Number(raw?.skipped) || 0;
  const pct = typeof raw?.pct === 'number' && !Number.isNaN(raw.pct) ? raw.pct : pctOf(covered, total);
  return { total, covered, skipped, pct };
}

/**
 * 把 coverage-summary.json 的 total 字段规整成四指标统一结构。
 * @param {{ statements?: unknown, branches?: unknown, functions?: unknown, lines?: unknown } | null | undefined} raw
 */
function normalizeTotals(raw) {
  const totals = emptyTotals();
  if (!raw || typeof raw !== 'object') return totals;
  for (const key of METRIC_KEYS) {
    totals[key] = normalizeMetric(raw[key]);
  }
  return totals;
}

/**
 * 直接读 Istanbul coverage-final.json 聚合四指标，作为 coverage-summary.json 缺失时的兜底。
 * 行覆盖率用 statementMap 反查每行最大的 statement hit 数。
 * @param {Record<string, { s?: Record<string, number>, f?: Record<string, number>, b?: Record<string, number[]>, statementMap?: Record<string, { start: { line: number } }> }>} data
 */
function summarizeFinal(data) {
  const totals = emptyTotals();
  if (!data || typeof data !== 'object') return totals;

  for (const file of Object.values(data)) {
    if (!file || typeof file !== 'object') continue;

    if (file.s) {
      for (const hits of Object.values(file.s)) {
        totals.statements.total++;
        if (hits > 0) totals.statements.covered++;
      }
    }
    if (file.f) {
      for (const hits of Object.values(file.f)) {
        totals.functions.total++;
        if (hits > 0) totals.functions.covered++;
      }
    }
    if (file.b) {
      for (const branches of Object.values(file.b)) {
        if (!Array.isArray(branches)) continue;
        for (const hits of branches) {
          totals.branches.total++;
          if (hits > 0) totals.branches.covered++;
        }
      }
    }
    if (file.statementMap && file.s) {
      /** @type {Map<number, number>} */
      const lineHits = new Map();
      for (const [id, hits] of Object.entries(file.s)) {
        const loc = file.statementMap[id];
        const line = loc?.start?.line;
        if (typeof line !== 'number') continue;
        lineHits.set(line, Math.max(lineHits.get(line) ?? 0, Number(hits) || 0));
      }
      for (const hits of lineHits.values()) {
        totals.lines.total++;
        if (hits > 0) totals.lines.covered++;
      }
    }
  }

  for (const key of METRIC_KEYS) {
    totals[key].pct = pctOf(totals[key].covered, totals[key].total);
  }
  return totals;
}

/**
 * 读取单个包的覆盖率指标。
 * 优先 coverage-summary.json；坏了/缺失再降级到 coverage-final.json（仍坏则返回 null）。
 * 注意：`coverage-final.json` 不存在并不一定是「没跑覆盖率」，
 *   也可能是 Vite 把文件拆到了别的位置 —— 调用方要在表格里区分。
 * @param {string} dir 单包覆盖率输出目录（如 coverage/packages/rxdb）
 */
function readMetrics(dir) {
  const summaryPath = join(dir, 'coverage-summary.json');
  if (existsSync(summaryPath)) {
    try {
      const data = JSON.parse(readFileSync(summaryPath, 'utf8'));
      return normalizeTotals(data.total);
    } catch (error) {
      // 降级到 coverage-final.json，但别静默：产物损坏和「没跑覆盖率」在表格里长得一样。
      console.warn(`[coverage-serve] 无法解析 ${summaryPath}，改用 coverage-final.json：`, error);
    }
  }

  const finalPath = join(dir, 'coverage-final.json');
  if (existsSync(finalPath)) {
    try {
      return summarizeFinal(JSON.parse(readFileSync(finalPath, 'utf8')));
    } catch (error) {
      console.warn(`[coverage-serve] 无法解析 ${finalPath}，该包将不显示指标：`, error);
      return null;
    }
  }
  return null;
}

/**
 * @returns {{
 *   id: string,
 *   href: string | null,
 *   group: string,
 *   metrics: ReturnType<typeof emptyTotals> | null,
 * }[]}
 */
function listReports() {
  if (!existsSync(coverageRoot)) return [];

  /** @type {{ id: string, href: string | null, group: string, metrics: ReturnType<typeof emptyTotals> | null }[]} */
  const reports = [];
  for (const group of ['packages', 'modules']) {
    const groupDir = join(coverageRoot, group);
    if (!existsSync(groupDir) || !statSync(groupDir).isDirectory()) continue;

    for (const name of readdirSync(groupDir).sort()) {
      const dir = join(groupDir, name);
      if (!statSync(dir).isDirectory()) continue;

      const hasHtml = existsSync(join(dir, 'index.html'));
      const metrics = readMetrics(dir);
      if (!hasHtml && !metrics) continue;

      reports.push({
        id: name,
        href: hasHtml ? `/${group}/${name}/` : null,
        group,
        metrics
      });
    }
  }
  return reports;
}

/**
 * 把所有包的指标按四指标累加（covered / total / skipped），最后重新算 pct。
 * @param {Array<{ metrics: ReturnType<typeof emptyTotals> | null }>} reports
 */
function aggregateMetrics(reports) {
  const totals = emptyTotals();
  for (const report of reports) {
    if (!report.metrics) continue;
    for (const key of METRIC_KEYS) {
      totals[key].total += report.metrics[key].total;
      totals[key].covered += report.metrics[key].covered;
      totals[key].skipped += report.metrics[key].skipped;
    }
  }
  for (const key of METRIC_KEYS) {
    totals[key].pct = pctOf(totals[key].covered, totals[key].total);
  }
  return totals;
}

/**
 * 把 CLI 传入的包名 / 路径解析为 `/` 下的相对路径，供 server 跳转。
 * 找不到对应报告时打印可用列表 + 退出 1。
 * @param {string | null} pkg
 */
function resolveReportHref(pkg) {
  if (!pkg) return '/';

  const reports = listReports();
  const exact = reports.find(
    r => r.id === pkg || r.href === `/${pkg}/` || r.href === `/packages/${pkg}/` || r.href === `/modules/${pkg}/`
  );
  if (exact?.href) return exact.href;
  if (exact && !exact.href) {
    console.error(`Coverage metrics exist for "${pkg}", but HTML report is missing.`);
    console.error(`Generate with: pnpm nx test ${pkg} --coverage`);
    process.exit(1);
  }

  const candidates = [
    join(coverageRoot, 'packages', pkg, 'index.html'),
    join(coverageRoot, 'modules', pkg, 'index.html'),
    join(coverageRoot, pkg, 'index.html')
  ];
  for (const file of candidates) {
    if (existsSync(file)) {
      return `/${relative(coverageRoot, file)
        .replace(/index\.html$/, '')
        .split(sep)
        .join('/')}`;
    }
  }

  console.error(`No HTML coverage for "${pkg}"`);
  if (reports.length) {
    console.error('Available:');
    for (const r of reports) console.error(`  - ${r.id}  (${r.group})`);
  } else {
    console.error('Generate first: pnpm nx test <project> --coverage');
  }
  process.exit(1);
}

/**
 * 把请求路径拼接回磁盘绝对路径，并防御 ../ 逃逸。
 * decodeURIComponent 失败（如 `GET /%`）返回 null，让外层兜底而不是抛未捕获异常。
 * @param {string} base 受限根目录
 * @param {string} requestPath URL 路径部分
 * @returns {string | null}
 */
function safeJoin(base, requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.split('?')[0]);
  } catch {
    // 畸形百分号转义（`GET /%`）会让 decodeURIComponent 抛错；
    // 不拦就是未捕获异常直接打死 dev server。
    return null;
  }
  const cleaned = decoded.replace(/^\/+/, '');
  const target = normalize(join(base, cleaned));
  const rel = relative(base, target);
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) return null;
  return target;
}

/**
 * Host 白名单。
 *
 * 服务器只绑 127.0.0.1，但那挡不住 DNS rebinding：远端页面把自己的域名解析到
 * 127.0.0.1 就能发同源请求。istanbul 的 HTML 报告内嵌**完整源码**，因此这里
 * 按 Host 头再挡一道。
 */
function isLoopbackHost(hostHeader) {
  if (!hostHeader) return false;
  const value = hostHeader.trim().toLowerCase();
  // IPv6 字面量带方括号（`[::1]:8765`），端口不能用 /:\d+$/ 从里面剥。
  const host = value.startsWith('[') ? value.slice(0, value.indexOf(']') + 1) : value.replace(/:\d+$/, '');
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/**
 * 软链兜底：`safeJoin` 只做词法检查，拦不住 coverage/ 内指向仓库外的软链。
 * 真实路径必须仍落在 coverage/ 内。
 */
function isWithinRoot(realRoot, target) {
  try {
    const rel = relative(realRoot, realpathSync(target));
    return rel === '' || !rel.startsWith('..');
  } catch {
    return false;
  }
}

/**
 * 统一写响应头 + body。
 * 默认 `Cache-Control: no-store` —— 本地覆盖率产物随时被覆盖，缓存反而误导。
 * @param {import('node:http').ServerResponse} res
 * @param {number} status HTTP 状态码
 * @param {string | Buffer} body
 * @param {string} [type] Content-Type
 */
function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

/**
 * HTML 转义五个字符，避免行内模板被注入。
 * 仅供本 server 内部渲染用（覆盖率指标全是我们自己的数字，外部不可信输入不进这里）。
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * 渲染百分比：整数显示无小数点（90%）；两位小数去除尾随 0（90.50% → 90.5%）。
 * 非数显示为 `—`，避免在表格里出现 `NaN%`。
 * @param {unknown} pct
 * @returns {string}
 */
function formatPct(pct) {
  if (typeof pct !== 'number' || Number.isNaN(pct)) return '—';
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(2).replace(/\.?0+$/, '')}%`;
}

/**
 * 按阈值给百分比打分：>=90 高 / >=80 中 / <80 低 / 非法 unknown。
 * 用作 CSS class 名，匹配 index.html 的 `.high` / `.medium` / `.low`。
 * @param {unknown} pct
 * @returns {'high' | 'medium' | 'low' | 'unknown'}
 */
function levelClass(pct) {
  if (typeof pct !== 'number' || Number.isNaN(pct)) return 'unknown';
  if (pct >= 90) return 'high';
  if (pct >= 80) return 'medium';
  return 'low';
}

function formatMetricCell(metric) {
  if (!metric) return '<td class="unknown">—</td>';
  const level = levelClass(metric.pct);
  return `<td class="${level}" data-covered-title="${escapeHtml(formatPct(metric.pct))}">
  <div class="pct">${escapeHtml(formatPct(metric.pct))}</div>
  <div class="count">${metric.covered}/${metric.total}</div>
</td>`;
}

function formatSummaryCards(totals) {
  return METRIC_KEYS.map(key => {
    const m = totals[key];
    return `<div class="card ${levelClass(m.pct)}">
  <div class="card-label" data-i18n="metric.${key}"></div>
  <div class="card-pct">${escapeHtml(formatPct(m.pct))}</div>
  <div class="card-count">${m.covered}/${m.total}</div>
</div>`;
  }).join('\n');
}

/**
 * 渲染首页 HTML（指标表 + 4 张 summary 卡）。
 * 表格按 group 分段，并附带 TOTAL 行；样式全部内联保证单文件能跑。
 * @param {Array<{ id: string, href: string | null, group: string, metrics: ReturnType<typeof emptyTotals> | null }>} reports
 * @returns {string} 完整 HTML
 */
function renderIndex(reports) {
  const totals = aggregateMetrics(reports);
  const withMetrics = reports.filter(r => r.metrics).length;

  const rows = reports
    .map(report => {
      const name =
        report.href ?
          `<a href="${escapeHtml(report.href)}">${escapeHtml(report.id)}</a>`
        : `<span class="muted" data-i18n-title="missingHtml" title="">${escapeHtml(report.id)}</span>`;
      const metrics = report.metrics;
      return `<tr>
  <td class="pkg">${name}</td>
  <td class="group">${escapeHtml(report.group)}</td>
  ${formatMetricCell(metrics?.statements ?? null)}
  ${formatMetricCell(metrics?.branches ?? null)}
  ${formatMetricCell(metrics?.functions ?? null)}
  ${formatMetricCell(metrics?.lines ?? null)}
</tr>`;
    })
    .join('\n');

  const totalRow = `<tr class="total">
  <td class="pkg" data-i18n="overall"></td>
  <td class="group"><span data-i18n-html="packagesCount" data-count-with="${withMetrics}" data-count-total="${reports.length}"></span></td>
  ${formatMetricCell(totals.statements)}
  ${formatMetricCell(totals.branches)}
  ${formatMetricCell(totals.functions)}
  ${formatMetricCell(totals.lines)}
</tr>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Coverage reports</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: Canvas;
      --fg: CanvasText;
      --muted: color-mix(in oklab, CanvasText 60%, Canvas);
      --border: color-mix(in oklab, CanvasText 18%, Canvas);
      --row: color-mix(in oklab, CanvasText 4%, Canvas);
      --high: #0a7f3f;
      --medium: #9a6b00;
      --low: #b42318;
      --high-bg: color-mix(in oklab, #0a7f3f 12%, Canvas);
      --medium-bg: color-mix(in oklab, #9a6b00 12%, Canvas);
      --low-bg: color-mix(in oklab, #b42318 12%, Canvas);
      font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
    }
    body { margin: 1.5rem auto; max-width: 72rem; line-height: 1.45; padding: 0 1rem 2rem; color: var(--fg); background: var(--bg); }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: .35rem; }
    h1 { font-size: 1.5rem; margin: 0; }
    h2 { font-size: 1.1rem; margin: 1.5rem 0 .75rem; }
    .hint { color: var(--muted); font-size: .9rem; margin: 0 0 1.25rem; }
    .lang-switch { display: inline-flex; border: 1px solid var(--border); border-radius: 999px; overflow: hidden; flex-shrink: 0; }
    .lang-switch button {
      appearance: none; border: 0; background: transparent; color: var(--muted);
      padding: .4rem .75rem; font: inherit; font-size: .85rem; cursor: pointer;
    }
    .lang-switch button[aria-pressed="true"] {
      background: color-mix(in oklab, CanvasText 12%, Canvas);
      color: var(--fg); font-weight: 600;
    }
    .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .75rem; margin-bottom: 1.25rem; }
    .card { border: 1px solid var(--border); border-radius: .75rem; padding: .85rem 1rem; background: var(--row); }
    .card-label { font-size: .8rem; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; }
    .card-pct { font-size: 1.6rem; font-weight: 700; margin-top: .2rem; }
    .card-count { font-size: .9rem; color: var(--muted); }
    .card.high .card-pct, td.high .pct { color: var(--high); }
    .card.medium .card-pct, td.medium .pct { color: var(--medium); }
    .card.low .card-pct, td.low .pct { color: var(--low); }
    .card.high, td.high { background: var(--high-bg); }
    .card.medium, td.medium { background: var(--medium-bg); }
    .card.low, td.low { background: var(--low-bg); }
    .table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: .75rem; }
    table { width: 100%; border-collapse: collapse; min-width: 52rem; }
    th, td { padding: .65rem .75rem; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); background: var(--row); position: sticky; top: 0; }
    tr:last-child td { border-bottom: 0; }
    tr.total td { font-weight: 700; border-top: 2px solid var(--border); background: var(--row); }
    td.pkg a { color: inherit; text-decoration: none; font-weight: 600; }
    td.pkg a:hover { text-decoration: underline; }
    td.group { color: var(--muted); font-size: .9rem; white-space: nowrap; }
    td .pct { font-weight: 700; }
    td .count { color: var(--muted); font-size: .85rem; }
    .muted { color: var(--muted); }
    @media (max-width: 800px) {
      .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .header { flex-direction: column; align-items: stretch; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1 data-i18n="title"></h1>
    <div class="lang-switch" role="group" data-i18n-aria-label="langSwitch">
      <button type="button" data-lang="zh" aria-pressed="false">中文</button>
      <button type="button" data-lang="en" aria-pressed="false">EN</button>
    </div>
  </div>
  <p class="hint" data-i18n-html="hint"></p>

  <h2 data-i18n="overall"></h2>
  <div class="cards">
${formatSummaryCards(totals)}
  </div>

  <h2 data-i18n="packages"></h2>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th data-i18n="col.package"></th>
          <th data-i18n="col.group"></th>
          <th data-i18n="metric.statements"></th>
          <th data-i18n="metric.branches"></th>
          <th data-i18n="metric.functions"></th>
          <th data-i18n="metric.lines"></th>
        </tr>
      </thead>
      <tbody>
${rows}
${totalRow}
      </tbody>
    </table>
  </div>
  <script>
    const I18N = {
      en: {
        title: 'Coverage reports',
        hint: 'Served from <code>coverage/</code>. Do not open via <code>file://</code>. Metrics from <code>coverage-summary.json</code> (fallback: <code>coverage-final.json</code>).',
        overall: 'Overall',
        packages: 'Packages',
        'col.package': 'Package',
        'col.group': 'Group',
        'metric.statements': 'Statements',
        'metric.branches': 'Branches',
        'metric.functions': 'Functions',
        'metric.lines': 'Lines',
        packagesCount: '{with}/{total} packages',
        missingHtml: 'HTML report missing',
        covered: '{pct} covered',
        langSwitch: 'Language',
      },
      zh: {
        title: '覆盖率报告',
        hint: '来自 <code>coverage/</code>，请通过 HTTP 打开，不要使用 <code>file://</code>。指标优先读取 <code>coverage-summary.json</code>（回退 <code>coverage-final.json</code>）。',
        overall: '总体',
        packages: '包列表',
        'col.package': '包名',
        'col.group': '分组',
        'metric.statements': '语句',
        'metric.branches': '分支',
        'metric.functions': '函数',
        'metric.lines': '行',
        packagesCount: '{with}/{total} 个包',
        missingHtml: '缺少 HTML 报告',
        covered: '已覆盖 {pct}',
        langSwitch: '语言',
      },
    };

    const STORAGE_KEY = 'aiao.coverage.lang';

    function detectLang() {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'zh' || saved === 'en') return saved;
      } catch {}
      const langs = Array.isArray(navigator.languages) && navigator.languages.length
        ? navigator.languages
        : [navigator.language || navigator.userLanguage || 'en'];
      return langs.some(l => String(l).toLowerCase().startsWith('zh')) ? 'zh' : 'en';
    }

    function t(lang, key, vars = {}) {
      let text = I18N[lang]?.[key] ?? I18N.en[key] ?? key;
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll('{' + name + '}', String(value));
      }
      return text;
    }

    function applyLang(lang) {
      const dict = I18N[lang] || I18N.en;
      document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
      document.title = dict.title;

      for (const el of document.querySelectorAll('[data-i18n]')) {
        el.textContent = t(lang, el.getAttribute('data-i18n'));
      }
      for (const el of document.querySelectorAll('[data-i18n-html]')) {
        const key = el.getAttribute('data-i18n-html');
        const vars = {};
        if (el.hasAttribute('data-count-with')) vars.with = el.getAttribute('data-count-with');
        if (el.hasAttribute('data-count-total')) vars.total = el.getAttribute('data-count-total');
        el.innerHTML = t(lang, key, vars);
      }
      for (const el of document.querySelectorAll('[data-i18n-title]')) {
        el.title = t(lang, el.getAttribute('data-i18n-title'));
      }
      for (const el of document.querySelectorAll('[data-i18n-aria-label]')) {
        el.setAttribute('aria-label', t(lang, el.getAttribute('data-i18n-aria-label')));
      }
      for (const el of document.querySelectorAll('[data-covered-title]')) {
        el.title = t(lang, 'covered', { pct: el.getAttribute('data-covered-title') });
      }
      for (const btn of document.querySelectorAll('.lang-switch [data-lang]')) {
        btn.setAttribute('aria-pressed', btn.getAttribute('data-lang') === lang ? 'true' : 'false');
      }
    }

    function setLang(lang, persist) {
      const next = lang === 'zh' ? 'zh' : 'en';
      applyLang(next);
      if (persist) {
        try { localStorage.setItem(STORAGE_KEY, next); } catch {}
      }
    }

    const initial = detectLang();
    setLang(initial, false);
    document.querySelectorAll('.lang-switch [data-lang]').forEach(btn => {
      btn.addEventListener('click', () => setLang(btn.getAttribute('data-lang'), true));
    });
  </script>
</body>
</html>`;
}

function serve(port, focusHref = '/') {
  const reports = listReports();
  if (!reports.length) {
    console.error(`No HTML coverage under ${relative(root, coverageRoot)}`);
    console.error('Generate first: pnpm nx test <project> --coverage');
    process.exit(1);
  }

  const realRoot = realpathSync(coverageRoot);
  const server = createServer((req, res) => {
    if (!isLoopbackHost(req.headers.host)) return send(res, 403, 'Forbidden');

    const rawPath = req.url === '/' || !req.url ? '/' : req.url.split('?')[0];

    // 指定了包就让 `/` 直达该报告；总表仍在 /index.html。
    if (rawPath === '/' && focusHref !== '/') {
      res.writeHead(302, { Location: focusHref, 'Cache-Control': 'no-store' });
      return res.end();
    }

    if (rawPath === '/' || rawPath === '/index.html') {
      return send(res, 200, renderIndex(listReports()), 'text/html; charset=utf-8');
    }

    let filePath = safeJoin(coverageRoot, rawPath);
    if (!filePath) return send(res, 403, 'Forbidden');

    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      const indexFile = join(filePath, 'index.html');
      if (existsSync(indexFile)) {
        filePath = indexFile;
      } else {
        return send(res, 404, `Not found: ${rawPath}`);
      }
    }

    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      return send(res, 404, `Not found: ${rawPath}`);
    }

    if (!isWithinRoot(realRoot, filePath)) return send(res, 403, 'Forbidden');

    const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    send(res, 200, readFileSync(filePath), type);
  });

  server.listen(port, '127.0.0.1', () => {
    const base = `http://127.0.0.1:${port}`;
    const totals = aggregateMetrics(reports);
    console.log(`Serving entire coverage tree`);
    console.log(`  dir: ${relative(root, coverageRoot)}`);
    if (focusHref === '/') {
      console.log(`  index: ${base}/`);
    } else {
      console.log(`  focus: ${base}${focusHref}  (/ redirects here)`);
      console.log(`  index: ${base}/index.html`);
    }
    console.log(`  reports: ${reports.length}`);
    console.log(
      `  overall: S ${formatPct(totals.statements.pct)} (${totals.statements.covered}/${totals.statements.total})` +
        `  B ${formatPct(totals.branches.pct)} (${totals.branches.covered}/${totals.branches.total})` +
        `  F ${formatPct(totals.functions.pct)} (${totals.functions.covered}/${totals.functions.total})` +
        `  L ${formatPct(totals.lines.pct)} (${totals.lines.covered}/${totals.lines.total})`
    );
    for (const r of reports) {
      const m = r.metrics;
      if (!m) {
        console.log(`    - ${r.group}/${r.id}  (no metrics)`);
        continue;
      }
      console.log(
        `    - ${r.group}/${r.id}` +
          `  S ${formatPct(m.statements.pct)} ${m.statements.covered}/${m.statements.total}` +
          `  B ${formatPct(m.branches.pct)} ${m.branches.covered}/${m.branches.total}` +
          `  F ${formatPct(m.functions.pct)} ${m.functions.covered}/${m.functions.total}` +
          `  L ${formatPct(m.lines.pct)} ${m.lines.covered}/${m.lines.total}`
      );
    }
    console.log('Do not open index.html via file:// — nested links will fail.');
    console.log('Ctrl+C to stop.');
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} in use. Try: pnpm coverage:serve --port ${port + 1}`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}

const { pkg, port } = parseArgs(process.argv.slice(2));
const focusHref = resolveReportHref(pkg);
serve(port, focusHref);
