import { GitWorkbenchError, type GitFile } from './git-protocol.js';
import { GitWorkbenchRuntime } from './git-runtime.js';

interface SerializedFile {
  path: string;
  content?: string;
  bytes?: number[];
}
interface WorkerRequest {
  id: number;
  action: string;
  payload: {
    projectId: string;
    files?: SerializedFile[];
    paths?: string[];
    path?: string;
    destination?: string;
    message?: string;
    oid?: string;
    archive?: number[];
    expectedRevision?: number;
    vendorBaseUrl?: string;
    kind?: 'working' | 'staged';
  };
}

let runtime: Promise<GitWorkbenchRuntime> | undefined;

function files(input: readonly SerializedFile[] = []): GitFile[] {
  return input.map(file => ({
    path: file.path,
    bytes: file.bytes ? new Uint8Array(file.bytes) : new TextEncoder().encode(file.content ?? '')
  }));
}

function serialized(value: unknown): unknown {
  if (value instanceof Uint8Array) return [...value];
  if (Array.isArray(value)) return value.map(serialized);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialized(item)]));
}

async function dispatch({ action, payload }: WorkerRequest): Promise<unknown> {
  runtime ??= GitWorkbenchRuntime.create(payload.vendorBaseUrl ?? new URL('/vendor/', self.location.origin).href);
  const git = await runtime;
  const projectId = payload.projectId;
  switch (action) {
    case 'init':
      return git.initialize(projectId, files(payload.files));
    case 'open':
      return git.open(projectId);
    case 'save':
      return git.save(projectId, files(payload.files), payload.expectedRevision);
    case 'snapshot':
      return git.snapshot(projectId);
    case 'remove':
      return git.remove(projectId, payload.path ?? '');
    case 'rename':
      return git.rename(projectId, payload.path ?? '', payload.destination ?? '');
    case 'move':
      return git.move(projectId, payload.path ?? '', payload.destination ?? '');
    case 'status':
      return git.status(projectId);
    case 'stage':
      return git.stage(projectId, payload.paths ?? []);
    case 'unstage':
      return git.unstage(projectId, payload.paths ?? []);
    case 'readDiff':
      if (payload.kind !== 'working' && payload.kind !== 'staged')
        throw new GitWorkbenchError('invalid_path', 'readDiff requires working or staged kind');
      return git.readDiff(projectId, payload.path ?? '', payload.kind);
    case 'discardWorking':
      return git.discardWorking(projectId, payload.path ?? '');
    case 'commit':
      return git.commit(projectId, payload.message ?? '');
    case 'history':
      return git.history(projectId);
    case 'restore':
      return git.restore(projectId, payload.oid ?? '');
    case 'export':
      return git.exportArchive(projectId);
    case 'import':
      return git.importArchive(projectId, new Uint8Array(payload.archive ?? []));
    case 'metrics':
      return { memoryBytes: git.memoryBytes };
    default:
      throw new Error(`Unknown Git action: ${action}`);
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  // 专用 Worker 的宿主通道不携带 Window 来源，只接受浏览器分发的消息。
  if (!event.isTrusted || event.origin !== '' || event.source !== null) return;
  const { data } = event;
  void dispatch(data)
    .then(result => self.postMessage({ id: data.id, result: serialized(result) }))
    .catch((error: unknown) => {
      const code =
        typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'storage_failed';
      self.postMessage({
        id: data.id,
        error: { code, message: error instanceof Error ? error.message : String(error) }
      });
    });
};
