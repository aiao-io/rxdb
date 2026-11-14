import { imageExtension, type ImageMimeType } from '@aiao-media/api-contracts';
import type { ProductAuthorization } from '../app/supabase-auth';
import type { LocalMediaStore } from './browser-media';
import { isImageFileVersion } from './image-file-identity';
import type { RemoteFileRecord } from './image-sync';

type Request = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type DeleteState = 'pending' | 'complete';

export interface ImageDeletionReceipt {
  id: string;
  workspaceId: string;
  fileId: string;
  sourceId: string;
  version: string;
  path: string;
  state: DeleteState;
  createdBy: string;
  createdAt: string;
  completedAt: string | null;
}

export interface ImageDeleteReview {
  file: RemoteFileRecord;
  workRevision: number;
  retainedReferences: number;
  conflictReferences: number;
  pendingTransfers: number;
  unknownHistory: number;
  retainedVersions: number;
  allowed: boolean;
  deletion: ImageDeletionReceipt | null;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = /^[0-9a-f]{64}$/;
const maxBytes = 16 * 1024 * 1024;
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const fields = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('远端图片身份或回执格式无效。');
  return value as Record<string, unknown>;
};
const windowFetch: Request = (input, init) => fetch(input, init);

/** 远端原图的显式物理删除控制器，删除前后都以远端不可变身份和设备日志恢复。 */
export class ImageDeleteController {
  constructor(
    private readonly store: Pick<LocalMediaStore, 'ensurePreference'>,
    private readonly access: ProductAuthorization,
    private readonly workspaceId: string,
    private readonly request: Request = windowFetch,
    private readonly signal?: AbortSignal
  ) {
    if (!uuid.test(workspaceId)) throw new Error('图片同步工作区标识无效。');
    if (!uuid.test(access.userId)) throw new Error('图片同步账号标识无效。');
  }

  async preview(sourceId: string, digest: string): Promise<ImageDeleteReview> {
    this.assertSource(sourceId, digest);
    await this.capabilities();
    this.assertActive();
    const file = await this.findFile(sourceId, digest);
    const raw = await this.rpc('media_preview_image_delete', { p_file_id: file.id });
    this.assertActive();
    const review = this.review(raw);
    this.assertFile(review.file, file);
    return review;
  }

  async previewReupload(sourceId: string, digest: string): Promise<ImageDeleteReview> {
    this.assertSource(sourceId, digest);
    await this.capabilities();
    const raw = await this.rpc('media_preview_image_reupload', {
      p_workspace_id: this.workspaceId,
      p_source_id: sourceId,
      p_sha256: digest
    });
    this.assertActive();
    const review = this.review(raw);
    this.file(review.file, sourceId, digest);
    return review;
  }

  async confirm(review: ImageDeleteReview, staged?: () => Promise<void>): Promise<ImageDeletionReceipt> {
    await this.capabilities();
    this.assertActive();
    const checked = this.review(review);
    if (
      !checked.deletion &&
      (!checked.allowed || checked.file.deleted || checked.file.status !== 'uploaded' || this.blocked(checked))
    )
      throw new Error('此原图仍有保留引用、冲突引用、待核对传输或未知历史，不能物理删除。');

    const key = await this.journalKey(checked.file.id);
    this.assertActive();
    const candidate = JSON.stringify({
      version: 1,
      scope: this.scope(),
      fileId: checked.file.id,
      requestId: checked.deletion?.id ?? crypto.randomUUID()
    });
    const saved = await this.store.ensurePreference(key, candidate);
    this.assertActive();
    const journal = this.parseJournal(saved.payload, checked.file.id);
    const began = await this.rpc('media_begin_image_delete', {
      p_file_id: checked.file.id,
      p_file_revision: checked.file.revision,
      p_work_revision: checked.workRevision,
      p_request_id: journal.requestId
    });
    this.assertActive();
    const receipt = this.receipt(began);
    this.assertReceipt(receipt, checked.file);
    if (checked.deletion && checked.deletion.id !== receipt.id) throw new Error('远端删除回执已变化，请重新预览。');
    if (staged) {
      await staged();
      this.assertActive();
    }
    if (receipt.state === 'complete') return receipt;
    const beforeStorage = await this.complete(receipt, checked.file);
    if (beforeStorage.state === 'complete' || this.blocked(checked)) return beforeStorage;

    const response = await this.storageDelete(receipt.path);
    this.assertActive();
    if (!response.ok) throw new Error('远端原图对象删除失败；文件删标和恢复回执已保留。');
    const completed = await this.complete(receipt, checked.file);
    this.assertActive();
    return completed;
  }

  private async findFile(sourceId: string, digest: string): Promise<RemoteFileRecord> {
    const active = await this.records(sourceId, digest, false);
    if (active.length) return active[0];
    const deleted = await this.records(sourceId, digest, true);
    if (deleted.length) return deleted[0];
    throw new Error('远端原图版本不存在，未执行删除。');
  }

