import type { ProductAuthorization } from '../app/supabase-auth';
import { imageExtension, imageMetadata, type ImageMimeType } from '../contracts/image-format';
import type { GenerationJobSummary } from '../contracts/index';
import type { LocalMediaStore } from './browser-media';

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
const MAX_BYTES = 16 * 1024 * 1024;
const CHUNK_BYTES = 6 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = async (bytes: ArrayBuffer): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');

/** 自有项目图片传输：原图直达私有 Storage，数据库只保存不可变文件身份和完整性摘要。 */
export class ImageSyncController {
  constructor(
    private readonly store: LocalMediaStore,
    private readonly access: ProductAuthorization,
    private readonly workspaceId: string,
    private readonly request: Request = fetch
  ) {
    if (!uuid.test(workspaceId)) throw new Error('图片同步工作区标识无效。');
  }

  async records(sourceId?: string): Promise<RemoteFileRecord[]> {
    const query = sourceId ? `&sourceId=eq.${encodeURIComponent(sourceId)}` : '';
    const response = await this.rest(
      `/media_file_records?select=*&workspaceId=eq.${this.workspaceId}${query}&deleted=eq.false`
    );
    if (!Array.isArray(response)) throw new Error('远端图片记录无效。');
    return response.map(row => this.record(row));
  }

  async upload(job: GenerationJobSummary): Promise<RemoteFileRecord> {
    if (!uuid.test(job.id) || job.request.kind !== 'image') throw new Error('图片任务标识无效。');
    const image = await this.store.backupImage(job.id);
    const bytes = new Uint8Array(await image.blob.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) throw new Error('图片超过同步大小限制。');
    const metadata = imageMetadata(bytes);
    const digest = await sha256(bytes.buffer);
    const version = digest;
    const extension = imageExtension(metadata.mimeType);
    const path = `${this.access.userId}/${this.workspaceId}/${job.id}/${digest}.${extension}`;
    const existing = (await this.records(job.id)).find(record => record.version === version && record.path === path);
    if (existing?.status === 'uploaded') return existing;
    const pending = await this.upsertRecord({
      job,
      metadata,
      bytes: bytes.byteLength,
      digest,
      path,
      status: 'pending',
      existing
    });
    try {
      await this.uploadBytes(path, bytes, metadata.mimeType);
      const response = await this.upsertRecord({
        job,
        metadata,
        bytes: bytes.byteLength,
        digest,
        path,
        status: 'uploaded',
        existing: pending
      });
      return response;
    } catch (error) {
      if (pending) await this.markNeedsReview(pending);
      throw error;
    }
  }

  async download(sourceId: string, job: GenerationJobSummary): Promise<void> {
    const [record] = (await this.records(sourceId)).filter(item => item.status === 'uploaded' && !item.deleted);
    if (!record) throw new Error('远端图片尚未完成上传或已被移除。');
    const response = await this.storage(`/object/authenticated/aiao-media-images/${record.path}`);
    if (!response.ok) throw new Error('远端图片读取失败；本机数据保留。');
    const blob = await response.blob();
    const bytes = await blob.arrayBuffer();
    if (bytes.byteLength !== record.bytes || (await sha256(bytes)) !== record.sha256)
      throw new Error('远端图片完整性校验失败。');
    await this.store.saveResult(job, new Blob([bytes], { type: record.mimeType }));
  }

  private async uploadBytes(path: string, bytes: Uint8Array, mimeType: ImageMimeType): Promise<void> {
    if (bytes.byteLength <= CHUNK_BYTES) {
      const result = await this.storage(`/object/aiao-media-images/${path}`, {
        method: 'POST',
        headers: { 'content-type': mimeType, 'x-upsert': 'false' },
        body: bytes.slice().buffer as ArrayBuffer
      });
      if (!result.ok && result.status !== 409) throw new Error('远端图片上传失败；本机原图保留。');
      return;
    }
    const endpoint = this.storageUrl('/upload/resumable');
    const created = await this.request(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.access.session.access_token}`,
        apikey: this.access.config.anonKey,
        'tus-resumable': '1.0.0',
        'upload-length': String(bytes.byteLength),
        'upload-metadata': `bucketName ${btoa('aiao-media-images')},objectName ${btoa(path)},contentType ${btoa(mimeType)}`
      }
    });
    if (!created.ok) throw new Error('远端续传初始化失败；本机原图保留。');
    const location = created.headers.get('location');
    if (!location) throw new Error('远端续传回执缺少位置。');
    for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
      const chunk = bytes.slice(offset, Math.min(bytes.byteLength, offset + CHUNK_BYTES));
      const result = await this.request(new URL(location, endpoint), {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${this.access.session.access_token}`,
          apikey: this.access.config.anonKey,
          'tus-resumable': '1.0.0',
          'upload-offset': String(offset),
          'content-type': 'application/offset+octet-stream'
        },
        body: chunk
      });
      if (!result.ok) throw new Error('远端续传分片失败；本机原图保留。');
    }
  }

  private async upsertRecord(input: {
    job: GenerationJobSummary;
    metadata: ReturnType<typeof imageMetadata>;
    bytes: number;
    digest: string;
    path: string;
    status: RemoteFileRecord['status'];
    existing?: RemoteFileRecord;
  }): Promise<RemoteFileRecord> {
    const payload = {
      ...(input.existing ?
        { id: input.existing.id, revision: input.existing.revision + 1, baseRevision: input.existing.revision }
      : {}),
      workspaceId: this.workspaceId,
      sourceId: input.job.id,
      version: input.digest,
      path: input.path,
      mimeType: input.metadata.mimeType,
      width: input.metadata.width,
      height: input.metadata.height,
      bytes: input.bytes,
      sha256: input.digest,
      status: input.status,
      deleted: false,
      createdBy: this.access.userId,
      updatedBy: this.access.userId
    };
    const response = await this.rest('/media_file_records', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload)
    });
    const row = Array.isArray(response) ? response[0] : response;
    const result = this.record(row);
    if (result.sourceId !== input.job.id || result.path !== input.path || result.sha256 !== input.digest || result.bytes !== input.bytes || result.status !== input.status) throw new Error('远端图片回执与原图不一致。');
    return result;
  }

  private async markNeedsReview(record: RemoteFileRecord): Promise<void> {
    await this.rest(`/media_file_records?id=eq.${record.id}`, {
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
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error('远端图片记录操作失败，原图保留。');
    return response.status === 204 ? null : response.json();
  }
  private storageUrl(path: string): string {
    const url = new URL(this.access.config.url);
    const base =
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ?
        url.origin
      : `https://${url.hostname.split('.')[0]}.storage.supabase.co`;
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
      signal: AbortSignal.timeout(60000)
    });
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
      typeof row['path'] !== 'string'
    )
      throw new Error('远端图片记录字段无效。');
    return row as unknown as RemoteFileRecord;
  }
}
