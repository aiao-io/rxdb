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

/**
 * CONVENTIONS「过程留档的去向」点名的叙述词。命中只告警。
 *
 * @remarks
 * 后五条针对同一种病：把**过程**写进正文。`（已修）` / `（未修）` 是按时间轴记账，
 * 读者要自己算「现在到底是什么状态」；带日期的三级标题把一次 PR 的切片留成了永久章节；
 * `历史快照` 明说了这段已被别处取代，却仍占着正文。
 * 最后一条是 `\d+ 文件 \d+ 条` 这类裸测试计数——它天然会烂（实测 US-905 里三处互不相同），
 * 正确写法是给出复现命令而不是数字，见 CONVENTIONS「结论必须写出复验方式」。
 */
export const NARRATIVE_PATTERNS = [
  ['已于 X 日', /已于\s*\d{4}-\d{2}-\d{2}|已于\s*\d{1,2}-\d{1,2}/g],
  ['删除线', /~~[^~\n]+~~/g],
  ['原判定', /原判定/g],
  ['落地偏差', /落地偏差/g],
  ['第 N 轮复核', /第\s*[一二三四五六七八九十\d]+\s*轮复核/g],
  ['后续变更', /后续变更/g],
  ['已修 / 未修', /（\s*\**\s*(?:已修|未修)[^）\n]*）/g],
  ['历史快照', /历史快照|被[^\n。]{0,20}整节取代/g],
  ['带日期的标题', /^#{2,6} .*\d{4}-\d{2}-\d{2}.*$/gm],
  ['裸测试计数', /\d+\s*文件\s*\d+\s*条|（原\s*\d+\s*\/\s*\d+）/g]
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
 * 把围栏代码块与行内代码的**内容**换成等长空格（换行保留）。
 *
 * @remarks
 * Markdown 里代码跨度中的 `](x)` 是字面文本，不是链接。评审文逐字引用坏锚点的形状时
 * （`requirements/reviews/` 里那句 `` `- [:234](…#L234) …` ``），链接检查会把引文里的
 * `…` 当成死链报出来——门禁红的是被批评的样例本身，不是仓库里真有断链。
 * 留等长空格而不是整段删掉，是为了让掩码后的匹配位置仍与原文对得上。
 *
 * @param {string} text
 * @returns {string}
 */
export function maskCode(text) {
  const blank = s => s.replace(/[^\n]/g, ' ');
  // 行内代码：开合反引号串长度必须相等，所以两侧都要断言不是更长串的一截
  return maskFences(text)
    .split('\n')
    .map(line =>
      line.replace(/(?<!`)(`+)(?!`)([^\n]*?)(?<!`)\1(?!`)/g, (_m, ticks, body) => `${ticks}${blank(body)}${ticks}`)
    )
    .join('\n');
}

/**
 * 只清围栏代码块，**保留行内代码的内容**。
 *
 * @remarks
 * 标题里的行内代码是标题文本的一部分：`` ### `fetchMetadata`：对 core 的发射契约 `` 的 slug 是
 * `fetchmetadata对-core-的发射契约`。拿 {@link maskCode} 去找标题会把它抹成空白，
 * 于是每一个合法的锚点都被判成死链。
 *
 * @param {string} text
 * @returns {string}
 */
function maskFences(text) {
  const blank = s => s.replace(/[^\n]/g, ' ');
  /** @type {string | undefined} */
  let fence;
  return text
    .split('\n')
    .map(line => {
      const marker = FENCE_OPEN.exec(line);
      if (fence !== undefined) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = undefined;
        return blank(line);
      }
      if (marker) {
        fence = marker[1];
        return blank(line);
      }
      return line;
    })
    .join('\n');
}

/**
 * 按 GitHub 的标题 slug 规则把标题文本转成锚点。
 *
 * @remarks
 * 规则只有三步：**转小写 → 删掉标点与符号（原地留空位，不合并）→ 空白转连字符**。
 * 第二步是坑：`（tracked / untracked）` 里三个标点都删掉之后，`/` 两侧的空格**各自**变成
 * 一个连字符，于是 slug 里是**双**连字符 `域tracked--untracked`。少写一个，链接静默失效。
 * 全角括号、emoji 与半角标点同等对待（`\p{P}` / `\p{S}`），CJK 文字保留；`-` 与 `_` 不删。
 *
 * @param {string} heading 标题原文（不含 `#` 前缀）
 * @returns {string}
 */
export function headingSlug(heading) {
  return heading
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '$1')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, c => (c === '-' || c === '_' ? c : ''))
    .trim()
    .replace(/\s/g, '-');
}

/**
 * @param {string} text markdown 全文
 * @returns {Set<string>} 文中全部 ATX 标题的 slug
 */
function headingSlugs(text) {
  const slugs = new Set();
  for (const m of maskFences(text).matchAll(/^#{1,6}\s+(.+?)\s*$/gm)) slugs.add(headingSlug(m[1]));
  return slugs;
}

/**
 * 相对链接、行号锚点与标题锚点。只看 `](...)` 形式，跳过 http(s) / mailto，
 * 以及代码块 / 行内代码里的同形文本（见 {@link maskCode}）。
 *
 * @remarks
 * 标题锚点此前完全没查过——{@link headingSlug} 说的那个双连字符坑实测在
 * `US-306` 里踩中过一次。文件内锚点（`](#...)`）同等校验：正文重构删掉一节之后，
 * 指向它的内链会静默变成"跳转到页首"，比死链更难发现。
 *
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function checkLinks(root) {
  const offenders = [];
  const lineCountCache = new Map();
  const slugCache = new Map();
  const lineCount = async file => {
    if (!lineCountCache.has(file)) {
      const text = await readFile(file, 'utf8');
      lineCountCache.set(file, text.split('\n').length - (text.endsWith('\n') ? 1 : 0));
    }
    return lineCountCache.get(file);
  };
  const slugsOf = async file => {
    if (!slugCache.has(file)) slugCache.set(file, headingSlugs(await readFile(file, 'utf8')));
    return slugCache.get(file);
  };
  for (const file of await collectMarkdown(path.join(root, 'requirements'))) {
    if (file.endsWith('.template.md')) continue;
    const text = maskCode(await readFile(file, 'utf8'));
    const rel = path.relative(root, file);
    for (const m of text.matchAll(/\]\(([^)\s]+?)(#[^)\s]*)?\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:)/.test(target) || target.startsWith('<')) continue;
      // `](#foo)` 形式：非贪婪的 m[1] 会把整段吃进去，m[2] 落空——文件内锚点按本文件校验
      if (target.startsWith('#')) {
        const slug = decodeURI(target).slice(1);
        if (slug !== '' && !(await slugsOf(file)).has(slug))
          offenders.push(`${rel}: 标题锚点 #${slug} 在本文件里没有对应标题`);
        continue;
      }
      const resolved = path.resolve(path.dirname(file), decodeURI(target));
      let info;
      try {
        info = await stat(resolved);
      } catch {
        offenders.push(`${rel}: 链接目标不存在 → ${target}`);
        continue;
      }
      if (!info.isFile() || m[2] === undefined) continue;
      const anchor = /^#L(\d+)(?:-L(\d+))?$/.exec(m[2]);
      if (anchor) {
        const last = Number(anchor[2] ?? anchor[1]);
        const total = await lineCount(resolved);
        if (last > total) offenders.push(`${rel}: 行号锚点 ${target}${m[2]} 超出文件行数 ${total}`);
      } else if (resolved.endsWith('.md')) {
        const slug = decodeURI(m[2]).slice(1);
        if (slug !== '' && !(await slugsOf(resolved)).has(slug))
          offenders.push(`${rel}: 标题锚点 #${slug} 在 ${target} 里没有对应标题`);
      }
    }
  }
  return offenders;
}

/** 不能当证据的通用词：语言关键字与随处可见的标识符。 */
const EVIDENCE_STOPWORDS = new Set(
  [
    'this',
    'true',
    'false',
    'null',
    'void',
    'type',
    'const',
    'await',
    'async',
    'return',
    'import',
    'export',
    'from',
    'function',
    'class',
    'interface',
    'extends',
    'implements',
    'public',
    'private',
    'protected',
    'readonly',
    'static',
    'then',
    'catch',
    'throw',
    'case',
    'break',
    'default',
    'super',
    'yield',
    'undefined',
    'number',
    'string',
    'boolean',
    'object',
    'promise',
    'never',
    'unknown'
  ].map(w => w.toLowerCase())
);

/**
 * 从一段正文里取出可以当证据的符号名。
 *
 * @remarks
 * **整条 markdown 链接先丢掉**——链接文字里的 `[RxDB.ts:432-434]` 与 URL 里的路径都含目标文件名，
 * 留着它们的话，任何指向 `RxDB.ts` 的锚点都会因为 `RxDB` 三个字母"自证"成立。
 * 四字以下与语言关键字同样排除：`init` 之流在任何文件里都命中，没有判别力。
 *
 * @param {string} text
 * @returns {Set<string>}
 */
export function evidenceSymbols(text) {
  const stripped = text
    // 链接文字本身就是一段反引号符号名（`` [`runIsolated`](a.ts#L39) ``）——这是优先级 1 的正体，留下
    .replace(/\[\s*`([^`\n]+)`\s*\]\([^)\n]*\)/g, ' $1 ')
    // 其余链接整条丢弃：`[:234](…/plugin.ts#L234)` 的路径不能给自己作证
    .replace(/\[[^\]\n]*\]\([^)\n]*\)/g, ' ')
    .replace(/\*\*|~~/g, ' ');
  const out = new Set();
  for (const m of stripped.matchAll(/[A-Za-z_$][\w$]*/g)) {
    if (m[0].length < 4 || EVIDENCE_STOPWORDS.has(m[0].toLowerCase())) continue;
    out.add(m[0]);
  }
  return out;
}

/** 另起一个「证据单元」的行首：列表项、有序项、标题、表格行。 */
const EVIDENCE_BOUNDARY = /^\s*(?:[-*+] |\d+[.)] |#{1,6} |\| )/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

/**
 * 取锚点所在的「证据单元」：同一个段落 / 同一个列表项的全部行，外加紧随其后
 * （允许隔至多两个空行）的整个围栏代码块。
 *
 * @remarks
 * 边界必须切在列表项上。prettier 把长行折到下一行，符号名常常和锚点分处两行，所以不能只看本行；
 * 但要是无脑取上下各一行，密集的条目列表里**相邻条目的符号会互相串味**——上一条的 `Widget`
 * 会让下一条那个根本没有证据的裸行号看起来有证据。
 *
 * @param {string[]} lines
 * @param {number} index 锚点所在行下标
 * @returns {string}
 */
function evidenceContext(lines, index) {
  let start = index;
  while (start > 0 && !EVIDENCE_BOUNDARY.test(lines[start]) && lines[start - 1].trim() !== '') {
    start -= 1;
    if (EVIDENCE_BOUNDARY.test(lines[start])) break;
  }
  let end = index;
  while (
    end + 1 < lines.length &&
    lines[end + 1].trim() !== '' &&
    !EVIDENCE_BOUNDARY.test(lines[end + 1]) &&
    !FENCE_OPEN.test(lines[end + 1])
  ) {
    end += 1;
  }
  const parts = lines.slice(start, end + 1);
  let j = end + 1;
  while (j < lines.length && lines[j].trim() === '' && j - end <= 2) j += 1;
  const fence = FENCE_OPEN.exec(lines[j] ?? '');
  if (fence) {
    const close = new RegExp(`^ {0,3}\\${fence[1][0]}{${fence[1].length},}`);
    for (j += 1; j < lines.length && !close.test(lines[j]); j += 1) parts.push(lines[j]);
  }
  return parts.join('\n');
}

/**
 * 行号锚点的**证据**校验——CONVENTIONS 证据锚点优先级表（符号名 > 短代码引用 > 行号「不单用」）的机器版。
 *
 * @remarks
 * 既有的 `checkLinks` 只查「行号超出文件总行数」，于是上游插入几行、锚点漂到别的代码上时它全绿；
 * 上游**删**了代码反而更"安全"。真正的代价 CONVENTIONS 已经写明：不是链接坏了，
 * 是读者停止复验、转而信任叙述。这里按判别力分两级：
 *
 * - **阻断**：伴随符号一个都不在目标文件里 → 断言引用的东西已经不在那儿了，是假断言；
 * - **告警**：符号在文件里但不在所引区间内（纯行号漂移），或压根没有伴随符号（行号单用）。
 *
 * 只看指向源码的锚点；`.md` 之间的 `#L` 引用不在此列。
 *
 * @param {string} root
 * @returns {Promise<{offenders: string[], warnings: string[]}>}
 */
export async function checkAnchorEvidence(root) {
  const offenders = [];
  const warnings = [];
  const sourceCache = new Map();
  const sourceOf = async file => {
    if (!sourceCache.has(file)) {
      const text = await readFile(file, 'utf8');
      sourceCache.set(file, { text, lines: text.split('\n') });
    }
    return sourceCache.get(file);
  };
  for (const file of await collectMarkdown(path.join(root, 'requirements'))) {
    if (file.endsWith('.template.md') || NARRATIVE_EXEMPT.test(path.relative(root, file))) continue;
    const raw = await readFile(file, 'utf8');
    const rel = path.relative(root, file);
    const lines = raw.split('\n');
    const masked = maskCode(raw).split('\n');
    for (const [index, line] of masked.entries()) {
      for (const m of line.matchAll(/\]\(([^)\s]+?)(#L(\d+)(?:-L(\d+))?)\)/g)) {
        const target = m[1];
        if (/^(https?:|mailto:)/.test(target) || target.endsWith('.md')) continue;
        const resolved = path.resolve(path.dirname(file), decodeURI(target));
        let source;
        try {
          source = await sourceOf(resolved);
        } catch {
          continue; // 目标不存在由 checkLinks 报
        }
        const symbols = evidenceSymbols(evidenceContext(lines, index));
        const where = `${rel}:${index + 1}: ${target}${m[2]}`;
        if (symbols.size === 0) {
          warnings.push(`${where} 没有伴随的符号名或代码引用（CONVENTIONS 优先级 3：行号不单用）`);
          continue;
        }
        const present = [...symbols].filter(s => source.text.includes(s));
        if (present.length === 0) {
          offenders.push(`${where} 的伴随符号 ${[...symbols].join(' / ')} 在 ${target} 里不存在`);
          continue;
        }
        const range = source.lines.slice(Number(m[3]) - 1, Number(m[4] ?? m[3])).join('\n');
        if (!present.some(s => range.includes(s)))
          warnings.push(
            `${where} 所引区间不含 ${present.slice(0, 4).join(' / ')}${present.length > 4 ? ' 等' : ''}，行号已漂`
          );
      }
    }
  }
  return { offenders, warnings };
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

  const evidence = await checkAnchorEvidence(root);
  const offenders = [
    ...checkFrontmatter(stories, new Set(epics.map(e => e.id))),
    ...checkStatusOverview(await readFile(overviewPath, 'utf8'), stories),
    ...checkReadme(await readFile(readmePath, 'utf8'), counts),
    ...checkEpics(epics, stories),
    ...(await checkLinks(root)),
    ...evidence.offenders
  ];
  const warnings = [
    ...(await scanNarrative(root)).map(
      ({ rel, hits }) => `${rel}: ${hits.map(([label, n]) => `${label}×${n}`).join('，')}`
    ),
    ...evidence.warnings
  ];
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
