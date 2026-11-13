import type { LocalMediaStore, LocalPreferenceChange } from './browser-media';
import { ImageTransferError } from './image-transfer-error';

interface QueueScope {
  origin: string;
  userId: string;
  workspaceId: string;
  profileId: string;
}
interface FileIdentity {
  sha256: string;
  bytes: number;
}
type QueueStatus = 'pending' | 'uploading' | 'retry' | 'paused' | 'failed' | 'succeeded';
interface QueueEntry extends FileIdentity {
  version: 1;
  scope: string;
  sourceId: string;
  selection: 'future' | 'existing';
  status: QueueStatus;
  attempts: number;
  nextAttemptAt: number | null;
  confirmedBytes: number;
  succeededAt: number | null;
  error: string;
}
interface QueueRow {
  key: string;
  payload: string;
  revision: number;
}
/** 只有持久回执确认的字节计入完成量；分片进度由独立续传日志维护。 */
export interface ImageQueueSummary {
  selected: number;
  bytes: number;
  pending: number;
  failed: number;
  succeeded: number;
  confirmedBytes: number;
  lastSuccessAt: number | null;
  nextAttemptAt: number | null;
  paused: boolean;
}
type QueueStore = Pick<
  LocalMediaStore,
  'preference' | 'ensurePreference' | 'savePreference' | 'savePreferences' | 'preferences' | 'imageInfo'
>;
type Upload = (sourceId: string, identity: FileIdentity) => Promise<FileIdentity & { status: string }>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses: QueueStatus[] = ['pending', 'uploading', 'retry', 'paused', 'failed', 'succeeded'];
const checksum = async (value: unknown) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
const countKey = (status: QueueStatus): 'succeeded' | 'failed' | 'pending' => {
  if (status === 'succeeded') return 'succeeded';
  return status === 'failed' || status === 'paused' ? 'failed' : 'pending';
};
const emptySummary = (): ImageQueueSummary => ({
  selected: 0,
  bytes: 0,
  pending: 0,
  failed: 0,
  succeeded: 0,
  confirmedBytes: 0,
  lastSuccessAt: null,
  nextAttemptAt: null,
  paused: false
});

