import type {
  WorkbenchBackend,
  WorkbenchDiff,
  WorkbenchFileVersion,
  WorkbenchFiles,
  WorkbenchSnapshot,
  WorkbenchStatus
} from '../../session.js';
import { decodeFileBytes, encodeFileBytes } from '../file-encoding.js';
import { assertGitFileLimits } from '../git-archive.js';
import { assertGitPath, assertNoPathCollisions } from '../git-paths.js';
import { GIT_WORKBENCH_LIMITS, GitWorkbenchError } from '../git-protocol.js';
import type { GitHubApi, GitHubTreeItem } from './github-api.js';
import { GitHubApiError } from './github-api.js';
import type { GitHubTreeEntry } from './github-types.js';

const DEFAULT_FETCH_CONCURRENCY = 8;
/** 超过该大小的文本内容先上传 blob 再入树，避免单请求 payload 超限。 */
const INLINE_TREE_CONTENT_BYTES = 512 * 1024;

export interface GitHubBackendOptions {
  readonly api: GitHubApi;
  readonly fetchConcurrency?: number;
  readonly maxFileBytes?: number;
}

interface ProjectState {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  headSha: string;
  treeSha: string;
  modes: Map<string, string>;
  saved: Map<string, string | Uint8Array>;
  buffer: Map<string, string | Uint8Array>;
  /** 暂存集：内容快照；null 表示暂存删除。 */
  staged: Map<string, string | Uint8Array | null>;
  revision: string;
  counter: number;
  mutation: number;
}

type FileValue = string | Uint8Array;

interface RemoteSnapshot {
  readonly headSha: string;
  readonly treeSha: string;
  readonly modes: Map<string, string>;
  readonly saved: Map<string, FileValue>;
}

function equalBytes(left: FileValue | undefined, right: FileValue | undefined): boolean {
  if (left === right) return true;
  if (left === undefined || right === undefined) return false;
  if (typeof left === 'string' && typeof right === 'string') return false;
  const leftBytes = encodeFileBytes(left);
  const rightBytes = encodeFileBytes(right);
  return leftBytes.length === rightBytes.length && leftBytes.every((value, index) => value === rightBytes[index]);
}

function fileVersion(value: FileValue | null): WorkbenchFileVersion {
  if (value === null) return { exists: false, binary: false, text: null, byteLength: 0 };
  if (typeof value === 'string') {
    return { exists: true, binary: false, text: value, byteLength: encodeFileBytes(value).length };
  }
  return { exists: true, binary: true, text: null, byteLength: value.length };
}

function mapError(cause: unknown, context: string): GitWorkbenchError {
  if (!(cause instanceof GitHubApiError)) throw cause;
  switch (cause.code) {
    case 'auth_required':
      return new GitWorkbenchError('auth_required', '需要登录 GitHub 才能访问该仓库', { cause });
    case 'not_found':
      return new GitWorkbenchError('remote_not_found', `仓库不存在或无权访问：${context}（私有仓库需要登录）`, {
        cause
      });
    case 'rate_limited':
      return new GitWorkbenchError('rate_limited', 'GitHub 请求超出限额，请稍后重试', { cause });
    case 'conflict':
      return new GitWorkbenchError('remote_conflict', '远端分支已更新，请先拉取远端更改后再提交；本地更改已保留', {
        cause
      });
    case 'network_failed':
      return new GitWorkbenchError('network_failed', '无法连接 GitHub API', { cause });
    default:
      return new GitWorkbenchError('git_failed', cause.message, { cause });
  }
}

/** 把 projectId 解析为仓库坐标；分支经 encodeURIComponent 编码，形如 github:owner/repo@branch。 */
function parseProjectId(projectId: string): { owner: string; repo: string; branch: string } {
  if (!projectId.startsWith('github:')) {
    throw new GitWorkbenchError('invalid_path', '不是 GitHub 项目标识');
  }
  const rest = projectId.slice('github:'.length);
  const at = rest.lastIndexOf('@');
  if (at < 1) throw new GitWorkbenchError('invalid_path', 'GitHub 项目标识缺少分支');
  const [owner, repo] = rest.slice(0, at).split('/');
  if (!owner || !repo || rest.slice(0, at).split('/').length !== 2) {
    throw new GitWorkbenchError('invalid_path', `无法解析 GitHub 项目标识：${projectId}`);
  }
  let branch: string;
  try {
    branch = decodeURIComponent(rest.slice(at + 1));
  } catch (cause) {
    throw new GitWorkbenchError('invalid_path', `分支名编码无效：${projectId}`, { cause });
  }
  return { owner, repo, branch };
}

