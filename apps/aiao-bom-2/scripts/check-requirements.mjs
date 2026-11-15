import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';
import {
  acIdsOf,
  checkLinks,
  countStatuses,
  maskCode,
  parseFrontmatter,
  REQUIRED_FRONTMATTER,
  STATUS_EMOJI,
  SUMMARY_ROWS
} from '../../../scripts/audit/requirements-consistency.mjs';

const views = ['status-overview.md', 'roadmap.md', 'capability-matrix.md', 'verification-report.md'];
const requiredFiles = [
  'README.md',
  'CONVENTIONS.md',
  'decisions.md',
  'future-requirements.md',
  'stories/story.template.md',
  'epics/epic.template.md',
  'plans/README.md',
  'reviews/README.md',
  'reviews/review.template.md',
  'code-scanning/README.md',
  'code-scanning/code-scanning.template.md',
  ...views
];
const ranges = { platform: [1, 99], analysis: [101, 199], production: [201, 299], data: [301, 399] };
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(entry => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? markdownFiles(file) : [file].filter(name => name.endsWith('.md'));
    })
  );
  return nested.flat().sort();
}

function metadata(text, file, errors) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) {
    errors.push(`${file}: 缺少 YAML frontmatter`);
    return {};
  }
  const document = parseDocument(match[1]);
  if (document.errors.length) {
    errors.push(...document.errors.map(error => `${file}: YAML ${error.message}`));
    return {};
  }
  const value = document.toJS();
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  errors.push(`${file}: YAML 必须是键值映射`);
  return {};
}

async function documents(directory, errors, allowAuxiliary = false) {
  const files = (await markdownFiles(directory)).filter(file => !file.endsWith('.template.md'));
  const result = await Promise.all(
    files.map(async file => {
      const text = await readFile(file, 'utf8');
      if (allowAuxiliary && !/^---(?:\r?\n|$)/.test(text)) return null;
      const fm = metadata(text, file, errors);
      return { file, text, fm, id: fm.id };
    })
  );
  return result.filter(Boolean);
}

function checkUniqueIds(items, pattern, errors) {
  const seen = new Set();
  for (const { file, id } of items) {
    if (typeof id !== 'string' || !pattern.test(id)) errors.push(`${file}: 非法 ID ${id}`);
    if (!path.basename(file).startsWith(`${id}.`) && !path.basename(file).startsWith(`${id}-`))
      errors.push(`${file}: ID 与文件名不一致`);
    if (seen.has(id)) errors.push(`${file}: 重复 ID ${id}`);
    seen.add(id);
  }
}

function stringList(fm, key, file, errors) {
  const value = fm[key];
  if (Array.isArray(value) && value.every(item => typeof item === 'string') && new Set(value).size === value.length)
    return value;
  errors.push(`${file}: ${key} 必须是不重复字符串列表`);
  return [];
}

