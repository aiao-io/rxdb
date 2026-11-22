import { Service, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { Preferences } from '../data/preferences';
import type { DiskPath } from '../disk/disk-path';
import { assertGitPath, assertNoPathCollisions } from './git/git-paths';
import { GIT_WORKBENCH_LIMITS } from './git/git-protocol';
import type { GitFile } from './github-git-backend';
import type { GitHubApi, GitHubTreeItem } from './github/github-api';
import { GitHubApiError } from './github/github-api';
import type { GitHubTreeEntry } from './github/github-types';

const REPOSITORIES_KEY = 'github:repositories';

export interface GithubRepositoryRecord {
  readonly projectId: string;
  readonly name: string;
  readonly owner: string | null;
  readonly repo: string | null;
  readonly branch: string;
  readonly private: boolean;
  readonly remoteHead: string | null;
  readonly remoteTree: string | null;
  readonly fetched?: { readonly branch: string; readonly head: string };
  readonly remoteEntries: readonly GitHubTreeEntry[];
  readonly updatedAt: number;
  /** 终端和 Finder 目录对应的卷内路径，外部导入的仓库没有这个路径。 */
  readonly rootPath?: DiskPath;
}

export interface GithubRemoteOpen {
  readonly record: GithubRepositoryRecord;
  readonly files: readonly GitFile[];
}

export interface GithubPushResult {
  readonly head: string;
  readonly tree: string;
}

const isString = (value: unknown): value is string => typeof value === 'string';

function isTreeEntry(value: unknown): value is GitHubTreeEntry {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return isString(item['path']) && isString(item['sha']) && isString(item['mode']);
}

function isRecord(value: unknown): value is GithubRepositoryRecord {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return (
    isString(item['projectId']) &&
    isString(item['name']) &&
    (item['owner'] === null || isString(item['owner'])) &&
    (item['repo'] === null || isString(item['repo'])) &&
    isString(item['branch']) &&
    typeof item['private'] === 'boolean' &&
    (item['remoteHead'] === null || isString(item['remoteHead'])) &&
    (item['remoteTree'] === null || isString(item['remoteTree'])) &&
    Array.isArray(item['remoteEntries']) &&
    item['remoteEntries'].every(isTreeEntry) &&
    Number.isSafeInteger(item['updatedAt']) &&
    (item['fetched'] === undefined ||
      (typeof item['fetched'] === 'object' &&
        item['fetched'] !== null &&
        'branch' in item['fetched'] &&
        isString(item['fetched'].branch) &&
        'head' in item['fetched'] &&
        isString(item['fetched'].head))) &&
    (item['rootPath'] === undefined ||
      (Array.isArray(item['rootPath']) &&
        item['rootPath'].every(value => typeof value === 'string' && value.length > 0)))
  );
}

function recordsOf(value: unknown): value is readonly GithubRepositoryRecord[] {
  return Array.isArray(value) && value.every(isRecord);
}

export interface GithubRemoteAddress {
  readonly owner: string;
  readonly repo: string;
  readonly branch?: string;
}

export function parseGithubRemote(value: string): GithubRemoteAddress | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let path = trimmed;
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'github.com' ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        return null;
      path = url.pathname;
    } catch {
      return null;
    }
  }
  const parts = path.replace(/^\/+|\/+$/g, '').split('/');
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/i, '');
  if (!/^[a-z\d-]+$/i.test(owner) || !repo || !/^[\w.-]+$/.test(repo) || /^\.{1,2}$/.test(repo)) return null;
  if (parts.length === 2) return { owner, repo };
  if (parts[2] !== 'tree' || parts.length < 4) return null;
  try {
    const branch = decodeURIComponent(parts.slice(3).join('/'));
    const hasControlCharacter = [...branch].some(character => {
      const code = character.charCodeAt(0);
      return code <= 0x1f || code === 0x7f;
    });
    const hasInvalidCharacter =
      /\s/.test(branch) || /[~^:?*\\|]/.test(branch) || branch.includes('[') || branch.includes(']');
    return (
        branch &&
          !hasControlCharacter &&
          !hasInvalidCharacter &&
          !branch.startsWith('/') &&
          !branch.endsWith('/') &&
          !branch.includes('//')
      ) ?
        { owner, repo, branch }
      : null;
  } catch {
    return null;
  }
}

