import type {
  GitBranch,
  GitCommit,
  GitCommitFileChange,
  GitFile,
  GitFileDiff,
  GitFileVersion,
  GitSnapshot,
  GitStatus,
  GitStatusEntry
} from './git/git-protocol';
import { GitWorkbenchError, type GitErrorCode } from './git/git-protocol';

export type {
  GitBranch,
  GitCommit,
  GitCommitFileChange,
  GitFile,
  GitFileDiff,
  GitFileVersion,
  GitSnapshot,
  GitStatus,
  GitStatusEntry
};

interface WorkerResponse {
  readonly id: number;
  readonly result?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface SerializedSnapshot {
  readonly projectId: unknown;
  readonly revision: unknown;
  readonly files: unknown;
}

function isWorkerResponse(value: unknown): value is WorkerResponse {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  const id = item['id'];
  const error = item['error'];
  const hasResult = 'result' in item;
  const hasError = 'error' in item;
  const validError =
    typeof error === 'object' &&
    error !== null &&
    typeof (error as Record<string, unknown>)['code'] === 'string' &&
    Boolean((error as Record<string, unknown>)['code']) &&
    typeof (error as Record<string, unknown>)['message'] === 'string' &&
    Boolean((error as Record<string, unknown>)['message']);
  return (
    Number.isSafeInteger(id) &&
    (id as number) > 0 &&
    ((hasResult && !hasError) || (!hasResult && hasError && validError))
  );
}

function invalidPayload(message: string): never {
  throw new GitWorkbenchError('storage_failed', `Git Worker returned an invalid ${message}`);
}

function recordOf(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalidPayload(name);
  return value as Record<string, unknown>;
}

function stringOf(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) invalidPayload(name);
  return value;
}

function nullableStringOf(value: unknown, name: string): string | null {
  if (value === null) return null;
  return stringOf(value, name);
}

function integerOf(value: unknown, name: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalidPayload(name);
  return value as number;
}

function booleanOf(value: unknown, name: string): boolean {
  if (typeof value !== 'boolean') invalidPayload(name);
  return value;
}

function bytesOf(value: unknown, name: string): Uint8Array<ArrayBuffer> {
  if (
    !Array.isArray(value) ||
    !value.every(
      (item): item is number => typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= 255
    )
  )
    invalidPayload(name);
  return Uint8Array.from(value) as Uint8Array<ArrayBuffer>;
}

function snapshot(value: unknown): GitSnapshot {
  const item = recordOf(value as SerializedSnapshot, 'snapshot');
  const files = item['files'];
  if (!Array.isArray(files)) invalidPayload('snapshot.files');
  return {
    projectId: stringOf(item['projectId'], 'snapshot.projectId'),
    revision: integerOf(item['revision'], 'snapshot.revision', 1),
    files: files.map((value, index) => {
      const file = recordOf(value, `snapshot.files[${index}]`);
      return {
        path: stringOf(file['path'], `snapshot.files[${index}].path`),
        bytes: bytesOf(file['bytes'], `snapshot.files[${index}].bytes`)
      };
    })
  };
}

function status(value: unknown): GitStatus {
  const item = recordOf(value, 'status');
  const head = item['head'];
  const entries = item['entries'];
  if (head !== null && typeof head !== 'string') invalidPayload('status.head');
  if (!Array.isArray(entries)) invalidPayload('status.entries');
  return {
    head,
    branch: stringOf(item['branch'], 'status.branch'),
    raw: typeof item['raw'] === 'string' ? item['raw'] : invalidPayload('status.raw'),
    entries: entries.map((value, index) => {
      const entry = recordOf(value, `status.entries[${index}]`);
      const originalPath = entry['originalPath'];
      if (originalPath !== undefined && typeof originalPath !== 'string')
        invalidPayload(`status.entries[${index}].originalPath`);
      return {
        path: stringOf(entry['path'], `status.entries[${index}].path`),
        index: typeof entry['index'] === 'string' ? entry['index'] : invalidPayload(`status.entries[${index}].index`),
        worktree:
          typeof entry['worktree'] === 'string' ?
            entry['worktree']
          : invalidPayload(`status.entries[${index}].worktree`),
        ...(originalPath === undefined ? {} : { originalPath })
      } satisfies GitStatusEntry;
    })
  };
}

function fileVersion(value: unknown, name: string): GitFileDiff['base'] {
  const item = recordOf(value, name);
  const text = item['text'];
  if (text !== null && typeof text !== 'string') invalidPayload(`${name}.text`);
  return {
    exists: booleanOf(item['exists'], `${name}.exists`),
    binary: booleanOf(item['binary'], `${name}.binary`),
    text,
    byteLength: integerOf(item['byteLength'], `${name}.byteLength`)
  };
}

