/**
 * `requirements/` 派生视图一致性门禁。
 *
 * @remarks
 * 需求管理只有一个真相源：每条 story 的 YAML `status`（`requirements/README.md`「真相源规则」）。
 * 其余全是派生视图——`status-overview.md` 的计数表与按 Epic 索引、各 epic 的 frontmatter
 * `status`、`README.md` 首屏的「N/M 已交付」。派生视图此前全靠手改，实测已漂移过：
 * README 写 50/61 时 YAML 已是 54/63，Backlog 的 epic 里挂着 In Progress 的故事。
 * 漂移的代价不是数字难看，是读者停止复验、转而信任叙述（CONVENTIONS「证据锚点」）。
 *
 * 本脚本把「派生」这一步交给机器：
 *
 * 1. story frontmatter 完整（`id` / `title` / `status` / `priority` / `epic` / `created` / `updated` / `tags`），
 *    `status` 落在五态之内，`epic` 指向存在的 epic 文件；
 * 2. `status-overview.md` 的状态汇总表、「进行中（N 条）」/「待评审（N 条）」标题、
 *    按 Epic 索引里每条 story 前的状态符号，全部等于 YAML 推导值；每条 story 都在索引里；
 * 3. epic frontmatter `status` 与归属它的故事一致：`Done` 的 epic 不得持有 In Progress / Backlog 故事，
 *    `Backlog` 的 epic 不得持有已开工故事；`In Progress` 不作约束（epic-005 全绿但发布门禁未审计，
 *    epic-007 只有一条故事却还有无主目标，都是有意的）；
 * 4. `README.md` 的「N/M 已交付」等于 Done / 合计；
 * 5. `requirements/**\/*.md` 里的相对链接都能解析到文件；指向源码的 `#L<n>` 行号锚点不得超过文件行数——
 *    CONVENTIONS 说「锚点失效的真实代价不是链接坏了，是读者停止复验」；
 * 6. CONVENTIONS「过程留档的去向」禁止进正文的叙述词（`已于 X 日`、删除线、`落地偏差`……）
 *    只**告警**不阻塞：存量太多，先让它可见，再逐条烧掉。
 *
 * `--update` 只重写机器能唯一确定的数字：汇总表、两个标题里的条数、README 的 N/M。
 * 状态符号、epic `status`、死链**不自动改**——那些是判断，不是派生。
 *
 * @example
 * ```bash
 * pnpm audit:requirements            # --check，CI 每个 PR 跑
 * pnpm audit:requirements:update     # 改完 story status 后同步数字
 * ```
 */

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** story 五态与派生视图里对应的状态符号。 */
export const STATUS_EMOJI = {
  Done: '✅',
  'In Progress': '🚧',
  'In Review': '👀',
  Backlog: '⬜',
  Blocked: '🚫'
};

/** 状态汇总表每一行的首列原文，顺序即表格顺序。 */
export const SUMMARY_ROWS = [
  ['✅ Done', 'Done'],
  ['🚧 In Progress', 'In Progress'],
  ['👀 In Review', 'In Review'],
  ['📝 Backlog', 'Backlog'],
  ['🚫 Blocked', 'Blocked'],
  ['**合计**', 'total']
];

export const REQUIRED_FRONTMATTER = ['id', 'title', 'status', 'priority', 'epic', 'created', 'updated', 'tags'];

/** CONVENTIONS「过程留档的去向」点名的叙述词。命中只告警。 */
export const NARRATIVE_PATTERNS = [
  ['已于 X 日', /已于\s*\d{4}-\d{2}-\d{2}|已于\s*\d{1,2}-\d{1,2}/g],
  ['删除线', /~~[^~\n]+~~/g],
  ['原判定', /原判定/g],
  ['落地偏差', /落地偏差/g],
  ['第 N 轮复核', /第\s*[一二三四五六七八九十\d]+\s*轮复核/g],
  ['后续变更', /后续变更/g]
];

/** 叙述词扫描不看的路径：约定本身、评审记录（那是记录不是需求）、模板。 */
const NARRATIVE_EXEMPT = /(^|\/)(CONVENTIONS\.md|reviews\/|.*\.template\.md)/;

