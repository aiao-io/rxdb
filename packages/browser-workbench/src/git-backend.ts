import type { GitSnapshot } from './git/git-protocol.js';
import { GitWorkbenchError } from './git/git-protocol.js';
import type { WorkspaceBackend, WorkspaceFiles, WorkspaceSnapshot } from './session.js';

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

interface SerializedSnapshot extends Omit<GitSnapshot, 'files'> {
  readonly files: readonly { readonly path: string; readonly bytes: readonly number[] }[];
}

const textPath =
  /(?:\.(?:[cm]?[jt]sx?|vue|html?|css|json|svg|md|txt|ya?ml|toml|lock)|(?:^|\/)(?:LICENSE|README|\.gitignore))$/i;

function decodeFile(path: string, bytes: readonly number[]): string | Uint8Array<ArrayBuffer> {
  const value = new Uint8Array(bytes);
  if (!textPath.test(path)) return value;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(value);
    return text.includes('\0') ? value : text;
  } catch {
    return value;
  }
}

function snapshot(value: SerializedSnapshot): WorkspaceSnapshot {
  return {
    projectId: value.projectId,
    revision: String(value.revision),
    files: Object.fromEntries(value.files.map(file => [file.path, decodeFile(file.path, file.bytes)]))
  };
}

function serializeFiles(files: WorkspaceFiles): { path: string; content?: string; bytes?: number[] }[] {
  return Object.entries(files).map(([path, value]) =>
    typeof value === 'string' ? { path, content: value } : { path, bytes: [...value] }
  );
}

function revisionNumber(revision: string): number {
  if (!/^[1-9]\d*$/.test(revision) || !Number.isSafeInteger(Number(revision)))
    throw new GitWorkbenchError('revision_conflict', 'Invalid project revision');
  return Number(revision);
}

/** 创建独占 Git Worker 的工作区后端；资源 URL 指向已发布的 assets 目录。 */
export function createGitBackend(assetBaseURL: string): WorkspaceBackend {
  const base = new URL(assetBaseURL.endsWith('/') ? assetBaseURL : `${assetBaseURL}/`, location.href).href;
  const vendorBaseUrl = new URL('git/', base).href;
  const worker = new Worker(new URL('git-worker.js', base), { type: 'module' });
  const pending = new Map<number, PendingRequest>();
  let sequence = 0;
  let closed = false;

  const shutdown = (error: Error): void => {
    if (closed) return;
    closed = true;
    worker.terminate();
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  };

  const call = <T>(action: string, payload: Record<string, unknown>): Promise<T> => {
    if (closed) return Promise.reject(new Error('Git backend is closed'));
    const id = ++sequence;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => shutdown(new Error(`Git Worker timed out: ${action}`)), 60_000);
      pending.set(id, { resolve: value => resolve(value as T), reject, timer });
      worker.postMessage({ id, action, payload: { ...payload, vendorBaseUrl } });
    });
  };

  worker.onmessage = ({ data }: MessageEvent<WorkerResponse>) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    clearTimeout(request.timer);
    if (data.error) request.reject(Object.assign(new Error(data.error.message), { code: data.error.code }));
    else request.resolve(data.result);
  };
  worker.onerror = event => shutdown(new Error(event.message || 'Git Worker crashed'));

  return {
    open: async projectId => snapshot(await call('open', { projectId })),
    create: async (projectId, files) => snapshot(await call('init', { projectId, files: serializeFiles(files) })),
    save: async (projectId, files, expectedRevision) =>
      snapshot(
        await call('save', {
          projectId,
          files: serializeFiles(files),
          expectedRevision: revisionNumber(expectedRevision)
        })
      ),
    remove: async (projectId, path) => {
      await call('remove', { projectId, path });
    },
    rename: async (projectId, from, to) => {
      await call('rename', { projectId, path: from, destination: to });
    },
    status: projectId => call('status', { projectId }),
    stage: async (projectId, paths) => {
      await call('stage', { projectId, paths });
    },
    commit: (projectId, message) => call('commit', { projectId, message }),
    history: projectId => call('history', { projectId }),
    restore: async (projectId, oid) => snapshot(await call('restore', { projectId, oid })),
    exportArchive: async projectId => new Uint8Array(await call<number[]>('export', { projectId })),
    importArchive: async (projectId, bytes) => {
      await call('import', { projectId, archive: [...bytes] });
    },
    dispose: () => shutdown(new Error('Git backend is closed'))
  };
}
