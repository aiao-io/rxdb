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
 * 3. epic 数字编号唯一、文件名与 frontmatter id 一致；`status` 与归属它的故事一致：`Done` 的 epic 不得持有 In Progress / Backlog 故事，
 *    `Backlog` 的 epic 不得持有已开工故事；`In Progress` 不作约束（epic-005 全绿但发布门禁未审计，
 *    epic-007 只有一条故事却还有无主目标，都是有意的）；
 * 4. `README.md` 的「N/M 已交付」等于 Done / 合计；
 * 5. `requirements/**\/*.md` 里的相对链接都能解析到文件；指向源码的 `#L<n>` 行号锚点不得超过文件行数——
 *    CONVENTIONS 说「锚点失效的真实代价不是链接坏了，是读者停止复验」；
 * 6. CONVENTIONS「过程留档的去向」禁止进正文的叙述词（`已于 X 日`、删除线、`落地偏差`……）
 *    只**告警**不阻塞：存量太多，先让它可见，再逐条烧掉。
 * 7. 验收与真相源对齐：Done 故事的当前承诺 AC 不得残留 ⬜ / ⚠️，In Review 故事的当前承诺 AC 不得已经
 *    全部 ✅（实现 PR 内直接标 Done）；`inherited_acs` 的 `from` 必须指向存在的 story、纯数字 `ac`
 *    不得超出源故事 AC 最大编号；显式标为候选 / 移出的 AC 必须登记 `candidate_acs`。
 * 8. README「大故事」清单与「正文含交付阶段」的 story 集合一致；
 *    capability-matrix / versioning-policy 手写的包计数等于 packages/ 与 api-baseline/ 的实际值。
 * 9. 生成段落没有过期：`status-overview.md` 的进行中 / 待评审 / 阻塞三节与按 Epic 索引、
 *    `requirements/README.md` 的 Epic 清单，必须等于现在重新生成一遍的结果；
 * 10. AC 表的状态格都以 ✅ / ⚠️ / ⬜ 开头；全部需求根（根目录与各应用、各产品的 `requirements/`）下的
 *     表格行都长在表格里（行前多一个空行就会掉出表格，渲染成一串竖线）；
 * 11. 全部需求根下，故事验收证据区里的日期与裸测试计数只减不增：存量按故事编号记在
 *     `requirements-evidence-baseline.json`，新故事必须为零；带 frontmatter 的故事必须有 `id` 且编号不重复。
 *
 * 第 9 条只生成根 `requirements/` 的视图；应用与产品目录的派生视图仍是手写的，由它们各自的门禁核对。
 *
 * `--update` 重写机器能唯一确定的内容：数字（汇总表、标题里的条数、README 的 N/M）、第 9 条的生成段落，
 * 并把第 11 条的基线收紧到现状（只降不升）。epic `status`、死链、表格与证据区的新增**不自动改**——那些是判断，
 * 不是派生。`--rebaseline-evidence` 按现状重建基线，是唯一能上调基线的入口。
 *
 * @example
 * ```bash
 * pnpm audit:requirements            # --check，CI 每个 PR 跑
 * pnpm audit:requirements:update     # 改完 story 后同步数字与生成段落
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
 * 验收日期、评审轮次、修复标签与历史标题针对同一种病：把**过程**写进正文。`（已修）` / `（未修）` 是按时间轴记账，
 * 读者要自己算「现在到底是什么状态」；带日期的三级标题把一次 PR 的切片留成了永久章节；
 * `历史快照` 明说了这段已被别处取代，却仍占着正文。
 * 最后一条是 `\d+ 文件 \d+ 条` 这类裸测试计数——它天然会烂（实测 US-905 里三处互不相同），
 * 正确写法是给出复现命令而不是数字，见 CONVENTIONS「结论必须写出复验方式」。
 */
export const NARRATIVE_PATTERNS = [
  ['已于 X 日', /已于\s*\*{0,2}(?:\d{4}-\d{2}-\d{2}|\d{1,2}-\d{1,2})/g],
  ['删除线', /~~[^~\n]+~~/g],
  ['原判定', /原判定/g],
  ['落地偏差', /落地偏差/g],
  ['第 N 轮复核 / 评审', /第\s*[一二三四五六七八九十\d]+\s*轮(?:复核|评审)/g],
  ['后续变更', /后续变更/g],
  ['已修 / 未修', /（\s*\**\s*(?:已修|未修)[^）\n]*）/g],
  [
    '历史快照',
    // 只在「给一段内容贴标签」时才算：自指的章节说明、标题、加粗。裸写的「历史快照」是
    // undo/redo 的领域名词（`HistoryManager` 的物化视图），把它一并报出来，这张告警表就
    // 永远清不到零——而清不到零的表，读者会整张忽略。
    /(?:本节|本段|以下|下面|上面|前文|这一?[段节])[^\n。]{0,20}历史快照|^#{1,6}[^\n]*历史快照|\*\*[^*\n]*历史快照[^*\n]*\*\*|被[^\n。]{0,20}整节取代/gm
  ],
  ['带日期的验收记录', /(?:验收注记[（(][^）)\n]*|验证日期[：:]\s*)\d{4}-\d{2}-\d{2}/g],
  ['带日期的标题', /^#{2,6} .*\d{4}-\d{2}-\d{2}.*$/gm],
  ['裸测试计数', /\d+\s*文件\s*\d+\s*条|（原\s*\d+\s*\/\s*\d+）/g]
];

/**
 * 叙述词扫描不看的路径：约定本身、评审记录与 code scanning 跟踪（那些是**记录**不是需求）、模板。
 *
 * @remarks
 * `code-scanning/` 自述「工作集，不是档案库」：按批次归档、每批带报出与关闭日期，那正是它的
 * 正文体裁。同 `reviews/`——记录类文档里，日期和批次编号是内容，不是该烧掉的过程叙述。
 *
 * 注意这份名单同时被 {@link checkAnchorEvidence} 用来跳过锚点校验。
 */
const NARRATIVE_EXEMPT = /(^|\/)(CONVENTIONS\.md|reviews\/|code-scanning\/|.*\.template\.md)/;

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
    const text = await readFile(file, 'utf8');
    const fm = parseFrontmatter(text);
    if (!fm) continue;
    stories.push({ file, rel: path.relative(root, file), fm, text, id: fm.id ?? path.basename(file).slice(0, 6) });
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

const summaryRowRegex = row => new RegExp(`^(\\| ${escapeRegex(row)}\\s*\\| )(\\d+)(\\s*\\|)[ \\t]*$`, 'm');
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

/**
 * `status-overview.md` 里整段由故事 YAML 生成的三节：标题里的名字、对应状态、没有故事时的整段文字。
 *
 * @remarks
 * 这三节与按 Epic 索引都写成列表而不是表格：prettier 按 string-width 对齐表格列，脚本重排整张表会让
 * `format:check` 变红（见 {@link updateStatusOverview}），列表没有这个问题。
 */
const STATUS_SECTIONS = [
  ['进行中', 'In Progress', '当前没有进行中的故事。'],
  ['待评审', 'In Review', '当前没有待评审的故事。'],
  ['阻塞', 'Blocked', '当前没有 YAML 显式标为 Blocked 的故事；不等于其他故事没有前置。']
];

/** 索引里的故事行；生成时整批替换，小节里其余的行是手写说明。 */
const STORY_INDEX_LINE = /^\s*- (?:✅|🚧|👀|⬜|🚫) \[US-\d+\b/;

const storyNumber = id => Number(/(\d+)$/.exec(id)?.[1] ?? 0);
const byStoryNumber = (a, b) => storyNumber(a.id) - storyNumber(b.id);
/** story 相对 `requirements/` 的链接：派生视图都放在那一层。 */
const storyLink = story =>
  `[${story.id} ${story.fm.title}](${story.rel
    .split(path.sep)
    .join('/')
    .replace(/^requirements\//, '')})`;

const epicKey = epic => path.basename(epic.file, '.md');
const epicNumber = epic => Number(/^epic-(\d+)/.exec(epicKey(epic))?.[1] ?? 0);
const byEpicOrder = (a, b) => epicNumber(a) - epicNumber(b) || epicKey(a).localeCompare(epicKey(b));
/** 没有一级标题的 epic 先用文件名占位，同时由 {@link checkGeneratedViews} 报出，不会悄悄过去。 */
const epicTitle = epic => epic.title ?? epicKey(epic);

/** 把升序编号压成 `#2～#4、#6`：三个及以上连续才写成区间。 */
function acRanges(ids) {
  const parts = [];
  for (let i = 0; i < ids.length;) {
    let j = i;
    while (j + 1 < ids.length && ids[j + 1] === ids[j] + 1) j++;
    if (j - i >= 2) parts.push(`#${ids[i]}～#${ids[j]}`);
    else for (let k = i; k <= j; k++) parts.push(`#${ids[k]}`);
    i = j + 1;
  }
  return parts.join('、');
}

/**
 * 验收标准一节里 AC 表的编号行。AC 表按表头认：末列是「状态」的才是。
 *
 * @remarks
 * 同一节里还会有按 AC 编号排的证据表、归属表（末列是「证据」「测试」「谁最终关闭」……），它们的行不是 AC。
 * 按表头认而不是按「状态格里有没有状态符号」认，状态格空着或写了别的字的 AC 才不会被当成证据行漏掉。
 *
 * @param {string} text story 全文
 * @returns {Array<{id: number, status: string, symbol: string | undefined}>} `symbol` 是状态格开头的 ✅ / ⚠️ / ⬜，认不出时为 undefined
 */
function acTableRows(text) {
  const body = text.split(/^## 验收标准\s*$/m)[1]?.split(/^##\s/m)[0] ?? '';
  const rows = [];
  let inTable = false;
  let isAcTable = false;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) {
      inTable = false;
      continue;
    }
    const cells = line
      .replace(/^\||\|$/g, '')
      .split('|')
      .map(cell => cell.trim());
    if (!inTable) {
      inTable = true;
      isAcTable = cells.at(-1) === '状态';
      continue;
    }
    if (isAcTable && /^\d+$/.test(cells[0]))
      rows.push({ id: Number(cells[0]), status: cells.at(-1), symbol: /^(✅|⚠️|⬜)/u.exec(cells.at(-1))?.[1] });
  }
  return rows;
}

/**
 * AC 表的状态格必须以 ✅ / ⚠️ / ⬜ 开头。空着或写了别的字，这条 AC 就既不算通过也不算未通过，
 * 会从「还差什么」里消失。
 *
 * @param {Array<{rel: string, text: string}>} stories
 * @returns {string[]}
 */
export function checkAcStatusCells(stories) {
  const offenders = [];
  for (const { rel, text } of stories) {
    for (const { id, status, symbol } of acTableRows(text)) {
      if (symbol === undefined)
        offenders.push(`${rel}: AC#${id} 的状态格必须以 ✅ / ⚠️ / ⬜ 开头（现为「${status}」）`);
    }
  }
  return offenders;
}

/**
 * 一句话说明这条故事还差哪些当前承诺的 AC，派生视图里「进行中 / 待评审」各行用它。
 *
 * 登记在 `candidate_acs` 里的候选 AC 不参与；状态格认不出来的 AC 按未通过算（同时由 {@link checkAcStatusCells} 报出）。
 *
 * @param {{fm: Record<string, string>, text: string}} story
 * @returns {string}
 */
export function openAcSummary({ fm, text }) {
  const rows = acTableRows(text);
  if (rows.length === 0) return 'AC 不是数字编号，见故事';
  const candidates = candidateAcIds({ rel: '', fm, text }, []);
  const current = rows.filter(row => !candidates.has(row.id));
  if (current.length === 0) return '只有候选 AC，没有当前承诺的 AC';
  const open = current.filter(row => row.symbol !== '✅').map(row => row.id);
  if (open.length === 0) return 'AC 已全部通过';
  return `未通过 AC${acRanges(open.sort((a, b) => a - b))}（${open.length}/${current.length}）`;
}

/** 把 `## 标题` 到下一个二级标题之间的正文整段换掉；找不到标题时原样返回，缺标题由检查报出。 */
function replaceSectionBody(text, heading, body) {
  const match = heading.exec(text);
  if (!match) return text;
  const start = match.index + match[0].length;
  const next = /^## /m.exec(text.slice(start));
  const rest = next ? text.slice(start + next.index) : '';
  return `${text.slice(0, start)}\n\n${body}\n${rest ? `\n${rest}` : ''}`;
}

/** 拆出「按 Epic 索引」一节：前言、已知史诗各自的手写说明、指向不存在史诗的小节原文。 */
function parseEpicIndex(body, epics) {
  const known = new Set(epics.map(epicKey));
  const parts = body.split(/^(?=### )/m);
  const prose = new Map();
  const unknown = [];
  for (const part of parts.slice(1)) {
    const lines = part.split('\n');
    const key = /^### \[[^\]]*\]\(epics\/([^)]+)\.md\)[ \t]*$/.exec(lines[0])?.[1];
    if (key === undefined || !known.has(key)) {
      unknown.push({ key: key ?? lines[0], text: part.trim() });
      continue;
    }
    prose.set(
      key,
      lines
        .slice(1)
        .filter(line => !STORY_INDEX_LINE.test(line))
        .join('\n')
        .trim()
    );
  }
  return { preamble: parts[0].trim(), prose, unknown };
}

function renderEpicIndex(text, stories, epics) {
  const heading = /^## 按 Epic 索引[ \t]*$/m.exec(text);
  if (!heading) return text;
  const start = heading.index + heading[0].length;
  const next = /^## /m.exec(text.slice(start));
  const body = next ? text.slice(start, start + next.index) : text.slice(start);
  const { preamble, prose, unknown } = parseEpicIndex(body, epics);
  const blocks = preamble ? [preamble] : [];
  for (const epic of [...epics].sort(byEpicOrder)) {
    const block = [`### [${epicTitle(epic)}](epics/${epicKey(epic)}.md)`];
    if (prose.get(epicKey(epic))) block.push(prose.get(epicKey(epic)));
    const owned = stories.filter(story => story.fm.epic === epic.id).sort(byStoryNumber);
    if (owned.length)
      block.push(owned.map(story => `- ${STATUS_EMOJI[story.fm.status]} ${storyLink(story)}`).join('\n'));
    blocks.push(block.join('\n\n'));
  }
  // 指向不存在史诗的小节不删：标题下可能有手写说明，改好链接之后再生成。
  blocks.push(...unknown.map(section => section.text));
  return replaceSectionBody(text, /^## 按 Epic 索引[ \t]*$/m, blocks.join('\n\n'));
}

/**
 * 重新生成 `status-overview.md` 里能由故事 YAML 唯一确定的全部内容：汇总表数字、进行中 / 待评审 / 阻塞三节、
 * 按 Epic 索引的小节标题与故事列表。索引各小节标题下的说明文字、其余章节都是手写的，原样保留。
 *
 * @remarks
 * 手写这些段落时，每加一条故事要同步改四五处，漏一处门禁才报；两条分支各加一行又必然冲突。
 * 生成之后冲突的解法只剩一种：任取一侧，再跑一次 `--update`。
 *
 * @param {string} text status-overview.md 全文
 * @param {Awaited<ReturnType<typeof collectStories>>} stories
 * @param {Awaited<ReturnType<typeof collectEpics>>} epics
 * @returns {string}
 */
export function renderStatusOverview(text, stories, epics) {
  const counts = countStatuses(stories);
  let next = updateStatusOverview(text, counts);
  for (const [name, status, empty] of STATUS_SECTIONS) {
    const rows = stories.filter(story => story.fm.status === status).sort(byStoryNumber);
    const body = rows
      .map(story => (status === 'Blocked' ? `- ${storyLink(story)}` : `- ${storyLink(story)}：${openAcSummary(story)}`))
      .join('\n');
    next = next.replace(new RegExp(`^## ${name}（\\d+ 条）`, 'm'), `## ${name}（${rows.length} 条）`);
    next = replaceSectionBody(next, new RegExp(`^## ${name}（\\d+ 条）[ \\t]*$`, 'm'), body || empty);
  }
  return renderEpicIndex(next, stories, epics);
}

const README_EPIC_LIST = /^Epic：[ \t]*\n\n(?:- .*\n)*/m;

/**
 * 重新生成 `requirements/README.md`「快速导航」里的 Epic 清单：一行一个 epic 文件，名字取它的一级标题。
 *
 * @param {string} text requirements/README.md 全文
 * @param {Awaited<ReturnType<typeof collectEpics>>} epics
 * @returns {string} 找不到「Epic：」时原样返回，由 {@link checkGeneratedViews} 报出
 */
export function renderEpicList(text, epics) {
  const list = [...epics]
    .sort(byEpicOrder)
    .map(
      epic =>
        `- [${/^epic-\d+/.exec(epicKey(epic))?.[0] ?? epicKey(epic)} ${epicTitle(epic)}](epics/${epicKey(epic)}.md)`
    )
    .join('\n');
  return text.replace(README_EPIC_LIST, () => `Epic：\n\n${list}\n`);
}

/**
 * 生成段落必须等于「现在重新生成一遍」的结果，否则就是过期了。
 *
 * @param {{overview: string, readme: string}} views status-overview.md 与 requirements/README.md 全文
 * @param {Awaited<ReturnType<typeof collectStories>>} stories
 * @param {Awaited<ReturnType<typeof collectEpics>>} epics
 * @returns {string[]}
 */
export function checkGeneratedViews({ overview, readme }, stories, epics) {
  const offenders = [];
  for (const epic of epics) {
    if (epic.title === undefined) offenders.push(`${epic.rel}: 缺一级标题，派生视图用它作史诗名`);
  }
  for (const [name] of STATUS_SECTIONS) {
    if (!new RegExp(`^## ${name}（\\d+ 条）[ \\t]*$`, 'm').test(overview))
      offenders.push(`status-overview.md: 缺「## ${name}（N 条）」一节`);
  }
  const index = /^## 按 Epic 索引[ \t]*$/m.exec(overview);
  if (!index) offenders.push('status-overview.md: 缺「## 按 Epic 索引」一节');
  else {
    const body = overview.slice(index.index + index[0].length).split(/^## /m)[0];
    for (const { key } of parseEpicIndex(body, epics).unknown)
      offenders.push(
        `status-overview.md: 索引小节指向不存在的 ${key}（先把小节标题的链接改到现有的 epic 文件，再跑 pnpm audit:requirements:update）`
      );
  }
  const expected = renderStatusOverview(overview, stories, epics);
  if (expected !== overview) {
    const want = expected.split('\n');
    const line = overview.split('\n').findIndex((have, i) => have !== want[i]);
    offenders.push(
      `status-overview.md: 生成段落与故事 YAML 不一致（第 ${line + 1} 行起），跑 pnpm audit:requirements:update`
    );
  }
  if (!README_EPIC_LIST.test(readme)) offenders.push('requirements/README.md: 找不到「Epic：」清单');
  else if (renderEpicList(readme, epics) !== readme)
    offenders.push('requirements/README.md: Epic 清单与 epics/ 目录不一致，跑 pnpm audit:requirements:update');
  return offenders;
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

const ROADMAP_OPEN_COUNT = /仓库还剩 \*\*(\d+) 条\*\*未关闭故事（(\d+) In Progress \+ (\d+) In Review \+ (\d+) Backlog/;

/** roadmap「现状快照」表的五态行，首列原文与 status-overview 汇总表相同；末行是加粗的未完成合计，另配正则。 */
const ROADMAP_SNAPSHOT_ROWS = SUMMARY_ROWS.filter(([, key]) => key !== 'total');
const ROADMAP_OPEN_TOTAL_ROW = /^(\| \*\*未完成合计\*\*\s*\| )(\*\*(\d+)\*\*)(\s*\|)[ \t]*$/m;

function markdownSection(text, heading) {
  const start = new RegExp(`^## ${escapeRegex(heading)}[ \\t]*\\r?\\n`, 'm').exec(text);
  if (!start) return '';
  return text.slice(start.index + start[0].length).split(/^## /m)[0];
}

function checkRoadmapRowStatuses(text, stories) {
  const byId = new Map(stories.map(story => [story.id, story.fm.status]));
  const rows = markdownSection(text, '未完成需求全景').matchAll(
    /^\|([^|]+)\|\s*(?:✅|🚧|👀|⬜|📝|🚫)\s*(Done|In Progress|In Review|Backlog|Blocked)\s*\|/gm
  );
  const offenders = [];
  for (const [, cell, status] of rows) {
    const ids = new Set([...cell.matchAll(/\[(US-\d+)\b/g)].map(match => match[1]));
    for (const id of ids) {
      const actual = byId.get(id);
      if (actual && actual !== status)
        offenders.push(`roadmap.md: 未完成需求全景 ${id} 标 ${status}，YAML 是 ${actual}`);
    }
  }
  return offenders;
}

/**
 * 校验 `roadmap.md`：未关闭故事的条数与分项，以及**每条未关闭故事都在排期里露过面**。
 *
 * 后者是这份审计最容易漏的一类：故事的 frontmatter、status-overview 索引、epic 反链可以全对，
 * 它却在 roadmap 的批次表与「明确不排期」里一次都没出现——于是谁也不知道它该什么时候做。
 * US-024 就是这么漏了一个月的。只查「出现过」不查「在哪个批次」：排期归属是人的判断，
 * 但「压根没提」一定是漏，而漏了可以机器判。
 *
 * @param {string} text roadmap.md 全文
 * @param {Array<{id: string, fm: Record<string, string>}>} stories
 * @returns {string[]}
 */
export function checkRoadmap(text, stories) {
  const offenders = checkRoadmapRowStatuses(text, stories);
  const counts = countStatuses(stories);
  const open = counts.total - counts.Done;
  const m = ROADMAP_OPEN_COUNT.exec(text);
  if (!m) offenders.push('roadmap.md: 找不到「仓库还剩 **N 条**未关闭故事（a In Progress + b In Review + c Backlog」');
  else {
    const expected = [open, counts['In Progress'], counts['In Review'], counts.Backlog];
    const labels = ['未关闭合计', 'In Progress', 'In Review', 'Backlog'];
    for (const [i, want] of expected.entries()) {
      if (Number(m[i + 1]) !== want) offenders.push(`roadmap.md: 「${labels[i]}」写 ${m[i + 1]}，YAML 推导为 ${want}`);
    }
  }
  // 现状快照表与上面那句是同一组数。只查那一句的话，手改时漏掉表里的格子不会报（RV-083 P1-1：表写 1 / 29，句子写 2 / 30）
  for (const [label, key] of ROADMAP_SNAPSHOT_ROWS) {
    const row = summaryRowRegex(label).exec(text);
    if (!row) offenders.push(`roadmap.md: 现状快照缺「${label}」行`);
    else if (Number(row[2]) !== counts[key])
      offenders.push(`roadmap.md: 现状快照「${label}」写 ${row[2]}，YAML 推导为 ${counts[key]}`);
  }
  const total = ROADMAP_OPEN_TOTAL_ROW.exec(text);
  if (!total) offenders.push('roadmap.md: 现状快照缺「**未完成合计**」行');
  else if (Number(total[3]) !== open)
    offenders.push(`roadmap.md: 现状快照「未完成合计」写 ${total[3]}，YAML 推导为 ${open}`);
  for (const { id, fm } of stories) {
    if (fm.status === 'Done') continue;
    if (!new RegExp(`\\b${escapeRegex(id)}\\b`).test(text))
      offenders.push(`roadmap.md: ${id}（${fm.status}）未关闭，却没有排进任何批次、也不在「明确不排期」里`);
  }
  return offenders;
}

/**
 * 回写 roadmap 的未关闭那句与现状快照表；表格同 {@link updateStatusOverview}，只改数字、不动列宽。
 *
 * @param {string} text @param {Record<string, number>} counts
 */
export function updateRoadmap(text, counts) {
  const open = counts.total - counts.Done;
  let next = text.replace(
    ROADMAP_OPEN_COUNT,
    `仓库还剩 **${open} 条**未关闭故事（${counts['In Progress']} In Progress + ${counts['In Review']} In Review + ${counts.Backlog} Backlog`
  );
  for (const [label, key] of ROADMAP_SNAPSHOT_ROWS) {
    next = next.replace(summaryRowRegex(label), (_m, head, digits, tail) => {
      const cell = String(counts[key]).padEnd(digits.length + tail.length - 1);
      return `${head}${cell}|`;
    });
  }
  return next.replace(ROADMAP_OPEN_TOTAL_ROW, (_m, head, bold, _digits, tail) => {
    const cell = `**${open}**`.padEnd(bold.length + tail.length - 1);
    return `${head}${cell}|`;
  });
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
    const listedStoryIds = new Set(
      [...markdownSection(text, '故事').matchAll(/\(\.\.\/stories\/[^)]*?(US-\d+)-[^)]*\.md\)/g)].map(m => m[1])
    );
    epics.push({
      file,
      rel: path.relative(root, file),
      id: fm.id ?? path.basename(file, '.md'),
      // 派生视图里的史诗名取正文一级标题；缺了由 checkGeneratedViews 报出。
      title: /^# +(.+?)[ \t]*$/m.exec(text.replace(/^---\r?\n[\s\S]*?\r?\n---/, ''))?.[1],
      fm,
      storyIds,
      listedStoryIds
    });
  }
  return epics;
}

/**
 * epic 数字编号唯一、文件名与 id 一致，状态符合故事约束，且 epic ↔ story 双向引用完整。
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
  const byNumber = new Map();
  for (const epic of epics) {
    if (path.basename(epic.file, '.md') !== epic.id)
      offenders.push(`${epic.rel}: 文件名必须与 frontmatter id ${epic.id} 一致`);
    const number = /^epic-(\d+)-/.exec(epic.id);
    const previous = number && byNumber.get(Number(number[1]));
    if (previous) offenders.push(`${epic.rel}: epic-${number[1]} 编号重复，已由 ${previous} 使用`);
    if (number) byNumber.set(Number(number[1]), epic.id);
    for (const id of epic.storyIds) {
      if (!byId.has(id)) offenders.push(`${epic.rel}: 链接到不存在的故事 ${id}`);
    }
  }
  for (const story of stories) {
    const owner = epicById.get(story.fm.epic);
    if (!owner) continue;
    const status = story.fm.status;
    if (!owner.listedStoryIds.has(story.id))
      offenders.push(`${story.rel}: 声明 epic ${story.fm.epic}，但该 epic 的故事清单没有链接到它`);
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

/**
 * AC 表区域（`## 验收标准` 与下一个 `## ` 标题之间）里带编号的行，返回编号数组。
 * 分阶段故事的行编号仍用纯数字（如 US-012），Given/When/Then 类故事没有编号行，返回空。
 *
 * @param {string} text story 全文
 */
export function acIdsOf(text) {
  const section = text.split(/^## 验收标准\s*$/m)[1] ?? '';
  const body = section.split(/^##\s/m)[0] ?? '';
  const ids = [];
  for (const line of body.split('\n')) {
    const m = /^\|\s*(\d+)\s*\|/.exec(line.trim());
    if (m) ids.push(Number(m[1]));
  }
  return ids;
}

function candidateAcIds({ rel, fm, text }, offenders) {
  if (fm.candidate_acs === undefined) return new Set();
  let ids;
  try {
    ids = JSON.parse(fm.candidate_acs);
  } catch {
    offenders.push(`${rel}: candidate_acs 必须是整数数组`);
    return new Set();
  }
  if (!Array.isArray(ids) || ids.some(id => !Number.isInteger(id) || id < 1) || new Set(ids).size !== ids.length) {
    offenders.push(`${rel}: candidate_acs 必须是不重复的正整数数组`);
    return new Set();
  }
  const known = new Set(acIdsOf(text));
  const missing = ids.filter(id => !known.has(id));
  if (missing.length) offenders.push(`${rel}: candidate_acs 引用了不存在的 AC ${missing.join(' / ')}`);
  return new Set(ids);
}

/**
 * 状态格以状态符号开头的才是 AC 行。验收标准一节里还会有按 AC 编号排的证据表，
 * 它们的末格是一段说明，按「未通过」数就会让任何带证据表的故事都显得还有待办。
 */
const AC_STATUS_CELL = /^\s*(✅|⚠️|⬜)/u;

/**
 * story 状态与 AC 符号的对应关系。候选 AC 由 candidate_acs 显式登记，保留未验状态，不参与下面两条：
 *
 * - `Done` 的当前承诺 AC 必须全部 ✅：残留 ⬜ 或 ⚠️ 都阻断；
 * - `In Review` 至少要有一条未 ✅ 的当前承诺 AC 说明还差什么。全部 ✅ 就在实现 PR 内直接标 `Done`——
 *   等合并后再开一个 PR 补标，这一步没人做，状态就停在 In Review。
 *
 * 候选编号不存在、重复或提前标 ✅ 同样阻断，避免候选范围成为隐藏未完成工作的缺口。
 *
 * @remarks
 * 没有数字编号 AC 行的故事（Given / When / Then 形态）读不到 AC，两条状态规则都不判。
 *
 * @param {Array<{rel: string, fm: Record<string, string>, text: string}>} stories
 */
export function checkAcSymbols(stories) {
  const offenders = [];
  for (const story of stories) {
    const { rel, fm, text } = story;
    const candidates = candidateAcIds(story, offenders);
    const section = text.split(/^## 验收标准\s*$/m)[1];
    if (!section) continue;
    const body = section.split(/^##\s/m)[0];
    let current = 0;
    let open = 0;
    for (const line of body.split('\n')) {
      const id = /^\|\s*(\d+)\s*\|/.exec(line.trim());
      if (!id) continue;
      const cells = line.trim().replace(/\|$/, '').split('|');
      const status = cells[cells.length - 1] ?? '';
      const candidate = candidates.has(Number(id[1]));
      if (!candidate && /^\s*(?:⚠️|⬜)?\s*(?:候选|移出)/u.test(status))
        offenders.push(`${rel}: AC#${id[1]} 标为候选或移出，必须登记 candidate_acs`);
      if (candidate && status.includes('✅'))
        offenders.push(`${rel}: 候选 AC#${id[1]} 不得标 ✅，解锁后应移除候选登记`);
      if (fm.status === 'Done' && !candidate && status.includes('⬜'))
        offenders.push(`${rel}: Done 故事的 AC 行仍标 ⬜（应补齐验收；候选范围须登记 candidate_acs）`);
      const symbol = AC_STATUS_CELL.exec(status)?.[1];
      if (candidate || symbol === undefined) continue;
      current++;
      if (symbol !== '✅') open++;
      if (fm.status === 'Done' && symbol === '⚠️')
        offenders.push(
          `${rel}: Done 故事的 AC#${id[1]} 仍标 ⚠️（有保留就留在 In Review 并写明还差什么；候选范围须登记 candidate_acs）`
        );
    }
    if (fm.status === 'In Review' && current > 0 && open === 0)
      offenders.push(
        `${rel}: In Review 故事的当前承诺 AC 已全部 ✅（在实现 PR 内直接标 Done；确有待办就保留一条未 ✅ 的 AC 写明还差什么）`
      );
  }
  return offenders;
}

/**
 * inherited_acs 是接收方声明的机器可读真相：`from` 必须指向存在的 story，
 * 纯数字 `ac` 不得超过源故事 AC 表里的最大编号。不按行数判：表里有空洞、不按编号排序时
 * 行数小于最大编号，表里还在的高编号会被误拒；也不要求编号在表里——移出的 AC 按约定从源表删除。
 * `US1-AC4` 这类复合编号留人工核对。
 *
 * @param {Array<{id: string, rel: string, fm: Record<string, string>, text: string}>} stories
 */
export function checkInheritedAcs(stories) {
  const offenders = [];
  const byId = new Map(stories.map(s => [s.id, s]));
  for (const { rel, fm } of stories) {
    const raw = fm.inherited_acs ?? '';
    for (const entry of raw.split(/(?=-\s+from:)/)) {
      const from = /-\s+from:\s*(US-\d+)/.exec(entry);
      if (!from) continue;
      const source = byId.get(from[1]);
      if (!source) {
        offenders.push(`${rel}: inherited_acs 的 from ${from[1]} 没有对应的故事文件`);
        continue;
      }
      const ac = /ac:\s*(\d+)/.exec(entry);
      const maxId = Math.max(0, ...acIdsOf(source.text));
      if (ac && Number(ac[1]) > maxId)
        offenders.push(`${rel}: inherited_acs 的 ac ${ac[1]} 超出 ${from[1]} 验收标准表的最大编号 ${maxId}`);
    }
  }
  return offenders;
}

/**
 * README「大故事」清单必须与「正文含交付阶段」的 story 文件集合一致。
 * 清单是手写维护的派生视图，历史上 13 条清单对 19 条实际都未被任何门禁发现。
 *
 * @param {string} readmeText requirements/README.md 全文
 * @param {Array<{id: string, text: string}>} stories
 */
export function checkBigStoryList(readmeText, stories) {
  const actual = stories
    .filter(s => s.text.includes('交付阶段'))
    .map(s => s.id)
    .sort();
  const count = /现有\s*(\d+)\s*条：/.exec(readmeText);
  // 清单整段缺失（或引导语被改掉）同样是派生视图失真；只有确实没有大故事时才不要求清单
  if (!count) {
    if (actual.length === 0) return [];
    return [`requirements/README.md: 缺少大故事清单「现有 N 条：」，实际 ${actual.length} 条：${actual.join(' ')}`];
  }
  const paragraph = readmeText.slice(count.index + count[0].length).split('\n\n')[0];
  const listed = [...paragraph.matchAll(/\((stories\/[^)]+)\)/g)].map(m => path.basename(m[1]).slice(0, 6)).sort();
  const offenders = [];
  if (Number(count[1]) !== actual.length)
    offenders.push(`requirements/README.md: 大故事清单写「现有 ${count[1]} 条」，实际 ${actual.length} 条`);
  if (listed.length !== actual.length || listed.some((id, i) => id !== actual[i]))
    offenders.push(
      `requirements/README.md: 大故事清单与「正文含交付阶段」的故事不一致（清单 ${listed.join(' ') || '（空）'}，实际 ${actual.join(' ') || '（空）'}）`
    );
  return offenders;
}

/**
 * capability-matrix 与 versioning-policy 手写的公开包 / 受基线保护包计数必须等于实际。
 * 这两处此前长期停在「31 / 30」，而真相源（packages/ 与 api-baseline/）一直在变。
 *
 * @param {string} root 仓库根
 */
export async function checkPackageCounts(root) {
  const offenders = [];
  const pkgs = [];
  for (const entry of await readdir(path.join(root, 'packages'), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgJson = path.join(root, 'packages', entry.name, 'package.json');
    let json;
    try {
      json = JSON.parse(await readFile(pkgJson, 'utf8'));
    } catch {
      continue; // 无 package.json 的目录壳（如已废弃的 rxdb-adapter-desktop）不计
    }
    if (!json.private) pkgs.push(entry.name);
  }
  let baselines = [];
  try {
    baselines = (await readdir(path.join(root, 'requirements', 'api-baseline'))).filter(f => f.endsWith('.json'));
  } catch {
    // api-baseline/ 不存在时跳过计数比对（测试脚手架与最小仓库没有该目录）
  }
  let matrix;
  try {
    matrix = await readFile(path.join(root, 'requirements', 'capability-matrix.md'), 'utf8');
  } catch {
    matrix = '';
  }
  const matrixTotal = /\*\*(\d+) 个\*\* `packages\/\*`/.exec(matrix);
  const matrixGuarded = /其中 \*\*(\d+) 个\*\*受 API baseline 保护/.exec(matrix);
  if (matrixTotal && Number(matrixTotal[1]) !== pkgs.length)
    offenders.push(`capability-matrix.md: 公开包写 ${matrixTotal[1]} 个，实际 ${pkgs.length} 个`);
  if (matrixGuarded && Number(matrixGuarded[1]) !== baselines.length)
    offenders.push(`capability-matrix.md: 受基线保护写 ${matrixGuarded[1]} 个，实际 ${baselines.length} 个`);
  let policy;
  try {
    policy = await readFile(path.join(root, 'requirements', 'versioning-policy.md'), 'utf8');
  } catch {
    policy = '';
  }
  const policyCounts = /当前 \*\*(\d+) 个\*\*，其中 (\d+) 个受 API 基线保护/.exec(policy);
  if (policyCounts && (Number(policyCounts[1]) !== pkgs.length || Number(policyCounts[2]) !== baselines.length))
    offenders.push(
      `versioning-policy.md: 公开包写 ${policyCounts[1]} 个 / 受保护 ${policyCounts[2]} 个，实际 ${pkgs.length} / ${baselines.length}`
    );
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

/**
 * 从「符号名作链接文字」的链接里取出**被断言存在**的那个名字，取不到返回 null。
 *
 * @remarks
 * 这是 CONVENTIONS 优先级 1 的正体 ``[`symbolName`](path/to/file.ts)``：链接文字声称这个符号
 * 就在这个文件里，归属**无歧义**——不像散在证据单元里的符号，可能分属同段点名的好几个文件。
 *
 * 三类不是断言，不校验：`@aiao/rxdb` 这种包名（指向包内某个文件只是导航）、含 `/` 的路径、
 * 太短的词。带参签名 `mergeChanges(a, b?)` 取函数名；`Class#member` / `Class.method()` 取末段
 * ——私有名 `#priv` 走子串匹配照样命中。
 *
 * @param {string} text 反引号里的链接文字
 * @returns {string | null}
 */
export function symbolClaim(text) {
  if (text.startsWith('@') || text.includes('/')) return null;
  const core = text
    .replace(/\s*\(.*$/, '')
    .split(/[#.\s]+/)
    .filter(Boolean)
    .pop();
  return core && core.length >= 3 ? core : null;
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
 * 另外单查一类：`[`符号`](路径)` 这种「符号名作链接文字」的形式（见 {@link symbolClaim}）。
 * 它没有 `#L`，从前整个不在覆盖内——而 CONVENTIONS 恰恰把它定为**首选**写法，等于推荐大家
 * 写门禁看不见的锚点。它的归属无歧义，所以缺席直接判阻断。
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
    // 这条检查要读链接**文字**，而 maskCode 会把行内代码的内容抹空——只能清围栏，保住反引号里的符号名。
    for (const [index, line] of maskFences(raw).split('\n').entries()) {
      for (const m of line.matchAll(/\[\s*`([^`\n]+)`\s*\]\(([^)\s]+?)\)/g)) {
        const symbol = symbolClaim(m[1]);
        const target = m[2].split('#')[0];
        if (!symbol || /^(https?:|mailto:)/.test(target) || target.endsWith('.md')) continue;
        let source;
        try {
          source = await sourceOf(path.resolve(path.dirname(file), decodeURI(target)));
        } catch {
          continue; // 目标不存在由 checkLinks 报
        }
        if (!source.text.includes(symbol)) offenders.push(`${rel}:${index + 1}: \`${m[1]}\` 在 ${target} 里不存在`);
      }
    }
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

const TABLE_ROW = /^\s*\|/;
const TABLE_DELIMITER = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

/**
 * 表格行必须长在表格里：一组连续的 `|` 行，第二行得是分隔行。
 *
 * @remarks
 * 往表格末尾补一行时前面多留一个空行，那一行就掉出了表格，渲染成一串带竖线的文字。
 * 按行匹配的检查（全景表的行内状态、「每条未关闭故事都排过期」）照样认得它，所以这类错一直是绿的。
 *
 * @param {string} text 文档全文
 * @param {string} rel 报错用的路径
 * @returns {string[]}
 */
export function checkTables(text, rel) {
  const offenders = [];
  const lines = maskCode(text).split('\n');
  for (const [i, line] of lines.entries()) {
    if (!TABLE_ROW.test(line) || (i > 0 && TABLE_ROW.test(lines[i - 1]))) continue;
    if (!TABLE_DELIMITER.test(lines[i + 1] ?? ''))
      offenders.push(
        `${rel}:${i + 1}: 表格行不在表格里（前面没有表头与分隔行，多半是行前多了一个空行），渲染出来是一串竖线`
      );
  }
  return offenders;
}

/** 证据区存量基线相对仓库根的位置。 */
export const EVIDENCE_BASELINE = 'scripts/audit/requirements-evidence-baseline.json';

/** 验收证据区的标题：`## 验收标准` 整节（AC 表与紧随的证据说明），以及单列的证据 / 入口 / 记录小节。 */
const EVIDENCE_HEADING = /^(#{2,3})\s+(?:验收标准|验收证据|验收入口|验证记录|验收记录)/;
const EVIDENCE_DATE = /(?<!\d)20\d{2}-\d{2}-\d{2}(?!\d)/g;
/**
 * 裸测试计数：`62 例通过`、`139/139`、`7 passed`。它们写下当天就开始过期，
 * 该写的是测试文件与复验命令（CONVENTIONS「结论必须写出复验方式」）。
 */
const EVIDENCE_COUNTS = [
  /\d+\s*(?:例|条|个用例|条用例|个测试)(?:全部|均|都|全)?(?:通过|全绿|全过|转绿)/g,
  /(?<![\d/.])(\d+)\s*\/\s*\1(?![\d/.])/g,
  /\d+\s*(?:(?:tests?|cases?|specs?)\s+)?pass(?:ed|ing)\b/gi
];

/**
 * 数一条故事的验收证据区里有多少处日期、多少处裸测试计数。
 *
 * @remarks
 * 范围故意收得很窄，换来可以直接阻断而不误报：
 *
 * - 只看证据区，区外的正文（立项背景、技术笔记）不管；
 * - 行内代码与代码块不算——领域数据里的日期（生效日、`as_of_date`）写成行内代码即可；
 * - 表格行里的日期不算：AC 的前置条件与预期结果常带领域日期，BOM 的十几条故事都是这样。
 *
 * @param {string} text story 全文
 * @returns {{date: number, count: number}}
 */
export function evidenceHits(text) {
  let date = 0;
  let count = 0;
  let level = 0; // 所在证据区最外层标题的级别；0 表示不在证据区
  for (const line of maskCode(text).split('\n')) {
    const heading = /^(#{1,6})\s/.exec(line);
    if (heading) {
      const zone = EVIDENCE_HEADING.exec(line);
      if (zone) level = level && level < zone[1].length ? level : zone[1].length;
      else if (level && heading[1].length <= level) level = 0;
      continue;
    }
    if (!level) continue;
    if (!TABLE_ROW.test(line)) date += line.match(EVIDENCE_DATE)?.length ?? 0;
    for (const pattern of EVIDENCE_COUNTS) count += line.match(pattern)?.length ?? 0;
  }
  return { date, count };
}

const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'tmp', 'coverage']);

/**
 * 仓库里全部需求根目录：根 `requirements/`，以及各应用、各产品自己的 `requirements/`（带 `stories/` 才算）。
 *
 * @param {string} root 仓库根
 * @returns {Promise<string[]>} 相对仓库根的路径，已排序
 */
export async function collectRequirementRoots(root) {
  const found = [];
  const probe = async (dir, depth) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.name !== 'requirements') {
        // 应用在 `apps/<app>/`，产品在仓库根下一层，再深就不是需求根了。
        if (depth < 2) await probe(full, depth + 1);
        continue;
      }
      const hasStories = await stat(path.join(full, 'stories')).then(
        info => info.isDirectory(),
        () => false
      );
      if (hasStories) found.push(path.relative(root, full).split(path.sep).join('/'));
    }
  };
  await probe(root, 0);
  return found.sort();
}

/**
 * 扫描全部需求根下的故事，返回证据区有命中的那些，以及归属认不出来的文件。
 *
 * @remarks
 * `stories/` 下带 frontmatter 的文件都是故事（证据留档等辅助文件没有 frontmatter，不受约束）。基线按故事编号登记，
 * 所以编号必须认得出、且在全部需求根里唯一：有 frontmatter 却没有 `id`、或编号与别的故事重复，都作为问题返回，
 * 不能当成「没有命中」悄悄跳过。缺 `status` 不影响归属，照样按编号扫。
 *
 * @param {string} root 仓库根
 * @returns {Promise<{hits: Map<string, {date: number, count: number, rel: string}>, offenders: string[]}>}
 *   `hits` 以故事编号为键：编号不随文件搬迁变化
 */
export async function scanEvidence(root) {
  const hits = new Map();
  const offenders = [];
  const seen = new Map();
  for (const requirements of await collectRequirementRoots(root)) {
    for (const file of await collectMarkdown(path.join(root, requirements, 'stories'))) {
      if (file.endsWith('.template.md')) continue;
      const text = await readFile(file, 'utf8');
      const fm = parseFrontmatter(text);
      if (fm === null) continue;
      const rel = path.relative(root, file).split(path.sep).join('/');
      if (!fm.id) {
        offenders.push(`${rel}: 有 frontmatter 却没有 id，验收证据区无法按故事编号登记`);
        continue;
      }
      if (seen.has(fm.id)) {
        offenders.push(
          `${rel}: 故事编号 ${fm.id} 重复（另一处是 ${seen.get(fm.id)}），证据区基线按编号登记，分不清两条故事`
        );
        continue;
      }
      seen.set(fm.id, rel);
      const found = evidenceHits(text);
      if (found.date || found.count) hits.set(fm.id, { ...found, rel });
    }
  }
  return { hits, offenders };
}

const EVIDENCE_KINDS = [
  ['date', '日期', '带日期的运行记录放 `<故事编号>-evidence.md` 或 PR 描述；领域数据里的日期写成行内代码'],
  ['count', '裸测试计数', '写测试文件与复验命令，不写条数']
];

/**
 * 证据区的存量只减不增：现状必须正好等于基线。
 *
 * - 多了：新增被拒。不在基线里的故事基线按零算，所以新故事一处都不能有；
 * - 少了：要求跑 `--update` 把基线收紧，清掉的部分才不会被悄悄写回来。
 *
 * @param {Awaited<ReturnType<typeof scanEvidence>>['hits']} scan
 * @param {Record<string, {date: number, count: number}>} baseline
 * @returns {string[]}
 */
export function checkEvidenceBaseline(scan, baseline) {
  const offenders = [];
  for (const id of [...new Set([...scan.keys(), ...Object.keys(baseline)])].sort()) {
    const now = scan.get(id) ?? { date: 0, count: 0 };
    const base = baseline[id] ?? { date: 0, count: 0 };
    for (const [kind, label, advice] of EVIDENCE_KINDS) {
      if (now[kind] > base[kind])
        offenders.push(`${now.rel}: 验收证据区的${label}从 ${base[kind]} 处增到 ${now[kind]} 处。${advice}`);
    }
    if (now.date < base.date || now.count < base.count)
      offenders.push(`${EVIDENCE_BASELINE}: ${id} 的基线高于现状，跑 pnpm audit:requirements:update 收紧`);
  }
  return offenders;
}

/**
 * `--update` 用的基线回写：只收紧，清零即删条目；从不替新故事登记，也从不上调。
 *
 * @param {Awaited<ReturnType<typeof scanEvidence>>['hits']} scan
 * @param {Record<string, {date: number, count: number}>} baseline
 * @returns {Record<string, {count: number, date: number}>}
 */
export function ratchetEvidenceBaseline(scan, baseline) {
  const next = {};
  for (const id of Object.keys(baseline).sort()) {
    const now = scan.get(id) ?? { date: 0, count: 0 };
    const count = Math.min(now.count, baseline[id].count);
    const date = Math.min(now.date, baseline[id].date);
    if (count || date) next[id] = { count, date };
  }
  return next;
}

/**
 * 这次运行之后基线应该是什么：重建取现状，回写只收紧，其余不动。
 *
 * 有故事的归属认不出来时一律不动——编号丢了的故事扫不到，回写会把它的存量登记当成「已清零」抹掉，
 * 等它改回来，原有的存量就成了「新增」。
 *
 * @param {Awaited<ReturnType<typeof scanEvidence>>} scan
 * @param {Record<string, {date: number, count: number}>} baseline
 * @param {{update: boolean, rebaselineEvidence: boolean}} mode
 */
function nextEvidenceBaseline(scan, baseline, { update, rebaselineEvidence }) {
  if (scan.offenders.length) return baseline;
  if (rebaselineEvidence)
    return Object.fromEntries([...scan.hits].map(([id, { date, count }]) => [id, { count, date }]));
  if (update) return ratchetEvidenceBaseline(scan.hits, baseline);
  return baseline;
}

/** 读基线文件；文件不存在表示没有登记过任何存量。 */
async function readEvidenceBaseline(file) {
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  const baseline = JSON.parse(raw);
  for (const [id, entry] of Object.entries(baseline)) {
    if (!Number.isInteger(entry?.date) || !Number.isInteger(entry?.count) || entry.date < 0 || entry.count < 0)
      throw new Error(`${EVIDENCE_BASELINE}: ${id} 的条目必须是 { "count": 非负整数, "date": 非负整数 }`);
  }
  return baseline;
}

/** 键按编号字符串排序、每条故事占一行，diff 里一眼能看出哪条变了；写法与 prettier 的 JSON 格式一致。 */
function serializeEvidenceBaseline(baseline) {
  const rows = Object.entries(baseline)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([id, { count, date }]) => `  ${JSON.stringify(id)}: { "count": ${count}, "date": ${date} }`);
  return rows.length ? `{\n${rows.join(',\n')}\n}\n` : '{}\n';
}

/**
 * @param {{root: string, update?: boolean, rebaselineEvidence?: boolean}} options
 *   `rebaselineEvidence` 按现状重建证据区基线，是唯一能上调基线的入口——只在引入门禁、或批量导入存量故事时用，
 *   用了要在 PR 里说明。
 * @returns {Promise<{offenders: string[], warnings: {narrative: string[], evidence: string[]}, counts: Record<string, number>}>}
 */
export async function run({ root, update = false, rebaselineEvidence = false }) {
  const stories = await collectStories(root);
  const epics = await collectEpics(root);
  const counts = countStatuses(stories);
  const overviewPath = path.join(root, 'requirements', 'status-overview.md');
  const readmePath = path.join(root, 'README.md');
  const requirementsReadmePath = path.join(root, 'requirements', 'README.md');
  const roadmapPath = path.join(root, 'requirements', 'roadmap.md');
  const baselinePath = path.join(root, EVIDENCE_BASELINE);

  const evidenceScan = await scanEvidence(root);
  let evidenceBaseline = await readEvidenceBaseline(baselinePath);

  if (update) {
    await writeFile(overviewPath, renderStatusOverview(await readFile(overviewPath, 'utf8'), stories, epics));
    await writeFile(readmePath, updateReadme(await readFile(readmePath, 'utf8'), counts));
    await writeFile(roadmapPath, updateRoadmap(await readFile(roadmapPath, 'utf8'), counts));
    await writeFile(requirementsReadmePath, renderEpicList(await readFile(requirementsReadmePath, 'utf8'), epics));
  }
  const evidenceNext = nextEvidenceBaseline(evidenceScan, evidenceBaseline, { update, rebaselineEvidence });
  if (serializeEvidenceBaseline(evidenceNext) !== serializeEvidenceBaseline(evidenceBaseline))
    await writeFile(baselinePath, serializeEvidenceBaseline(evidenceNext));
  evidenceBaseline = evidenceNext;

  const tableOffenders = [];
  for (const requirements of await collectRequirementRoots(root)) {
    for (const file of await collectMarkdown(path.join(root, requirements)))
      tableOffenders.push(...checkTables(await readFile(file, 'utf8'), path.relative(root, file)));
  }

  const evidence = await checkAnchorEvidence(root);
  const offenders = [
    ...checkFrontmatter(stories, new Set(epics.map(e => e.id))),
    ...checkAcSymbols(stories),
    ...checkInheritedAcs(stories),
    ...checkBigStoryList(await readFile(requirementsReadmePath, 'utf8'), stories),
    ...(await checkPackageCounts(root)),
    ...checkStatusOverview(await readFile(overviewPath, 'utf8'), stories),
    ...checkGeneratedViews(
      { overview: await readFile(overviewPath, 'utf8'), readme: await readFile(requirementsReadmePath, 'utf8') },
      stories,
      epics
    ),
    ...checkReadme(await readFile(readmePath, 'utf8'), counts),
    ...checkRoadmap(await readFile(roadmapPath, 'utf8'), stories),
    ...checkEpics(epics, stories),
    ...checkAcStatusCells(stories),
    ...tableOffenders,
    ...evidenceScan.offenders,
    ...checkEvidenceBaseline(evidenceScan.hits, evidenceBaseline),
    ...(await checkLinks(root)),
    ...evidence.offenders
  ];
  // 两类告警**分开**返回：叙述词是「按文件」计的，锚点漂移是「按处」计的，
  // 合成一个数组就只能挑一个单位去播报，另一类必然被念错。
  const warnings = {
    narrative: (await scanNarrative(root)).map(
      ({ rel, hits }) => `${rel}: ${hits.map(([label, n]) => `${label}×${n}`).join('，')}`
    ),
    evidence: evidence.warnings
  };
  return { offenders, warnings, counts };
}

const main = async () => {
  const update = process.argv.includes('--update');
  const rebaselineEvidence = process.argv.includes('--rebaseline-evidence');
  const { offenders, warnings, counts } = await run({ root: process.cwd(), update, rebaselineEvidence });
  const summary = `${counts.Done} Done / ${counts['In Progress']} In Progress / ${counts['In Review']} In Review / ${counts.Backlog} Backlog / ${counts.Blocked} Blocked，合计 ${counts.total}`;

  if (warnings.narrative.length) {
    console.warn(`⚠️  ${warnings.narrative.length} 个文件含 CONVENTIONS 不允许进正文的过程叙述（不阻塞，逐条烧掉）：`);
    for (const w of warnings.narrative) console.warn(`   ${w}`);
  }
  if (warnings.evidence.length) {
    console.warn(`⚠️  ${warnings.evidence.length} 处行号锚点已漂或单用（不阻塞，逐条烧掉）：`);
    for (const w of warnings.evidence) console.warn(`   ${w}`);
  }
  if (offenders.length) {
    console.error(`❌ requirements 派生视图与 YAML 不一致（${offenders.length} 处）：`);
    for (const o of offenders) console.error(`   ${o}`);
    console.error(
      '\n数字、生成段落与基线收紧跑 `pnpm audit:requirements:update`；epic status、死链、表格与证据区的新增需手改。'
    );
    process.exit(1);
  }
  const written = [update && '派生段落已回写', rebaselineEvidence && '证据区基线已按现状重建'].filter(Boolean);
  process.stdout.write(
    `✅ Requirements consistency passed（${summary}）${written.map(note => `，${note}`).join('')}.\n`
  );
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
