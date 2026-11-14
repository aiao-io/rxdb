export interface PrefetchItem {
  id: string;
  key: string;
}
export interface PrefetchStatus extends PrefetchItem {
  state: 'waiting' | 'preparing' | 'ready' | 'cancelled' | 'error';
  error: string | null;
}

export class Prefetch {
  private desired: PrefetchItem[] = [];
  private readonly jobs = new Map<string, AbortController>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  readonly statuses = new Map<string, PrefetchStatus>();
  enabled = false;
  constructor(
    private readonly run: (item: PrefetchItem, signal: AbortSignal) => Promise<void>,
    private readonly changed: () => void,
    private readonly lifetime: AbortSignal
  ) {
    lifetime.addEventListener('abort', () => this.stop(), { once: true });
  }

  start(items: PrefetchItem[]): void {
    if (this.lifetime.aborted) throw new Error('CANCELLED: 桌面已关闭');
    this.enabled = true;
    this.desired = items.map(item => ({ ...item }));
    for (const item of items) {
      const status = this.statuses.get(item.id);
      if (status?.key !== item.key || status.state !== 'ready')
        this.statuses.set(item.id, { ...item, state: 'waiting', error: null });
    }
    this.activity();
    this.changed();
  }

  activity(): void {
    if (!this.enabled || this.lifetime.aborted) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.desired.some(item => this.statuses.get(item.id)?.state !== 'ready')) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      for (const item of this.desired) this.launch(item);
    }, 500);
  }

  cancel(id: string): void {
    this.desired = this.desired.filter(item => item.id !== id);
    this.jobs.get(id)?.abort();
    const status = this.statuses.get(id);
    if (status && status.state !== 'ready') status.state = 'cancelled';
    this.changed();
  }

  stop(): void {
    this.enabled = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const controller of this.jobs.values()) controller.abort();
    for (const status of this.statuses.values())
      if (status.state === 'waiting' || status.state === 'preparing') status.state = 'cancelled';
    this.changed();
  }

  private launch(item: PrefetchItem): void {
    const status = this.statuses.get(item.id);
    if (!this.enabled || this.jobs.has(item.id) || (status?.key === item.key && status.state === 'ready')) return;
    const controller = new AbortController();
    this.jobs.set(item.id, controller);
    this.statuses.set(item.id, { ...item, state: 'preparing', error: null });
    this.changed();
    void Promise.resolve()
      .then(() => this.run(item, controller.signal))
      .then(
        () => this.finish(item, controller),
        error => this.finish(item, controller, error)
      );
  }

  private finish(item: PrefetchItem, controller: AbortController, error?: unknown): void {
    if (this.jobs.get(item.id) !== controller) return;
    this.jobs.delete(item.id);
    this.statuses.set(item.id, {
      ...item,
      state:
        controller.signal.aborted ? 'cancelled'
        : error === undefined ? 'ready'
        : 'error',
      error: error instanceof Error && !controller.signal.aborted ? error.message : null
    });
    if (
      this.enabled &&
      this.desired.some(desired => desired.id === item.id && (desired.key !== item.key || controller.signal.aborted))
    )
      this.activity();
    this.changed();
  }
}