  private async records(sourceId: string, digest: string, deleted: boolean): Promise<RemoteFileRecord[]> {
    const query =
      `/media_file_records?select=*&workspaceId=eq.${encodeURIComponent(this.workspaceId)}` +
      `&sourceId=eq.${encodeURIComponent(sourceId)}&sha256=eq.${encodeURIComponent(digest)}` +
      `&deleted=eq.${deleted ? 'true' : 'false'}&order=createdAt.desc,id.desc&limit=1`;
    const raw = await this.rest(query);
    if (!Array.isArray(raw)) throw new Error('远端图片记录无效。');
    return raw.map(row => this.file(row, sourceId, digest));
  }

  private async capabilities(): Promise<void> {
    const raw = await this.rpc('media_file_capabilities', {});
    if (!raw || typeof raw !== 'object') throw new Error('平台图片删除协议无效。');
    const value = raw as Record<string, unknown>;
    if (
      value['protocol'] !== 1 ||
      value['privateBucket'] !== 'aiao-media-images' ||
      value['maxBytes'] !== maxBytes ||
      value['resumable'] !== true ||
      value['metadataOnly'] !== false ||
      value['lifecycle'] !== 1 ||
      value['deletion'] !== 1 ||
      value['references'] !== 1
    )
      throw new Error('平台图片删除协议或私有存储不兼容，未执行删除。');
  }

