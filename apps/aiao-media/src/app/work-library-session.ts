import { type Observable, Subscription } from 'rxjs';
import type { ImageMimeType } from '../contracts/image-format';
import type { LocalImageInfo, LocalWorkFilters, LocalWorkQuery, LocalWorkSummary } from '../local-data/index';

export type LibraryWork = LocalWorkSummary & {
  url: string | null;
  mimeType?: ImageMimeType;
  info?: LocalImageInfo;
  viewKey: string;
  previewStatus: 'idle' | 'loading' | 'ready' | 'error';
  previewError?: string;
};

export interface LibraryState {
  works: LibraryWork[];
  total: number | null;
  page: number;
  pageSize: 24;
  loading: boolean;
  error: string | null;
}

export interface WorkLibraryPort {
  works$(query?: LocalWorkQuery): Observable<LocalWorkSummary[]>;
  workCount$(filters: LocalWorkFilters): Observable<number>;
  previewImage(jobId: string): Promise<{ url: string; mimeType: ImageMimeType }>;
  release(url: string): void;
}

interface Row {
  work: LibraryWork;
  token: symbol;
}

interface PreviewRequest {
  jobId: string;
  generation: number;
  token: symbol;
}

const PAGE_SIZE = 24;

/** 分页元数据订阅与可见卡片预览的生命周期。 */
export class WorkLibrarySession {
  private closed = false;
  private generation = 0;
  private rows = new Map<string, Row>();
  private readonly visible = new Set<string>();
  private readonly pending = new Map<string, PreviewRequest>();
  private subscription?: Subscription;
  private currentQuery: LocalWorkQuery = {};
  private total: number | null = null;
  private receivedPage = false;
  private error: string | null = null;

  constructor(
    private readonly port: WorkLibraryPort,
    private readonly accept: (state: LibraryState) => void,
    private readonly report: () => void
  ) {}

  /** 从第一页或指定偏移量启动本机查询。 */
  start(query: LocalWorkQuery = {}): void {
    this.query(query);
  }

  /** 替换查询时立即释放上一页，页大小固定为 24。 */
  query(query: LocalWorkQuery): void {
    if (this.closed) return;
    const generation = ++this.generation;
    this.subscription?.unsubscribe();
    this.clear();
    const offset =
      Number.isSafeInteger(query.offset) && query.offset! > 0 ? Math.floor(query.offset! / PAGE_SIZE) * PAGE_SIZE : 0;
    const { search, model, from, to } = query;
    const filters = { search, model, from, to };
    this.currentQuery = { ...filters, offset, limit: PAGE_SIZE };
    this.total = null;
    this.receivedPage = false;
    this.error = null;
    const subscription = new Subscription();
    this.subscription = subscription;
    this.publish();
    this.subscribe(filters, generation, subscription);
  }

  /** 由视口观察器通知卡片的实际可见性。 */
  setVisible(jobId: string, visible: boolean): void {
    const row = this.rows.get(jobId);
    if (this.closed || !row) return;
    if (visible) {
      this.visible.add(jobId);
      this.ensurePreview(jobId);
      return;
    }
    this.visible.delete(jobId);
    this.release(row);
    row.work = { ...row.work, url: null, previewStatus: row.work.previewStatus === 'error' ? 'error' : 'idle' };
    this.publish();
  }

  /** 只重试当前可见卡片的失败预览。 */
  retry(jobId: string): void {
    const row = this.rows.get(jobId);
    if (this.closed || !row || !this.visible.has(jobId) || row.work.previewStatus !== 'error') return;
    row.work = { ...row.work, previewStatus: 'idle', previewError: undefined };
    this.ensurePreview(jobId);
  }

