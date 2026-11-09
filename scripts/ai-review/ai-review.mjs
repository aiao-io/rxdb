/**
 * scripts/ai-review/ai-review.mjs
 *
 * ai-code-review skill（`.agents/skills/ai-code-review/`）的确定性部分：快照、项目归属、必审单元、
 * 覆盖登记与状态、问题 ID 与记录查找。评审本身由执行 skill 的 AI 会话完成，本脚本只负责记账。
 *
 * 覆盖按内容寻址：单元键 = (评审标准摘要, range, 路径, base 侧 blob, head 侧 blob)。每条覆盖另记评审时读过的
 * 上下文文件 blob 与产出的问题 ID；判定有效只看内容——上下文 blob 与当前快照一致、引用的问题记录还在。
 * 与提交历史无关：rebase、base 前移之后只有内容真正变了的单元要重审；中断后再跑 status，得到的就是续跑清单。
 *
 * 状态只追加写进 `<git common dir>/ai-review/v1/coverage.jsonl`（同一仓库的所有 worktree 共享），
 * 每批一次写入，不需要锁；写到一半中断留下的半行由下一批写入另起一行封存，不会把之后的覆盖连带读坏。
 * 问题记录 Markdown 是问题状态的事实源，本脚本只检查它们在不在。
 */

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  closeSync,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

/** 评审标准；它的摘要进单元键，标准一改旧覆盖全部失效。 */
const RUBRIC = path.resolve(import.meta.dirname, '../../.agents/skills/ai-code-review/references/rubric.md');
const RECORD_PATH = /(^|\/)requirements\/reviews\//;
const LOCKFILES = new Set(['pnpm-lock.yaml']);
const NULL_OBJECT = /^0+$/;
const ISSUE_ID = /^RV-[0-9A-Z]+$/i;
const MAX_BUFFER = 1 << 30;

const compare = (a, b) => (a < b ? -1 : Number(a > b));
const byPath = (a, b) => compare(a.path, b.path);
const splitNul = text => text.split('\0').filter(Boolean);
const splitLines = text => text.split('\n').filter(Boolean);
const depth = root => (root === '.' ? 0 : root.split('/').length);

/**
 * 运行 git，返回 stdout；失败时抛出带 stderr 的错误。
 *
 * @param {string} cwd 仓库内目录
 * @param {string[]} args git 参数
 * @param {import('node:child_process').ExecFileSyncOptions} [options] 额外选项（env、input）
 * @returns {string}
 */
function git(cwd, args, options = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
    stdio: ['pipe', 'pipe', 'pipe'],
    ...options
  });
}

/**
 * 运行 git，失败时改抛给定说明（把「找不到 ref」这类退出码翻成可操作的提示）。
 *
 * @param {string} cwd 仓库内目录
 * @param {string[]} args git 参数
 * @param {string} message 失败时的说明
 * @returns {string} 去掉首尾空白的 stdout
 */
function gitOr(cwd, args, message) {
  try {
    return git(cwd, args).trim();
  } catch {
    throw new Error(message);
  }
}

const resolveCommit = (cwd, rev) =>
  gitOr(cwd, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], `找不到提交 ${rev}`);
const treeOf = (cwd, commit) => git(cwd, ['rev-parse', `${commit}^{tree}`]).trim();
const topLevel = cwd => git(cwd, ['rev-parse', '--show-toplevel']).trim();
const emptyTree = cwd => git(cwd, ['hash-object', '-t', 'tree', '--stdin'], { input: '' }).trim();
const objectOrNull = sha => (NULL_OBJECT.test(sha) ? null : sha);

/**
 * 生成 UUIDv7 的 32 位小写十六进制（无连字符）：前 48 位是毫秒时间戳，字典序即时间序。
 *
 * @param {number} [now] 毫秒时间戳
 * @param {Buffer} [random] 10 字节随机数
 * @returns {string}
 */
export function uuidv7(now = Date.now(), random = randomBytes(10)) {
  const bytes = Buffer.alloc(16);
  bytes.writeUIntBE(now, 0, 6);
  random.copy(bytes, 6, 0, 10);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes.toString('hex');
}