function diff(value: unknown): GitFileDiff {
  const item = recordOf(value, 'diff');
  return {
    projectId: stringOf(item['projectId'], 'diff.projectId'),
    path: stringOf(item['path'], 'diff.path'),
    kind: item['kind'] === 'working' || item['kind'] === 'staged' ? item['kind'] : invalidPayload('diff.kind'),
    base: fileVersion(item['base'], 'diff.base'),
    modified: fileVersion(item['modified'], 'diff.modified')
  };
}

function commitChanges(value: unknown): readonly GitCommitFileChange[] {
  if (!Array.isArray(value)) invalidPayload('commitChanges');
  return value.map((raw, index) => {
    const item = recordOf(raw, `commitChanges[${index}]`);
    const status = item['status'];
    if (status !== 'added' && status !== 'modified' && status !== 'deleted')
      invalidPayload(`commitChanges[${index}].status`);
    return {
      projectId: stringOf(item['projectId'], `commitChanges[${index}].projectId`),
      oid: stringOf(item['oid'], `commitChanges[${index}].oid`),
      path: stringOf(item['path'], `commitChanges[${index}].path`),
      status,
      base: fileVersion(item['base'], `commitChanges[${index}].base`),
      modified: fileVersion(item['modified'], `commitChanges[${index}].modified`)
    };
  });
}

function branches(value: unknown): readonly GitBranch[] {
  if (!Array.isArray(value)) invalidPayload('branches');
  return value.map((raw, index) => {
    const item = recordOf(raw, `branches[${index}]`);
    return {
      name: stringOf(item['name'], `branches[${index}].name`),
      oid: nullableStringOf(item['oid'], `branches[${index}].oid`),
      current: booleanOf(item['current'], `branches[${index}].current`)
    };
  });
}

function commits(value: unknown): readonly GitCommit[] {
  if (!Array.isArray(value)) invalidPayload('history');
  return value.map((raw, index) => {
    const item = recordOf(raw, `history[${index}]`);
    return {
      oid: stringOf(item['oid'], `history[${index}].oid`),
      message: stringOf(item['message'], `history[${index}].message`)
    };
  });
}

function archive(value: unknown): Uint8Array {
  return bytesOf(value, 'archive');
}

function serializeFiles(files: readonly GitFile[]): { path: string; bytes: number[] }[] {
  return files.map(file => ({ path: file.path, bytes: [...file.bytes] }));
}

function revisionNumber(revision: number): number {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid project revision');
  return revision;
}

type WorkerFactory = () => Worker;

const GIT_ERROR_CODES = new Set<GitErrorCode>([
  'unsupported_environment',
  'unsupported_operation',
  'invalid_path',
  'path_collision',
  'project_exists',
  'project_missing',
  'revision_conflict',
  'dirty_workspace',
  'nothing_staged',
  'unreachable_commit',
  'invalid_archive',
  'resource_limit',
  'auth_required',
  'auth_invalid',
  'remote_not_found',
  'remote_conflict',
  'rate_limited',
  'network_failed',
  'git_failed',
  'storage_failed'
]);

function isGitErrorCode(value: string): value is GitErrorCode {
  return GIT_ERROR_CODES.has(value as GitErrorCode);
}

export class GithubGitBackend {
  private worker: Worker;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly workerFactory: WorkerFactory;
  private sequence = 0;
  private closed = false;
  private disposed = false;

  constructor(workerFactory?: WorkerFactory) {
    this.workerFactory =
      workerFactory ?? (() => new Worker(new URL('./github-git-worker', import.meta.url), { type: 'module' }));
    this.worker = this.createWorker();
  }

  open(projectId: string): Promise<GitSnapshot> {
    return this.call('open', { projectId }).then(snapshot);
  }

  create(projectId: string, files: readonly GitFile[]): Promise<GitSnapshot> {
    return this.call('init', { projectId, files: serializeFiles(files) }).then(snapshot);
  }

  save(
    projectId: string,
    files: readonly GitFile[],
    expectedRevision: number,
    removedPaths: readonly string[] = []
  ): Promise<GitSnapshot> {
    return this.call('save', {
      projectId,
      files: serializeFiles(files),
      expectedRevision: revisionNumber(expectedRevision),
      removedPaths
    }).then(snapshot);
  }

  committed(projectId: string): Promise<GitSnapshot> {
    return this.call('committed', { projectId }).then(snapshot);
  }

  snapshot(projectId: string): Promise<GitSnapshot> {
    return this.call('snapshot', { projectId }).then(snapshot);
  }

  remove(projectId: string, path: string): Promise<GitSnapshot> {
    return this.call('remove', { projectId, path }).then(snapshot);
  }

  rename(projectId: string, path: string, destination: string): Promise<GitSnapshot> {
    return this.call('rename', { projectId, path, destination }).then(snapshot);
  }

  move(projectId: string, path: string, destination: string): Promise<GitSnapshot> {
    return this.call('move', { projectId, path, destination }).then(snapshot);
  }

  status(projectId: string): Promise<GitStatus> {
    return this.call('status', { projectId }).then(status);
  }