  /** 释放已持有资源；进行中的预览返回后仍会回收。 */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    ++this.generation;
    this.subscription?.unsubscribe();
    this.clear();
  }

  private subscribe(filters: LocalWorkFilters, generation: number, subscription: Subscription): void {
    try {
      const works = this.port.works$(this.currentQuery),
        count = this.port.workCount$(filters);
      subscription.add(
        count.subscribe({
          next: total => this.count(total, generation),
          error: () => this.fail(generation)
        })
      );
      if (!this.active(generation)) return;
      subscription.add(
        works.subscribe({
          next: entries => this.render(entries, generation),
          error: () => this.fail(generation)
        })
      );
    } catch {
      this.fail(generation);
    }
  }

  private count(total: number, generation: number): void {
    if (!this.active(generation)) return;
    const lastOffset = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1) * PAGE_SIZE;
    if (this.currentQuery.offset! > lastOffset) {
      this.query({ ...this.currentQuery, offset: lastOffset });
      return;
    }
    this.total = total;
    this.publish();
  }

  private render(entries: LocalWorkSummary[], generation: number): void {
    if (!this.active(generation)) return;
    const next = new Map(entries.map(item => [item.jobId, this.merge(item)]));
    for (const [jobId, row] of this.rows) {
      if (next.get(jobId)?.token !== row.token) this.release(row);
      if (!next.has(jobId)) this.visible.delete(jobId);
    }
    this.rows = next;
    this.receivedPage = true;
    this.publish();
    for (const jobId of this.visible) this.ensurePreview(jobId);
  }

  private merge(item: LocalWorkSummary): Row {
    const previous = this.rows.get(item.jobId);
    if (
      previous &&
      previous.work.status === item.status &&
      previous.work.bytes === item.bytes &&
      previous.work.createdAt === item.createdAt
    )
      return { ...previous, work: { ...previous.work, ...item } };
    return {
      token: Symbol(item.jobId),
      work: { ...item, url: null, viewKey: `${this.generation}:${item.jobId}`, previewStatus: 'idle' }
    };
  }

  private ensurePreview(jobId: string): void {
    const row = this.rows.get(jobId);
    if (this.closed || !row || !this.visible.has(jobId) || row.work.status !== 'saved') return;
    if (row.work.previewStatus === 'ready' || row.work.previewStatus === 'error') return;
    const pending = this.pending.get(jobId);
    if (pending) {
      if (pending.generation === this.generation && pending.token === row.token) this.loading(row);
      return;
    }
    const request = { jobId, generation: this.generation, token: row.token };
    this.pending.set(jobId, request);
    this.loading(row);
    void this.preview(request);
  }

  private loading(row: Row): void {
    if (row.work.previewStatus === 'loading') return;
    row.work = { ...row.work, previewStatus: 'loading', previewError: undefined };
    this.publish();
  }

  private async preview(request: PreviewRequest): Promise<void> {
    let image: { url: string; mimeType: ImageMimeType };
    try {
      image = await this.port.previewImage(request.jobId);
    } catch {
      this.settle(request);
      return;
    }
    this.settle(request, image);
  }

  private settle(request: PreviewRequest, image?: { url: string; mimeType: ImageMimeType }): void {
    const url = image?.url;
    this.pending.delete(request.jobId);
    const row = this.rows.get(request.jobId);
    if (!this.active(request.generation) || row?.token !== request.token) {
      if (url) this.port.release(url);
      this.ensurePreview(request.jobId);
      return;
    }
    if (!this.visible.has(request.jobId)) {
      if (url) this.port.release(url);
      return;
    }
    row.work = {
      ...row.work,
      url: url ?? null,
      mimeType: image?.mimeType,
      previewStatus: url ? 'ready' : 'error',
      previewError: url ? undefined : '预览加载失败，请重试。'
    };
    this.publish();
  }

  private fail(generation: number): void {
    if (!this.active(generation)) return;
    ++this.generation;
    this.subscription?.unsubscribe();
    this.clear();
    this.total = null;
    this.error = '读取本机作品库失败，请重试。';
    this.publish();
    this.report();
  }

  private active(generation: number): boolean {
    return !this.closed && generation === this.generation;
  }

  private clear(): void {
    for (const row of this.rows.values()) this.release(row);
    this.rows.clear();
    this.visible.clear();
  }

  private release(row: Row): void {
    if (row.work.url) this.port.release(row.work.url);
  }

  private publish(): void {
    if (this.closed) return;
    this.accept({
      works: [...this.rows.values()].map(row => row.work),
      total: this.total,
      page: (this.currentQuery.offset ?? 0) / PAGE_SIZE + 1,
      pageSize: PAGE_SIZE,
      loading: this.error === null && (!this.receivedPage || this.total === null),
      error: this.error
    });
  }
}
