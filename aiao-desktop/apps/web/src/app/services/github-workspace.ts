import type { OrbitValue } from '@aiao/orbit';
import { decodeBase64, encodeBase64, type DesktopWorkspaceRequest } from '@aiao/orbit/desktop';
import { DestroyRef, Service, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { HOME, isRequiredDiskPath, isWithin, parentOf, samePath, toVmPath, type DiskPath } from '../disk/disk-path';
import { runWorkspaceGit, type GithubTerminalRequest } from '../vm/workspace-git';
import { DesktopAppServices } from './desktop-app-services';
import { FileSystem } from './file-system';
import { GitWorkbenchError } from './git/git-protocol';
import { GithubConnection } from './github-connection';
import { GithubGitBackend, type GitFile, type GitSnapshot } from './github-git-backend';
import {
  GithubRepositoryStore,
  parseGithubRemote,
  projectIdForPath,
  type GithubRepositoryRecord
} from './github-repository';
import { bindVolumeRepository, gitfile } from './github-volume-binding';
import { volumeJournal } from './github-volume-journal';
import {
  hashBytes,
  projectionHashes,
  publishWorkingFiles,
  recoverWorkingFiles,
  worktreeDelta,
  worktreeFiles
} from './github-worktree';

function wire(value: unknown): OrbitValue {
  if (value instanceof Uint8Array) return encodeBase64(value);
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number')
    return value;
  if (Array.isArray(value)) return value.map(wire);
  if (typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, wire(item)]));
  throw new Error('Invalid workspace result');
}

function requireRoot(root: DiskPath): void {
  if (
    !isWithin(root, HOME) ||
    isRequiredDiskPath(root) ||
    root.some(
      part =>
        !part ||
        ['.', '..', '.git'].includes(part) ||
        part.includes('/') ||
        part.includes('\\') ||
        Array.from(part).some(ch => ch.charCodeAt(0) < 32)
    )
  )
    throw new GitWorkbenchError('invalid_path', '请选择 Macintosh HD 主目录内的项目文件夹');
}

function recordFor(
  projectId: string,
  rootPath: DiskPath,
  branch: string
): GithubRepositoryRecord & { rootPath: DiskPath } {
  return {
    projectId,
    rootPath,
    name: rootPath.at(-1)!,
    owner: null,
    repo: null,
    private: false,
    branch,
    remoteHead: null,
    remoteTree: null,
    remoteEntries: [],
    updatedAt: Date.now()
  };
}

function forBranch(record: GithubRepositoryRecord, branch: string): GithubRepositoryRecord {
  if (record.branch === branch) return record;
  const branches = new Map(record.branchBases?.map(base => [base.branch, base]));
  const base = branches.get(branch);
  branches.delete(branch);
  if (record.remoteHead && record.remoteTree)
    branches.set(record.branch, { branch: record.branch, head: record.remoteHead, tree: record.remoteTree });
  return {
    ...record,
    branch,
    remoteHead: base?.head ?? null,
    remoteTree: base?.tree ?? null,
    remoteEntries: [],
    branchBases: [...branches.values()]
  };
}