  diffText(projectId: string, staged: boolean): Promise<string> {
    return this.call('diffText', {projectId, kind: staged ? 'staged' : 'working'}).then(value => typeof value === 'string' ? value : invalidPayload('diffText'));
  }

  stage(projectId: string, paths: readonly string[]): Promise<GitStatus> {
    return this.call('stage', { projectId, paths }).then(status);
  }

  unstage(projectId: string, paths: readonly string[]): Promise<GitStatus> {
    return this.call('unstage', { projectId, paths }).then(status);
  }

  readDiff(projectId: string, path: string, kind: 'working' | 'staged'): Promise<GitFileDiff> {
    return this.call('readDiff', { projectId, path, kind }).then(diff);
  }

  discardWorking(projectId: string, path: string): Promise<GitSnapshot> {
    return this.call('discardWorking', { projectId, path }).then(snapshot);
  }

  commit(projectId: string, message: string): Promise<string> {
    return this.call('commit', { projectId, message }).then(value => stringOf(value, 'commit'));
  }

  branches(projectId: string): Promise<readonly GitBranch[]> {
    return this.call('branches', { projectId }).then(branches);
  }

  createBranch(projectId: string, branch: string): Promise<readonly GitBranch[]> {
    return this.call('createBranch', { projectId, branch }).then(branches);
  }

  deleteBranch(projectId: string, branch: string): Promise<readonly GitBranch[]> {
    return this.call('deleteBranch', { projectId, branch }).then(branches);
  }

  checkout(projectId: string, branch: string, force = false): Promise<GitStatus> {
    return this.call('checkout', { projectId, branch, force }).then(status);
  }

  history(projectId: string): Promise<readonly GitCommit[]> {
    return this.call('history', { projectId }).then(commits);
  }

  commitChanges(projectId: string, oid: string): Promise<readonly GitCommitFileChange[]> {
    return this.call('commitChanges', { projectId, oid }).then(commitChanges);
  }

  restore(projectId: string, oid: string): Promise<GitSnapshot> {
    return this.call('restore', { projectId, oid }).then(snapshot);
  }

  origin(projectId: string): Promise<string | null> {
    return this.call('origin', { projectId }).then(value => nullableStringOf(value, 'origin'));
  }

  async setOrigin(projectId: string, url: string | null): Promise<void> {
    await this.call('setOrigin', { projectId, ...(url ? { url } : {}) });
  }

  exportArchive(projectId: string): Promise<Uint8Array> {
    return this.call('export', { projectId }).then(archive);
  }

  importArchive(projectId: string, bytes: Uint8Array): Promise<GitSnapshot> {
    return this.call('import', { projectId, archive: [...bytes] }).then(snapshot);
  }

  dispose(): void {
    this.disposed = true;
    this.shutdown(this.storageError('Git backend is closed'));
  }

  restart(): void {
    if (this.disposed) return;
    const error = this.storageError('Git Worker restarted');
    this.closed = true;
    this.worker.terminate();
    this.rejectPending(error);
    this.closed = false;
    this.worker = this.createWorker();
  }

  private createWorker(): Worker {
    const worker = this.workerFactory();
    worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
      if (this.worker !== worker) return;
      if (!isWorkerResponse(data)) {
        this.shutdown(this.storageError('Git Worker returned an invalid response'));
        return;
      }
      this.resolve(data);
    };
    worker.onerror = event => {
      if (this.worker === worker) this.shutdown(this.storageError(event.message || 'Git Worker crashed'));
    };
    worker.onmessageerror = () => {
      if (this.worker === worker) this.shutdown(this.storageError('Git Worker 消息无法解析'));
    };
    return worker;
  }

  private call(action: string, payload: Record<string, unknown>): Promise<unknown> {
    if (this.closed) return Promise.reject(this.storageError('Git backend is closed'));
    const id = ++this.sequence;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => this.shutdown(this.storageError(`Git Worker timed out: ${action}`)), 60_000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.worker.postMessage({ id, action, payload });
      } catch (cause) {
        clearTimeout(timer);
        this.pending.delete(id);
        const error = this.storageError('无法向 Git Worker 发送消息', cause);
        reject(error);
        this.shutdown(error);
      }
    });
  }

  private resolve(data: WorkerResponse): void {
    const request = this.pending.get(data.id);
    if (!request) return;
    this.pending.delete(data.id);
    clearTimeout(request.timer);
    if (data.error) {
      const code = isGitErrorCode(data.error.code) ? data.error.code : 'storage_failed';
      request.reject(new GitWorkbenchError(code, data.error.message));
    } else request.resolve(data.result);
  }

  private storageError(message: string, cause?: unknown): GitWorkbenchError {
    return new GitWorkbenchError('storage_failed', message, cause === undefined ? undefined : { cause });
  }

  private shutdown(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    this.rejectPending(error);
  }

  private rejectPending(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}
