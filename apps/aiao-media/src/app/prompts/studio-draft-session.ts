import type { Observable, Subscription } from 'rxjs';
import type { StudioDraftSnapshot, StudioPromptState } from '../../local-data/index';
export type StudioDraftStatus = 'loading' | 'ready' | 'saved' | 'dirty' | 'saving' | 'conflict' | 'failed' | 'closed';
export interface StudioDraftPort {
  studioDraft(): Promise<StudioDraftSnapshot | null>;
  saveStudioDraft(state: StudioPromptState, revision: number | null): Promise<StudioDraftSnapshot>;
  studioDraft$(): Observable<StudioDraftSnapshot | null>;
}
/** Account-scoped debounced writes. No transport, paid dispatch, uploads or sync. */
export class StudioDraftSession {
  private ready = false;
  private observed: StudioDraftSnapshot | null | undefined;
  private revision: number | null = null;
  private desired: StudioPromptState | null = null;
  private dirty = false;
  private closed = false;
  private saving = false;
  private pending?: Promise<void>;
  private conflict = false;
  private timer?: ReturnType<typeof setTimeout>;
  private subscription?: Subscription;
  private editVersion = 0;
  constructor(
    private readonly port: StudioDraftPort,
    private readonly accept: (state: StudioPromptState) => void,
    private readonly report: (status: StudioDraftStatus) => void,
    private readonly delay = 300
  ) {}
  async start() {
    this.report('loading');
    const version = this.editVersion;
    try {
      const row = await this.port.studioDraft();
      if (this.closed) return;
      this.revision = row?.revision ?? null;
      this.ready = true;
      if (version === this.editVersion && !this.dirty && row) this.accept(structuredClone(row.state));
      this.watch();
      if (this.conflict) return;
      if (this.dirty) this.schedule();
      else this.report(row ? 'saved' : 'ready');
    } catch {
      if (!this.closed) {
        this.conflict = true;
        this.report('failed');
      }
    }
  }
  edit(state: StudioPromptState) {
    if (this.closed) return;
    this.desired = structuredClone(state);
    this.dirty = true;
    ++this.editVersion;
    this.report(this.conflict ? 'conflict' : 'dirty');
    if (this.ready && !this.conflict) this.schedule();
  }
  async checkpoint(): Promise<void> {
    await this.flush();
    if (!this.ready || this.closed || this.dirty || this.conflict)
      throw new Error('当前输入尚未保存，请先处理草稿冲突或重试保存。');
  }
  async flush(): Promise<void> {
    if (this.pending) await this.pending;
    const writing = this.save();
    this.pending = writing;
    try {
      await writing;
    } finally {
      if (this.pending === writing) this.pending = undefined;
    }
  }
  /** Explicit replace/reload only; never silently drops this tab's dirty input. */
  async reload() {
    if (this.closed) return;
    const version = this.editVersion;
    try {
      const row = await this.port.studioDraft();
      if (this.closed) return;
      if (version !== this.editVersion) {
        this.conflict = true;
        if (this.timer) clearTimeout(this.timer);
        this.report('conflict');
        return;
      }
      this.revision = row?.revision ?? null;
      this.ready = true;
      this.dirty = false;
      this.conflict = false;
      this.desired = null;
      ++this.editVersion;
      if (this.timer) clearTimeout(this.timer);
      this.accept(
        row ?
          structuredClone(row.state)
        : {
            document: {
              type: 'doc',
              content: [{ type: 'paragraph', content: [] }]
            },
            fields: [],
            values: {}
          }
      );
      this.watch();
      if (this.conflict) return;
      this.report(row ? 'saved' : 'ready');
    } catch {
      if (!this.closed) this.report('failed');
    }
  }
  async keepCurrent() {
    if (this.closed || !this.desired) return;
    try {
      const row = await this.port.studioDraft();
      if (this.closed) return;
      this.revision = row?.revision ?? null;
      this.ready = true;
      this.conflict = false;
      this.watch();
      await this.flush();
    } catch {
      if (!this.closed) this.report('failed');
    }
  }
  close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.subscription?.unsubscribe();
    this.desired = null;
    this.report('closed');
  }
  private async save() {
    if (this.closed || !this.ready || this.saving || !this.dirty || this.conflict || !this.desired) return;
    if (this.timer) clearTimeout(this.timer);
    const version = this.editVersion,
      state = structuredClone(this.desired);
    this.saving = true;
    this.report('saving');
    try {
      const saved = await this.port.saveStudioDraft(state, this.revision);
      if (this.closed) return;
      this.revision = saved.revision;
      if (version === this.editVersion) {
        this.dirty = false;
        this.report('saved');
      } else {
        this.report('dirty');
        this.schedule();
      }
    } catch (error) {
      if (!this.closed) {
        this.conflict = (error as { code?: string })?.code === 'conflict';
        this.report(this.conflict ? 'conflict' : 'failed');
      }
    } finally {
      this.saving = false;
      const observed = this.observed;
      this.observed = undefined;
      if (observed !== undefined) this.receive(observed);
    }
  }
  private receive(row: StudioDraftSnapshot | null) {
    if (this.closed) return;
    const revision = row?.revision ?? null;
    if ((revision ?? 0) <= (this.revision ?? 0)) return;
    // An in-flight own write can emit before its Promise resolves. Never replace
    // the editor (and its IME selection/history) with a round trip of our state.
    if (this.saving) {
      this.observed = row;
      return;
    }
    if (this.dirty) {
      this.conflict = true;
      if (this.timer) clearTimeout(this.timer);
      this.report('conflict');
      return;
    }
    this.revision = revision;
    if (row) this.accept(structuredClone(row.state));
    else
      this.accept({
        document: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }]
        },
        fields: [],
        values: {}
      });
    this.report('saved');
  }
  private watch() {
    if (this.subscription && !this.subscription.closed) return;
    this.subscription = this.port.studioDraft$().subscribe({
      next: value => this.receive(value),
      error: () => {
        if (!this.closed) {
          this.conflict = true;
          this.report('failed');
        }
      }
    });
  }
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.delay);
  }
}
