import type { ImageMimeType } from '@aiao-media/api-contracts';
import type { LocalMediaStore } from './browser-media';
import { ImageTransferError } from './image-transfer-error';

type Journal = Pick<LocalMediaStore, 'preference' | 'savePreference'>;
type Request = (url: string, init: RequestInit) => Promise<Response>;
interface UploadSession {
  version: 1;
  location: string;
  path: string;
  bytes: number;
  mimeType: ImageMimeType;
  offset: number;
}
export const IMAGE_UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;

function sessionLocation(value: string, endpoint: string): string {
  const target = new URL(value, endpoint);
  const base = new URL(endpoint);
  if (
    value.length > 4096 ||
    target.origin !== base.origin ||
    target.username ||
    target.password ||
    target.hash ||
    !target.pathname.startsWith(`${base.pathname}/`) ||
    target.pathname === `${base.pathname}/`
  )
    throw new Error('远端续传回执指向未授权的存储服务。');
  return target.href;
}
function serverOffset(response: Response, bytes: number): number {
  const value = response.headers.get('upload-offset');
  const length = response.headers.get('upload-length');
  if (
    !value ||
    !/^(0|[1-9]\d*)$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) > bytes ||
    (length !== null && length !== String(bytes))
  )
    throw new Error('远端续传进度回执无效；未确认上传完成。');
  return Number(value);
}
function readSession(payload: string, file: Pick<UploadSession, 'path' | 'bytes' | 'mimeType'>): UploadSession | null {
  const value: unknown = JSON.parse(payload);
  if (value === null) return null;
  if (!value || typeof value !== 'object') throw new Error('本机续传记录无效，原记录保留。');
  const session = value as Partial<UploadSession>;
  if (
    session.version !== 1 ||
    session.path !== file.path ||
    session.bytes !== file.bytes ||
    session.mimeType !== file.mimeType ||
    typeof session.location !== 'string' ||
    typeof session.offset !== 'number' ||
    !Number.isSafeInteger(session.offset) ||
    session.offset < 0 ||
    session.offset > file.bytes
  )
    throw new Error('本机续传记录身份或版本无效，原记录保留。');
  return session as UploadSession;
}

/** 设备续传日志只保存不可变文件身份和 TUS 回执；每次恢复先核对服务端进度。 */
export async function uploadImageChunks(
  store: Journal,
  endpoint: string,
  path: string,
  bytes: Uint8Array,
  mimeType: ImageMimeType,
  request: Request
): Promise<void> {
  const identity = new TextEncoder().encode(JSON.stringify([endpoint, path]));
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', identity))]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
  const key = `image-upload-${hash}`;
  const saved = await store.preference(key);
  let revision = saved?.revision ?? null;
  const file = { path, bytes: bytes.byteLength, mimeType };
  let session = saved ? readSession(saved.payload, file) : null;
  const persist = async (value: UploadSession | null) => {
    revision = await store.savePreference(key, JSON.stringify(value), revision);
  };
  if (session) {
    const response = await request(sessionLocation(session.location, endpoint), {
      method: 'HEAD',
      headers: { 'tus-resumable': '1.0.0' }
    });
    if (response.status === 404 || response.status === 410) {
      session = null;
      await persist(null);
    } else {
      if (!response.ok)
        throw new ImageTransferError(response.status, '远端续传进度读取失败；本机会话保留，请稍后重试。');
      if (response.headers.get('upload-length') !== String(bytes.byteLength))
        throw new Error('远端续传文件长度不一致；本机原图保留。');
      session.offset = serverOffset(response, bytes.byteLength);
      await persist(session);
    }
  }
  if (!session) {
    const response = await request(endpoint, {
      method: 'POST',
      headers: {
        'tus-resumable': '1.0.0',
        'upload-length': String(bytes.byteLength),
        'upload-metadata': `bucketName ${btoa('aiao-media-images')},objectName ${btoa(path)},contentType ${btoa(mimeType)}`
      }
    });
    if (response.status === 409) return;
    if (!response.ok) throw new ImageTransferError(response.status, '远端续传初始化失败；本机原图保留。');
    const location = response.headers.get('location');
    if (!location) throw new Error('远端续传回执缺少位置。');
    session = { version: 1, ...file, location: sessionLocation(location, endpoint), offset: 0 };
    await persist(session);
  }
  while (session.offset < bytes.byteLength) {
    const end = Math.min(bytes.byteLength, session.offset + IMAGE_UPLOAD_CHUNK_BYTES);
    const response = await request(session.location, {
      method: 'PATCH',
      headers: {
        'tus-resumable': '1.0.0',
        'upload-offset': String(session.offset),
        'content-type': 'application/offset+octet-stream'
      },
      body: bytes.slice(session.offset, end).buffer
    });
    if (!response.ok) throw new ImageTransferError(response.status, '远端续传分片失败；本机会话保留，请稍后重试。');
    if (serverOffset(response, bytes.byteLength) !== end) throw new Error('远端续传分片进度不一致；未确认上传完成。');
    session.offset = end;
    await persist(session);
  }
}
