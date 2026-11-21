import { GitWorkbenchError, type GitFile } from './git/git-protocol';
import { GitWorkbenchRuntime } from './git/git-runtime';

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
    message?: string;
    oid?: string;
    archive?: number[];
    expectedRevision?: number;
    destination?: string;
    removedPaths?: string[];
    kind?: 'working' | 'staged';
    branch?: string;
    force?: boolean;
  };
}

let runtime: Promise<GitWorkbenchRuntime> | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isByteArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every(item => typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= 255)
  );
}

function isSerializedFile(value: unknown): value is SerializedFile {
  if (!isRecord(value) || typeof value['path'] !== 'string' || !value['path']) return false;
  const content = value['content'];
  const bytes = value['bytes'];
  return (content === undefined || typeof content === 'string') && (bytes === undefined || isByteArray(bytes));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isPayload(value: unknown): value is WorkerRequest['payload'] {
  if (!isRecord(value) || typeof value['projectId'] !== 'string' || !value['projectId']) return false;
  if (value['files'] !== undefined && (!Array.isArray(value['files']) || !value['files'].every(isSerializedFile)))
    return false;
  if (value['paths'] !== undefined && !isStringArray(value['paths'])) return false;
  if (value['path'] !== undefined && typeof value['path'] !== 'string') return false;
  if (value['message'] !== undefined && typeof value['message'] !== 'string') return false;
  if (value['oid'] !== undefined && typeof value['oid'] !== 'string') return false;
  if (value['archive'] !== undefined && !isByteArray(value['archive'])) return false;
  if (value['expectedRevision'] !== undefined && !Number.isSafeInteger(value['expectedRevision'])) return false;
  if (value['destination'] !== undefined && typeof value['destination'] !== 'string') return false;
  if (value['removedPaths'] !== undefined && !isStringArray(value['removedPaths'])) return false;
  if (value['kind'] !== undefined && value['kind'] !== 'working' && value['kind'] !== 'staged') return false;
  if (value['branch'] !== undefined && typeof value['branch'] !== 'string') return false;
  return value['force'] === undefined || typeof value['force'] === 'boolean';
}

function isWorkerRequest(value: unknown): value is WorkerRequest {
  if (!isRecord(value) || !Number.isSafeInteger(value['id']) || (value['id'] as number) <= 0) return false;
  return typeof value['action'] === 'string' && Boolean(value['action']) && isPayload(value['payload']);
}

function files(input: readonly SerializedFile[] = []): GitFile[] {
  return input.map(file => ({
    path: file.path,
    bytes: file.bytes === undefined ? new TextEncoder().encode(file.content ?? '') : new Uint8Array(file.bytes)
  }));
}

function serialized(value: unknown): unknown {
  if (value instanceof Uint8Array) return [...value];
  if (Array.isArray(value)) return value.map(serialized);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialized(item)]));
}

async function dispatch({ action, payload }: WorkerRequest): Promise<unknown> {
  runtime ??= GitWorkbenchRuntime.create(new URL('/github-git/', self.location.origin).href);
  const git = await runtime;
  const projectId = payload.projectId;
  switch (action) {
    case 'init':
      return git.initialize(projectId, files(payload.files));
    case 'open':
      return git.open(projectId);
    case 'save':
      return payload.removedPaths === undefined ?
          git.save(projectId, files(payload.files), payload.expectedRevision)
        : git.save(projectId, files(payload.files), payload.expectedRevision, payload.removedPaths);
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
    case 'branches':
      return git.branches(projectId);
    case 'createBranch':
      return git.createBranch(projectId, payload.branch ?? '');
    case 'deleteBranch':
      return git.deleteBranch(projectId, payload.branch ?? '');
    case 'checkout':
      return git.checkout(projectId, payload.branch ?? '', payload.force ?? false);
    case 'history':
      return git.history(projectId);
    case 'restore':
      return git.restore(projectId, payload.oid ?? '');
    case 'export':
      return git.exportArchive(projectId);
    case 'import':
      return git.importArchive(projectId, new Uint8Array(payload.archive ?? []));
    default:
      throw new Error(`Unknown Git action: ${action}`);
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (!event.isTrusted || event.origin !== '' || event.source !== null) return;
  const { data } = event;
  if (!isWorkerRequest(data)) return;
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
