import type { GenerationJobSummary } from '@aiao-media/api-contracts';
import { imageExtension, imageMetadata, type ImageMimeType } from '@aiao-media/api-contracts';
import type { ProductAuthorization } from '../app/supabase-auth';
import type { LocalMediaStore } from './browser-media';
import { ImageTransferError } from './image-transfer-error';
import { IMAGE_UPLOAD_CHUNK_BYTES, uploadImageChunks } from './resumable-image-upload';

export interface RemoteFileRecord {
  id: string;
  workspaceId: string;
  sourceId: string;
  version: string;
  path: string;
  mimeType: ImageMimeType;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  status: 'pending' | 'uploaded' | 'deleted' | 'needs_review';
  deleted: boolean;
  revision: number;
  baseRevision: number;
}

type Request = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
interface UploadFile {
  sourceId: string;
  metadata: ReturnType<typeof imageMetadata>;
  bytes: number;
  digest: string;
  path: string;
}
const MAX_BYTES = 16 * 1024 * 1024;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = async (bytes: ArrayBuffer): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
// fetch 是 Window 的方法：存成属性再以 this.request() 调用，浏览器会抛 Illegal invocation。
const windowFetch: Request = (input, init) => fetch(input, init);

class RecordRequestError extends ImageTransferError {
  constructor(status: number) {
    super(status, '远端图片记录操作失败，原图保留。');
  }
}

/** 平台账号图片传输：原图直达私有存储，数据库保存不可变文件身份和完整性摘要。 */
export class ImageSyncController {
  constructor(
    private readonly store: LocalMediaStore,
    private readonly access: ProductAuthorization,
    private readonly workspaceId: string,
    private readonly request: Request = windowFetch,
    /** 目标、账号或工作区一变就中止：在途请求取消，迟到的结果不再提交远端记录、不写入本机。 */
    private readonly signal?: AbortSignal
  ) {
    if (!uuid.test(workspaceId)) throw new Error('图片同步工作区标识无效。');
  }

  async records(sourceId?: string, version?: string): Promise<RemoteFileRecord[]> {
    const query =
      (sourceId ? `&sourceId=eq.${encodeURIComponent(sourceId)}` : '') +
      (version ? `&version=eq.${encodeURIComponent(version)}` : '');
    const response = await this.rest(
      `/media_file_records?select=*&workspaceId=eq.${this.workspaceId}${query}&deleted=eq.false`
    );
    if (!Array.isArray(response)) throw new Error('远端图片记录无效。');
    return response.map(row => this.record(row));
  }