/** 每张原图独立落盘，按设备和授权范围串行调度；不枚举范围外的历史作品。 */
export class ImageUploadQueue {
  private readonly prefix: string;
  private constructor(
    private readonly store: QueueStore,
    private readonly scope: string,
    private readonly signal: AbortSignal,
    private readonly now: () => number
  ) {
    this.prefix = `iq-${scope.slice(0, 32)}-`;
  }
  static async open(
    store: QueueStore,
    scope: QueueScope,
    signal: AbortSignal,
    now = Date.now
  ): Promise<ImageUploadQueue> {
    const hash = await checksum([scope.origin, scope.userId, scope.workspaceId, scope.profileId]);
    signal.throwIfAborted();
    return new ImageUploadQueue(store, hash, signal, now);
  }
  async enqueue(sourceId: string, selection: QueueEntry['selection']): Promise<void> {
    this.signal.throwIfAborted();
    if (!uuid.test(sourceId)) throw new Error('图片队列作品标识无效。');
    const info = await this.store.imageInfo(sourceId);
    this.signal.throwIfAborted();
    const entry = this.newEntry(sourceId, selection, info);
    const key = await this.entryKey(entry);
    const saved = await this.store.ensurePreference(key, JSON.stringify(entry));
    await this.read({ key, ...saved });
  }
  /** 已确认的历史范围整体落盘，使用预览身份，不在确认后重新枚举或替换原图。 */
  async enqueueSelection(files: readonly (FileIdentity & { sourceId: string })[]): Promise<void> {
    const entries = files.map(file => this.newEntry(file.sourceId, 'existing', file));
    await this.exclusive(async () => {
      const changes: LocalPreferenceChange[] = [];
      const seen = new Set<string>();
      for (const entry of entries) {
        this.signal.throwIfAborted();
        const key = await this.entryKey(entry);
        if (seen.has(key)) continue;
        seen.add(key);
        const saved = await this.store.preference(key);
        if (saved) await this.read({ key, ...saved });
        else changes.push({ key, payload: JSON.stringify(entry), revision: null });
      }
      this.signal.throwIfAborted();
      if (changes.length) await this.store.savePreferences(changes);
    });
  }
  async snapshot(): Promise<ImageQueueSummary> {
    const summary = emptySummary();
    for await (const row of this.rows()) this.add(summary, await this.read(row));
    return summary;
  }
  async retry(): Promise<void> {
    await this.exclusive(async () => {
      for await (const row of this.rows()) {
        const entry = await this.read(row);
        if (!['failed', 'paused', 'retry'].includes(entry.status)) continue;
        await this.write(row, { ...entry, status: 'pending', attempts: 0, nextAttemptAt: 0, error: '' });
      }
    });
  }
  async run(
    upload: Upload,
    progress: (summary: ImageQueueSummary) => void = () => undefined
  ): Promise<ImageQueueSummary> {
    return this.exclusive(async () => {
      const summary = await this.snapshot();
      progress({ ...summary });
      if (summary.paused) return summary;
      for await (const row of this.rows()) {
        const entry = await this.read(row);
        if (!this.ready(entry)) continue;
        const next = await this.transfer(row, entry, upload);
        summary[countKey(entry.status)]--;
        summary[countKey(next.status)]++;
        summary.confirmedBytes += next.confirmedBytes - entry.confirmedBytes;
        summary.lastSuccessAt = Math.max(summary.lastSuccessAt ?? 0, next.succeededAt ?? 0) || null;
        summary.paused = next.status === 'paused';
        progress({ ...summary });
        if (summary.paused) break;
      }
      const completed = await this.snapshot();
      progress({ ...completed });
      return completed;
    });
  }
  private newEntry(sourceId: string, selection: QueueEntry['selection'], info: FileIdentity): QueueEntry {
    if (!uuid.test(sourceId)) throw new Error('图片队列作品标识无效。');
    if (
      !/^[0-9a-f]{64}$/.test(info.sha256) ||
      !Number.isSafeInteger(info.bytes) ||
      info.bytes < 1 ||
      info.bytes > 16 * 1024 * 1024
    )
      throw new Error('图片队列源身份无效。');
    return {
      version: 1,
      scope: this.scope,
      sourceId,
      selection,
      sha256: info.sha256,
      bytes: info.bytes,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      confirmedBytes: 0,
      succeededAt: null,
      error: ''
    };
  }
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    return navigator.locks.request(`aiao-media-image-queue-${this.scope}`, { signal: this.signal }, async () => {
      this.signal.throwIfAborted();
      return operation();
    });
  }
  private async *rows(): AsyncGenerator<QueueRow> {
    let after = '';
    while (true) {
      this.signal.throwIfAborted();
      const page = await this.store.preferences(this.prefix, after, 100);
      for (const row of page) yield row;
      if (page.length < 100) return;
      after = page[page.length - 1].key;
    }
  }
  private entryKey(entry: Pick<QueueEntry, 'sourceId' | 'sha256'>): Promise<string> {
    return checksum([entry.sourceId, entry.sha256]).then(hash => `${this.prefix}${hash.slice(0, 32)}`);
  }
  private async read(row: QueueRow): Promise<QueueEntry> {
    const parsed: unknown = JSON.parse(row.payload);
    if (!parsed || typeof parsed !== 'object') throw new Error('图片队列记录无效，原记录保留。');
    const entry = parsed as QueueEntry;
    if (
      entry.version !== 1 ||
      entry.scope !== this.scope ||
      !uuid.test(entry.sourceId) ||
      !/^[0-9a-f]{64}$/.test(entry.sha256) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes < 1 ||
      entry.bytes > 16 * 1024 * 1024 ||
      !['existing', 'future'].includes(entry.selection) ||
      !statuses.includes(entry.status) ||
      !Number.isSafeInteger(entry.attempts) ||
      entry.attempts < 0 ||
      entry.attempts > 3 ||
      (entry.nextAttemptAt !== null && (!Number.isSafeInteger(entry.nextAttemptAt) || entry.nextAttemptAt < 0)) ||
      entry.confirmedBytes !== (entry.status === 'succeeded' ? entry.bytes : 0) ||
      (entry.succeededAt !== null && (!Number.isSafeInteger(entry.succeededAt) || entry.succeededAt < 0)) ||
      typeof entry.error !== 'string' ||
      row.key !== (await this.entryKey(entry))
    )
      throw new Error('图片队列身份、版本或状态无效，原记录保留。');
    return entry;
  }
  private ready(entry: QueueEntry): boolean {
    return ['pending', 'uploading', 'retry'].includes(entry.status) && (entry.nextAttemptAt ?? 0) <= this.now();
  }
  private async write(row: QueueRow, entry: QueueEntry): Promise<void> {
    this.signal.throwIfAborted();
    row.revision = await this.store.savePreference(row.key, JSON.stringify(entry), row.revision);
    row.payload = JSON.stringify(entry);
  }
  private async transfer(row: QueueRow, entry: QueueEntry, upload: Upload): Promise<QueueEntry> {
    const active: QueueEntry = {
      ...entry,
      status: 'uploading',
      attempts: entry.attempts + (entry.status === 'uploading' ? 0 : 1),
      nextAttemptAt: null
    };
    await this.write(row, active);
    let next: QueueEntry;
    try {
      const info = await this.store.imageInfo(entry.sourceId);
      this.signal.throwIfAborted();
      if (info.sha256 !== entry.sha256 || info.bytes !== entry.bytes) throw new Error('源原图已变化。');
      const receipt = await upload(entry.sourceId, { sha256: entry.sha256, bytes: entry.bytes });
      this.signal.throwIfAborted();
      if (receipt.status !== 'uploaded' || receipt.sha256 !== entry.sha256 || receipt.bytes !== entry.bytes)
        throw new Error('上传回执与所选原图不一致。');
      next = { ...active, status: 'succeeded', confirmedBytes: entry.bytes, succeededAt: this.now(), error: '' };
    } catch (error) {
      this.signal.throwIfAborted();
      next = this.failure(active, error);
    }
    await this.write(row, next);
    return next;
  }
  private failure(entry: QueueEntry, error: unknown): QueueEntry {
    if (error instanceof ImageTransferError && [401, 403, 413, 507].includes(error.status))
      return { ...entry, status: 'paused', error: '授权或容量受限，队列已暂停，请处理后明确重试。' };
    const transient =
      error instanceof TypeError ||
      (error instanceof DOMException && error.name === 'TimeoutError') ||
      (error instanceof ImageTransferError && (error.status === 429 || error.status === 408 || error.status >= 500));
    if (transient && entry.attempts < 3)
      return {
        ...entry,
        status: 'retry',
        nextAttemptAt: this.now() + 1000 * 2 ** (entry.attempts - 1),
        error: '网络或存储暂时不可用，等待重试。'
      };
    return { ...entry, status: 'failed', error: '原图传输未确认完成，请检查后重试。' };
  }
  private add(summary: ImageQueueSummary, entry: QueueEntry): void {
    summary.selected++;
    summary.bytes += entry.bytes;
    summary[countKey(entry.status)]++;
    summary.confirmedBytes += entry.confirmedBytes;
    summary.paused ||= entry.status === 'paused';
    summary.lastSuccessAt = Math.max(summary.lastSuccessAt ?? 0, entry.succeededAt ?? 0) || null;
    if (!this.ready(entry) && entry.status !== 'retry') return;
    summary.nextAttemptAt = Math.min(summary.nextAttemptAt ?? Infinity, entry.nextAttemptAt ?? 0);
  }
}
