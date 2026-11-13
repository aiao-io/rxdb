import { open, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  acIdsOf,
  checkFrontmatter,
  countStatuses,
  headingSlug,
  maskCode,
  parseFrontmatter,
  STATUS_EMOJI,
  SUMMARY_ROWS
} from './requirements-consistency.mjs';

/** 应用需求编号的全部正则，按应用短前缀（如 `ADMIN`、`MODEL`）生成。 */
function idPatterns(prefix) {
  if (!/^[A-Z][A-Z0-9]*$/.test(prefix ?? '')) throw new Error(`应用短前缀无效：${prefix}`);
  return {
    story: new RegExp(`^${prefix}-US-\\d{3}$`),
    epic: new RegExp(`^${prefix}-EPIC-\\d{3}$`),
    epicFile: new RegExp(`^${prefix}-EPIC-\\d{3}\\.md$`),
    storyLink: new RegExp(`\\[${prefix}-US-\\d{3}\\b[^\\]]*\\]\\(([^)\\s]+)\\)`, 'g'),
    linkedStory: new RegExp(`\\[(${prefix}-US-\\d{3})\\b[^\\]]*\\]\\([^)]+\\)`, 'g'),
    overviewEntry: new RegExp(`^\\s*- (✅|🚧|👀|⬜|🚫) \\[(${prefix}-US-\\d{3})\\b`, 'gm')
  };
}

async function markdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => markdownEntry(path.join(dir, entry.name), entry)));
  return groups.flat().sort();
}

function markdownEntry(file, entry) {
  if (entry.isDirectory()) return markdownFiles(file);
  return entry.name.endsWith('.md') && !entry.name.endsWith('.template.md') ? [file] : [];
}

function unquote(value) {
  if (value.startsWith('"')) return JSON.parse(value);
  if (value.startsWith("'")) {
    if (!value.endsWith("'")) throw new Error('单引号未闭合');
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value.trim();
}

function readArray(doc, key, errors) {
  const raw = doc.fm[key];
  if (raw === undefined && key !== 'tags') return [];
  if (!/^\[[\s\S]*\]$/.test(raw ?? '')) {
    errors.push(`${doc.rel}: ${key} 必须是字符串数组`);
    return [];
  }
  let values;
  try {
    values = (raw.slice(1, -1).match(/"(?:\\.|[^"\\])*"|'(?:''|[^'])*'|[^,]+/g) ?? []).map(value =>
      unquote(value.trim())
    );
  } catch {
    errors.push(`${doc.rel}: ${key} 的 YAML 数组无效`);
    return [];
  }
  if (values.some(value => !value || /^(?:true|false|null|\d+)$/.test(value)))
    errors.push(`${doc.rel}: ${key} 必须是非空字符串数组`);
  if (new Set(values).size !== values.length) errors.push(`${doc.rel}: ${key} 存在重复项`);
  return values;
}

function parseDocument(doc, errors) {
  try {
    const raw = parseFrontmatter(doc.text);
    const arrays = ['tags', 'dependsOn', 'capabilities', 'candidate_acs', 'inherited_acs'];
    const fm =
      raw &&
      Object.fromEntries(
        Object.entries(raw).map(([key, value]) => [key, arrays.includes(key) ? value : unquote(value)])
      );
    if (!fm) errors.push(`${doc.rel}: 无效的 YAML frontmatter`);
    const keys = [...(doc.text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '').matchAll(/^([\w-]+):/gm)].map(
      match => match[1]
    );
    for (const key of keys) {
      if (keys.indexOf(key) !== keys.lastIndexOf(key)) errors.push(`${doc.rel}: 重复 YAML 字段 ${key}`);
    }
    return { ...doc, fm: fm ?? {} };
  } catch (error) {
    errors.push(`${doc.rel}: 无效的 YAML frontmatter：${error.message}`);
    return { ...doc, fm: {} };
  }
}