/**
 * 问题或事件 ID：`RV-` / `EV-` 加无连字符 UUIDv7。
 *
 * @param {'RV' | 'EV'} prefix 前缀
 * @param {number} [now] 毫秒时间戳
 * @param {Buffer} [random] 10 字节随机数
 * @returns {string}
 */
export function newId(prefix, now, random) {
  return `${prefix}-${uuidv7(now, random)}`;
}

/**
 * Nx 项目名 → `requirements/reviews/` 下的目录名：去掉开头的 `@`，`/` 换成 `__`。
 * 真实项目名写在记录的 `project` 字段，目录名不需要可逆。
 *
 * @param {string} name Nx 项目名
 * @returns {string}
 */
export function projectKey(name) {
  const key = name.replace(/^@/, '').replaceAll('/', '__');
  if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`项目名 ${name} 不能映射成目录名`);
  return key;
}

/**
 * 文件归属：取 root 为其祖先目录且最深的项目；root 为 `.` 的根项目只收其余文件。
 *
 * @param {string} file 仓库相对路径
 * @param {{ name: string, root: string }[]} projects 快照里的项目
 * @returns {string | undefined} 项目名；没有项目认领时为 `undefined`
 */
export function ownerOf(file, projects) {
  const owners = projects.filter(({ root }) => root === '.' || file === root || file.startsWith(`${root}/`));
  return owners.sort((a, b) => depth(b.root) - depth(a.root))[0]?.name;
}

/**
 * 树里所有 blob：路径 → blob SHA（跳过子模块）。
 *
 * @param {string} cwd 仓库内目录
 * @param {string} tree 树 SHA
 * @returns {Map<string, string>}
 */
function listTree(cwd, tree) {
  const entries = new Map();
  for (const record of splitNul(git(cwd, ['ls-tree', '-r', '-z', '--full-tree', tree]))) {
    const tab = record.indexOf('\t');
    const [, type, blob] = record.slice(0, tab).split(' ');
    if (type === 'blob') entries.set(record.slice(tab + 1), blob);
  }
  return entries;
}

/**
 * 用 `git cat-file --batch` 一次读出多个 blob。
 *
 * @param {string} cwd 仓库内目录
 * @param {string[]} specs `<树>:<路径>` 列表
 * @returns {Buffer[]} 与 specs 一一对应
 */