/**
 * 解析文件头部的 YAML frontmatter。只认本仓库用到的扁平 `key: value` 与 `key: [a, b]`（含被 prettier 折到下一行的值），
 * 不引入 yaml 依赖——story 模板从没用过嵌套结构，`inherited_acs` 是唯一的列表块，
 * 这里把它整体记成原文即可（本脚本不消费它）。
 *
 * @param {string} text 文件全文
 * @returns {Record<string, string> | null} 没有 frontmatter 返回 null
 */
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const result = {};
  let lastKey;
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) {
      lastKey = kv[1];
      result[lastKey] = kv[2].replace(/\s+#.*$/, '').trim();
      continue;
    }
    // prettier 会把超长的 `tags: [...]` 折成下一行缩进——值续行拼回上一个 key
    if (lastKey !== undefined && /^\s+\S/.test(line)) result[lastKey] = `${result[lastKey]} ${line.trim()}`.trim();
  }
  return result;
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>} 目录下全部 `.md` 的绝对路径（递归）
 */
async function collectMarkdown(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectMarkdown(full)));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

/**
 * 读取全部 story。文件名匹配 `US-\d+-*.md` 且带 frontmatter 才算 story——
 * `US-904-phase-a-evidence.md` 没有 frontmatter，是证据留档，按 status-overview 自己的口径排除。
 *
 * @param {string} root 仓库根
 */
export async function collectStories(root) {
  const storiesDir = path.join(root, 'requirements', 'stories');
  const stories = [];
  for (const file of await collectMarkdown(storiesDir)) {
    if (!/^US-\d+-.*\.md$/.test(path.basename(file))) continue;
    const fm = parseFrontmatter(await readFile(file, 'utf8'));
    if (!fm) continue;
    stories.push({ file, rel: path.relative(root, file), fm, id: fm.id ?? path.basename(file).slice(0, 6) });
  }
  return stories;
}

/**
 * @param {Array<{fm: Record<string, string>}>} stories
 * @returns {Record<string, number>} 五态计数 + `total`
 */
export function countStatuses(stories) {
  const counts = { Done: 0, 'In Progress': 0, 'In Review': 0, Backlog: 0, Blocked: 0, total: stories.length };
  for (const { fm } of stories) if (fm.status in counts) counts[fm.status] += 1;
  return counts;
}

/**
 * @param {Array<{rel: string, fm: Record<string, string>}>} stories
 * @param {Set<string>} epicIds 存在的 epic id
 * @returns {string[]}
 */
export function checkFrontmatter(stories, epicIds) {
  const offenders = [];
  for (const { rel, fm } of stories) {
    const missing = REQUIRED_FRONTMATTER.filter(key => !(key in fm) || fm[key] === '');
    if (missing.length) offenders.push(`${rel}: frontmatter 缺 ${missing.join(' / ')}`);
    if (fm.status && !(fm.status in STATUS_EMOJI)) offenders.push(`${rel}: status "${fm.status}" 不在五态之内`);
    if (fm.epic && !epicIds.has(fm.epic)) offenders.push(`${rel}: epic "${fm.epic}" 没有对应的 epics/${fm.epic}.md`);
  }
  return offenders;
}

const summaryRowRegex = row => new RegExp(`^(\\| ${escapeRegex(row)}\\s*\\| )(\\d+)(\\s*\\|)\\s*$`, 'm');
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 校验 `status-overview.md`：汇总表、两处标题条数、索引里每条 story 的状态符号、索引覆盖全部 story。
 *
 * @param {string} text status-overview.md 全文
 * @param {Array<{id: string, fm: Record<string, string>}>} stories
 * @returns {string[]}
 */
