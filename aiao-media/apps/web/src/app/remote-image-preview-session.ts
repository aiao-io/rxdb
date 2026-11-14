import type { PublicWorkPayload } from '@aiao-media/api-contracts';

/** 预览核对与本机保存独立，缺少文件回执时只显示作品信息。 */
export type RemoteImagePreview =
  | { status: 'idle' | 'loading' | 'unavailable' }
  | { status: 'ready'; url: string }
  | { status: 'failed'; message: string };

interface PreviewPort {
  preview(work: PublicWorkPayload, signal: AbortSignal): Promise<{ url: string } | null>;
  release(url: string): void;
}
interface Row {
  work: PublicWorkPayload;
  state: RemoteImagePreview;
  request?: AbortController;
}

/** 临时预览只按作品与内容摘要归属，不进入同步或备份。 */
export function remoteImageKey(work: PublicWorkPayload): string {
  return `${work.jobId}:${work.sha256}`;
}

/** 远端元数据沿用同步副本，图库每页最多呈现 24 张。 */
export function remoteImagePage(works: PublicWorkPayload[], requested: number) {
  const selected = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const page = Math.min(selected, Math.max(1, Math.ceil(works.length / 24)));
  const ordered = [...works].sort(
    (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.jobId.localeCompare(left.jobId)
  );
  return { page, total: works.length, works: ordered.slice((page - 1) * 24, page * 24) };
}

/** 私有预览仅在可见时读取；取消后的请求退出前继续占用并发名额。 */
export class RemoteImagePreviewSession {
  private readonly rows = new Map<string, Row>();
  private readonly visibleKeys = new Set<string>();
  private readonly requests = new Set<AbortController>();
  private closed = false;

  constructor(
    private readonly port: PreviewPort,
    private readonly accept: (state: ReadonlyMap<string, RemoteImagePreview>) => void
  ) {}

  page(works: PublicWorkPayload[]): void {
    if (this.closed) return;
    const keys = new Set(works.map(remoteImageKey));
    for (const [key, row] of this.rows) {
      if (keys.has(key)) continue;
      this.release(row);
      this.rows.delete(key);
      this.visibleKeys.delete(key);
    }
    for (const work of works) this.merge(work);
    this.publish();
    this.drain();
  }

  visible(work: PublicWorkPayload, visible: boolean): void {
    if (this.closed) return;
    const key = remoteImageKey(work),
      row = this.rows.get(key);
    if (!row) return;
    if (visible) this.visibleKeys.add(key);
    else {
      this.visibleKeys.delete(key);
      this.release(row);
      if (row.state.status !== 'failed') row.state = { status: 'idle' };
      this.publish();
    }
    this.drain();
  }

  retry(work: PublicWorkPayload): void {
    if (this.closed) return;
    const key = remoteImageKey(work),
      row = this.rows.get(key);
    if (!row || !this.visibleKeys.has(key) || !['failed', 'unavailable'].includes(row.state.status)) return;
    row.state = { status: 'idle' };
    this.drain();
  }

  reset(): void {
    if (this.closed) return;
    this.clear();
    this.publish();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.clear();
  }

  private merge(work: PublicWorkPayload): void {
    const key = remoteImageKey(work),
      row = this.rows.get(key);
    if (
      row &&
      row.work.bytes === work.bytes &&
      row.work.mimeType === work.mimeType &&
      row.work.width === work.width &&
      row.work.height === work.height
    ) {
      row.work = work;
      return;
    }
    if (row) this.release(row);
    this.rows.set(key, { work, state: { status: 'idle' } });
  }

  private drain(): void {
    if (this.closed) return;
    for (const key of this.visibleKeys) {
      if (this.requests.size >= 2) break;
      const row = this.rows.get(key);
      if (row && !row.request && row.state.status === 'idle') this.start(key, row);
    }
  }

  private start(key: string, row: Row): void {
    const request = new AbortController();
    row.request = request;
    row.state = { status: 'loading' };
    this.requests.add(request);
    this.publish();
    void this.read(key, row, request);
  }

  private async read(key: string, row: Row, request: AbortController): Promise<void> {
    try {
      const image = await this.port.preview(row.work, request.signal);
      if (!this.active(key, row, request)) {
        if (image) this.port.release(image.url);
        return;
      }
      row.state = image ? { status: 'ready', url: image.url } : { status: 'unavailable' };
    } catch (error) {
      if (this.active(key, row, request))
        row.state = { status: 'failed', message: error instanceof Error ? error.message : '远端预览读取失败。' };
    } finally {
      this.requests.delete(request);
      if (row.request === request) row.request = undefined;
      if (!this.closed) this.publish();
      this.drain();
    }
  }

  private active(key: string, row: Row, request: AbortController): boolean {
    return !this.closed && !request.signal.aborted && this.rows.get(key) === row && this.visibleKeys.has(key);
  }

  private release(row: Row): void {
    row.request?.abort();
    if (row.state.status === 'ready') this.port.release(row.state.url);
  }

  private clear(): void {
    for (const row of this.rows.values()) this.release(row);
    this.rows.clear();
    this.visibleKeys.clear();
  }

  private publish(): void {
    this.accept(new Map([...this.rows].map(([key, row]) => [key, row.state])));
  }
}