function readBlobs(cwd, specs) {
  const output = execFileSync('git', ['cat-file', '--batch'], {
    cwd,
    input: specs.map(spec => `${spec}\n`).join(''),
    maxBuffer: MAX_BUFFER,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  const blobs = [];
  let offset = 0;
  while (offset < output.length) {
    const end = output.indexOf(0x0a, offset);
    const [, type, size] = output.subarray(offset, end).toString('utf8').split(' ');
    if (type !== 'blob') throw new Error(`读不到 ${specs[blobs.length]}`);
    blobs.push(output.subarray(end + 1, end + 1 + Number(size)));
    offset = end + 2 + Number(size);
  }
  return blobs;
}

function projectOf(file, content) {
  let name;
  try {
    ({ name } = JSON.parse(content.toString('utf8')));
  } catch {
    throw new Error(`${file} 不是合法 JSON`);
  }
  if (typeof name !== 'string' || name === '') throw new Error(`${file} 没有 name`);
  return { name, root: path.posix.dirname(file), key: projectKey(name) };
}

function projectsOf(cwd, tree, entries) {
  const files = [...entries.keys()].filter(file => path.posix.basename(file) === 'project.json');
  const contents = readBlobs(
    cwd,
    files.map(file => `${tree}:${file}`)
  );
  return files.map((file, index) => projectOf(file, contents[index])).sort((a, b) => compare(a.name, b.name));
}

/**
 * 快照里的 Nx 项目：每个 `project.json` 的 `name`，root 为其所在目录（仓库根为 `.`）。
 * 读的是快照对象而非工作区，审别的分支时拿到的是那条分支的项目图。
 *
 * @param {string} cwd 仓库内目录
 * @param {string} tree 树 SHA
 * @returns {{ name: string, root: string, key: string }[]} 按项目名排序
 */
export function listProjects(cwd, tree) {
  return projectsOf(cwd, tree, listTree(cwd, tree));
}

/**
 * 工作区快照：用临时 index 依次 `read-tree HEAD`、`add -A`、`write-tree`，收进修改、未跟踪与删除，
 * 真实 index 不动。连续两次结果不同就再捕获一次，仍不同则报错。
 *
 * @param {string} cwd 仓库内目录
 * @returns {string} 树 SHA
 */
export function captureWorktreeTree(cwd) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ai-review-index-'));
  const env = { ...process.env, GIT_INDEX_FILE: path.join(dir, 'index') };
  const capture = () => {
    git(cwd, ['read-tree', 'HEAD'], { env });
    git(cwd, ['add', '-A'], { env });
    return git(cwd, ['write-tree'], { env }).trim();
  };
  try {
    return stableTree(capture);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function stableTree(capture) {
  const first = capture();
  const second = capture();
  if (first === second) return first;
  if (capture() === second) return second;
  throw new Error('工作区在捕获期间一直在变，无法得到稳定快照');
}

function symbolicRef(cwd, rev) {
  const ref = git(cwd, ['rev-parse', '--symbolic-full-name', rev]).trim();
  return ref.startsWith('refs/') ? ref : null;
}

const changedPaths = (cwd, from, to) => splitNul(git(cwd, ['diff', '--name-only', '-z', '--no-renames', from, to]));

/**
 * 把 rev 解析成不可变快照。
 *
 * @param {string} cwd 仓库内目录
 * @param {{ rev?: string, worktree?: boolean }} [options] `worktree` 只适用于当前检出位的 HEAD
 * @returns {{ view: 'commit' | 'worktree', ref: string | null, commit: string, tree: string, dirty: string[] | null }}
 *   `ref` 是完整分支 ref（detached 或直接给 SHA 时为 null）；提交视图且 rev 就是当前 HEAD 时，
 *   `dirty` 列出工作区与快照不同的文件——读这些文件要用 `git show <commit>:<path>`
 */
export function resolveSnapshot(cwd, { rev = 'HEAD', worktree = false } = {}) {
  const commit = resolveCommit(cwd, rev);
  const atHead = commit === resolveCommit(cwd, 'HEAD');
  if (worktree && !atHead) throw new Error('--worktree 只适用于当前检出位的 HEAD');
  const ref = symbolicRef(cwd, rev);
  if (worktree) return { view: 'worktree', ref, commit, tree: captureWorktreeTree(cwd), dirty: null };
  const tree = treeOf(cwd, commit);
  return {
    view: 'commit',
    ref,
    commit,
    tree,
    dirty: atHead ? changedPaths(cwd, tree, captureWorktreeTree(cwd)) : null
  };
}

/**
 * 两棵树之间每个文件的改动行数；二进制文件为 `null`。
 *
 * @param {string} cwd 仓库内目录
 * @param {string} from 起点树
 * @param {string} to 终点树
 * @param {string[]} pathspecs 限定路径，空数组表示全树
 * @returns {Map<string, number | null>}
 */
function lineStats(cwd, from, to, pathspecs) {
  const args = ['diff', '--numstat', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', from, to];
  const stats = new Map();
  for (const field of splitNul(git(cwd, pathspecs.length ? [...args, '--', ...pathspecs] : args))) {
    const [added, deleted, ...name] = field.split('\t');
    stats.set(name.join('\t'), added === '-' ? null : Number(added) + Number(deleted));
  }
  return stats;
}

function rawDiff(cwd, from, to) {
  const args = ['diff', '--raw', '-z', '--no-renames', '--no-abbrev', '--no-ext-diff', '--no-textconv', from, to];
  const fields = splitNul(git(cwd, args));
  const changes = [];
  for (let index = 0; index < fields.length; index += 2) {
    const [, , base, blob] = fields[index].split(' ');
    changes.push({ path: fields[index + 1], base: objectOrNull(base), blob: objectOrNull(blob) });
  }
  return changes;
}

function uniqueMergeBase(cwd, base, commit) {
  if (base === undefined) throw new Error('range=branch 需要 base');
  const baseCommit = resolveCommit(cwd, base);
  const output = gitOr(cwd, ['merge-base', '--all', baseCommit, commit], `${base} 与 ${commit} 没有 merge base`);
  const bases = splitLines(output);
  if (bases.length !== 1)
    throw new Error(`${base} 与 ${commit} 的 merge base 不唯一（${bases.length} 个），先合并或 rebase 成单一基线`);
  return bases[0];
}

function candidates(names, query) {
  const wanted = query.toLowerCase();
  const near = [...names].filter(name => name.toLowerCase().includes(wanted) || wanted.includes(name.toLowerCase()));
  return near.length ? near.sort(compare).slice(0, 10).join('、') : '无';
}

function selectProjects(projects, wanted) {
  const names = new Set(projects.map(project => project.name));
  if (wanted === 'all') return names;
  for (const name of wanted) {
    if (!names.has(name)) throw new Error(`未知项目 ${name}；候选：${candidates(names, name)}`);
  }
  return new Set(wanted);
}

function exclusionOf(file, lines) {
  if (RECORD_PATH.test(file)) return 'review-records';
  if (LOCKFILES.has(path.posix.basename(file))) return 'lockfile';
  if (lines === null) return 'binary';
  return null;
}

const unitKey = (scope, unit) =>
  createHash('sha256')
    .update(JSON.stringify([scope.policy, scope.range, unit.path, unit.base, unit.blob]))
    .digest('hex');

function projectFiles(cwd, scope, head, projects) {
  const selected = selectProjects(projects, scope.projects);
  const roots = projects.filter(project => selected.has(project.name)).map(project => project.root);
  const stats = lineStats(cwd, emptyTree(cwd), scope.tree, roots.includes('.') ? [] : roots);
  const changes = [...head]
    .map(([file, blob]) => ({ path: file, base: null, blob, project: ownerOf(file, projects) }))
    .filter(change => selected.has(change.project))
    .map(change => ({ ...change, lines: stats.get(change.path) }));
  return { changes, mergeBase: null };
}

function branchChanges(cwd, scope, projects) {
  const mergeBase = uniqueMergeBase(cwd, scope.base, scope.commit);
  const baseTree = treeOf(cwd, mergeBase);
  const baseProjects = listProjects(cwd, baseTree);
  // 整个删掉或改了名的项目，原名只在 base 侧；它名下的删除单元也要选得到
  const selected = selectProjects([...baseProjects, ...projects], scope.projects);
  const stats = lineStats(cwd, baseTree, scope.tree, []);
  const changes = rawDiff(cwd, baseTree, scope.tree)
    .map(change => ({ ...change, project: ownerOf(change.path, change.blob === null ? baseProjects : projects) }))
    .filter(change => selected.has(change.project))
    .map(change => ({ ...change, lines: stats.get(change.path) }));
  return { changes, mergeBase };
}

/**
 * 本次范围的必审单元。
 *
 * - `range=project`：所选项目在快照里的全部文件；
 * - `range=branch`：`merge-base(base, commit)` 到快照的改动，删除的文件按 base 侧归属；项目名按 base 与快照
 *   两侧的并集认，整个删掉或改了名的项目用原名照样选得到。
 *
 * 评审记录（`requirements/reviews/`）、锁文件与二进制文件排除，原因列在 `excluded`。
 *
 * @param {string} cwd 仓库内目录
 * @param {{ commit: string, tree: string, projects: string[] | 'all', range: 'project' | 'branch', base?: string, policy: string }} scope
 * @returns {{ units: { path: string, base: string | null, blob: string | null, project: string, lines: number, key: string }[], excluded: { path: string, reason: string }[], mergeBase: string | null }}
 */
export function requiredUnits(cwd, scope) {
  if (!['project', 'branch'].includes(scope.range)) throw new Error(`range 只能是 project 或 branch：${scope.range}`);
  const head = listTree(cwd, scope.tree);
  const projects = projectsOf(cwd, scope.tree, head);
  const { changes, mergeBase } =
    scope.range === 'branch' ? branchChanges(cwd, scope, projects) : projectFiles(cwd, scope, head, projects);
  const units = [];
  const excluded = [];
  for (const change of changes) {
    const reason = exclusionOf(change.path, change.lines);
    if (reason) excluded.push({ path: change.path, reason });
    else units.push({ ...change, key: unitKey(scope, change) });
  }
  return { units: units.sort(byPath), excluded: excluded.sort(byPath), mergeBase };
}

/**
 * 分支改动涉及的项目（不指定项目时的默认范围）。只改评审记录不算。
 *
 * @param {string} cwd 仓库内目录
 * @param {{ commit: string, tree: string, base: string }} snapshot `commit` 用来求 merge base，`tree` 是内容
 * @returns {{ base: string, mergeBase: string, projects: string[] }}
 */
export function affectedProjects(cwd, { commit, tree, base }) {
  const mergeBase = uniqueMergeBase(cwd, base, commit);
  const baseTree = treeOf(cwd, mergeBase);
  const head = listProjects(cwd, tree);
  const old = listProjects(cwd, baseTree);
  const names = rawDiff(cwd, baseTree, tree)
    .filter(change => !RECORD_PATH.test(change.path))
    .map(change => ownerOf(change.path, change.blob === null ? old : head))
    .filter(name => name !== undefined);
  return { base, mergeBase, projects: [...new Set(names)].sort(compare) };
}

function entriesOf(root, dir) {
  try {
    return readdirSync(path.join(root, dir), { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return [];
    throw error;
  }
}

function markdownUnder(root, dir) {
  return entriesOf(root, dir).flatMap(entry => {
    const file = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return markdownUnder(root, file);
    return entry.name.endsWith('.md') ? [file] : [];
  });
}

/** 工作区里全部评审记录：仓库根 `requirements/reviews/` 与各应用的旧记录目录。 */
function recordIndex(root) {
  const apps = entriesOf(root, 'apps')
    .filter(entry => entry.isDirectory())
    .map(entry => `apps/${entry.name}/requirements/reviews`);
  return ['requirements/reviews', ...apps].flatMap(dir => markdownUnder(root, dir)).sort(compare);
}

function matchRecords(index, id, exact) {
  const wanted = id.toLowerCase();
  return index.filter(file => {
    const name = path.posix.basename(file).toLowerCase();
    return exact ? name === `${wanted}.md` || name.startsWith(`${wanted}-`) : name.startsWith(wanted);
  });
}

/**
 * 在工作区里按 ID 找评审记录。文件名是 `<ID>.md` 或 `<ID>-<slug>.md`。
 *
 * @param {string} root 工作区根目录
 * @param {string} query 完整 ID 或前缀（不区分大小写）
 * @param {{ exact?: boolean }} [options] `exact` 为真时只认完整 ID
 * @returns {string[]} 仓库相对路径，已排序
 */
export function findIssue(root, query, { exact = false } = {}) {
  if (!ISSUE_ID.test(query)) throw new Error(`问题 ID 格式不对：${query}`);
  return matchRecords(recordIndex(root), query, exact);
}

function stateFile(cwd) {
  const common = path.resolve(cwd, git(cwd, ['rev-parse', '--git-common-dir']).trim());
  return path.join(common, 'ai-review', 'v1', 'coverage.jsonl');
}

/** 封存标记的 `sealed` 值：日志末尾写断的半行由下一批写入另起一行封存。 */
const SEALED = 'torn-tail';

function parseOrUndefined(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

/**
 * 读覆盖日志。最后一段不以换行结尾（另一个进程尚未写完，或写到一半中断）不算数；
 * 紧挨在封存标记之前的损坏行是写断后被封存的半行，跳过；其余损坏行报错。
 */
function readCoverage(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const lines = text.split('\n');
  // 最后一段是空串，或另一个进程尚未写完的半行
  lines.pop();
  const entries = [];
  let sealed = false;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index] === '') continue;
    const entry = parseOrUndefined(lines[index]);
    if (entry === undefined && !sealed) throw new Error(`${file} 第 ${index + 1} 行损坏`);
    if (entry === undefined) continue;
    sealed = entry.sealed === SEALED;
    if (!sealed) entries.push(entry);
  }
  return entries.reverse();
}

function endsWithNewline(fd) {
  const { size } = fstatSync(fd);
  if (size === 0) return true;
  const last = Buffer.alloc(1);
  readSync(fd, last, 0, 1, size - 1);
  return last[0] === 0x0a;
}

/**
 * 整批一次追加。日志末尾是写断的半行时先另起一行写封存标记，新条目不会粘到半行上；
 * 检查与写入之间若有别的进程追加了完整的一批，只会多出空行与一条多余的标记，读取时都跳过。
 */
function appendBatch(file, text, at) {
  const fd = openSync(file, 'a+');
  try {
    const seal = endsWithNewline(fd) ? '' : `\n${JSON.stringify({ v: 1, sealed: SEALED, at })}\n`;
    writeFileSync(fd, `${seal}${text}`);
  } finally {
    closeSync(fd);
  }
}

function skipReason(item) {
  if (typeof item.skip !== 'string' || item.skip === '') throw new Error(`${item.path}：skip 要写理由`);
  if (item.context !== undefined || item.findings !== undefined)
    throw new Error(`${item.path}：skip 不能与 context / findings 同时出现`);
  return item.skip;
}

function contextOf(item, blobs) {
  if (!Array.isArray(item.context)) throw new Error(`${item.path}：缺少 context 数组（没有就写 []）`);
  return item.context.map(file => {
    if (!blobs.has(file)) throw new Error(`上下文路径不存在：${file}`);
    return [file, blobs.get(file)];
  });
}

function findingsOf(item, records) {
  if (!Array.isArray(item.findings)) throw new Error(`${item.path}：缺少 findings 数组（没有就写 []）`);
  for (const id of item.findings) {
    const found = matchRecords(records, id, true);
    if (found.length !== 1) throw new Error(`找不到记录 ${id}：先写记录再登记覆盖（匹配到 ${found.length} 份）`);
  }
  return item.findings;
}

function entryOf(scope, unit, item, meta) {
  const common = {
    v: 1,
    key: unit.key,
    project: unit.project,
    path: unit.path,
    range: scope.range,
    base: unit.base,
    blob: unit.blob,
    policy: scope.policy,
    commit: scope.commit,
    tree: scope.tree,
    reviewer: meta.reviewer,
    session: meta.session,
    at: meta.at
  };
  if (item.skip !== undefined) return { ...common, skip: skipReason(item), context: [], findings: [] };
  return { ...common, skip: null, context: contextOf(item, meta.blobs), findings: findingsOf(item, meta.records) };
}

/**
 * 登记一批已审单元。路径必须属于本次范围；上下文路径必须在快照里；`findings` 里的记录必须已经写在工作区。
 * 整批一次追加写入。
 *
 * @param {string} cwd 仓库内目录
 * @param {Parameters<typeof requiredUnits>[1]} scope 本次范围
 * @param {{ reviewer: string, session?: string, units: { path: string, context?: string[], findings?: string[], skip?: string }[] }} input
 *   `reviewer` 是 `<provider>/<model>`，取不到写 `unknown`；`skip` 写不审的理由，不能与 context / findings 同时出现
 * @param {{ now?: Date }} [options]
 * @returns {number} 写入条数
 */
export function recordCoverage(cwd, scope, input, { now = new Date() } = {}) {
  const { reviewer, session = 'unknown', units } = input;
  if (typeof reviewer !== 'string' || reviewer === '') throw new Error('缺少 reviewer（取不到写 unknown）');
  if (!Array.isArray(units) || units.length === 0) throw new Error('units 不能为空');
  const required = new Map(requiredUnits(cwd, scope).units.map(unit => [unit.path, unit]));
  const meta = {
    reviewer,
    session,
    at: now.toISOString(),
    blobs: listTree(cwd, scope.tree),
    records: recordIndex(topLevel(cwd))
  };
  const seen = new Set();
  const lines = units.map(item => {
    if (seen.has(item.path)) throw new Error(`重复登记：${item.path}`);
    seen.add(item.path);
    const unit = required.get(item.path);
    if (unit === undefined) throw new Error(`不在本次范围：${item.path}`);
    return `${JSON.stringify(entryOf(scope, unit, item, meta))}\n`;
  });
  const file = stateFile(cwd);
  mkdirSync(path.dirname(file), { recursive: true });
  appendBatch(file, lines.join(''), meta.at);
  return lines.length;
}

function staleReason(entry, { blobs, records }) {
  const changed = entry.context.find(([file, blob]) => blobs.get(file) !== blob);
  if (changed) return `上下文已变：${changed[0]}`;
  const missing = entry.findings.find(id => matchRecords(records, id, true).length !== 1);
  return missing === undefined ? null : `记录缺失：${missing}`;
}

function judge(unit, entries, current) {
  const reasons = [];
  for (const entry of entries.toReversed()) {
    const reason = staleReason(entry, current);
    if (reason === null) return { unit, entry, reason: null };
    reasons.push(reason);
  }
  return { unit, entry: null, reason: reasons[0] ?? null };
}

/** `--since` 换成毫秒时刻；按时刻比较，不按字符串（同一秒内带毫秒的覆盖时间字典序反而在不带毫秒的开始时间之前）。 */
function startOf(since) {
  if (since === undefined) return undefined;
  const start = Date.parse(since);
  if (Number.isNaN(start)) throw new Error(`--since 不是合法的时间：${since}（用 ISO 8601，如 2026-11-08T08:10:30Z）`);
  return start;
}

function accepts(entry, independent, start) {
  if (independent !== undefined && entry.reviewer !== independent) return false;
  return start === undefined || Date.parse(entry.at) >= start;
}

function countBy(items, keyOf) {
  const counts = new Map();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  return Object.fromEntries(counts);
}

function projectBreakdown(verdicts) {
  const groups = Map.groupBy(verdicts, verdict => verdict.unit.project);
  return Object.fromEntries(
    [...groups].map(([project, items]) => [
      project,
      { required: items.length, outstanding: items.filter(item => item.entry === null).length }
    ])
  );
}

function summarize(scope, { verdicts, excluded, mergeBase, limit }) {
  const open = verdicts.filter(verdict => verdict.entry === null);
  const done = verdicts.filter(verdict => verdict.entry !== null);
  const skipped = done.filter(verdict => verdict.entry.skip !== null);
  return {
    commit: scope.commit,
    tree: scope.tree,
    range: scope.range,
    base: scope.base ?? null,
    mergeBase,
    policy: scope.policy,
    required: verdicts.length,
    covered: done.length - skipped.length,
    skipped: skipped.map(verdict => ({ path: verdict.unit.path, reason: verdict.entry.skip })),
    outstanding: open.length,
    outstandingLines: open.reduce((total, verdict) => total + verdict.unit.lines, 0),
    complete: open.length === 0,
    reviewers: countBy(done, verdict => verdict.entry.reviewer),
    byProject: projectBreakdown(verdicts),
    outstandingPaths: open.slice(0, limit).map(verdict => verdict.unit.path),
    invalid: open
      .filter(verdict => verdict.reason !== null)
      .slice(0, limit)
      .map(verdict => ({ path: verdict.unit.path, reason: verdict.reason })),
    excluded: excluded.slice(0, limit),
    excludedCount: excluded.length
  };
}

/**
 * 本次范围的覆盖状态：每个必审单元取最新一条仍有效的覆盖。
 *
 * @param {string} cwd 仓库内目录
 * @param {Parameters<typeof requiredUnits>[1]} scope 本次范围
 * @param {{ independent?: string, since?: string, limit?: number }} [filters]
 *   `independent`：只认这个评审者签名（独立复审，`unknown` 不行）；`since`：只认此 ISO 时间之后的覆盖（全量）；
 *   `limit`：清单类字段最多列几条
 * @returns {ReturnType<typeof summarize>}
 */
export function coverageStatus(cwd, scope, { independent, since, limit = 50 } = {}) {
  if (independent === 'unknown') throw new Error('身份未知不能做独立复审：去掉 --independent，按默认接续');
  const start = startOf(since);
  const { units, excluded, mergeBase } = requiredUnits(cwd, scope);
  const accepted = readCoverage(stateFile(cwd)).filter(entry => accepts(entry, independent, start));
  const entries = Map.groupBy(accepted, entry => entry.key);
  const current = { blobs: listTree(cwd, scope.tree), records: recordIndex(topLevel(cwd)) };
  const verdicts = units.map(unit => judge(unit, entries.get(unit.key) ?? [], current));
  return summarize(scope, { verdicts, excluded, mergeBase, limit });
}

/**
 * 评审标准的摘要，进单元键。
 *
 * @param {string} [file] 评审标准文件
 * @returns {string}
 */
export function policyDigest(file = RUBRIC) {
  return `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;
}

const repo = () => topLevel(process.cwd());
const verifyTree = (cwd, sha) => gitOr(cwd, ['rev-parse', '--verify', '--quiet', `${sha}^{tree}`], `找不到树 ${sha}`);
const snapshotTree = (cwd, values) =>
  values.tree === undefined ? treeOf(cwd, resolveCommit(cwd, values.rev)) : verifyTree(cwd, values.tree);
const defaultBase = cwd =>
  gitOr(
    cwd,
    ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
    'origin/HEAD 未设置：显式传 --base，或先跑 git remote set-head origin --auto'
  );

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  return 0;
}

function positiveInt(text) {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--limit 要是正整数：${text}`);
  return value;
}

function scopeFrom(cwd, values) {
  if (values.project === undefined) throw new Error('缺少 --project（多个用逗号分隔，全部写 all）');
  if (values.range !== 'branch' && values.base !== undefined) throw new Error('--base 只用于 --range branch');
  const names = values.project.flatMap(value => value.split(',')).map(name => name.trim());
  return {
    commit: resolveCommit(cwd, values.rev),
    tree: snapshotTree(cwd, values),
    projects: names.length === 1 && names[0] === 'all' ? 'all' : names,
    range: values.range,
    base: values.range === 'branch' ? (values.base ?? defaultBase(cwd)) : undefined,
    policy: policyDigest()
  };
}

const REV = { type: 'string', default: 'HEAD' };
const TREE = { type: 'string' };
const SCOPE = {
  rev: REV,
  tree: TREE,
  project: { type: 'string', multiple: true },
  range: { type: 'string', default: 'project' },
  base: { type: 'string' }
};

const COMMANDS = {
  snapshot: {
    options: { rev: REV, worktree: { type: 'boolean', default: false } },
    run: ({ values }) => print(resolveSnapshot(repo(), values))
  },
  projects: {
    options: { rev: REV, tree: TREE },
    run: ({ values }) => {
      const cwd = repo();
      return print(listProjects(cwd, snapshotTree(cwd, values)));
    }
  },
  affected: {
    options: { rev: REV, tree: TREE, base: { type: 'string' } },
    run: ({ values }) => {
      const cwd = repo();
      const snapshot = { commit: resolveCommit(cwd, values.rev), tree: snapshotTree(cwd, values) };
      return print(affectedProjects(cwd, { ...snapshot, base: values.base ?? defaultBase(cwd) }));
    }
  },
  status: {
    options: {
      ...SCOPE,
      independent: { type: 'string' },
      since: { type: 'string' },
      limit: { type: 'string', default: '50' }
    },
    run: ({ values }) => {
      const cwd = repo();
      const filters = { independent: values.independent, since: values.since, limit: positiveInt(values.limit) };
      return print(coverageStatus(cwd, scopeFrom(cwd, values), filters));
    }
  },
  cover: {
    options: { ...SCOPE, input: { type: 'string' } },
    run: ({ values }) => {
      if (values.input === undefined) throw new Error('缺少 --input（JSON 文件，- 表示 stdin）');
      const cwd = repo();
      const scope = scopeFrom(cwd, values);
      const recorded = recordCoverage(
        cwd,
        scope,
        JSON.parse(readFileSync(values.input === '-' ? 0 : values.input, 'utf8'))
      );
      const { outstanding, complete } = coverageStatus(cwd, scope);
      return print({ recorded, outstanding, complete });
    }
  },
  'new-id': {
    options: { prefix: { type: 'string', default: 'RV' } },
    run: ({ values }) => {
      if (!['RV', 'EV'].includes(values.prefix)) throw new Error('--prefix 只能是 RV 或 EV');
      process.stdout.write(`${newId(values.prefix)}\n`);
      return 0;
    }
  },
  'find-issue': {
    options: {},
    run: ({ positionals }) => {
      if (positionals.length !== 1) throw new Error('用法：find-issue <RV-ID 或前缀>');
      const matches = findIssue(repo(), positionals[0]);
      print({ query: positionals[0], matches });
      return matches.length === 1 ? 0 : 1;
    }
  }
};

/**
 * 命令行入口。
 *
 * @param {string[]} argv 命令与参数
 * @returns {number} 退出码
 */
export function main(argv) {
  const [name, ...args] = argv;
  if (!Object.hasOwn(COMMANDS, name)) throw new Error(`未知命令 ${name}；可用：${Object.keys(COMMANDS).join(' / ')}`);
  const command = COMMANDS[name];
  return command.run(parseArgs({ args, options: command.options, allowPositionals: name === 'find-issue' }));
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`ai-review: ${error.message}\n`);
    process.exitCode = 1;
  }
}