  private rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
    return this.rest(`/rpc/${name}`, { method: 'POST', body: JSON.stringify(body) });
  }

  private async rest(path: string, options: RequestInit = {}): Promise<unknown> {
    const response = await this.send(`${this.access.config.url}/rest/v1${path}`, options, 30000);
    if (!response.ok) throw new Error('平台图片删除请求失败，删除回执和本机原图保留。');
    const result: unknown = response.status === 204 ? null : await response.json();
    this.assertActive();
    return result;
  }

  private async complete(expected: ImageDeletionReceipt, file: RemoteFileRecord): Promise<ImageDeletionReceipt> {
    const raw = await this.rpc('media_complete_image_delete', { p_request_id: expected.id });
    const receipt = this.receipt(raw);
    this.assertReceipt(receipt, file);
    if (receipt.id !== expected.id) throw new Error('远端删除回执身份不一致。');
    return receipt;
  }

  private async send(url: string, options: RequestInit, milliseconds: number): Promise<Response> {
    this.assertActive();
    const signal = this.deadline(milliseconds);
    const response = await this.request(url, {
      ...options,
      headers: {
        apikey: this.access.config.anonKey,
        authorization: `Bearer ${this.access.session.access_token}`,
        'content-type': 'application/json'
      },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal
    });
    signal.throwIfAborted();
    return response;
  }

  private storageDelete(path: string): Promise<Response> {
    return this.send(
      `${this.storageUrl()}/storage/v1/object/aiao-media-images`,
      {
        method: 'DELETE',
        body: JSON.stringify({ prefixes: [path] })
      },
      60000
    );
  }

  private storageUrl(): string {
    const configured = this.access.config.storageUrl;
    if (configured) return configured.replace(/\/$/, '');
    const url = new URL(this.access.config.url);
    const hosted = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
    return (hosted ? `https://${hosted[1]}.storage.supabase.co` : url.origin).replace(/\/$/, '');
  }

  private file(value: unknown, sourceId: string, digest: string): RemoteFileRecord {
    this.assertSource(sourceId, digest);
    const row = fields(value);
    if (
      typeof row['id'] !== 'string' ||
      !uuid.test(row['id']) ||
      row['workspaceId'] !== this.workspaceId ||
      row['sourceId'] !== sourceId ||
      !isImageFileVersion(row['version'], digest) ||
      row['sha256'] !== digest ||
      !this.mime(row['mimeType']) ||
      typeof row['path'] !== 'string' ||
      !this.path(row['path'], sourceId, String(row['version']), row['mimeType']) ||
      !integer(row['width'], 1, 4096) ||
      !integer(row['height'], 1, 4096) ||
      !integer(row['bytes'], 1, maxBytes) ||
      !['pending', 'uploaded', 'deleted', 'needs_review'].includes(String(row['status'])) ||
      typeof row['deleted'] !== 'boolean' ||
      !integer(row['revision'], 1) ||
      !integer(row['baseRevision']) ||
      Number(row['baseRevision']) >= Number(row['revision'])
    )
      throw new Error('远端图片记录身份或完整性字段无效。');
    return row as unknown as RemoteFileRecord;
  }

  private review(value: unknown): ImageDeleteReview {
    const row = fields(value);
    const file = fields(row['file']);
    const parsedFile = this.file(file, String(file['sourceId']), String(file['sha256']));
    const counters = [
      'workRevision',
      'retainedReferences',
      'conflictReferences',
      'pendingTransfers',
      'unknownHistory',
      'retainedVersions'
    ];
    if (counters.some(key => !integer(row[key])) || typeof row['allowed'] !== 'boolean')
      throw new Error('远端图片删除预览计数无效。');
    const deletion = row['deletion'] === null || row['deletion'] === undefined ? null : this.receipt(row['deletion']);
    if (deletion) this.assertReceipt(deletion, parsedFile);
    return {
      file: parsedFile,
      workRevision: Number(row['workRevision']),
      retainedReferences: Number(row['retainedReferences']),
      conflictReferences: Number(row['conflictReferences']),
      pendingTransfers: Number(row['pendingTransfers']),
      unknownHistory: Number(row['unknownHistory']),
      retainedVersions: Number(row['retainedVersions']),
      allowed: row['allowed'],
      deletion
    };
  }

  private receipt(value: unknown): ImageDeletionReceipt {
    const row = fields(value);
    if (
      typeof row['id'] !== 'string' ||
      !uuid.test(row['id']) ||
      row['workspaceId'] !== this.workspaceId ||
      typeof row['fileId'] !== 'string' ||
      !uuid.test(row['fileId']) ||
      typeof row['sourceId'] !== 'string' ||
      !uuid.test(row['sourceId']) ||
      !isImageFileVersion(row['version'], String(row['version']).slice(0, 64)) ||
      typeof row['path'] !== 'string' ||
      !['pending', 'complete'].includes(String(row['state'])) ||
      row['createdBy'] !== this.access.userId ||
      typeof row['createdAt'] !== 'string' ||
      !(row['completedAt'] === null || typeof row['completedAt'] === 'string')
    )
      throw new Error('远端删除回执字段无效。');
    return row as unknown as ImageDeletionReceipt;
  }

  private assertReceipt(receipt: ImageDeletionReceipt, file: RemoteFileRecord): void {
    if (
      receipt.fileId !== file.id ||
      receipt.sourceId !== file.sourceId ||
      receipt.version !== file.version ||
      receipt.path !== file.path
    )
      throw new Error('远端删除回执身份不一致，原图保留。');
  }

  private assertFile(actual: RemoteFileRecord, expected: RemoteFileRecord): void {
    if (
      actual.id !== expected.id ||
      actual.workspaceId !== expected.workspaceId ||
      actual.sourceId !== expected.sourceId ||
      actual.version !== expected.version ||
      actual.sha256 !== expected.sha256 ||
      actual.path !== expected.path ||
      actual.mimeType !== expected.mimeType ||
      actual.width !== expected.width ||
      actual.height !== expected.height ||
      actual.bytes !== expected.bytes ||
      actual.revision !== expected.revision ||
      actual.deleted !== expected.deleted ||
      actual.status !== expected.status ||
      actual.baseRevision !== expected.baseRevision
    )
      throw new Error('远端图片文件身份在预览期间发生变化，原图保留。');
  }

  private blocked(review: ImageDeleteReview): boolean {
    return [review.retainedReferences, review.conflictReferences, review.pendingTransfers, review.unknownHistory].some(
      value => value > 0
    );
  }

  private parseJournal(
    payload: string,
    fileId: string
  ): { version: 1; scope: string; fileId: string; requestId: string } {
    let value: unknown;
    try {
      value = JSON.parse(payload);
    } catch {
      throw new Error('图片删除设备日志损坏，原图保留。');
    }
    if (!value || typeof value !== 'object') throw new Error('图片删除设备日志无效，原图保留。');
    const row = value as Record<string, unknown>;
    if (
      row['version'] !== 1 ||
      row['scope'] !== this.scope() ||
      row['fileId'] !== fileId ||
      typeof row['requestId'] !== 'string' ||
      !uuid.test(row['requestId'])
    )
      throw new Error('未知图片删除设备日志版本，原图保留。');
    return row as { version: 1; scope: string; fileId: string; requestId: string };
  }

  private async journalKey(fileId: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.scope()));
    const prefix = [...new Uint8Array(hash)]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 32);
    return `id-${prefix}-${fileId.replaceAll('-', '')}`;
  }

  private scope(): string {
    return `${this.access.config.url}:${this.access.userId}:${this.workspaceId}`;
  }
  private assertSource(sourceId: string, digest: string): void {
    if (!uuid.test(sourceId) || !sha256.test(digest)) throw new Error('图片作品或版本摘要无效。');
  }
  private mime(value: unknown): value is ImageMimeType {
    return value === 'image/png' || value === 'image/jpeg';
  }
  private path(value: string, sourceId: string, digest: string, mime: unknown): boolean {
    return (
      value ===
      `${this.access.userId}/${this.workspaceId}/${sourceId}/${digest}.${imageExtension(mime as ImageMimeType)}`
    );
  }
  private assertActive(): void {
    this.signal?.throwIfAborted();
  }
  private deadline(milliseconds: number): AbortSignal {
    const timeout = AbortSignal.timeout(milliseconds);
    return this.signal ? AbortSignal.any([this.signal, timeout]) : timeout;
  }
}
