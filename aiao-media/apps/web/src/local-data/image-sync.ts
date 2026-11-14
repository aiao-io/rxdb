import type { GenerationJobSummary, PublicWorkPayload } from '@aiao-media/api-contracts';
import { imageExtension, imageMetadata, validateImageBlob, type ImageMimeType } from '@aiao-media/api-contracts';
import type { ProductAuthorization } from '../app/supabase-auth';
import type { LocalMediaStore } from './browser-media';
import type { ImageDeleteReview } from './image-delete';
import { isImageFileVersion } from './image-file-identity';
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
  version: string;
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

class RemovedImageError extends Error {}

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

  async records(sourceId?: string, version?: string, digest?: string): Promise<RemoteFileRecord[]> {
    const query =
      (sourceId ? `&sourceId=eq.${encodeURIComponent(sourceId)}` : '') +
      (version ? `&version=eq.${encodeURIComponent(version)}` : '') +
      (digest ? `&sha256=eq.${encodeURIComponent(digest)}` : '');
    const response = await this.rest(
      `/media_file_records?select=*&workspaceId=eq.${this.workspaceId}${query}&deleted=eq.false`
    );
    if (!Array.isArray(response)) throw new Error('远端图片记录无效。');
    return response.map(row => this.record(row));
  }

  async upload(
    sourceId: string,
    expected?: { sha256: string; bytes: number },
    progress: (bytes: number) => void = () => undefined
  ): Promise<RemoteFileRecord> {
    const { file, bytes } = await this.localFile(sourceId, expected);
    progress(0);
    await this.requireUploadAllowed(file);
    const [existing] = await this.records(sourceId, file.version);
    const record = existing ? this.receipt(existing, file) : await this.create(file);
    return this.transfer(record, file, bytes, progress);
  }

  async reupload(
    review: ImageDeleteReview,
    progress: (bytes: number) => void = () => undefined
  ): Promise<RemoteFileRecord> {
    const previous = review.file;
    const deletion = review.deletion;
    if (
      !uuid.test(previous.id) ||
      previous.workspaceId !== this.workspaceId ||
      !previous.deleted ||
      previous.status !== 'deleted' ||
      !isImageFileVersion(previous.version, previous.sha256) ||
      !deletion ||
      deletion.state !== 'complete' ||
      deletion.fileId !== previous.id ||
      deletion.workspaceId !== this.workspaceId ||
      deletion.createdBy !== this.access.userId ||
      deletion.sourceId !== previous.sourceId ||
      deletion.version !== previous.version ||
      deletion.path !== previous.path
    )
      throw new Error('原图删除尚未确认，不能重新上传新版本。');
    const capability = await this.rest('/rpc/media_file_capabilities', { method: 'POST', body: '{}' });
    const supported = capability as Record<string, unknown> | null;
    if (
      !supported ||
      supported['protocol'] !== 1 ||
      supported['privateBucket'] !== 'aiao-media-images' ||
      supported['maxBytes'] !== MAX_BYTES ||
      supported['resumable'] !== true ||
      supported['metadataOnly'] !== false ||
      supported['lifecycle'] !== 1 ||
      supported['deletion'] !== 1 ||
      supported['references'] !== 1 ||
      supported['fileVersions'] !== 2 ||
      supported['reupload'] !== 1
    )
      throw new Error('平台重新上传协议不兼容，原图保留。');
    const { file, bytes } = await this.localFile(previous.sourceId, { sha256: previous.sha256, bytes: previous.bytes });
    if (
      file.metadata.mimeType !== previous.mimeType ||
      file.metadata.width !== previous.width ||
      file.metadata.height !== previous.height
    )
      throw new Error('本机原图与已删除文件不一致。');
    const requestId = await this.reuploadRequest(previous.id);
    const raw = await this.rest('/rpc/media_prepare_image_reupload', {
      method: 'POST',
      body: JSON.stringify({
        p_file_id: previous.id,
        p_file_revision: previous.revision,
        p_work_revision: review.workRevision,
        p_request_id: requestId
      })
    });
    const prepared = this.record(raw);
    if (
      !uuid.test(prepared.id) ||
      prepared.id === previous.id ||
      prepared.revision <= 0 ||
      !Number.isSafeInteger(prepared.baseRevision) ||
      prepared.baseRevision < 0 ||
      prepared.baseRevision >= prepared.revision ||
      !['pending', 'needs_review', 'uploaded'].includes(prepared.status) ||
      !isImageFileVersion(prepared.version, file.digest) ||
      prepared.version === file.digest
    )
      throw new Error('重新上传回执没有独立的新版本身份。');
    const selected = {
      ...file,
      version: prepared.version,
      path: this.filePath(file.sourceId, prepared.version, file.metadata.mimeType)
    };
    this.receipt(prepared, selected);
    await this.requireUploadAllowed(selected);
    progress(0);
    return this.transfer(prepared, selected, bytes, progress);
  }

  /** 校验私有原图并创建临时预览；调用方释放 URL，预览不写入本机。 */
  async preview(work: PublicWorkPayload): Promise<{ url: string; mimeType: ImageMimeType } | null> {
    const records = await this.records(work.jobId, undefined, work.sha256);
    if (records.length > 1) throw new Error('远端原图版本不唯一，未读取预览。');
    const [record] = records;
    if (!record || record.status !== 'uploaded') return null;
    if (!isImageFileVersion(record.version, work.sha256)) throw new Error('远端原图版本与作品不一致。');
    this.receipt(
      record,
      {
        sourceId: work.jobId,
        version: record.version,
        digest: work.sha256,
        bytes: work.bytes,
        path: this.filePath(work.jobId, record.version, work.mimeType),
        metadata: { mimeType: work.mimeType, width: work.width, height: work.height }
      },
      'uploaded'
    );
    const bytes = await this.remoteBytes(record.path, work.bytes, work.sha256);
    const blob = new Blob([bytes], { type: work.mimeType });
    const metadata = await validateImageBlob(blob);
    if (metadata.width !== work.width || metadata.height !== work.height) throw new Error('远端预览尺寸与作品不一致。');
    this.signal?.throwIfAborted();
    return { url: URL.createObjectURL(blob), mimeType: metadata.mimeType };
  }

  async download(sourceId: string, digest: string, job: GenerationJobSummary): Promise<void> {
    if (!/^[0-9a-f]{64}$/.test(digest)) throw new Error('作品原图摘要无效。');
    // 按作品摘要取有效文件，允许用户明确重新上传产生的新版本。
    const record = (await this.records(sourceId, undefined, digest)).find(
      item => item.status === 'uploaded' && item.sha256 === digest
    );
    if (!record)
      throw new Error(
        '远端尚无可取回的原图，请在有原图的设备打开“设置图片同步范围”，选择“已有及以后保存的图片”并确认，完成后重试。'
      );
    if (
      record.sourceId !== sourceId ||
      !isImageFileVersion(record.version, digest) ||
      record.path !== this.filePath(sourceId, record.version, record.mimeType)
    )
      throw new Error('远端图片回执与作品版本不一致。');
    const bytes = await this.remoteBytes(record.path, record.bytes, digest);
    this.signal?.throwIfAborted();
    await this.store.saveResult(job, new Blob([bytes], { type: record.mimeType }));
  }

  private async reuploadRequest(fileId: string): Promise<string> {
    const scope = `${this.access.config.url}:${this.access.userId}:${this.workspaceId}`;
    const hash = await sha256(new TextEncoder().encode(scope).buffer);
    this.signal?.throwIfAborted();
    const saved = await this.store.ensurePreference(
      `ir-${hash.slice(0, 32)}-${fileId.replaceAll('-', '')}`,
      JSON.stringify({ version: 1, scope, fileId, requestId: crypto.randomUUID() })
    );
    this.signal?.throwIfAborted();
    const journal: unknown = JSON.parse(saved.payload);
    const row = journal as Record<string, unknown> | null;
    if (
      !row ||
      row['version'] !== 1 ||
      row['scope'] !== scope ||
      row['fileId'] !== fileId ||
      typeof row['requestId'] !== 'string' ||
      !uuid.test(row['requestId'])
    )
      throw new Error('重新上传设备记录无效，原图保留。');
    return row['requestId'];
  }

  private filePath(sourceId: string, version: string, mime: ImageMimeType): string {
    return `${this.access.userId}/${this.workspaceId}/${sourceId}/${version}.${imageExtension(mime)}`;
  }

  private async localFile(
    sourceId: string,
    expected?: { sha256: string; bytes: number }
  ): Promise<{ file: UploadFile; bytes: Uint8Array<ArrayBuffer> }> {
    this.signal?.throwIfAborted();
    if (!uuid.test(sourceId)) throw new Error('图片作品标识无效。');
    const image = await this.store.backupImage(sourceId);
    const bytes = new Uint8Array(await image.blob.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('图片超过同步大小限制。');
    const metadata = imageMetadata(bytes);
    const digest = await sha256(bytes.buffer);
    this.signal?.throwIfAborted();
    if (expected && (expected.sha256 !== digest || expected.bytes !== bytes.byteLength))
      throw new Error('原图与已选队列版本不一致；原任务保留，请重新选择。');
    return {
      file: {
        sourceId,
        metadata,
        bytes: bytes.byteLength,
        digest,
        version: digest,
        path: this.filePath(sourceId, digest, metadata.mimeType)
      },
      bytes
    };
  }

  private async transfer(
    record: RemoteFileRecord,
    file: UploadFile,
    bytes: Uint8Array<ArrayBuffer>,
    progress: (bytes: number) => void
  ): Promise<RemoteFileRecord> {
    this.signal?.throwIfAborted();
    if (record.status === 'deleted') throw new Error('远端已删除此图片版本；重新上传需要新的明确操作。');
    try {
      if (record.status !== 'uploaded') await this.uploadBytes(file.path, bytes, file.metadata.mimeType, progress);
      await this.remoteBytes(file.path, file.bytes, file.digest);
      await this.requireUploadAllowed(file);
      progress(file.bytes);
      return record.status === 'uploaded' ? record : await this.commit(record, file);
    } catch (error) {
      if (!(error instanceof RemovedImageError)) await this.markNeedsReview(record);
      throw error;
    }
  }

  private async requireUploadAllowed(file: UploadFile): Promise<void> {
    const allowed = await this.rest('/rpc/media_image_upload_allowed', {
      method: 'POST',
      body: JSON.stringify({ p_workspace_id: this.workspaceId, p_source_id: file.sourceId, p_version: file.version })
    });
    if (allowed !== true) throw new RemovedImageError('此作品或原图版本已从同步图库移除，本机原图保留。');
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

  private async uploadBytes(
    path: string,
    bytes: Uint8Array,
    mimeType: ImageMimeType,
    progress: (bytes: number) => void
  ): Promise<void> {
    if (bytes.byteLength <= IMAGE_UPLOAD_CHUNK_BYTES) {
      const result = await this.storage(`/object/aiao-media-images/${path}`, {
        method: 'POST',
        headers: { 'content-type': mimeType, 'x-upsert': 'false' },
        body: bytes.slice().buffer as ArrayBuffer
      });
      // 409 只表示路径已占用，仍须读取对象核对原字节后才能确认关联。
      if (!result.ok && result.status !== 409)
        throw new ImageTransferError(result.status, '远端图片上传失败；本机原图保留。');
      if (result.ok) progress(bytes.byteLength);
      return;
    }
    const endpoint = this.storageUrl('/upload/resumable');
    await uploadImageChunks(
      this.store,
      endpoint,
      path,
      bytes,
      mimeType,
      (url, options) => this.storage(url.slice(this.storageUrl('').length), options),
      progress
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
          version: file.version,
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
      const [existing] = await this.records(file.sourceId, file.version);
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
    const current = row ? this.record(row) : (await this.records(file.sourceId, file.version))[0];
    if (!current) throw new Error('远端图片记录已不存在；本机原图保留。');
    return this.receipt(current, file, 'uploaded');
  }

  private receipt(record: RemoteFileRecord, file: UploadFile, status?: RemoteFileRecord['status']): RemoteFileRecord {
    if (
      record.sourceId !== file.sourceId ||
      record.version !== file.version ||
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
    this.signal?.throwIfAborted();
    const signal = this.deadline(30000);
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
      signal
    });
    signal.throwIfAborted();
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
    this.signal?.throwIfAborted();
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
