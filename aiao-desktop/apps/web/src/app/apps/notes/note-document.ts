import { computed, signal } from '@angular/core';

import { localWriteFailureMessage } from '../../data/local-write-error';

import type { Note } from './notes.entities';

export type NoteSnapshot = Readonly<Pick<Note, 'id' | 'body' | 'title'>>;
export interface NoteWrite {
  readonly base: NoteSnapshot;
  readonly value: NoteSnapshot;
}

export class NoteSaveError extends Error {
  constructor(kind: 'conflict' | 'missing') {
    super(kind === 'conflict'
      ? 'This note changed in another window. Save a copy or discard your changes to load the saved note.'
      : 'This note is no longer available. Save a copy to keep your changes.');
  }
}

/** 用户反馈保留可操作原因，不直接展示数据库异常。 */
export function noteFailureMessage(error: unknown): string {
  if (error instanceof NoteSaveError) return error.message;
  return localWriteFailureMessage(error);
}

export const sameNoteContent = (left: NoteSnapshot, right: NoteSnapshot): boolean =>
  left.title === right.title && left.body === right.body;

/** 单个编辑缓冲；导航等待保存，写入中新增的输入按成功基线顺序提交。 */
export class NoteDocument {
  private readonly content = signal<NoteSnapshot | null>(null);
  private readonly base = signal<NoteSnapshot | null>(null);
  private readonly writing = signal(false);
  private readonly failure = signal('');
  private pending: Promise<boolean> | null = null;
  private disposed = false;

  readonly value = this.content.asReadonly();
  readonly saving = this.writing.asReadonly();
  readonly error = this.failure.asReadonly();
  readonly dirty = computed(() => {
    const value = this.content();
    const base = this.base();
    return value !== null && base !== null && !sameNoteContent(value, base);
  });

  constructor(private readonly write: (change: NoteWrite) => Promise<void>) {}

  open(note: NoteSnapshot | null): boolean {
    return !this.dirty() && this.discard(note);
  }

  discard(note: NoteSnapshot | null): boolean {
    if (this.disposed || this.saving()) return false;
    const value = note ? { id: note.id, title: note.title, body: note.body } : null;
    this.content.set(value);
    this.base.set(value);
    this.failure.set('');
    return true;
  }

  edit(content: Pick<NoteSnapshot, 'body' | 'title'>): void {
    if (this.disposed) return;
    this.content.update(value => value ? { ...value, body: content.body, title: content.title } : null);
    this.failure.set('');
  }

  save(): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    if (this.pending) return this.pending;
    this.writing.set(true);
    this.failure.set('');
    this.pending = Promise.resolve().then(() => this.flush()).finally(() => {
      this.pending = null;
      this.writing.set(false);
    });
    return this.pending;
  }

  dispose(): void {
    this.disposed = true;
    this.content.set(null);
    this.base.set(null);
  }

  private async flush(): Promise<boolean> {
    try {
      while (this.dirty() && !this.disposed) {
        const value = this.value();
        const base = this.base();
        if (!value || !base) return false;
        await this.write({ base, value });
        if (!this.disposed) this.base.set(value);
      }
      return !this.disposed;
    } catch (error) {
      if (!this.disposed) this.failure.set(noteFailureMessage(error));
      return false;
    }
  }
}