/** 所有入口共用仓库锁和 Worker。卷内工作文件的读、Git 操作与增量发布持有同一把桌面磁盘锁。 */
@Service({ autoProvided: false })
export class GithubWorkspace {
  private readonly files = inject(FileSystem);
  private worker?: GithubGitBackend;
  private get git() {
    return (this.worker ??= new GithubGitBackend());
  }
  readonly records = inject(DesktopAppServices).get(GithubRepositoryStore);
  readonly connection = inject(DesktopAppServices).get(GithubConnection);
  readonly changes = new Subject<string>();
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.worker?.dispose();
      this.changes.complete();
    });
  }
  restart(): void {
    this.worker?.restart();
  }

  async repositoryAt(root: DiskPath) {
    await this.records.ready();
    return this.records
      .records()
      .filter(item => item.rootPath && isWithin(root, item.rootPath))
      .sort((a, b) => b.rootPath!.length - a.rootPath!.length)[0];
  }

  async localDirectoryRoot(path: DiskPath): Promise<DiskPath> {
    requireRoot(path);
    return this.files.run(async store => {
      if ((await store.kindOf(path)) !== 'directory') throw new Error(`找不到项目文件夹：${toVmPath(path)}`);
      for (let root = path; root.length > HOME.length; root = parentOf(root)) {
        if (await store.kindOf([...root, '.git'])) return root;
      }
      return path;
    });
  }

  async openDirectory(
    root: DiskPath,
    { initialize = false, requireExisting = false }: { initialize?: boolean; requireExisting?: boolean } = {}
  ): Promise<GithubRepositoryRecord> {
    requireRoot(root);
    await this.records.ready();
    const projectId =
      this.records.records().find(item => item.rootPath && samePath(item.rootPath, root))?.projectId ??
      projectIdForPath(root);
    return this.lock(projectId, async () => {
      const record = this.records.find(projectId);
      if (record && !samePath(root, record.rootPath ?? [])) throw new Error('仓库标识已被其他目录使用');
      if (record) {
        await this.withWorktree(projectId, 'read', () => this.git.open(projectId));
        return record;
      }
      const result = await this.files.run(async store => {
        if (requireExisting && (await store.kindOf(root)) !== 'directory')
          throw new Error(`找不到项目文件夹：${toVmPath(root)}`);
        return bindVolumeRepository(store, root, projectId, this.git, { initialize }, snapshot =>
          this.registerDirectory(root, snapshot)
        );
      });
      this.files.notifyChanges([root]);
      this.changes.next(projectId);
      return result.record;
    });
  }

  async createDirectory(root: DiskPath, files: readonly GitFile[]) {
    return (await this.addDirectory(root, 'new', id => this.git.create(id, files))).record;
  }
  async importDirectory(name: string, archive: Uint8Array<ArrayBuffer>) {
    const digest = await hashBytes(archive);
    return this.addDirectory([...HOME, 'Documents', 'GitHub', name], digest, id => this.git.importArchive(id, archive));
  }

  workingDirectory(id: string) {
    return this.lock(id, async () => {
      const record = await this.registered(id);
      if (record.rootPath) return record.rootPath;
      const root = [...HOME, 'Documents', 'GitHub', ...record.name.split('/')];
      requireRoot(root);
      await this.files.run(store =>
        bindVolumeRepository(store, root, id, this.git, { copy: { source: 'opfs', existing: true } }, () =>
          this.records.put({ ...record, rootPath: root })
        )
      );
      this.files.notifyChanges([root]);
      this.changes.next(id);
      return root;
    });
  }

  inspect(id: string) {
    return this.use(id, 'read', async () => {
      const [snapshot, status, branches, history] = await Promise.all([
        this.git.snapshot(id),
        this.git.status(id),
        this.git.branches(id),
        this.git.history(id)
      ]);
      return { snapshot, status, branches, history };
    });
  }

  open(id: string) {
    return this.use(id, 'read', () => this.git.open(id));
  }

  snapshot(id: string) {
    return this.use(id, 'read', () => this.git.snapshot(id));
  }

  status(id: string) {
    return this.use(id, 'read', () => this.git.status(id));
  }

  localCommand(id: string, cwd: string, args: readonly string[]) {
    return this.use(id, 'write', () => this.git.localCommand(id, cwd, args));
  }

  diffText(id: string, staged: boolean) {
    return this.use(id, 'read', () => this.git.diffText(id, staged));
  }

  readDiff(id: string, path: string, kind: 'working' | 'staged') {
    return this.use(id, 'read', () => this.git.readDiff(id, path, kind));
  }

  branches(id: string) {
    return this.use(id, 'read', () => this.git.branches(id));
  }

  history(id: string) {
    return this.use(id, 'read', () => this.git.history(id));
  }

  compareHistory(id: string, branch: string) {
    return this.use(id, 'read', () => this.git.compareHistory(id, branch));
  }

  commitChanges(id: string, oid: string, branch?: string) {
    return this.use(id, 'read', () => this.git.commitChanges(id, oid, branch));
  }

  exportArchive(id: string) {
    return this.use(id, 'read', () => this.git.exportArchive(id));
  }

  stage(id: string, paths: readonly string[]) {
    return this.use(id, 'index', () => this.git.stage(id, paths));
  }

  unstage(id: string, paths: readonly string[]) {
    return this.use(id, 'index', () => this.git.unstage(id, paths));
  }

  commit(id: string, message: string) {
    return this.use(id, 'index', () => this.git.commit(id, message));
  }

  createBranch(id: string, name: string) {
    return this.use(id, 'index', () => this.git.createBranch(id, name));
  }

  deleteBranch(id: string, name: string) {
    return this.use(id, 'index', () => this.git.deleteBranch(id, name));
  }

  checkout(id: string, name: string, force = false) {
    return this.use(id, 'write', () => this.git.checkout(id, name, force));
  }

  save(id: string, files: readonly GitFile[], expectedRevision: number, removedPaths: readonly string[] = []) {
    return this.use(id, 'write', () => this.git.save(id, files, expectedRevision, removedPaths));
  }

  discardWorking(id: string, path: string) {
    return this.use(id, 'write', () => this.git.discardWorking(id, path));
  }

  remove(id: string, path: string) {
    return this.use(id, 'write', () => this.git.remove(id, path));
  }

  rename(id: string, path: string, destination: string) {
    return this.use(id, 'write', () => this.git.rename(id, path, destination));
  }

  move(id: string, path: string, destination: string) {
    return this.use(id, 'write', () => this.git.move(id, path, destination));
  }

  restore(id: string, oid: string) {
    return this.use(id, 'write', () => this.git.restore(id, oid));
  }

  create(id: string, files: readonly GitFile[]) {
    return this.lock(id, () => this.git.create(id, files));
  }
  importArchive(id: string, bytes: Uint8Array) {
    return this.lock(id, () => this.git.importArchive(id, bytes));
  }
  origin(id: string): Promise<string | null> {
    return this.lock(id, async () => {
      await this.registered(id);
      return this.git.origin(id);
    });
  }

  async configureRemote(id: string, url: string | null, expectedOrigin?: string | null) {
    return this.lock(id, async () => {
      const record = await this.registered(id);
      const origin = await this.git.origin(id);
      if (expectedOrigin !== undefined && origin !== expectedOrigin)
        throw new Error('The remote URL changed. Reopen Repository Settings and try again.');
      if (expectedOrigin === undefined && url && origin) throw new Error('remote origin already exists');
      if (url === null && !origin && !record.owner) throw new Error('No such remote: origin');
      const address = url === null ? null : parseGithubRemote(url);
      if (url !== null && (!address || address.branch)) throw new Error('请输入 GitHub HTTPS 仓库地址');
      const nextUrl = address ? `https://github.com/${address.owner}/${address.repo}.git` : null;
      if (origin === nextUrl && address?.owner === record.owner && address?.repo === record.repo) return record;
      const next = {
        ...record,
        fetched: undefined,
        branchBases: [],
        owner: address?.owner ?? null,
        repo: address?.repo ?? null,
        private: false,
        remoteHead: null,
        remoteTree: null,
        remoteEntries: [],
        updatedAt: Date.now()
      };
      await this.records.put(next);
      try {
        await this.git.setOrigin(id, nextUrl);
      } catch (cause) {
        await this.records.put(record);
        throw cause;
      }
      this.changes.next(id);
      return next;
    });
  }

  async fetch(id: string) {
    return this.lock(id, async () => {
      const record = await this.registered(id);
      if (!record.owner || !record.repo) throw new Error('No GitHub remote is configured');
      const { branch } = await this.git.status(id);
      const remote = await this.connection.remote.open(record.owner, record.repo, branch);
      await this.records.put({
        ...record,
        fetched: { branch, head: remote.record.remoteHead! },
        updatedAt: Date.now()
      });
      this.changes.next(id);
      return remote;
    });
  }

  async pull(id: string): Promise<GitSnapshot> {
    return this.lock(id, async () => {
      const record = await this.registered(id);
      if (!record.owner || !record.repo) throw new Error('No GitHub remote is configured');
      const branch = (await this.git.status(id)).branch;
      const remote = await this.connection.remote.open(record.owner, record.repo, branch);
      const base = forBranch(record, branch);
      const current = await this.withWorktree(id, 'read', () => this.git.snapshot(id));
      if (base.remoteHead === remote.record.remoteHead) {
        if (base !== record) await this.records.put({ ...base, updatedAt: Date.now() });
        return current;
      }
      const merged = await this.connection.remote.pull(base, current.files, true, remote);
      const delta = worktreeDelta(current.files, merged.files);
      const snapshot = await this.withWorktree(id, 'write', async () => {
        const status = await this.git.status(id);
        const saved = await this.git.save(id, delta.changed, current.revision, delta.removed);
        const paths = [...delta.removed, ...delta.changed.map(file => file.path)];
        if (!status.entries.length && paths.length) {
          await this.git.stage(id, paths);
          await this.git.commit(id, `Pull ${remote.record.name}@${branch}`);
        }
        return saved;
      });
      await this.records.put({ ...base, ...remote.record, projectId: id, name: record.name });
      return snapshot;
    });
  }

  async push(id: string, message: string) {
    return this.lock(id, async () => {
      const record = await this.registered(id);
      const snapshot = await this.withWorktree(id, 'read', async () => {
        const status = await this.git.status(id);
        return { ...(await this.git.committed(id)), branch: status.branch };
      });
      const base = forBranch(record, snapshot.branch);
      const result = await this.connection.remote.push(base, snapshot.files, message, record.remoteHead);
      const next = {
        ...base,
        remoteHead: result.head,
        remoteTree: result.tree,
        remoteEntries: [],
        updatedAt: Date.now()
      };
      await this.records.put(next);
      this.changes.next(id);
      return next;
    });
  }

  async setClonedOrigin(record: GithubRepositoryRecord) {
    await this.git.setOrigin(record.projectId, `https://github.com/${record.owner}/${record.repo}.git`);
  }

  runTerminal(request: GithubTerminalRequest) {
    return runWorkspaceGit(this, request);
  }

  async call(request: DesktopWorkspaceRequest): Promise<OrbitValue> {
    const id = request.projectId;
    await this.registered(id);
    const result = await this.editorCommand(id, request);
    return wire(result);
  }
  private async registerDirectory(root: DiskPath, snapshot: GitSnapshot) {
    const id = snapshot.projectId;
    const url = await this.git.origin(id);
    const address = url ? parseGithubRemote(url) : null;
    const record = {
      ...recordFor(id, root, (await this.git.status(id)).branch),
      owner: address?.owner ?? null,
      repo: address?.repo ?? null
    };
    await this.records.put(record);
    return { record, snapshot };
  }

  private async addDirectory(root: DiskPath, source: string, create: (id: string) => Promise<GitSnapshot>) {
    requireRoot(root);
    const id = projectIdForPath(root);
    return this.lock(id, async () => {
      await this.records.ready();
      if (this.records.find(id)) throw new Error(`目标目录已存在：${toVmPath(root)}`);
      const result = await this.files.run(store =>
        bindVolumeRepository(store, root, id, this.git, { copy: { source, create: () => create(id) } }, snapshot =>
          this.registerDirectory(root, snapshot)
        )
      );
      this.files.notifyChanges([root]);
      this.changes.next(id);
      return result;
    });
  }

  private lock<T>(id: string, task: () => Promise<T>): Promise<T> {
    return navigator.locks.request(`aiao-desktop:git-workspace:${id}`, task);
  }

  private async use<T>(id: string, mode: 'read' | 'index' | 'write', task: () => Promise<T>): Promise<T> {
    return this.lock(id, () => this.withWorktree(id, mode, task));
  }

  private async withWorktree<T>(id: string, mode: 'read' | 'index' | 'write', task: () => Promise<T>): Promise<T> {
    await this.records.ready();
    const root = this.records.find(id)?.rootPath;
    let paths: DiskPath[] = [];
    const result =
      root ?
        await this.files.run(async store => {
          const linked = new TextDecoder().decode(await store.read([...root, '.git']));
          if (linked !== gitfile(id)) throw new Error('卷内目录已移动或已指向另一个仓库');
          let disk = await worktreeFiles(store, root);
          const current = await this.git.snapshot(id);
          const journal = await volumeJournal(id);
          const interrupted = await journal.read();
          if (interrupted) {
            paths = await recoverWorkingFiles(store, root, interrupted, disk, current.files);
            await journal.clear();
            disk = await worktreeFiles(store, root);
          }
          const diff = worktreeDelta(current.files, disk);
          if (diff.changed.length || diff.removed.length)
            await this.git.save(id, diff.changed, current.revision, diff.removed);
          if (mode !== 'write') return task();
          await journal.write(await projectionHashes(disk));
          const value = await task();
          const next = worktreeDelta(disk, (await this.git.snapshot(id)).files);
          paths.push(...(await publishWorkingFiles(store, root, next)));
          await journal.clear();
          return value;
        })
      : await task();
    if (paths.length) this.files.notifyChanges(paths);
    if (mode !== 'read') this.changes.next(id);
    return result;
  }

  private async registered(id: string) {
    await this.records.ready();
    const record = this.records.find(id);
    if (!record) throw new GitWorkbenchError('project_missing', '仓库未登记');
    return record;
  }
  private async editorCommand(id: string, request: DesktopWorkspaceRequest): Promise<unknown> {
    switch (request.operation) {
      case 'open':
        return this.open(id);
      case 'save':
        return this.save(
          id,
          request.files.map(file => ({ path: file.path, bytes: decodeBase64(file.base64) })),
          request.expectedRevision,
          request.removedPaths
        );
      case 'remove':
        return this.remove(id, request.path);
      case 'rename':
        return this.rename(id, request.path, request.destination);
      case 'move':
        return this.move(id, request.path, request.destination);
      case 'status':
        return this.status(id);
      case 'stage':
        return this.stage(id, request.paths);
      case 'unstage':
        return this.unstage(id, request.paths);
      case 'readDiff':
        return this.readDiff(id, request.path, request.kind);
      case 'discardWorking':
        return this.discardWorking(id, request.path);
      case 'commit':
        return this.commit(id, request.message);
      case 'pull':
        return this.pull(id);
      case 'history':
        return this.history(id);
      case 'restore':
        return this.restore(id, request.oid);
    }
  }
}