function pathHash(path: readonly string[]): string {
  let hash = 2166136261;
  for (const character of path.join('\u0000')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** 卷内目录的稳定项目标识，保证终端、GitHub Desktop 和 Aiao Code 打开同一个目录时复用仓库。 */
export function projectIdForPath(path: DiskPath): string {
  const slug = path
    .join('-')
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const suffix = pathHash(path);
  return `local-${(slug || 'repository').slice(0, 50)}-${suffix}`.slice(0, 64);
}

function projectIdFor(owner: string, repo: string, branch: string): string {
  const slug = `${owner}-${repo}-${branch}`
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  const plain = `github-${slug || 'repository'}`;
  const source = `${owner}-${repo}-${branch}`.toLowerCase();
  const needsHash = plain.length > 64 || slug !== source;
  if (!needsHash) return plain;
  let hash = 2166136261;
  for (const character of `${owner}\u0000${repo}\u0000${branch}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = `-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  return `${plain.slice(0, 64 - suffix.length)}${suffix}`;
}

function fileBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(value) as Uint8Array<ArrayBuffer>;
}

function isBinary(bytes: Uint8Array): boolean {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.includes('\0');
  } catch {
    return true;
  }
}

function sameBytes(left: Uint8Array | undefined, right: Uint8Array | undefined): boolean {
  if (!left || !right) return !left && !right;
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function validateRemoteEntries(entries: readonly GitHubTreeEntry[]): void {
  const unsupported = entries.find(entry => entry.mode !== '100644');
  if (unsupported) throw new Error(`远端文件模式不受支持：${unsupported.path}（${unsupported.mode}）`);
  entries.forEach(entry => assertGitPath(entry.path));
  const paths = entries.map(entry => entry.path);
  if (new Set(paths).size !== paths.length) throw new Error('远端树包含重复路径');
  assertNoPathCollisions(paths);
  if (entries.length > GIT_WORKBENCH_LIMITS.files) throw new Error(`远端文件数超过 ${GIT_WORKBENCH_LIMITS.files} 个`);
}

function validateLocalFiles(files: readonly GitFile[]): void {
  files.forEach(file => {
    assertGitPath(file.path);
    if (file.bytes.byteLength > GIT_WORKBENCH_LIMITS.fileBytes)
      throw new Error(`文件超过 ${GIT_WORKBENCH_LIMITS.fileBytes} 字节上限：${file.path}`);
  });
  const paths = files.map(file => file.path);
  if (new Set(paths).size !== paths.length) throw new Error('本地工作区包含重复路径');
  assertNoPathCollisions(paths);
  if (files.length > GIT_WORKBENCH_LIMITS.files) throw new Error(`文件数超过 ${GIT_WORKBENCH_LIMITS.files} 个`);
  const total = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  if (total > GIT_WORKBENCH_LIMITS.totalBytes)
    throw new Error(`文件总大小超过 ${GIT_WORKBENCH_LIMITS.totalBytes} 字节`);
}

function mergeFiles(
  baseFiles: readonly GitFile[],
  localFiles: readonly GitFile[],
  remoteFiles: readonly GitFile[]
): { readonly files: readonly GitFile[]; readonly conflicts: readonly string[] } {
  const base = new Map(baseFiles.map(file => [file.path, file.bytes]));
  const local = new Map(localFiles.map(file => [file.path, file.bytes]));
  const remote = new Map(remoteFiles.map(file => [file.path, file.bytes]));
  const paths = new Set([...base.keys(), ...local.keys(), ...remote.keys()]);
  const files: GitFile[] = [];
  const conflicts: string[] = [];
  for (const path of [...paths].sort((left, right) => left.localeCompare(right, 'en'))) {
    const baseFile = base.get(path);
    const localFile = local.get(path);
    const remoteFile = remote.get(path);
    let value: Uint8Array | undefined;
    let conflict = false;
    if (sameBytes(localFile, baseFile)) value = remoteFile;
    else if (sameBytes(remoteFile, baseFile) || sameBytes(localFile, remoteFile)) value = localFile;
    else conflict = true;
    if (conflict) conflicts.push(path);
    else if (value !== undefined) files.push({ path, bytes: fileBytes(value) });
  }
  return { files, conflicts };
}

function toTreeItem(file: GitFile, api: GitHubApi, owner: string, repo: string): Promise<GitHubTreeItem> {
  const bytes = file.bytes;
  if (!isBinary(bytes) && bytes.byteLength <= 512 * 1024)
    return Promise.resolve({ path: file.path, mode: '100644', content: new TextDecoder().decode(bytes) });
  return api.createBlob(owner, repo, bytes).then(sha => ({ path: file.path, mode: '100644', sha }));
}

function remoteFailure(cause: unknown, context: string): Error {
  if (!(cause instanceof GitHubApiError)) return cause instanceof Error ? cause : new Error(String(cause));
  switch (cause.code) {
    case 'auth_required':
      return new Error('需要登录 GitHub 才能访问该仓库', { cause });
    case 'not_found':
      return new Error(`仓库不存在或无权访问：${context}`, { cause });
    case 'forbidden':
      return new Error(`GitHub 拒绝了请求：${context}`, { cause });
    case 'conflict':
      return new Error('远端分支已变化，请先拉取并处理冲突', { cause });
    case 'rate_limited':
      return new Error('GitHub 请求超出限额，请稍后重试', { cause });
    case 'network_failed':
      return new Error('无法连接 GitHub API', { cause });
    default:
      return new Error(cause.message, { cause });
  }
}

/** GitHub 应用的仓库目录。OPFS 只由 Git Worker 管理，桌面库只保存坐标与界面元数据。 */
@Service({ autoProvided: false })
export class GithubRepositoryStore {
  private readonly preferences = inject(Preferences);
  private readonly recordsState = signal<readonly GithubRepositoryRecord[]>([]);
  private loaded: Promise<void>;

  readonly records = this.recordsState.asReadonly();

  constructor() {
    this.loaded = this.load();
    this.loaded.catch(() => undefined);
    this.preferences.external$.pipe(takeUntilDestroyed()).subscribe(keys => {
      if (keys.includes(REPOSITORIES_KEY)) {
        this.recordsState.set([...(this.preferences.get(REPOSITORIES_KEY, recordsOf) ?? [])]);
      }
    });
  }

  async ready(): Promise<void> {
    return this.loaded;
  }

  async put(record: GithubRepositoryRecord): Promise<void> {
    await this.loaded;
    await this.preferences.update(REPOSITORIES_KEY, recordsOf, current => {
      const next = [...(current ?? []).filter(item => item.projectId !== record.projectId), record];
      return next.sort((left, right) => right.updatedAt - left.updatedAt);
    });
    this.recordsState.set([...(this.preferences.get(REPOSITORIES_KEY, recordsOf) ?? [])]);
  }

  async remove(projectId: string): Promise<void> {
    await this.loaded;
    await this.preferences.update(REPOSITORIES_KEY, recordsOf, current =>
      (current ?? []).filter(item => item.projectId !== projectId)
    );
    this.recordsState.set([...(this.preferences.get(REPOSITORIES_KEY, recordsOf) ?? [])]);
  }

  find(projectId: string): GithubRepositoryRecord | undefined {
    return this.recordsState().find(item => item.projectId === projectId);
  }

  private async load(): Promise<void> {
    await this.preferences.ready;
    const value = this.preferences.get(REPOSITORIES_KEY, recordsOf);
    this.recordsState.set(value ? [...value] : []);
  }
}

/** 本地 Git 与 GitHub API 之间的仓库操作，远端变更先校验 head 再写入。 */
export class GithubRemoteRepository {
  constructor(private readonly api: GitHubApi) {}

  async open(owner: string, repo: string, branch?: string): Promise<GithubRemoteOpen> {
    try {
      const repository = await this.api.getRepository(owner, repo);
      const selectedBranch = branch ?? repository.defaultBranch;
      const head = await this.api.getBranchSha(owner, repo, selectedBranch);
      const commit = await this.api.getCommit(owner, repo, head);
      const entries = (await this.api.getTreeFiles(owner, repo, commit.treeSha)).filter(
        entry => entry.mode !== '160000'
      );
      validateRemoteEntries(entries);
      const files = await this.readFiles(owner, repo, entries);
      const total = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
      if (total > GIT_WORKBENCH_LIMITS.totalBytes) throw new Error('远端仓库超过本地工作台大小上限');
      return {
        record: {
          projectId: projectIdFor(owner, repo, selectedBranch),
          name: `${owner}/${repo}`,
          owner,
          repo,
          branch: selectedBranch,
          private: repository.isPrivate,
          remoteHead: head,
          remoteTree: commit.treeSha,
          remoteEntries: entries,
          updatedAt: Date.now()
        },
        files
      };
    } catch (cause) {
      throw remoteFailure(cause, `${owner}/${repo}`);
    }
  }

  async pull(
    record: GithubRepositoryRecord,
    localFiles: readonly GitFile[],
    localDirty: boolean,
    knownRemote?: GithubRemoteOpen
  ): Promise<GithubRemoteOpen> {
    validateLocalFiles(localFiles);
    if (!record.owner || !record.repo) throw new Error('本地仓库没有 GitHub 远端坐标');
    const remote = knownRemote ?? (await this.open(record.owner, record.repo, record.branch));
    if (record.remoteHead && remote.record.remoteHead === record.remoteHead)
      return { record: { ...record, updatedAt: Date.now() }, files: localFiles };
    if (!localDirty) return remote;
    const base = await this.readBase(record);
    const merged = mergeFiles(base, localFiles, remote.files);
    if (merged.conflicts.length) throw new Error(`远端与本地提交存在冲突：${merged.conflicts.join(', ')}`);
    return { record: remote.record, files: merged.files };
  }

  async push(record: GithubRepositoryRecord, files: readonly GitFile[], message: string): Promise<GithubPushResult> {
    validateLocalFiles(files);
    const { owner, repo, branch } = record;
    if (!owner || !repo) throw new Error('请先配置 GitHub 远端 origin');
    const summary = message.trim() || 'Update from Aiao Desktop';
    try {
      if (!record.remoteHead || !record.remoteTree) return await this.firstPush(owner, repo, branch, files, summary);
      const currentHead = await this.api.getBranchSha(owner, repo, branch);
      if (currentHead !== record.remoteHead) throw new Error('远端分支已变化，请先拉取远端更改');
      const baseEntries = await this.entriesForTree(record);
      validateRemoteEntries(baseEntries);
      const items = await Promise.all(files.map(file => toTreeItem(file, this.api, owner, repo)));
      const localPaths = new Set(files.map(file => file.path));
      const deleted = baseEntries
        .filter(entry => !localPaths.has(entry.path))
        .map(entry => ({ path: entry.path, sha: null }) satisfies GitHubTreeItem);
      return await this.advanceBranch(
        owner,
        repo,
        branch,
        { head: record.remoteHead, tree: record.remoteTree },
        [...items, ...deleted],
        summary
      );
    } catch (cause) {
      throw remoteFailure(cause, `${record.owner}/${record.repo}@${record.branch}`);
    }
  }

  private async firstPush(
    owner: string,
    repo: string,
    branch: string,
    files: readonly GitFile[],
    message: string
  ): Promise<GithubPushResult> {
    const repository = await this.api.getRepository(owner, repo);
    const branches = await this.api.listBranches(owner, repo);
    if (branches.length) throw new Error('远端已有提交，请先拉取远端更改');
    if (repository.defaultBranch !== branch)
      throw new Error(`空仓库的首次推送请使用默认分支 ${repository.defaultBranch}`);
    const [first, ...rest] = files;
    if (!first) throw new Error('首次推送需要一个已提交的文件');
    const initial = await this.api.createInitialFile(owner, repo, branch, first.path, first.bytes, message);
    if (!rest.length) return initial;
    if ((await this.api.getBranchSha(owner, repo, branch)) !== initial.head)
      throw new Error('远端分支已变化，请先拉取远端更改');
    const items = await Promise.all(rest.map(file => toTreeItem(file, this.api, owner, repo)));
    return this.advanceBranch(owner, repo, branch, initial, items, message);
  }

  private async advanceBranch(
    owner: string,
    repo: string,
    branch: string,
    base: GithubPushResult,
    items: readonly GitHubTreeItem[],
    message: string
  ): Promise<GithubPushResult> {
    const tree = await this.api.createTree(owner, repo, base.tree, items);
    const head = await this.api.createCommit(owner, repo, message, tree, [base.head]);
    await this.api.updateRef(owner, repo, `heads/${branch}`, head);
    return { head, tree };
  }

  private async readFiles(
    owner: string,
    repo: string,
    entries: readonly GitHubTreeEntry[]
  ): Promise<readonly GitFile[]> {
    validateRemoteEntries(entries);
    const files: GitFile[] = [];
    for (const entry of entries) {
      const bytes = await this.api.getBlobContents(owner, repo, entry.sha);
      if (bytes.byteLength > GIT_WORKBENCH_LIMITS.fileBytes)
        throw new Error(`文件超过 ${GIT_WORKBENCH_LIMITS.fileBytes} 字节上限：${entry.path}`);
      files.push({ path: entry.path, bytes: fileBytes(bytes) });
    }
    return files;
  }

  private async entriesForTree(record: GithubRepositoryRecord): Promise<readonly GitHubTreeEntry[]> {
    if (!record.owner || !record.repo) throw new Error('本地仓库没有 GitHub 远端坐标');
    if (record.remoteEntries.length) return record.remoteEntries;
    if (record.remoteTree) return this.api.getTreeFiles(record.owner, record.repo, record.remoteTree);
    if (!record.remoteHead) return [];
    const commit = await this.api.getCommit(record.owner, record.repo, record.remoteHead);
    return this.api.getTreeFiles(record.owner, record.repo, commit.treeSha);
  }

  private async readBase(record: GithubRepositoryRecord): Promise<readonly GitFile[]> {
    if (!record.owner || !record.repo) return [];
    return this.readFiles(record.owner, record.repo, await this.entriesForTree(record));
  }
}

export { projectIdFor };