function conflictsWithRemote(
  base: FileValue | undefined,
  local: FileValue | undefined,
  remote: FileValue | undefined
): boolean {
  return !equalBytes(base, remote) && !equalBytes(base, local) && !equalBytes(local, remote);
}

function mergeRemote(project: ProjectState, remote: RemoteSnapshot): Pick<ProjectState, 'buffer' | 'staged'> {
  const buffer = new Map(remote.saved);
  const staged = new Map(project.staged);
  const paths = new Set([
    ...project.saved.keys(),
    ...project.buffer.keys(),
    ...project.staged.keys(),
    ...remote.saved.keys()
  ]);
  const conflicts: string[] = [];
  for (const path of paths) {
    const base = project.saved.get(path);
    const working = project.buffer.get(path);
    const next = remote.saved.get(path);
    const index = project.staged.get(path) ?? undefined;
    const hasIndex = project.staged.has(path);
    if (conflictsWithRemote(base, working, next) || (hasIndex && conflictsWithRemote(base, index, next))) {
      conflicts.push(path);
    }
    const edited = !equalBytes(base, working) || (hasIndex && !equalBytes(index, working));
    if (edited && working === undefined) buffer.delete(path);
    if (edited && working !== undefined) buffer.set(path, working);
    if (hasIndex && (equalBytes(base, index) || equalBytes(next, index))) staged.delete(path);
  }
  if (conflicts.length) {
    throw new GitWorkbenchError(
      'remote_conflict',
      `拉取会覆盖本地更改：${conflicts.sort().join('、')}；请先处理这些文件`
    );
  }
  const indexPaths = new Set(remote.saved.keys());
  for (const [path, value] of staged) {
    if (value === null) indexPaths.delete(path);
    else indexPaths.add(path);
  }
  try {
    assertNoPathCollisions([...buffer.keys()]);
    assertNoPathCollisions([...indexPaths]);
  } catch (cause) {
    throw new GitWorkbenchError(
      'remote_conflict',
      `远端文件与本地更改存在路径冲突：${cause instanceof Error ? cause.message : String(cause)}`,
      { cause }
    );
  }
  return { buffer, staged };
}

