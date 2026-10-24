import { open, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseDocument } from 'yaml';

const statuses = ['Done', 'In Progress', 'In Review', 'Backlog', 'Blocked'];
const symbols = {
  Done: '✅',
  'In Progress': '🚧',
  'In Review': '👀',
  Backlog: '⬜',
  Blocked: '🚫'
};
const sections = ['作为/我想要/以便', '范围边界', '验收标准', '技术笔记', '实现文件', 'References'];
const within = (root, path) => {
  const part = relative(root, path);
  return part === '' || (part !== '..' && !part.replaceAll('\\', '/').startsWith('../') && !isAbsolute(part));
};
function withoutFences(text) {
  let fence;
  return text
    .split('\n')
    .map(line => {
      const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
      if (match) {
        if (!fence) fence = match[1];
        else if (match[1][0] === fence[0] && match[1].length >= fence.length && /^\s*(?:`+|~+)\s*$/.test(line))
          fence = undefined;
        return '';
      }
      return fence ? '' : line;
    })
    .join('\n');
}
function section(text, name) {
  const start = new RegExp(`^## ${name}\\s*$`, 'm').exec(text);
  if (!start) return null;
  const tail = text.slice(start.index + start[0].length);
  const next = /^## /m.exec(tail);
  return next ? tail.slice(0, next.index) : tail;
}
function links(text) {
  const results = [];
  // All inline links/images and reference definitions in the agreed Markdown
  // format are checked; literal examples in fenced code are not links.
  const pattern =
    /\[[^\]\n]*\]\((<[^>\n]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\)|^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|[^\s]+)/gm;
  for (const match of withoutFences(text).matchAll(pattern)) results.push((match[1] ?? match[2]).replace(/^<|>$/g, ''));
  return results;
}
function anchors(text) {
  const result = new Set();
  const counts = new Map();
  const body = withoutFences(text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, ''));
  for (const match of body.matchAll(/^\s{0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/gm)) {
    const base = match[1]
      .replace(/<[^>]*>/g, '')
      .replaceAll('<', '')
      .replaceAll('>', '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '')
      .replace(/\s/g, '-');
    let slug = base;
    let count = counts.get(base) ?? 0;
    while (result.has(slug)) slug = `${base}-${++count}`;
    counts.set(base, count);
    result.add(slug);
  }
  for (const match of body.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) result.add(match[1]);
  return result;
}
async function markdownFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await markdownFiles(path)));
    else if (entry.isFile() && entry.name.endsWith('.md')) result.push(path);
  }
  return result.sort();
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

/** Read-only audit. It cannot establish real provider, deployment or release evidence. */
export async function auditRequirements(root, { namespace = '', repositoryRoot = root } = {}) {
  root = resolve(root);
  repositoryRoot = resolve(repositoryRoot);
  const storyPrefix = namespace ? `${namespace}-US` : 'US';
  const epicPrefix = namespace ? `${namespace}-EPIC` : 'epic';
  const report = {
    storyCounts: Object.fromEntries(statuses.map(status => [status, 0])),
    total: 0,
    linksChecked: 0,
    anchorsChecked: 0,
    skippedUpstreamLinks: 0,
    errors: []
  };
  const documents = new Map();
  const stories = new Map();
  const epics = new Map();
  const error = (path, message) => report.errors.push(`${relative(root, path)}: ${message}`);
  for (const path of await markdownFiles(join(root, 'requirements'))) documents.set(path, await readFile(path, 'utf8'));
  const readme = join(root, 'README.md');
  try {
    documents.set(readme, await readFile(readme, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const [path, text] of documents) {
    const local = relative(root, path).replaceAll('\\', '/');
    const story = /^requirements\/stories\/[^/]+\/(?:[A-Z]+-)?US-\d+[^/]*\.md$/.test(local);
    const epic = /^requirements\/epics\/(?:epic|[A-Z]+-EPIC)-\d+[^/]*\.md$/.test(local);
    if (!story && !epic) continue;
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    if (!match) {
      error(path, 'Missing YAML frontmatter.');
      continue;
    }
    let metadata;
    try {
      const parsed = parseDocument(match[1], { uniqueKeys: true });
      if (parsed.errors.length || parsed.warnings.length) throw new Error('Invalid YAML.');
      metadata = parsed.toJS({ maxAliasCount: 0 });
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error('Invalid frontmatter.');
    } catch {
      error(path, 'Invalid YAML frontmatter (duplicate keys and aliases are not allowed).');
      continue;
    }
    if (!statuses.includes(metadata.status)) error(path, 'Unknown status.');
    const expected =
      story ?
        new RegExp(`^${storyPrefix}-\\d{3}$`)
      : new RegExp(`^${epicPrefix}-\\d{3}${namespace ? '' : '-[a-z0-9-]+'}$`);
    if (!expected.test(metadata.id)) error(path, 'Invalid story/epic id.');
    else if (story ? !local.split('/').at(-1).startsWith(`${metadata.id}-`) : !local.endsWith(`/${metadata.id}.md`))
      error(path, 'Frontmatter id disagrees with the filename.');
    const collection = story ? stories : epics;
    if (collection.has(metadata.id)) error(path, `Duplicate id ${metadata.id}.`);
    collection.set(metadata.id, { ...metadata, path, text });
    if (!story) continue;
    if (typeof metadata.title !== 'string' || !metadata.title.trim()) error(path, 'Missing title.');
    if (!['High', 'Medium', 'Low'].includes(metadata.priority)) error(path, 'Invalid priority.');
    if (!Array.isArray(metadata.tags) || metadata.tags.some(tag => typeof tag !== 'string' || !tag))
      error(path, 'Invalid tags.');
    if (
      !Array.isArray(metadata.dependsOn) ||
      metadata.dependsOn.some(id => typeof id !== 'string') ||
      new Set(metadata.dependsOn).size !== metadata.dependsOn.length
    ) {
      error(path, 'dependsOn must be a unique array of story ids.');
      stories.get(metadata.id).dependsOn = [];
    }
    if (!validDate(metadata.created) || !validDate(metadata.updated) || metadata.created > metadata.updated)
      error(path, 'Invalid or reversed created/updated date.');
    for (const name of sections) if (section(text, name) === null) error(path, `Missing section ${name}.`);
    if (!/^### In Scope\s*$/m.test(text) || !/^### Out of Scope\s*$/m.test(text))
      error(path, 'Missing In Scope / Out of Scope boundary.');
    const ac = [...(section(text, '验收标准') ?? '').matchAll(/^\|\s*(\d+)\s*\|([^\n]*)$/gm)];
    if (!ac.length) error(path, 'No acceptance criteria.');
    for (const [index, row] of ac.entries()) {
      const cells = row[2].split('|').map(cell => cell.trim());
      const state = cells.at(-2);
      if (Number(row[1]) !== index + 1 || cells.length !== 5 || !['✅', '⚠️', '⬜'].includes(state))
        error(path, 'Invalid acceptance criterion row, number or state.');
      if (metadata.status === 'Done' && state !== '✅') error(path, 'Done story has an unpassed acceptance criterion.');
      if (metadata.status === 'Backlog' && state === '✅')
        error(path, 'Backlog story has a passed acceptance criterion.');
    }
    if (statuses.includes(metadata.status)) report.storyCounts[metadata.status]++;
  }
  report.total = stories.size;
  for (const story of stories.values()) {
    if (!epics.has(story.epic)) error(story.path, `Missing epic ${story.epic}.`);
    for (const id of story.dependsOn ?? []) {
      const dependency = stories.get(id);
      if (!dependency) error(story.path, `Missing hard dependency ${id}.`);
      else if (story.status === 'Done' && dependency.status !== 'Done')
        error(story.path, `Done story depends on unfinished ${id}.`);
    }
  }
  for (const story of stories.values()) {
    for (const capability of story.capabilities ?? []) {
      if (!/^rxdb:US-\d{3}$/.test(capability.ref ?? '')) {
        error(story.path, 'Invalid capability reference.');
        continue;
      }
      const id = capability.ref.slice('rxdb:'.length);
      const platformStories = await markdownFiles(join(repositoryRoot, 'requirements/stories'));
      const candidates = platformStories.filter(file => file.split('/').at(-1).startsWith(`${id}-`));
      if (candidates.length !== 1) error(story.path, `Missing capability ${capability.ref}.`);
      if (!['pending', 'verified'].includes(capability.integration))
        error(story.path, `Invalid capability integration for ${capability.ref}.`);
    }
  }
  const visited = new Set();
  function visit(id, stack) {
    if (stack.includes(id)) {
      error(stories.get(id).path, `Dependency cycle: ${[...stack, id].join(' -> ')}.`);
      return;
    }
    if (visited.has(id)) return;
    const story = stories.get(id);
    if (!story) return;
    for (const dependency of story.dependsOn ?? []) visit(dependency, [...stack, id]);
    visited.add(id);
  }
  for (const id of stories.keys()) visit(id, []);
  for (const epic of epics.values()) {
    const members = [...stories.values()].filter(story => story.epic === epic.id);
    if (!members.length) {
      error(epic.path, 'Epic has no stories.');
      continue;
    }
    const expected =
      members.every(story => story.status === 'Done') ? 'Done'
      : members.every(story => story.status === 'Backlog') ? 'Backlog'
      : 'In Progress';
    if (epic.status !== expected) error(epic.path, `Derived epic status must be ${expected}.`);
    const listed = section(epic.text, '故事') ?? '';
    for (const story of members)
      if (!links(listed).some(link => resolve(dirname(epic.path), link) === story.path))
        error(epic.path, `Missing story index entry ${story.id}.`);
    for (const row of (section(epic.text, '目标') ?? '').split('\n')) {
      const checkbox = /^- \[([ xX])\]/.exec(row);
      if (!checkbox) continue;
      const targets = links(row).map(link =>
        [...stories.values()].find(story => resolve(dirname(epic.path), link) === story.path)
      );
      if (!targets.length || targets.some(story => !story || story.epic !== epic.id))
        error(epic.path, 'Epic goal must link to its member stories.');
      else if ((checkbox[1] !== ' ') !== targets.every(story => story.status === 'Done'))
        error(epic.path, 'Epic goal checkbox disagrees with story status.');
    }
  }
  const overviewPath = join(root, 'requirements/status-overview.md');
  const overview = documents.get(overviewPath);
  if (!overview) error(overviewPath, 'Missing derived status overview.');
  else {
    for (const status of statuses) {
      const row = overview
        .split('\n')
        .find(line => line.startsWith('|') && line.split('|')[1].trim().endsWith(` ${status}`));
      if (!row || Number(row.split('|')[2].trim()) !== report.storyCounts[status])
        error(overviewPath, `Count for ${status} disagrees with story YAML.`);
    }
    const total = overview.split('\n').find(line => /^\|\s*\*\*合计\*\*/.test(line));
    if (!total || Number(total.split('|')[2].replaceAll('*', '').trim()) !== report.total)
      error(overviewPath, 'Total disagrees with story YAML.');
    const indexed = new Map();
    for (const row of overview.matchAll(
      new RegExp(`^- (\\S+) \\[(${storyPrefix}-\\d{3})[^\\]\\n]*\\]\\(([^)]+)\\)`, 'gm')
    )) {
      if (indexed.has(row[2])) error(overviewPath, `Duplicate story index entry ${row[2]}.`);
      indexed.set(row[2], row);
      const story = stories.get(row[2]);
      if (!story || symbols[story.status] !== row[1] || resolve(dirname(overviewPath), row[3]) !== story.path)
        error(overviewPath, `Story index entry ${row[2]} disagrees with YAML/path.`);
    }
    for (const id of stories.keys()) if (!indexed.has(id)) error(overviewPath, `Missing story index entry ${id}.`);
  }
  for (const name of ['README.md', 'requirements/README.md', 'requirements/verification-report.md']) {
    const path = join(root, name);
    const text = documents.get(path) ?? '';
    for (const match of text.matchAll(/(\d+)\s+(?:条\s*)?(Done|In Progress|In Review|Backlog|Blocked)\b/g))
      if (Number(match[1]) !== report.storyCounts[match[2]])
        error(path, `Summary count for ${match[2]} disagrees with story YAML.`);
    for (const match of text.matchAll(/当前\s+(\d+)\s+条故事/g))
      if (Number(match[1]) !== report.total) error(path, 'Summary total disagrees with story YAML.');
  }
  const upstream = join(dirname(root), 'rxdb_ai');
  const upstreamPresent = Boolean(await stat(upstream).catch(() => null));
  for (const [path, text] of documents) {
    for (const link of links(text)) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(link)) continue;
      if (path.endsWith('.template.md') && /(?:US-XXX|epic-XXX|对应文件)/.test(link)) continue;
      let destination, fragment;
      try {
        const [location, anchor] = link.split('#', 2);
        destination = resolve(dirname(path), decodeURIComponent(location.split('?')[0]) || path);
        fragment = anchor === undefined ? undefined : decodeURIComponent(anchor);
      } catch {
        error(path, `Malformed local link ${link}.`);
        continue;
      }
      if (!within(repositoryRoot, destination) && !within(upstream, destination)) {
        error(path, `Local link leaves the workspace and declared read-only upstream: ${link}.`);
        continue;
      }
      // The sibling checkout is an explicit reference, not a CI clone prerequisite.
      if (within(upstream, destination) && !upstreamPresent) {
        report.skippedUpstreamLinks++;
        continue;
      }
      report.linksChecked++;
      let handle;
      try {
        handle = await open(destination, 'r');
        if (fragment && destination.endsWith('.md')) {
          report.anchorsChecked++;
          const target = documents.get(destination) ?? (await handle.readFile('utf8'));
          if (!anchors(target).has(fragment)) error(path, `Missing Markdown anchor ${link}.`);
        }
      } catch (failure) {
        if (failure.code !== 'ENOENT' && failure.code !== 'ENOTDIR') throw failure;
        error(path, `Broken local link ${link}.`);
      } finally {
        await handle?.close();
      }
    }
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await auditRequirements(resolve(dirname(fileURLToPath(import.meta.url)), '..'), {
      namespace: 'MEDIA',
      repositoryRoot: resolve(import.meta.dirname, '../../..')
    });
    console.log(JSON.stringify(report, null, 2));
    if (report.errors.length) process.exitCode = 1;
  } catch (error) {
    console.error('Requirements audit could not finish:', error.message);
    process.exitCode = 1;
  }
}
