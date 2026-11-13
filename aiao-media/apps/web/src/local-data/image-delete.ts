import { imageExtension, type ImageMimeType } from '@aiao-media/api-contracts';
import type { ProductAuthorization } from '../app/supabase-auth';
import type { LocalMediaStore } from './browser-media';
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

  async confirm(review: ImageDeleteReview, staged?: () => Promise<void>): Promise<ImageDeletionReceipt> {
    await this.capabilities();
    this.assertActive();
    const checked = this.review(review);
    this.assertFile(checked.file, checked.file);
    if (!checked.allowed || this.blocked(checked))
      throw new Error('此原图仍有保留引用、冲突引用、待核对传输或未知历史，不能物理删除。');

    const key = this.journalKey(checked.file.id);
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
    this.assertReceipt(receipt, checked.file, journal.requestId);
    if (receipt.state === 'complete') return receipt;

    if (staged) {
      await staged();
      this.assertActive();
    }
    const beforeStorage = await this.complete(receipt.id);
    if (beforeStorage.state === 'complete') return beforeStorage;

    const response = await this.storageDelete(receipt.path);
    this.assertActive();
    if (!response.ok) throw new Error('远端原图对象删除失败；文件删标和恢复回执已保留。');
    const completed = await this.complete(receipt.id);
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
    const query = `/media_file_records?select=*&workspaceId=eq.${encodeURIComponent(this.workspaceId)}` +
      `&sourceId=eq.${encodeURIComponent(sourceId)}&sha256=eq.${encodeURIComponent(digest)}` +
      `&deleted=eq.${deleted ? 'true' : 'false'}&order=createdAt.desc`;
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

  private async rpc(name: string, body: Record<string, unknown>): Promise<unknown> {
    const response = await this.request(`${this.access.config.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: this.access.config.anonKey,
        authorization: `Bearer ${this.access.session.access_token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: this.deadline(30000)
    });
    if (!response.ok) throw new Error('平台图片删除操作失败，原图已保留。');
    return response.status === 204 ? null : response.json();
  }

  private async rest(path: string): Promise<unknown> {
    const response = await this.request(`${this.access.config.url}/rest/v1${path}`, {
      headers: {
        apikey: this.access.config.anonKey,
        authorization: `Bearer ${this.access.session.access_token}`,
        'content-type': 'application/json'
      },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: this.deadline(30000)
    });
    if (!response.ok) throw new Error('远端图片记录读取失败，未执行删除。');
    return response.status === 204 ? null : response.json();
  }

  private async complete(requestId: string): Promise<ImageDeletionReceipt> {
    const raw = await this.rpc('media_complete_image_delete', { p_request_id: requestId });
    this.assertActive();
    return this.receipt(raw);
  }

  private async storageDelete(path: string): Promise<Response> {
    return this.request(`${this.storageUrl()}/storage/v1/object/aiao-media-images`, {
      method: 'DELETE',
      headers: {
        apikey: this.access.config.anonKey,
        authorization: `Bearer ${this.access.session.access_token}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ prefixes: [path] }),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      signal: this.deadline(60000)
    });
  }

  private storageUrl(): string {
    const configured = this.access.config.storageUrl;
    if (configured) return configured.replace(/\/$/, '');
    const url = new URL(this.access.config.url);
    const hosted = /^([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
    return (hosted ? `https://${hosted[1]}.storage.supabase.co` : url.origin).replace(/\/$/, '');
  }

  private file(value: unknown, sourceId: string, digest: string): RemoteFileRecord {
    if (!value || typeof value !== 'object') throw new Error('远端图片记录无效。');
    const row = value as Record<string, unknown>;
    if (
      typeof row['id'] !== 'string' || !uuid.test(row['id']) ||
      row['workspaceId'] !== this.workspaceId || row['sourceId'] !== sourceId ||
      row['version'] !== digest || row['sha256'] !== digest ||
      !this.mime(row['mimeType']) || typeof row['path'] !== 'string' ||
      !this.path(row['path'], sourceId, digest, row['mimeType']) ||
      !Number.isSafeInteger(row['width']) || row['width'] < 1 || row['width'] > 4096 ||
      !Number.isSafeInteger(row['height']) || row['height'] < 1 || row['height'] > 4096 ||
      !Number.isSafeInteger(row['bytes']) || row['bytes'] < 1 || row['bytes'] > maxBytes ||
      !['pending', 'uploaded', 'deleted', 'needs_review'].includes(String(row['status'])) ||
      typeof row['deleted'] !== 'boolean' || !Number.isSafeInteger(row['revision']) || row['revision'] < 1 ||
      !Number.isSafeInteger(row['baseRevision']) || row['baseRevision'] < 0
    )
      throw new Error('远端图片记录身份或完整性字段无效。');
    return row as unknown as RemoteFileRecord;
  }

  private review(value: unknown): ImageDeleteReview {
    if (!value || typeof value !== 'object') throw new Error('远端图片删除预览无效。');
    const row = value as Record<string, unknown>;
    const file = row['file'];
    const parsedFile = file && typeof file === 'object' ? this.file(file, String((file as Record<string, unknown>)['sourceId']), String((file as Record<string, unknown>)['version'])) : null;
    if (!parsedFile) throw new Error('远端图片删除预览缺少文件身份。');
    const counters = ['workRevision', 'retainedReferences', 'conflictReferences', 'pendingTransfers', 'unknownHistory', 'retainedVersions'];
    if (
      counters.some(key => !Number.isSafeInteger(row[key]) || Number(row[key]) < 0) ||
      typeof row['allowed'] !== 'boolean'
    ) throw new Error('远端图片删除预览计数无效。');
    const deletion = row['deletion'] === null || row['deletion'] === undefined ? null : this.receipt(row['deletion']);
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
    if (!value || typeof value !== 'object') throw new Error('远端删除回执无效。');
    const row = value as Record<string, unknown>;
    if (
      typeof row['id'] !== 'string' || !uuid.test(row['id']) ||
      row['workspaceId'] !== this.workspaceId || typeof row['fileId'] !== 'string' || !uuid.test(row['fileId']) ||
      typeof row['sourceId'] !== 'string' || !uuid.test(row['sourceId']) || !sha256.test(String(row['version'])) ||
      typeof row['path'] !== 'string' || !['pending', 'complete'].includes(String(row['state'])) ||
      row['createdBy'] !== this.access.userId || typeof row['createdAt'] !== 'string' ||
      !(row['completedAt'] === null || typeof row['completedAt'] === 'string')
    ) throw new Error('远端删除回执字段无效。');
    return row as unknown as ImageDeletionReceipt;
  }

  private assertReceipt(receipt: ImageDeletionReceipt, file: RemoteFileRecord, requestId: string): void {
    if (
      receipt.id !== requestId || receipt.fileId !== file.id || receipt.sourceId !== file.sourceId ||
      receipt.version !== file.version || receipt.path !== file.path
    ) throw new Error('远端删除回执身份不一致，原图保留。');
  }

  private assertFile(actual: RemoteFileRecord, expected: RemoteFileRecord): void {
    if (
      actual.id !== expected.id || actual.workspaceId !== expected.workspaceId || actual.sourceId !== expected.sourceId ||
      actual.version !== expected.version || actual.sha256 !== expected.sha256 || actual.path !== expected.path ||
      actual.mimeType !== expected.mimeType || actual.width !== expected.width || actual.height !== expected.height ||
      actual.bytes !== expected.bytes || actual.revision !== expected.revision || actual.deleted !== expected.deleted
    ) throw new Error('远端图片文件身份在预览期间发生变化，原图保留。');
  }

  private blocked(review: ImageDeleteReview): boolean {
    return [review.retainedReferences, review.conflictReferences, review.pendingTransfers, review.unknownHistory].some(value => value > 0);
  }

  private parseJournal(payload: string, fileId: string): { version: 1; scope: string; fileId: string; requestId: string } {
    let value: unknown;
    try { value = JSON.parse(payload); } catch { throw new Error('图片删除设备日志损坏，原图保留。'); }
    if (!value || typeof value !== 'object') throw new Error('图片删除设备日志无效，原图保留。');
    const row = value as Record<string, unknown>;
    if (row['version'] !== 1 || row['scope'] !== this.scope() || row['fileId'] !== fileId || typeof row['requestId'] !== 'string' || !uuid.test(row['requestId']))
      throw new Error('未知图片删除设备日志版本，原图保留。');
    return row as { version: 1; scope: string; fileId: string; requestId: string };
  }

  private journalKey(fileId: string): string {
    return `id-${this.workspaceId.replaceAll('-', '')}-${fileId.replaceAll('-', '')}`.slice(0, 80);
  }

  private scope(): string { return `${this.access.userId}:${this.workspaceId}`; }
  private assertSource(sourceId: string, digest: string): void {
    if (!uuid.test(sourceId) || !sha256.test(digest)) throw new Error('图片作品或版本摘要无效。');
  }
  private mime(value: unknown): value is ImageMimeType { return value === 'image/png' || value === 'image/jpeg'; }
  private path(value: string, sourceId: string, digest: string, mime: unknown): boolean {
    return value === `${this.access.userId}/${this.workspaceId}/${sourceId}/${digest}.${imageExtension(mime as ImageMimeType)}`;
  }
  private assertActive(): void { this.signal?.throwIfAborted(); }
  private deadline(milliseconds: number): AbortSignal {
    const timeout = AbortSignal.timeout(milliseconds);
    return this.signal ? AbortSignal.any([this.signal, timeout]) : timeout;
  }
}