function collectDocuments(documents, folder, ids, errors) {
  const declared = new Set(
    documents.flatMap(owner =>
      [...owner.text.matchAll(ids.storyLink)].map(match =>
        path.resolve(path.dirname(owner.file), match[1].split('#')[0])
      )
    )
  );
  return documents
    .filter(
      doc =>
        doc.rel.startsWith(`${folder}/`) &&
        (doc.text.startsWith('---') ||
          declared.has(doc.file) ||
          /^# 用户故事[：:]/m.test(doc.text) ||
          ids.epicFile.test(path.basename(doc.file)))
    )
    .map(doc => parseDocument(doc, errors));
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function checkIdentity(documents, kind, pattern, errors) {
  const ids = new Set();
  for (const doc of documents) {
    const id = doc.fm.id;
    if (!pattern.test(id)) errors.push(`${doc.rel}: ${kind} id 格式无效`);
    if (ids.has(id)) errors.push(`${doc.rel}: 重复 ${kind} ID ${id}`);
    ids.add(id);
    const filename = path.basename(doc.file, '.md');
    const matches = kind === 'story' ? filename.startsWith(`${id}-`) : filename === id;
    if (!matches) errors.push(`${doc.rel}: 文件名与 ${kind} ID ${id} 不一致`);
  }
}

function section(text, heading) {
  return text.split(new RegExp(`^## ${heading}[ \\t]*$`, 'm'))[1]?.split(/^## /m)[0] ?? '';
}

function checkAcs(story, errors) {
  const ids = acIdsOf(story.text);
  if (!ids.length) errors.push(`${story.rel}: 缺少编号 AC`);
  if (ids.some((id, index) => id !== index + 1)) errors.push(`${story.rel}: AC 必须从 1 连续编号，不得重复`);
  const rows = section(story.text, '验收标准')
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^\|\s*\d+\s*\|/.test(line));
  for (const row of rows) {
    const cells = row
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map(cell => cell.trim());
    const status = cells.at(-1);
    if (!['⬜', '⚠️', '✅'].includes(status)) errors.push(`${story.rel}: AC#${cells[0]} 状态无效`);
    if (story.fm.status === 'Done' && status !== '✅')
      errors.push(`${story.rel}: Done 故事 AC#${cells[0]} 必须全部 ✅`);
  }
}

function checkStory(story, errors) {
  if (!['High', 'Medium', 'Low'].includes(story.fm.priority))
    errors.push(`${story.rel}: priority 必须是 High / Medium / Low`);
  for (const key of ['created', 'updated']) {
    if (!validDate(story.fm[key])) errors.push(`${story.rel}: ${key} 必须是有效的 YYYY-MM-DD 日期`);
  }
  if (story.fm.updated < story.fm.created) errors.push(`${story.rel}: updated 不得早于 created`);
  readArray(story, 'tags', errors);
  story.dependencies = readArray(story, 'dependsOn', errors);
  story.capabilities = readArray(story, 'capabilities', errors);
  checkAcs(story, errors);
}

function checkStoryDependencies(story, byId, ids, errors) {
  for (const id of story.dependencies) {
    if (!ids.story.test(id) || !byId.has(id)) errors.push(`${story.rel}: dependsOn ${id} 不是存在的本应用故事`);
    if (story.fm.status === 'Done' && byId.has(id) && byId.get(id).fm.status !== 'Done')
      errors.push(`${story.rel}: Done 故事的硬依赖 ${id} 尚未 Done`);
  }
}

function checkDependencies(stories, ids, errors) {
  const byId = new Map(stories.map(story => [story.fm.id, story]));
  for (const story of stories) checkStoryDependencies(story, byId, ids, errors);
  const visited = new Set();
  const active = new Set();
  const visit = id => {
    if (active.has(id)) return errors.push(`dependsOn 存在依赖环：${[...active, id].join(' → ')}`);
    if (visited.has(id) || !byId.has(id)) return;
    active.add(id);
    for (const dependency of byId.get(id).dependencies) visit(dependency);
    active.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
}

async function checkCapabilities(stories, workspaceRoot, errors) {
  const references = stories.flatMap(story => story.capabilities.map(id => ({ story, id })));
  if (!references.length) return;
  const files = await markdownFiles(path.join(workspaceRoot, 'requirements/stories'));
  const known = new Set();
  for (const file of files) {
    const id = parseFrontmatter(await readFile(file, 'utf8'))?.id;
    if (id) known.add(id);
  }
  for (const { story, id } of references) {
    if (!/^rxdb:US-\d+$/.test(id) || !known.has(id.slice(5)))
      errors.push(`${story.rel}: capabilities ${id} 必须引用存在的 rxdb:US-XXX 平台故事`);
  }
}

function linkedStoryIds(text, ids) {
  return new Set([...text.matchAll(ids.linkedStory)].map(match => match[1]));
}

function checkEpic(epic, stories, ids, errors) {
  for (const key of ['id', 'status', 'startDate', 'targetDate', 'owner']) {
    if (!epic.fm[key]) errors.push(`${epic.rel}: epic 缺少必填字段 ${key}`);
  }
  for (const key of ['startDate', 'targetDate']) {
    if (epic.fm[key] !== 'TBD' && !validDate(epic.fm[key])) errors.push(`${epic.rel}: ${key} 必须是有效日期或 TBD`);
  }
  const byId = new Map(stories.map(story => [story.fm.id, story]));
  const owned = stories.filter(story => story.fm.epic === epic.fm.id);
  const listed = linkedStoryIds(section(epic.text, '故事'), ids);
  for (const story of owned) {
    if (!listed.has(story.fm.id)) errors.push(`${epic.rel}: 故事清单缺少 ${story.fm.id}`);
  }
  for (const id of listed) {
    if (!byId.has(id) || byId.get(id).fm.epic !== epic.fm.id) errors.push(`${epic.rel}: 故事清单 ${id} 不属于本 epic`);
  }
  if (!['Backlog', 'In Progress', 'Done'].includes(epic.fm.status)) errors.push(`${epic.rel}: epic status 无效`);
  if (epic.fm.status === 'Done' && owned.some(story => story.fm.status !== 'Done'))
    errors.push(`${epic.rel}: epic Done 仍有未关闭故事`);
  if (epic.fm.status === 'Backlog' && owned.some(story => story.fm.status !== 'Backlog'))
    errors.push(`${epic.rel}: epic Backlog 仍有已开始故事`);
}

function checkOverview(text, stories, counts, ids, errors) {
  for (const [label, key] of SUMMARY_ROWS) {
    const row = text.split('\n').find(line => line.split('|')[1]?.trim() === label);
    const count = row?.split('|')[2]?.trim();
    if (count !== String(counts[key])) errors.push(`status-overview.md: ${label} 写 ${count}，应为 ${counts[key]}`);
  }
  for (const [heading, status] of [
    ['进行中', 'In Progress'],
    ['待评审', 'In Review']
  ]) {
    const actual = new RegExp(`^## ${heading}（(\\d+) 条）`, 'm').exec(text)?.[1];
    if (actual !== String(counts[status])) errors.push(`status-overview.md: ${heading}标题条数应为 ${counts[status]}`);
  }
  const indexed = new Map([...text.matchAll(ids.overviewEntry)].map(match => [match[2], match[1]]));
  for (const story of stories) {
    if (indexed.get(story.fm.id) !== STATUS_EMOJI[story.fm.status])
      errors.push(`status-overview.md: ${story.fm.id} 状态索引应为 ${STATUS_EMOJI[story.fm.status]}`);
  }
  for (const id of indexed.keys()) {
    if (!stories.some(story => story.fm.id === id)) errors.push(`status-overview.md: 索引引用不存在的 ${id}`);
  }
}

function headings(text) {
  const slugs = new Set();
  const visible = maskCode(text).split('\n');
  const lines = text.split('\n').filter((_line, index) => /^#{1,6}\s/.test(visible[index]));
  for (const line of lines) {
    const match = /^#{1,6}\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
    const base = headingSlug(match[1]);
    let slug = base;
    let duplicate = 0;
    while (slugs.has(slug)) slug = `${base}-${++duplicate}`;
    slugs.add(slug);
  }
  return slugs;
}

async function checkLink(doc, raw, errors) {
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(raw)) return;
  const [target, anchor] = decodeURI(raw).split('#');
  const file = target ? path.resolve(path.dirname(doc.file), target) : doc.file;
  let handle;
  try {
    handle = await open(file, 'r');
  } catch {
    errors.push(`${doc.rel}: 链接目标不存在 → ${raw}`);
    return;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile() || !anchor || !file.endsWith('.md')) return;
    if (!headings(await handle.readFile('utf8')).has(anchor)) errors.push(`${doc.rel}: 标题锚点不存在 → ${raw}`);
  } finally {
    await handle.close();
  }
}

async function checkLinks(documents, errors) {
  for (const doc of documents) {
    const targets = [...maskCode(doc.text).matchAll(/\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g)].map(
      match => match[1] ?? match[2]
    );
    for (const target of targets) await checkLink(doc, target, errors);
  }
}

/**
 * 只读校验 `apps/<app>/requirements/`，平台故事只校验能力引用，不继承其状态。
 *
 * @param options.appRoot 应用目录（含 `requirements/`）
 * @param options.prefix 应用短前缀，故事为 `<prefix>-US-XXX`、史诗为 `<prefix>-EPIC-XXX`
 * @param options.workspaceRoot 仓库根目录，用于解析 `capabilities` 引用的平台故事
 */
export async function checkAppRequirements({ appRoot, prefix, workspaceRoot = path.resolve(appRoot, '../..') }) {
  const ids = idPatterns(prefix);
  const errors = [];
  const requirementsRoot = path.join(appRoot, 'requirements');
  const files = await markdownFiles(requirementsRoot);
  const documents = await Promise.all(
    files.map(async file => ({ file, rel: path.relative(requirementsRoot, file), text: await readFile(file, 'utf8') }))
  );
  const stories = collectDocuments(documents, 'stories', ids, errors);
  const epics = collectDocuments(documents, 'epics', ids, errors);
  checkIdentity(stories, 'story', ids.story, errors);
  checkIdentity(epics, 'epic', ids.epic, errors);
  errors.push(...checkFrontmatter(stories, new Set(epics.map(epic => epic.fm.id))));
  for (const story of stories) checkStory(story, errors);
  checkDependencies(stories, ids, errors);
  await checkCapabilities(stories, workspaceRoot, errors);
  for (const epic of epics) checkEpic(epic, stories, ids, errors);
  const counts = countStatuses(stories);
  const documentText = name => {
    const doc = documents.find(item => item.rel === name);
    if (!doc) errors.push(`缺少必需文档 ${name}`);
    return doc?.text ?? '';
  };
  const readme = /\[(\d+)\/(\d+) 已交付\]/.exec(documentText('README.md'));
  if (!readme || Number(readme[1]) !== counts.Done || Number(readme[2]) !== counts.total)
    errors.push(`README.md: 已交付应为 [${counts.Done}/${counts.total} 已交付]`);
  checkOverview(documentText('status-overview.md'), stories, counts, ids, errors);
  const roadmap = documentText('roadmap.md');
  for (const story of stories) {
    if (story.fm.status !== 'Done' && !roadmap.includes(story.fm.id))
      errors.push(`roadmap.md: 未覆盖未关闭故事 ${story.fm.id}`);
  }
  await checkLinks(documents, errors);
  return { errors, counts };
}

/** 应用门禁命令行入口：失败时逐条输出并置非零退出码。 */
export async function reportAppRequirements({ label, ...options }) {
  const { errors, counts } = await checkAppRequirements(options);
  if (errors.length) {
    process.stderr.write(`${errors.map(error => `❌ ${error}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`✅ ${label} requirements passed（${counts.Done}/${counts.total} 已交付）\n`);
}
