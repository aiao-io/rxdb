import {
  base64ToBytes,
  MAX_OPFS_UPLOAD_BYTES,
  OPFS_MESSAGES,
  validateOpfsName,
  type DirectoryEntry,
  type OpfsRequest,
  type OpfsResponse
} from '@modules/rxdb-devtools-panel/wire';

interface OpfsDependencies {
  getRootDirectory: () => Promise<FileSystemDirectoryHandle>;
  document?: Document;
  url?: Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>;
}

interface UploadSession {
  writable: FileSystemWritableFileStream;
  expectedBytes: number;
  receivedBytes: number;
}

function pathSegments(path: string): string[] {
  const segments = path.replace(/^\.\//, '').split('/').filter(Boolean);
  return segments.map(validateOpfsName);
}

async function resolveDirectory(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
  let directory = root;
  for (const segment of pathSegments(path)) {
    directory = await directory.getDirectoryHandle(segment, { create: false });
  }
  return directory;
}

async function resolveFile(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemFileHandle> {
  const segments = pathSegments(path);
  const name = segments.pop();
  if (!name) throw new Error(`OPFS 条目不存在: ${path}`);
  const parent = await resolveDirectory(root, segments.join('/'));
  return parent.getFileHandle(name, { create: false });
}

async function removeEntry(root: FileSystemDirectoryHandle, path: string, recursive: boolean): Promise<void> {
  const segments = pathSegments(path);
  const name = segments.pop();
  if (!name) throw new Error(`OPFS 条目不存在: ${path}`);
  const parent = await resolveDirectory(root, segments.join('/'));
  await parent.removeEntry(name, { recursive });
}

async function readDirectory(
  directory: FileSystemDirectoryHandle,
  relativePath = '.'
): Promise<Record<string, DirectoryEntry>> {
  const result: Record<string, DirectoryEntry> = {};
  const entries = directory.entries() as AsyncIterable<[string, FileSystemHandle]>;
  for await (const [, handle] of entries) {
    const nestedPath = `${relativePath}/${handle.name}`;
    if (handle.kind === 'directory') {
      result[handle.name] = {
        name: handle.name,
        kind: 'directory',
        relativePath: nestedPath,
        entries: await readDirectory(handle as FileSystemDirectoryHandle, nestedPath)
      };
      continue;
    }
    const file = await (handle as FileSystemFileHandle).getFile();
    result[handle.name] = {
      name: handle.name,
      kind: 'file',
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      relativePath: nestedPath
    };
  }
  return result;
}

function errorMessage(error: unknown, request: OpfsRequest): string {
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return `OPFS 条目不存在: ${request.data?.path ?? request.data?.relativePath ?? ''}`;
  }
  return error instanceof Error ? error.message : String(error);
}

/** 创建一个隔离上传会话并执行 OPFS 请求的消息处理器。 */
export function createOpfsMessageHandler(dependencies: OpfsDependencies) {
  const uploads = new Map<string, UploadSession>();
  const abortUpload = async (uploadId: string): Promise<void> => {
    const session = uploads.get(uploadId);
    if (!session) return;
    uploads.delete(uploadId);
    await session.writable.abort().catch(() => undefined);
  };

  return async (request: OpfsRequest): Promise<OpfsResponse> => {
    const respond = (response: Omit<OpfsResponse, 'requestId'>): OpfsResponse => ({
      requestId: request.requestId,
      ...response
    });
    try {
      if (!OPFS_MESSAGES.has(request.message)) {
        return respond({ error: `不支持的 OPFS 消息: ${request.message}` });
      }
      if (request.message === 'getDirectoryStructure') {
        const root = await dependencies.getRootDirectory();
        const entries = await readDirectory(root);
        return respond({
          structure: { '.': { name: '.', kind: 'directory', relativePath: '.', entries } }
        });
      }
      if (request.message === 'downloadFile') {
        const path = request.data?.relativePath ?? '';
        const handle = await resolveFile(await dependencies.getRootDirectory(), path);
        const file = await handle.getFile();
        const urlApi = dependencies.url ?? URL;
        const currentDocument = dependencies.document ?? document;
        const objectUrl = urlApi.createObjectURL(file);
        try {
          const anchor = currentDocument.createElement('a');
          anchor.href = objectUrl;
          anchor.download = request.data?.fileName ?? handle.name;
          currentDocument.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
        } finally {
          urlApi.revokeObjectURL(objectUrl);
        }
        return respond({ result: 'ok' });
      }
      if (request.message === 'deleteFile' || request.message === 'deleteDirectory') {
        const path = request.data?.path ?? '';
        await removeEntry(await dependencies.getRootDirectory(), path, request.message === 'deleteDirectory');
        return respond({ result: 'ok' });
      }
      if (request.message === 'uploadStart') {
        const uploadId = request.data?.uploadId ?? '';
        const fileName = validateOpfsName(request.data?.fileName ?? '');
        const totalBytes = request.data?.totalBytes;
        if (!uploadId) throw new Error('上传会话 ID 不能为空');
        if (!Number.isSafeInteger(totalBytes) || (totalBytes ?? -1) < 0) throw new Error('上传大小无效');
        if ((totalBytes ?? 0) > MAX_OPFS_UPLOAD_BYTES) throw new Error(`文件超过 50MB 上限: ${fileName}`);
        if (uploads.has(uploadId)) throw new Error('上传会话已存在');
        const directory = await resolveDirectory(await dependencies.getRootDirectory(), request.data?.path ?? '/');
        const handle = await directory.getFileHandle(fileName, { create: true });
        uploads.set(uploadId, {
          writable: await handle.createWritable(),
          expectedBytes: totalBytes ?? 0,
          receivedBytes: 0
        });
        return respond({ result: 'ok' });
      }
      if (request.message === 'uploadChunk') {
        const uploadId = request.data?.uploadId ?? '';
        const session = uploads.get(uploadId);
        if (!session) throw new Error('上传会话不存在');
        const bytes = base64ToBytes(request.data?.fileData ?? '');
        if (session.receivedBytes + bytes.byteLength > session.expectedBytes) {
          throw new Error('上传数据超过声明大小');
        }
        await session.writable.write(bytes);
        session.receivedBytes += bytes.byteLength;
        return respond({ result: 'ok' });
      }
      if (request.message === 'uploadComplete') {
        const uploadId = request.data?.uploadId ?? '';
        const session = uploads.get(uploadId);
        if (!session) throw new Error('上传会话不存在');
        if (session.receivedBytes !== session.expectedBytes) throw new Error('上传数据不完整');
        await session.writable.close();
        uploads.delete(uploadId);
        return respond({ result: 'ok' });
      }
      if (request.message === 'uploadAbort') {
        await abortUpload(request.data?.uploadId ?? '');
        return respond({ result: 'ok' });
      }
      if (request.message === 'uploadFile') {
        const fileName = validateOpfsName(request.data?.fileName ?? '');
        const bytes = base64ToBytes(request.data?.fileData ?? '');
        if (bytes.byteLength > MAX_OPFS_UPLOAD_BYTES) throw new Error(`文件超过 50MB 上限: ${fileName}`);
        const directory = await resolveDirectory(await dependencies.getRootDirectory(), request.data?.path ?? '/');
        const handle = await directory.getFileHandle(fileName, { create: true });
        const writable = await handle.createWritable();
        try {
          await writable.write(bytes);
          await writable.close();
        } catch (error) {
          await writable.abort(error).catch(() => undefined);
          throw error;
        }
        return respond({ result: 'ok' });
      }
      const dirName = validateOpfsName(request.data?.dirName ?? '');
      const directory = await resolveDirectory(await dependencies.getRootDirectory(), request.data?.path ?? '/');
      await directory.getDirectoryHandle(dirName, { create: true });
      return respond({ result: 'ok' });
    } catch (error) {
      if (request.message === 'uploadChunk' || request.message === 'uploadComplete') {
        await abortUpload(request.data?.uploadId ?? '');
      }
      return respond({ error: errorMessage(error, request) });
    }
  };
}