/** 以 GitHub API 为存储的虚拟仓库后端：打开即快照、提交即推送，无本地 .git。 */
export function createGitHubBackend(options: GitHubBackendOptions): WorkbenchBackend {
  const api = options.api;
  const fetchConcurrency = options.fetchConcurrency ?? DEFAULT_FETCH_CONCURRENCY;
  const maxFileBytes = options.maxFileBytes ?? GIT_WORKBENCH_LIMITS.fileBytes;
  const projects = new Map<string, ProjectState>();

  function state(projectId: string): ProjectState {
    const project = projects.get(projectId);
    if (!project) throw new GitWorkbenchError('project_missing', '项目未打开');
    return project;
  }

  function bump(project: ProjectState): string {
    return `${project.headSha}:${++project.counter}`;
  }

  function snapshot(projectId: string, project: ProjectState): WorkbenchSnapshot {
    return { projectId, revision: project.revision, files: Object.fromEntries(project.buffer) };
  }

  /** 按并发上限分批拉取文件内容；超限文件明确报错，不做静默跳过。 */
  async function fetchContents(
    owner: string,
    repo: string,
    ref: string,
    entries: readonly GitHubTreeEntry[]
  ): Promise<Map<string, Uint8Array>> {
    const files = new Map<string, Uint8Array>();
    const queue = [...entries];
    const workers = Array.from({ length: Math.min(fetchConcurrency, queue.length || 1) }, async () => {
      while (queue.length) {
        const entry = queue.shift()!;
        const bytes = await api.getFileContents(owner, repo, entry.path, ref);
        if (bytes.byteLength > maxFileBytes) {
          throw new GitWorkbenchError('resource_limit', `文件超过工作台上限（${maxFileBytes} 字节）：${entry.path}`);
        }
        files.set(entry.path, bytes);
      }
    });
    await Promise.all(workers);
    return files;
  }

  async function readRemote(owner: string, repo: string, headSha: string): Promise<RemoteSnapshot> {
    const head = await api.getCommit(owner, repo, headSha);
    const entries = await api.getTreeFiles(owner, repo, head.treeSha);
    const contents = await fetchContents(owner, repo, headSha, entries);
    const saved = new Map<string, FileValue>();
    const modes = new Map<string, string>();
    for (const entry of entries) {
      modes.set(entry.path, entry.mode);
      saved.set(entry.path, decodeFileBytes(entry.path, contents.get(entry.path)!));
    }
    return { headSha, treeSha: head.treeSha, modes, saved };
  }

  function assertUnchanged(projectId: string, project: ProjectState, mutation: number): void {
    if (projects.get(projectId) !== project || project.mutation !== mutation) {
      throw new GitWorkbenchError('revision_conflict', '拉取期间本地状态发生变化，请重试；本地更改已保留');
    }
  }

  return {
    async open(projectId: string): Promise<WorkbenchSnapshot> {
      const { owner, repo, branch } = parseProjectId(projectId);
      try {
        const headSha = await api.getBranchSha(owner, repo, branch);
        const remote = await readRemote(owner, repo, headSha);
        const project: ProjectState = {
          owner,
          repo,
          branch,
          ...remote,
          buffer: new Map(remote.saved),
          staged: new Map(),
          revision: headSha,
          counter: 0,
          mutation: 0
        };
        projects.set(projectId, project);
        return snapshot(projectId, project);
      } catch (cause) {
        throw mapError(cause, projectId);
      }
    },

    async pull(projectId: string): Promise<WorkbenchSnapshot> {
      const project = state(projectId);
      const mutation = project.mutation;
      try {
        const headSha = await api.getBranchSha(project.owner, project.repo, project.branch);
        assertUnchanged(projectId, project, mutation);
        if (headSha === project.headSha) return snapshot(projectId, project);
        const remote = await readRemote(project.owner, project.repo, headSha);
        assertUnchanged(projectId, project, mutation);
        const merged = mergeRemote(project, remote);
        Object.assign(project, remote, merged);
        project.mutation++;
        project.revision = bump(project);
        return snapshot(projectId, project);
      } catch (cause) {
        throw mapError(cause, projectId);
      }
    },

    async create(): Promise<WorkbenchSnapshot> {
      throw new GitWorkbenchError('unsupported_operation', 'GitHub 后端不支持创建项目空间，请使用「发布到 GitHub」');
    },

    async save(
      projectId: string,
      files: WorkbenchFiles,
      expectedRevision: string,
      removedPaths?: readonly string[]
    ): Promise<WorkbenchSnapshot> {
      const project = state(projectId);
      if (expectedRevision !== project.revision) {
        throw new GitWorkbenchError('revision_conflict', '项目已被其他操作更新，请重新打开');
      }
      const next = new Map(removedPaths === undefined ? [] : project.buffer);
      const removed = new Set(removedPaths);
      for (const path of removed) {
        assertGitPath(path);
        if (Object.hasOwn(files, path)) throw new GitWorkbenchError('path_collision', '同一文件不能同时写入和删除');
        if (!next.has(path)) throw new GitWorkbenchError('invalid_path', `文件不存在：${path}`);
        next.delete(path);
      }
      for (const [path, content] of Object.entries(files)) next.set(path, content);
      if (removedPaths !== undefined) {
        for (const path of next.keys()) assertGitPath(path);
        assertNoPathCollisions([...next.keys()]);
        assertGitFileLimits(
          [...next].map(([path, content]) => ({ path, bytes: new Uint8Array(encodeFileBytes(content)) }))
        );
      }
      project.buffer = next;
      project.mutation++;
      project.revision = bump(project);
      return snapshot(projectId, project);
    },

    async remove(projectId: string, path: string): Promise<void> {
      const project = state(projectId);
      if (!project.buffer.has(path) && !project.saved.has(path)) {
        throw new GitWorkbenchError('invalid_path', `文件不存在：${path}`);
      }
      project.buffer.delete(path);
      project.mutation++;
    },

    async rename(projectId: string, from: string, to: string): Promise<void> {
      const project = state(projectId);
      if (!project.buffer.has(from)) {
        throw new GitWorkbenchError('invalid_path', `文件不存在：${from}`);
      }
      project.buffer.set(to, project.buffer.get(from)!);
      project.buffer.delete(from);
      project.mutation++;
    },

    async move(projectId: string, from: string, to: string): Promise<void> {
      const project = state(projectId);
      const prefix = `${from}/`;
      const children = [...project.buffer.keys()].filter(path => path.startsWith(prefix));
      project.mutation++;
      if (children.length) {
        for (const path of children) {
          project.buffer.set(`${to}/${path.slice(prefix.length)}`, project.buffer.get(path)!);
          project.buffer.delete(path);
        }
        return;
      }
      if (!project.buffer.has(from)) {
        throw new GitWorkbenchError('invalid_path', `文件不存在：${from}`);
      }
      project.buffer.set(to, project.buffer.get(from)!);
      project.buffer.delete(from);
    },

    async status(projectId: string): Promise<WorkbenchStatus> {
      const project = state(projectId);
      const paths = new Set([...project.saved.keys(), ...project.buffer.keys()]);
      const entries = [...paths]
        .sort()
        .map(path => {
          const staged = project.staged.has(path) ? project.staged.get(path) : undefined;
          const bufferValue = project.buffer.get(path);
          const savedValue = project.saved.get(path);
          const index =
            staged === undefined ?
              savedValue === undefined ?
                '?'
              : ' '
            : staged !== null && savedValue !== undefined && equalBytes(staged, savedValue) ? ' '
            : staged === null ? 'D'
            : savedValue !== undefined ? 'M'
            : 'A';
          let worktree: string;
          if (bufferValue === undefined) {
            worktree =
              staged === null ? ' '
              : savedValue !== undefined ? 'D'
              : ' ';
          } else if (savedValue === undefined) {
            worktree =
              staged === undefined ? '?'
              : staged !== null && equalBytes(bufferValue, staged) ? ' '
              : 'M';
          } else {
            const base = staged !== undefined && staged !== null ? staged : savedValue;
            worktree = equalBytes(bufferValue, base) ? ' ' : 'M';
          }
          return { path, index, worktree };
        })
        .filter(entry => entry.index !== ' ' || entry.worktree !== ' ');
      return {
        head: project.headSha,
        branch: project.branch,
        remote: { name: 'origin', url: `https://github.com/${project.owner}/${project.repo}` },
        entries
      };
    },

    async stage(projectId: string, paths: readonly string[]): Promise<void> {
      const project = state(projectId);
      project.mutation++;
      for (const path of paths) {
        if (project.buffer.has(path)) {
          project.staged.set(path, project.buffer.get(path)!);
        } else if (project.saved.has(path)) {
          project.staged.set(path, null);
        } else {
          throw new GitWorkbenchError('invalid_path', `文件不存在：${path}`);
        }
      }
    },

    async unstage(projectId: string, paths: readonly string[]): Promise<void> {
      const project = state(projectId);
      project.mutation++;
      for (const path of paths) project.staged.delete(path);
    },

    async readDiff(projectId: string, path: string, kind: 'working' | 'staged'): Promise<WorkbenchDiff> {
      const project = state(projectId);
      const staged = project.staged.has(path) ? project.staged.get(path) : undefined;
      let base: FileValue | null;
      let modified: FileValue | null;
      if (kind === 'staged') {
        base = project.saved.get(path) ?? null;
        modified = staged ?? null;
      } else {
        base = staged === undefined ? (project.saved.get(path) ?? null) : staged;
        modified = project.buffer.has(path) ? project.buffer.get(path)! : null;
      }
      return { projectId, path, kind, base: fileVersion(base), modified: fileVersion(modified) };
    },

    async discardWorking(projectId: string, path: string): Promise<WorkbenchSnapshot> {
      const project = state(projectId);
      const staged = project.staged.has(path) ? project.staged.get(path) : undefined;
      const base = staged === undefined ? project.saved.get(path) : staged;
      if (base === undefined || base === null) project.buffer.delete(path);
      else project.buffer.set(path, base);
      project.mutation++;
      project.revision = bump(project);
      return snapshot(projectId, project);
    },

    async commit(projectId: string, message: string): Promise<string> {
      const project = state(projectId);
      const committed = new Map(project.staged);
      const baseline = new Map(project.saved);
      const modes = new Map(project.modes);
      const parent = project.headSha;
      const baseTree = project.treeSha;
      project.mutation++;
      const items: GitHubTreeItem[] = [];
      for (const [path, staged] of committed) {
        if (staged === null) {
          items.push({ path, sha: null });
          continue;
        }
        const saved = baseline.get(path);
        if (saved !== undefined && equalBytes(staged, saved)) continue;
        const mode = modes.get(path) ?? '100644';
        if (typeof staged === 'string' && encodeFileBytes(staged).byteLength <= INLINE_TREE_CONTENT_BYTES) {
          items.push({ path, mode, content: staged });
        } else {
          items.push({ path, mode, sha: await api.createBlob(project.owner, project.repo, encodeFileBytes(staged)) });
        }
      }
      if (items.length === 0) {
        throw new GitWorkbenchError('nothing_staged', '没有可提交的暂存更改');
      }
      // 与 git index 一致，树条目按路径排序
      items.sort((left, right) => left.path.localeCompare(right.path));
      try {
        const newTree = await api.createTree(project.owner, project.repo, baseTree, items);
        const newSha = await api.createCommit(project.owner, project.repo, message, newTree, [parent]);
        await api.updateRef(project.owner, project.repo, `heads/${project.branch}`, newSha, false);
        for (const [path, staged] of committed) {
          if (staged === null) project.saved.delete(path);
          else project.saved.set(path, staged);
          const current = project.staged.get(path);
          if (current === staged || (current != null && staged !== null && equalBytes(current, staged))) {
            project.staged.delete(path);
          }
        }
        project.headSha = newSha;
        project.treeSha = newTree;
        project.mutation++;
        return newSha;
      } catch (cause) {
        throw mapError(cause, projectId);
      }
    },

    async history(projectId: string): Promise<readonly { oid: string; message: string }[]> {
      const project = state(projectId);
      try {
        return await api.listCommits(project.owner, project.repo, project.headSha);
      } catch (cause) {
        throw mapError(cause, projectId);
      }
    },

    async restore(projectId: string, oid: string): Promise<WorkbenchSnapshot> {
      const project = state(projectId);
      try {
        const commitInfo = await api.getCommit(project.owner, project.repo, oid);
        const entries = await api.getTreeFiles(project.owner, project.repo, commitInfo.treeSha);
        const contents = await fetchContents(project.owner, project.repo, commitInfo.sha, entries);
        const buffer = new Map<string, FileValue>();
        for (const entry of entries) {
          buffer.set(entry.path, decodeFileBytes(entry.path, contents.get(entry.path)!));
        }
        project.buffer = buffer;
        project.staged.clear();
        project.mutation++;
        project.revision = bump(project);
        return snapshot(projectId, project);
      } catch (cause) {
        throw mapError(cause, projectId);
      }
    },

    async exportArchive(projectId: string): Promise<Uint8Array> {
      const project = state(projectId);
      try {
        return await api.getZipball(project.owner, project.repo, project.headSha);
      } catch (cause) {
        throw mapError(cause, projectId);
      }
    },

    async importArchive(): Promise<void> {
      throw new GitWorkbenchError('unsupported_operation', 'GitHub 后端不支持导入归档，请直接打开远端仓库');
    },

    dispose(): void {
      projects.clear();
    }
  };
}