function checkStoryFields(story, epicIds, errors) {
  const { file, fm, id } = story;
  for (const field of REQUIRED_FRONTMATTER) {
    if (fm[field] === undefined || fm[field] === '') errors.push(`${file}: 缺少 ${field}`);
  }
  if (!Object.hasOwn(STATUS_EMOJI, fm.status)) errors.push(`${file}: 非法 status ${fm.status}`);
  if (!['High', 'Medium', 'Low'].includes(fm.priority)) errors.push(`${file}: 非法 priority`);
  if (typeof fm.title !== 'string' || !fm.title.trim()) errors.push(`${file}: title 必须是非空字符串`);
  for (const field of ['created', 'updated']) {
    const value = fm[field];
    if (
      typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      errors.push(`${file}: 非法 ${field} 日期`);
  }
  if (fm.updated < fm.created) errors.push(`${file}: updated 早于 created`);
  if (!epicIds.has(fm.epic)) errors.push(`${file}: epic ${fm.epic} 不存在`);
  const range = ranges[path.basename(path.dirname(file))];
  const number = Number(typeof id === 'string' ? id.split('-').at(-1) : NaN);
  if (!range || number < range[0] || number > range[1]) errors.push(`${file}: story 不在领域编号段内`);
  for (const field of ['tags', 'dependsOn', 'capabilities']) stringList(fm, field, file, errors);
}

function checkAcs({ file, fm, text }, errors) {
  const section = /^## 验收标准\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(maskCode(text))?.[1] ?? '';
  const rows = [...section.matchAll(/^\|\s*(\d+)\s*\|(.+)\|\s*$/gm)];
  if (!rows.length || rows.some((row, index) => Number(row[1]) !== index + 1))
    errors.push(`${file}: AC 必须从 1 连续编号，且至少一条`);
  const candidates = fm.candidate_acs ?? [];
  const validCandidates =
    Array.isArray(candidates) &&
    new Set(candidates).size === candidates.length &&
    candidates.every(id => Number.isInteger(id) && id > 0 && id <= rows.length);
  if (!validCandidates) errors.push(`${file}: candidate_acs 必须引用存在且不重复的正整数 AC`);
  for (const row of rows) {
    const status = row[2].split('|').at(-1).trim();
    const candidate = validCandidates && candidates.includes(Number(row[1]));
    if (!['✅', '⚠️', '⬜'].includes(status)) errors.push(`${file}: AC#${row[1]} 状态非法`);
    if (candidate && status === '✅') errors.push(`${file}: 候选 AC#${row[1]} 不得标通过`);
    if (fm.status === 'Done' && !candidate && status !== '✅') errors.push(`${file}: Done 的 AC#${row[1]} 未通过`);
  }
}

function checkDependencies(stories, errors) {
  const byId = new Map(stories.map(story => [story.id, story]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) {
      errors.push(`硬依赖环: ${[...visiting, id].join(' → ')}`);
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    const story = byId.get(id);
    const dependencies = Array.isArray(story.fm.dependsOn) ? story.fm.dependsOn : [];
    dependencies.forEach(dependency => checkDependency(story, dependency, byId, errors));
    dependencies.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  }
  stories.forEach(story => visit(story.id));
}

function checkDependency(story, id, byId, errors) {
  const dependency = byId.get(id);
  if (!dependency) errors.push(`${story.file}: 依赖 ${id} 不存在`);
  if (story.fm.status === 'Done' && dependency && dependency.fm.status !== 'Done')
    errors.push(`${story.file}: 依赖 ${id} 未关闭`);
}

function checkInheritedAcs(stories, errors) {
  const byId = new Map(stories.map(story => [story.id, story]));
  for (const { file, fm } of stories) {
    if (fm.inherited_acs === undefined) continue;
    if (!Array.isArray(fm.inherited_acs)) {
      errors.push(`${file}: inherited_acs 必须是列表`);
      continue;
    }
    fm.inherited_acs.forEach(entry => checkInheritedAc(file, entry, byId, errors));
  }
}

function checkInheritedAc(file, entry, byId, errors) {
  const source = byId.get(entry?.from);
  if (!source) {
    errors.push(`${file}: inherited_acs 源故事不存在`);
    return;
  }
  const ids = new Set(acIdsOf(source.text));
  const acs = Array.isArray(entry.ac) ? entry.ac : [entry.ac];
  const valid =
    acs.length > 0 &&
    acs.every(ac => (Number.isInteger(ac) ? ids.has(ac) : typeof ac === 'string' && ac.trim().length > 0));
  if (!valid) errors.push(`${file}: inherited_acs 必须指向存在的源 AC，分段标签须人工核对`);
}

async function checkCapabilities(stories, workspaceRoot, errors) {
  const platformFiles = await markdownFiles(path.join(workspaceRoot, 'requirements/stories'));
  const platformIds = new Set(
    await Promise.all(platformFiles.map(async file => parseFrontmatter(await readFile(file, 'utf8'))?.id))
  );
  for (const { file, fm } of stories) {
    const capabilities = Array.isArray(fm.capabilities) ? fm.capabilities : [];
    const invalid = capabilities.filter(
      id => typeof id !== 'string' || !/^rxdb:US-\d{3}$/.test(id) || !platformIds.has(id.slice(5))
    );
    if (invalid.length) errors.push(`${file}: capabilities 无效或故事不存在: ${invalid.join(', ')}`);
  }
}

function checkEpics(epics, stories, errors) {
  for (const { file, id, fm, text } of epics) {
    if (!['Backlog', 'In Progress', 'Done'].includes(fm.status)) errors.push(`${file}: 非法 epic status`);
    if (path.basename(file) !== `${id}.md`) errors.push(`${file}: epic ID 与文件名不一致`);
    const owned = stories.filter(story => story.fm.epic === id);
    if (!owned.length) errors.push(`${file}: epic 没有故事认领`);
    if (fm.status === 'Done' && owned.some(story => story.fm.status !== 'Done'))
      errors.push(`${file}: Done epic 包含未关闭故事`);
    if (fm.status === 'Backlog' && owned.some(story => story.fm.status !== 'Backlog'))
      errors.push(`${file}: Backlog epic 包含已开工故事`);
    const linked = [...maskCode(text).matchAll(/\]\([^)]*\/(BOM-US-\d{3})-[^)]*\.md\)/g)].map(match => match[1]);
    if (
      linked.length !== owned.length ||
      new Set(linked).size !== owned.length ||
      owned.some(story => !linked.includes(story.id))
    )
      errors.push(`${file}: epic 故事索引与归属不一致`);
  }
}

