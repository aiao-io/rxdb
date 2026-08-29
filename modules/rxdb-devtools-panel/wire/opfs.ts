/**
 * @fileoverview OPFS 文件信道的 v1 wire 契约：面板与 content script 共用的消息集合、
 * 信封类型、名称校验与请求 id 配对。
 *
 * @remarks
 * 只放**契约**，不放实现：`FileSystemDirectoryHandle` 的遍历、上传会话状态机、
 * `createOpfsMessageHandler` 全部留在 `apps/rxdb-devtools-extension/src/content/opfs.ts`。
 * 分界线的判据是「两端是否都必须认识它」—— 消息名集合、请求/响应形状、名称非法字符、
 * requestId 配对规则两端都要认；句柄遍历只有 content script 认。
 */

/** OPFS 目录树中的单个条目。 */
export interface DirectoryEntry {
  name: string;
  kind: 'file' | 'directory';
  size?: number;
  type?: string;
  lastModified?: number;
  relativePath: string;
  entries?: Record<string, DirectoryEntry>;
}

/** DevTools 面板发往 OPFS content script 的请求。 */
export interface OpfsRequest {
  requestId: string;
  message: string;
  data?: {
    relativePath?: string;
    fileName?: string;
    path?: string;
    dirName?: string;
    fileData?: string;
    uploadId?: string;
    totalBytes?: number;
  };
}

/** OPFS content script 返回给面板的响应。 */
export interface OpfsResponse {
  requestId: string;
  result?: 'ok';
  error?: string;
  structure?: Record<string, DirectoryEntry>;
}

/** content script 与面板共同执行的单文件上传硬上限。 */
export const MAX_OPFS_UPLOAD_BYTES = 50 * 1024 * 1024;

/** 受支持的 OPFS 消息名全集；两端共用同一份，避免任一侧单独放宽。 */
export const OPFS_MESSAGES: ReadonlySet<string> = new Set([
  'getDirectoryStructure',
  'downloadFile',
  'deleteFile',
  'deleteDirectory',
  'uploadFile',
  'uploadStart',
  'uploadChunk',
  'uploadComplete',
  'uploadAbort',
  'createDirectory'
]);

/** 校验单个 OPFS 文件名或目录名并返回原值。 */
export function validateOpfsName(name: string): string {
  if (name.length === 0) throw new Error('OPFS 名称不能为空');
  if (name === '.' || name === '..') throw new Error('OPFS 名称不能是 . 或 ..');
  if (/[\\/]/.test(name)) throw new Error('OPFS 名称不能包含路径分隔符');
  if (name.includes('\0')) throw new Error('OPFS 名称不能包含空字符');
  return name;
}

/** 判断未知值是否为带 requestId 的受支持 OPFS 请求。 */
export function isOpfsRequest(value: unknown): value is OpfsRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request['requestId'] === 'string' &&
    request['requestId'].length > 0 &&
    typeof request['message'] === 'string' &&
    OPFS_MESSAGES.has(request['message'])
  );
}

/** 发送请求并拒绝 requestId 不匹配的响应。 */
export async function withOpfsRequestId(
  request: Omit<OpfsRequest, 'requestId'>,
  send: (request: OpfsRequest) => Promise<OpfsResponse>,
  createRequestId: () => string
): Promise<OpfsResponse> {
  const requestId = createRequestId();
  const response = await send({ ...request, requestId });
  if (response.requestId !== requestId) throw new Error('OPFS 响应 requestId 不匹配');
  return response;
}