export function checkStatusOverview(text, stories) {
  const offenders = [];
  const counts = countStatuses(stories);
  for (const [label, key] of SUMMARY_ROWS) {
    const m = summaryRowRegex(label).exec(text);
    if (!m) offenders.push(`status-overview.md: 汇总表缺「${label}」行`);
    else if (Number(m[2]) !== counts[key])
      offenders.push(`status-overview.md: 「${label}」写 ${m[2]}，YAML 推导为 ${counts[key]}`);
  }
  for (const [heading, key] of [
    ['进行中', 'In Progress'],
    ['待评审', 'In Review']
  ]) {
    const m = new RegExp(`^## ${heading}（(\\d+) 条）`, 'm').exec(text);
    if (!m) offenders.push(`status-overview.md: 缺「## ${heading}（N 条）」标题`);
    else if (Number(m[1]) !== counts[key])
      offenders.push(`status-overview.md: 「## ${heading}（${m[1]} 条）」与 YAML 的 ${counts[key]} 不符`);
  }
  const indexed = new Map();
  for (const m of text.matchAll(/^\s*- (✅|🚧|👀|⬜|🚫) \[(US-\d+)\b/gm)) indexed.set(m[2], m[1]);
  for (const { id, fm } of stories) {
    const emoji = indexed.get(id);
    if (!emoji) offenders.push(`status-overview.md: 按 Epic 索引里没有 ${id}`);
    else if (emoji !== STATUS_EMOJI[fm.status])
      offenders.push(`status-overview.md: ${id} 标 ${emoji}，YAML 是 ${fm.status}（应为 ${STATUS_EMOJI[fm.status]}）`);
  }
  return offenders;
}

/**
 * 只改数字、不动列宽：prettier 会按 string-width 对齐表格列，整块重排反而会让 `format:check` 变红。
 *
 * @param {string} text
 * @param {Record<string, number>} counts
 */
export function updateStatusOverview(text, counts) {
  let next = text;
  for (const [label, key] of SUMMARY_ROWS) {
    next = next.replace(summaryRowRegex(label), (_m, head, digits, tail) => {
      const cell = String(counts[key]).padEnd(digits.length + tail.length - 1);
      return `${head}${cell}|`;
    });
  }
  next = next.replace(/^## 进行中（\d+ 条）/m, `## 进行中（${counts['In Progress']} 条）`);
  next = next.replace(/^## 待评审（\d+ 条）/m, `## 待评审（${counts['In Review']} 条）`);
  return next;
}

const README_DELIVERED = /\[(\d+)\/(\d+) 已交付\]/;

/**
 * @param {string} text README.md 全文
 * @param {Record<string, number>} counts
 * @returns {string[]}
 */
export function checkReadme(text, counts) {
  const m = README_DELIVERED.exec(text);
  if (!m) return ['README.md: 找不到「[N/M 已交付]」'];
  if (Number(m[1]) !== counts.Done || Number(m[2]) !== counts.total) {
    return [`README.md: 写 ${m[1]}/${m[2]} 已交付，YAML 推导为 ${counts.Done}/${counts.total}`];
  }
  return [];
}

/** @param {string} text @param {Record<string, number>} counts */
export function updateReadme(text, counts) {
  return text.replace(README_DELIVERED, `[${counts.Done}/${counts.total} 已交付]`);
}

/**
 * 读取全部 epic：frontmatter `status` 与正文里链接到的 story id。
 *
 * @param {string} root
 */
export async function collectEpics(root) {
  const epicsDir = path.join(root, 'requirements', 'epics');
  const epics = [];
  for (const file of await collectMarkdown(epicsDir)) {
    if (path.basename(file) === 'epic.template.md') continue;
    const text = await readFile(file, 'utf8');
    const fm = parseFrontmatter(text);
    if (!fm) continue;
    const storyIds = new Set([...text.matchAll(/\(\.\.\/stories\/[^)]*?(US-\d+)-[^)]*\.md\)/g)].map(m => m[1]));
    epics.push({ file, rel: path.relative(root, file), id: fm.id ?? path.basename(file, '.md'), fm, storyIds });
  }
  return epics;
}

/**
 * epic `status` 与故事状态的硬约束，以及 epic ↔ story 的双向引用。
 *
 * 状态约束只看**归属**该 epic 的故事（story frontmatter `epic:` 指向它），不看它正文顺带链接到的
 * 别家故事——epic-006 引用 US-207 / US-210 只是拿宿主能力当证据，不是持有它们。
 * `Done` 的 epic 允许持有 `In Review`：epic-008 的收口判据写的是「均不为 In Progress」，
 * US-015 停在 In Review 是它明示的稳态。
 *
 * @param {Awaited<ReturnType<typeof collectEpics>>} epics
 * @param {Awaited<ReturnType<typeof collectStories>>} stories
 * @returns {string[]}
 */
export function checkEpics(epics, stories) {
  const offenders = [];
  const byId = new Map(stories.map(s => [s.id, s]));
  const epicById = new Map(epics.map(e => [e.id, e]));
  for (const epic of epics) {
    for (const id of epic.storyIds) {
      if (!byId.has(id)) offenders.push(`${epic.rel}: 链接到不存在的故事 ${id}`);
    }
  }
  for (const story of stories) {
    const owner = epicById.get(story.fm.epic);
    if (!owner) continue;
    const status = story.fm.status;
    if (!owner.storyIds.has(story.id))
      offenders.push(`${story.rel}: 声明 epic ${story.fm.epic}，但该 epic 文件没有链接到它`);
    if (owner.fm.status === 'Done' && status !== 'Done' && status !== 'In Review') {
      offenders.push(`${owner.rel}: epic 是 Done，但 ${story.id} 是 ${status}`);
    }
    if (owner.fm.status === 'Backlog' && status !== 'Backlog') {
      offenders.push(`${owner.rel}: epic 是 Backlog，但 ${story.id} 已是 ${status}`);
    }
  }
  return offenders;
}

/**
 * 相对链接与行号锚点。只看 `](...)` 形式，跳过 http(s) / mailto / 纯 `#` 锚点。
 *
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function checkLinks(root) {
  const offenders = [];
  const lineCountCache = new Map();
  const lineCount = async file => {
    if (!lineCountCache.has(file)) {
      const text = await readFile(file, 'utf8');
      lineCountCache.set(file, text.split('\n').length - (text.endsWith('\n') ? 1 : 0));
    }
    return lineCountCache.get(file);
  };
  for (const file of await collectMarkdown(path.join(root, 'requirements'))) {
    if (file.endsWith('.template.md')) continue;
    const text = await readFile(file, 'utf8');
    const rel = path.relative(root, file);
    for (const m of text.matchAll(/\]\(([^)\s]+?)(#[^)\s]*)?\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|#)/.test(target) || target.startsWith('<')) continue;
      const resolved = path.resolve(path.dirname(file), decodeURI(target));
      let info;
      try {
        info = await stat(resolved);
      } catch {
        offenders.push(`${rel}: 链接目标不存在 → ${target}`);
        continue;
      }
      const anchor = /^#L(\d+)(?:-L(\d+))?$/.exec(m[2] ?? '');
      if (anchor && info.isFile()) {
        const last = Number(anchor[2] ?? anchor[1]);
        const total = await lineCount(resolved);
        if (last > total) offenders.push(`${rel}: 行号锚点 ${target}${m[2]} 超出文件行数 ${total}`);
      }
    }
  }
  return offenders;
}

/**
 * @param {string} root
 * @returns {Promise<Array<{rel: string, hits: Array<[string, number]>}>>} 每个文件命中的叙述词与次数
 */
export async function scanNarrative(root) {
  const report = [];
  for (const file of await collectMarkdown(path.join(root, 'requirements'))) {
    const rel = path.relative(root, file);
    if (NARRATIVE_EXEMPT.test(rel)) continue;
    const text = await readFile(file, 'utf8');
    const hits = NARRATIVE_PATTERNS.map(([label, re]) => [label, (text.match(re) ?? []).length]).filter(
      ([, n]) => n > 0
    );
    if (hits.length) report.push({ rel, hits });
  }
  return report;
}

/**
 * @param {{root: string, update?: boolean}} options
 * @returns {Promise<{offenders: string[], warnings: string[], counts: Record<string, number>}>}
 */
export async function run({ root, update = false }) {
  const stories = await collectStories(root);
  const epics = await collectEpics(root);
  const counts = countStatuses(stories);
  const overviewPath = path.join(root, 'requirements', 'status-overview.md');
  const readmePath = path.join(root, 'README.md');

  if (update) {
    await writeFile(overviewPath, updateStatusOverview(await readFile(overviewPath, 'utf8'), counts));
    await writeFile(readmePath, updateReadme(await readFile(readmePath, 'utf8'), counts));
  }

  const offenders = [
    ...checkFrontmatter(stories, new Set(epics.map(e => e.id))),
    ...checkStatusOverview(await readFile(overviewPath, 'utf8'), stories),
    ...checkReadme(await readFile(readmePath, 'utf8'), counts),
    ...checkEpics(epics, stories),
    ...(await checkLinks(root))
  ];
  const warnings = (await scanNarrative(root)).map(
    ({ rel, hits }) => `${rel}: ${hits.map(([label, n]) => `${label}×${n}`).join('，')}`
  );
  return { offenders, warnings, counts };
}

const main = async () => {
  const update = process.argv.includes('--update');
  const { offenders, warnings, counts } = await run({ root: process.cwd(), update });
  const summary = `${counts.Done} Done / ${counts['In Progress']} In Progress / ${counts['In Review']} In Review / ${counts.Backlog} Backlog / ${counts.Blocked} Blocked，合计 ${counts.total}`;

  if (warnings.length) {
    console.warn(`⚠️  ${warnings.length} 个文件含 CONVENTIONS 不允许进正文的过程叙述（不阻塞，逐条烧掉）：`);
    for (const w of warnings) console.warn(`   ${w}`);
  }
  if (offenders.length) {
    console.error(`❌ requirements 派生视图与 YAML 不一致（${offenders.length} 处）：`);
    for (const o of offenders) console.error(`   ${o}`);
    console.error('\n数字类漂移跑 `pnpm audit:requirements:update`；状态符号 / epic status / 死链需手改。');
    process.exit(1);
  }
  process.stdout.write(`✅ Requirements consistency passed（${summary}）${update ? '，派生数字已回写' : ''}.\n`);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