function checkView(file, text, stories, counts, errors) {
  for (const [label, key] of SUMMARY_ROWS) {
    const pattern = new RegExp(`^\\|\\s*${escapeRegex(label)}\\s*\\|\\s*(\\d+)\\s*\\|\\s*$`, 'gm');
    const matches = [...text.matchAll(pattern)];
    if (matches.length !== 1 || Number(matches[0][1]) !== counts[key]) errors.push(`${file}: ${label} 派生统计漂移`);
  }
  const entries = [...text.matchAll(/^\s*- (✅|🚧|👀|⬜|🚫) \[(BOM-US-\d{3})\b/gm)];
  const index = new Map(entries.map(match => [match[2], match[1]]));
  if (entries.length !== stories.length || index.size !== stories.length)
    errors.push(`${file}: 故事索引遗漏、重复或包含未知 ID`);
  for (const story of stories) {
    if (index.get(story.id) !== STATUS_EMOJI[story.fm.status]) errors.push(`${file}: ${story.id} 状态与 YAML 不一致`);
  }
}

/**
 * 只读校验应用需求结构、关闭条件、派生视图和本地链接。
 * @param {{appRoot?: string, workspaceRoot?: string}} options 应用根目录及平台仓库根目录。
 */
export async function checkRequirements({
  appRoot = path.resolve(import.meta.dirname, '..'),
  workspaceRoot = path.resolve(appRoot, '../..')
} = {}) {
  const directory = path.join(appRoot, 'requirements');
  const errors = [];
  const counts = countStatuses([]);
  await Promise.all(
    requiredFiles.map(async file => {
      try {
        await access(path.join(directory, file));
      } catch {
        errors.push(`requirements/${file}: 必需文件不存在`);
      }
    })
  );
  if (errors.length) return { errors, counts };
  const [stories, epics] = await Promise.all([
    documents(path.join(directory, 'stories'), errors, true),
    documents(path.join(directory, 'epics'), errors)
  ]);
  checkUniqueIds(stories, /^BOM-US-\d{3}$/, errors);
  checkUniqueIds(epics, /^BOM-EPIC-\d{3}$/, errors);
  const epicIds = new Set(epics.map(epic => epic.id));
  stories.forEach(story => checkStoryFields(story, epicIds, errors));
  stories.forEach(story => checkAcs(story, errors));
  checkDependencies(stories, errors);
  checkInheritedAcs(stories, errors);
  await checkCapabilities(stories, workspaceRoot, errors);
  checkEpics(epics, stories, errors);
  Object.assign(counts, countStatuses(stories.filter(story => Object.hasOwn(STATUS_EMOJI, story.fm.status))));
  for (const file of views)
    checkView(file, await readFile(path.join(directory, file), 'utf8'), stories, counts, errors);
  errors.push(...(await checkLinks(appRoot)));
  return { errors, counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { errors, counts } = await checkRequirements();
  errors.forEach(error => console.error(`❌ ${error}`));
  if (errors.length) process.exitCode = 1;
  else
    console.log(
      `✅ Aiao BOM requirements passed: ${Object.entries(counts)
        .map(([status, count]) => `${status}=${count}`)
        .join(', ')}`
    );
}
