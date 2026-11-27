import { computed, signal } from '@angular/core';

import { localWriteFailureMessage } from '../../data/local-write-error';
import type { MailMessage } from './mail.entities';

export interface MailDraftContent {
  readonly to: string;
  readonly subject: string;
  readonly body: string;
}
export interface MailDraftSnapshot extends MailDraftContent {
  readonly id: MailMessage['id'];
}
export interface MailDraftWrite {
  readonly base: MailDraftSnapshot | null;
  readonly value: MailDraftSnapshot;
}

/** 草稿写入失败：`translate` 可选，未注入时保持英文（与 print-document 风格一致）。 */
export class MailDraftError extends Error {
  constructor(kind: 'conflict' | 'missing', translate?: (key: string) => string) {
    super(
      kind === 'conflict' ?
        (translate?.('error.mail.draftChanged') ??
          'This draft changed in another window. Save a copy or discard your changes before reopening it.')
      : (translate?.('error.mail.draftUnavailable') ??
          'This draft is no longer available. Save a copy to keep your changes.')
    );
  }
}

export const sameMailDraft = (a: MailDraftContent, b: MailDraftContent): boolean =>
  a.to === b.to && a.subject === b.subject && a.body === b.body;

/** 面板消失不销毁草稿；稳定 ID 保证重试不会重复创建，只有成功写入才更新基线。 */
export class MailDraftEditor {
  private readonly state = signal<MailDraftSnapshot | null>(null);
  private readonly base = signal<MailDraftSnapshot | null>(null);
  private readonly writing = signal(false);
  private readonly failure = signal('');
  private pending: Promise<boolean> | null = null;
  private disposed = false;

  readonly value = this.state.asReadonly();
  readonly saving = this.writing.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly dirty = computed(() => {
    const value = this.value();
    if (!value) return false;
    const base = this.base();
    return base ? !sameMailDraft(value, base) : Boolean(value.to || value.subject || value.body);
  });

  constructor(
    private readonly write: (draft: MailDraftWrite) => Promise<void>,
    private readonly createId: () => MailMessage['id'] = () => crypto.randomUUID()
  ) {}

  start(content: Partial<MailDraftContent> = {}): boolean {
    if (this.disposed || this.dirty() || this.saving()) return false;
    this.state.set({ id: this.createId(), to: '', subject: '', body: '', ...content });
    this.base.set(null);
    this.failure.set('');
    return true;
  }

  open(value: MailDraftSnapshot): boolean {
    if (this.disposed || this.dirty() || this.saving()) return false;
    this.state.set({ ...value });
    this.base.set({ ...value });
    this.failure.set('');
    return true;
  }

  edit(patch: Partial<MailDraftContent>): void {
    if (this.disposed || this.saving()) return;
    this.state.update(value => (value ? { ...value, ...patch } : null));
    this.failure.set('');
  }

  discard(): boolean {
    if (this.disposed || this.saving()) return false;
    this.state.set(null);
    this.base.set(null);
    this.failure.set('');
    return true;
  }

  makeCopy(): boolean {
    const value = this.value();
    if (!value || this.disposed || this.saving()) return false;
    this.state.set({ ...value, id: this.createId() });
    this.base.set(null);
    this.failure.set('');
    return true;
  }

  save(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.pending) return this.pending;
    const value = this.value();
    if (!value || !this.dirty()) return Promise.resolve(true);
    const base = this.base();
    this.writing.set(true);
    this.failure.set('');
    this.pending = Promise.resolve()
      .then(() => this.write({ base, value }))
      .then(
        () => {
          if (!this.disposed) this.base.set(value);
          return !this.disposed;
        },
        error => {
          if (!this.disposed)
            this.failure.set(error instanceof MailDraftError ? error.message : localWriteFailureMessage(error));
          return false;
        }
      )
      .finally(() => {
        this.pending = null;
        this.writing.set(false);
      });
    return this.pending;
  }

  async settle(): Promise<boolean> {
    return this.pending ?? !this.disposed;
  }

  dispose(): void {
    this.disposed = true;
    this.state.set(null);
    this.base.set(null);
  }
}