  async upload(sourceId: string, expected?: { sha256: string; bytes: number }): Promise<RemoteFileRecord> {
    if (!uuid.test(sourceId)) throw new Error('图片作品标识无效。');
    const image = await this.store.backupImage(sourceId);
    const bytes = new Uint8Array(await image.blob.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('图片超过同步大小限制。');
    const metadata = imageMetadata(bytes);
    const digest = await sha256(bytes.buffer);
    if (expected && (expected.sha256 !== digest || expected.bytes !== bytes.byteLength))
      throw new Error('原图与已选队列版本不一致；原任务保留，请重新选择。');
    const extension = imageExtension(metadata.mimeType);
    const path = `${this.access.userId}/${this.workspaceId}/${sourceId}/${digest}.${extension}`;
    const file: UploadFile = { sourceId, metadata, bytes: bytes.byteLength, digest, path };
    // 同一工作区、来源和版本只有一条记录；上次停在 pending / needs_review 的记录接着用。
    const [existing] = await this.records(sourceId, digest);
    const record = existing ? this.receipt(existing, file) : await this.create(file);
    if (record.status === 'deleted') throw new Error('远端已删除此图片版本；重新上传需要新的明确操作。');
    try {
      if (record.status !== 'uploaded') await this.uploadBytes(path, bytes, metadata.mimeType);
      await this.remoteBytes(path, file.bytes, file.digest);
      return record.status === 'uploaded' ? record : await this.commit(record, file);
    } catch (error) {
      await this.markNeedsReview(record);
      throw error;
    }
  }

  async download(sourceId: string, digest: string, job: GenerationJobSummary): Promise<void> {
    if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('作品原图摘要无效。');
    // 作品记录带着当前原图摘要；按它精确取版本，同一来源的其他版本不会被当成当前原图。
    const record = (await this.records(sourceId, digest)).find(
      item => item.status === 'uploaded' && item.sha256 === digest
    );
    if (!record)
      throw new Error(
        '远端尚无可取回的原图，请在有原图的设备打开“设置图片同步范围”，选择“已有及以后保存的图片”并确认，完成后重试。'
      );
    const bytes = await this.remoteBytes(record.path, record.bytes, digest);
    this.signal?.throwIfAborted();
    await this.store.saveResult(job, new Blob([bytes], { type: record.mimeType }));
  }

  private async remoteBytes(path: string, length: number, digest: string): Promise<ArrayBuffer> {
    if (!Number.isSafeInteger(length) || length < 1 || length > MAX_BYTES)
      throw new Error('远端图片完整性记录超出文件限制。');
    const response = await this.storage(`/object/authenticated/aiao-media-images/${path}`);
    if (!response.ok) throw new ImageTransferError(response.status, '远端图片原字节读取失败；本机原图保留。');
    if (!response.body) throw new Error('远端图片完整性校验失败：响应为空。');
    const reader = response.body.getReader();
    const bytes = new Uint8Array(length);
    let offset = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        this.signal?.throwIfAborted();
        if (chunk.done) break;
        if (offset + chunk.value.byteLength > length) throw new Error('远端图片完整性校验失败：字节超限。');
        bytes.set(chunk.value, offset);
        offset += chunk.value.byteLength;
      }
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw error;
    } finally {
      reader.releaseLock();
    }
    if (offset !== length || (await sha256(bytes.buffer)) !== digest) throw new Error('远端图片完整性校验失败。');
    this.signal?.throwIfAborted();
    return bytes.buffer;
  }

  private async uploadBytes(path: string, bytes: Uint8Array, mimeType: ImageMimeType): Promise<void> {
    if (bytes.byteLength <= IMAGE_UPLOAD_CHUNK_BYTES) {
      const result = await this.storage(`/object/aiao-media-images/${path}`, {
        method: 'POST',
        headers: { 'content-type': mimeType, 'x-upsert': 'false' },
        body: bytes.slice().buffer as ArrayBuffer
      });
      // 409 只表示路径已占用，仍须读取对象核对原字节后才能确认关联。
      if (!result.ok && result.status !== 409)
        throw new ImageTransferError(result.status, '远端图片上传失败；本机原图保留。');
      return;
    }
    const endpoint = this.storageUrl('/upload/resumable');
    await uploadImageChunks(this.store, endpoint, path, bytes, mimeType, (url, options) =>
      this.storage(url.slice(this.storageUrl('').length), options)
    );
  }

  private async create(file: UploadFile): Promise<RemoteFileRecord> {
    try {
      const response = await this.rest('/media_file_records', {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({
          workspaceId: this.workspaceId,
          sourceId: file.sourceId,
          version: file.digest,
          path: file.path,
          mimeType: file.metadata.mimeType,
          width: file.metadata.width,
          height: file.metadata.height,
          bytes: file.bytes,
          sha256: file.digest,
          status: 'pending',
          deleted: false,
          createdBy: this.access.userId,
          updatedBy: this.access.userId
        })
      });
      return this.receipt(this.record(Array.isArray(response) ? response[0] : response), file, 'pending');
    } catch (error) {
      // 唯一约束冲突：另一设备或标签页刚建了同一版本的记录，改用那一条。
      if (!(error instanceof RecordRequestError) || error.status !== 409) throw error;
      const [existing] = await this.records(file.sourceId, file.digest);
      if (!existing) throw error;
      return this.receipt(existing, file);
    }
  }

  /**
   * 状态推进只走按修订过滤的 UPDATE。BEFORE INSERT 触发器先于冲突判定执行，
   * 用 upsert 带上后续修订会被当成非法初始修订拒绝，记录就永远停在 pending。
   */
  private async commit(record: RemoteFileRecord, file: UploadFile): Promise<RemoteFileRecord> {
    const response = await this.rest(`/media_file_records?id=eq.${record.id}&revision=eq.${record.revision}`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({
        status: 'uploaded',
        revision: record.revision + 1,
        baseRevision: record.revision,
        updatedBy: this.access.userId
      })
    });
    const [row] = Array.isArray(response) ? response : [];
    // 没有更新到行：修订已被另一设备推进，按远端现状核对，不覆盖。
    const current = row ? this.record(row) : (await this.records(file.sourceId, file.digest))[0];
    if (!current) throw new Error('远端图片记录已不存在；本机原图保留。');
    return this.receipt(current, file, 'uploaded');
  }

  private receipt(record: RemoteFileRecord, file: UploadFile, status?: RemoteFileRecord['status']): RemoteFileRecord {
    if (
      record.sourceId !== file.sourceId ||
      record.version !== file.digest ||
      record.deleted ||
      record.mimeType !== file.metadata.mimeType ||
      record.width !== file.metadata.width ||
      record.height !== file.metadata.height ||
      record.path !== file.path ||
      record.sha256 !== file.digest ||
      record.bytes !== file.bytes ||
      (status !== undefined && record.status !== status)
    )
      throw new Error('远端图片回执与原图不一致。');
    return record;
  }

  private async markNeedsReview(record: RemoteFileRecord): Promise<void> {
    await this.rest(`/media_file_records?id=eq.${record.id}&revision=eq.${record.revision}`, {
      method: 'PATCH',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'needs_review',
        revision: record.revision + 1,
        baseRevision: record.revision,
        updatedBy: this.access.userId
      })
    }).catch(() => undefined);
  }
  private async rest(path: string, options: RequestInit = {}): Promise<unknown> {
    const response = await this.request(`${this.access.config.url}/rest/v1${path}`, {
      ...options,
      headers: {
        apikey: this.access.config.anonKey,
        authorization: `Bearer ${this.access.session.access_token}`,
        'content-type': 'application/json',
        ...(options.headers ?? {})
      },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: this.deadline(30000)
    });
    if (!response.ok) throw new RecordRequestError(response.status);
    return response.status === 204 ? null : response.json();
  }
  private storageUrl(path: string): string {
    const url = new URL(this.access.config.url);
    const hosted = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname);
    const base = this.access.config.storageUrl ?? (hosted ? `https://${hosted[1]}.storage.supabase.co` : url.origin);
    return `${base}/storage/v1${path}`;
  }
  private storage(path: string, options: RequestInit = {}): Promise<Response> {
    return this.request(`${this.storageUrl(path)}`, {
      ...options,
      headers: {
        apikey: this.access.config.anonKey,
        authorization: `Bearer ${this.access.session.access_token}`,
        ...(options.headers ?? {})
      },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: this.deadline(60000)
    });
  }
  private deadline(milliseconds: number): AbortSignal {
    const timeout = AbortSignal.timeout(milliseconds);
    return this.signal ? AbortSignal.any([this.signal, timeout]) : timeout;
  }
  private record(value: unknown): RemoteFileRecord {
    if (!value || typeof value !== 'object') throw new Error('远端图片记录无效。');
    const row = value as Record<string, unknown>;
    if (
      typeof row['id'] !== 'string' ||
      row['workspaceId'] !== this.workspaceId ||
      row['sourceId'] === undefined ||
      !['image/png', 'image/jpeg'].includes(String(row['mimeType'])) ||
      typeof row['bytes'] !== 'number' ||
      typeof row['sha256'] !== 'string' ||
      typeof row['path'] !== 'string' ||
      !Number.isSafeInteger(row['revision'])
    )
      throw new Error('远端图片记录字段无效。');
    return row as unknown as RemoteFileRecord;
  }
}
