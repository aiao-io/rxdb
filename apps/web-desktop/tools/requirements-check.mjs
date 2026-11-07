import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const walk = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]
  );
const docs = walk(join(root, 'requirements')).filter(path => path.endsWith('.md'));
const storyPaths = docs.filter(path => path.includes('/stories/'));
const errors = [];
const stories = storyPaths.map(path => {
  const text = readFileSync(path, 'utf8');
  const field = key => text.match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1];
  const id = field('id');
  const ac = [...text.matchAll(/^\|\s*(\d+)\s*\|/gm)].map(match => Number(match[1]));
  const deps = [...(field('dependsOn') ?? '').matchAll(/DESKTOP-US-\d+/g)].map(match => match[0]);
  for (const key of [
    'id',
    'title',
    'status',
    'priority',
    'epic',
    'milestone',
    'created',
    'updated',
    'dependsOn',
    'capabilities'
  ]) {
    if (!field(key)) errors.push(`${path}: 缺少 ${key}`);
  }
  if (!id || !path.includes(id)) errors.push(`${path}: 文件名与故事 ID 不匹配`);
  if (!ac.length || ac.some((n, i) => n !== i + 1)) errors.push(`${id}: AC 不连续`);
  return { id, deps, ac, milestone: field('milestone'), status: field('status') };
});
const ids = new Map(stories.map(story => [story.id, story]));
if (ids.size !== stories.length) errors.push('故事 ID 重复');
if (stories.length !== 42) errors.push(`故事数量 ${stories.length}，预期 42`);
const count = stories.reduce((n, story) => n + story.ac.length, 0);
if (count !== 256) errors.push(`AC 数量 ${count}，预期 256`);
const visited = new Set();
function visit(id, ancestors = []) {
  if (ancestors.includes(id)) return errors.push(`依赖环: ${[...ancestors, id].join(' → ')}`);
  if (visited.has(id)) return;
  const story = ids.get(id);
  if (!story) return errors.push(`缺失依赖 ${id}`);
  for (const dep of story.deps) {
    const target = ids.get(dep);
    if (target && target.milestone > story.milestone) errors.push(`${id}: 依赖里程碑倒挂 ${dep}`);
    visit(dep, [...ancestors, id]);
  }
  visited.add(id);
}
for (const id of ids.keys()) visit(id);
for (const path of docs) {
  const text = readFileSync(path, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const link = match[1];
    if (/^(?:https?:|mailto:|#)/.test(link)) continue;
    const target = resolve(dirname(path), decodeURIComponent(link.split('#')[0]));
    if (!existsSync(target)) errors.push(`${path}: 链接不存在 ${link}`);
  }
}
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else {
  const statuses = Object.fromEntries(
    [...new Set(stories.map(story => story.status))].map(status => [
      status,
      stories.filter(story => story.status === status).length
    ])
  );
  console.log(
    JSON.stringify(
      { stories: stories.length, acceptanceCriteria: count, statuses, links: 'valid', dependencies: 'acyclic' },
      null,
      2
    )
  );
}
