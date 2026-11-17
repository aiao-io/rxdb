import { computed, signal } from '@angular/core';

import { localWriteFailureMessage } from '../../data/local-write-error';
import type { ChatMessage } from './messages.entities';

export interface LocalMessage {
  readonly id: ChatMessage['id'];
  readonly threadId: string;
  readonly text: string;
}

export interface MessageDraft extends LocalMessage {
  readonly saving: boolean;
  readonly error: string;
}

export class MessageSaveError extends Error {
  constructor(kind: 'missing' | 'conflict') {
    super(kind === 'missing'
      ? 'This conversation is no longer available. Your draft is still here.'
      : 'A saved message has different content. Your draft is still here.');
  }
}

/** 每个会话保留独立输入；仅明确保存才追加本地消息，成功后才清空对应草稿。 */
export class MessageDrafts {
  private readonly state = signal<ReadonlyMap<string, MessageDraft>>(new Map());
  private readonly writes = new Map<string, Promise<boolean>>();
  private disposed = false;

  readonly rows = computed(() => [...this.state().values()]);
  readonly dirty = computed(() => this.rows().some(row => row.text.trim().length > 0));
  readonly pending = computed(() => this.rows().some(row => row.saving));

  constructor(
    private readonly write: (message: LocalMessage) => Promise<void>,
    private readonly createId: () => ChatMessage['id'] = () => crypto.randomUUID()
  ) {}

  get(threadId: string): MessageDraft | undefined {
    return this.state().get(threadId);
  }

  edit(threadId: string, text: string): void {
    if (this.disposed || this.writes.has(threadId)) return;
    const existing = this.get(threadId);
    this.put({ id: existing?.id ?? this.createId(), threadId, text, saving: false, error: '' });
  }

  discard(threadId: string): boolean {
    if (this.writes.has(threadId)) return false;
    this.remove(threadId);
    return true;
  }

  save(threadId: string): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    const pending = this.writes.get(threadId);
    if (pending) return pending;
    const draft = this.get(threadId);
    const text = draft?.text.trim();
    if (!draft || !text) return Promise.resolve(this.discard(threadId));
    this.put({ ...draft, saving: true, error: '' });
    const saving = Promise.resolve()
      .then(() => this.write({ id: draft.id, threadId, text }))
      .then(() => {
        if (!this.disposed) this.remove(threadId);
        return !this.disposed;
      }, error => {
        if (!this.disposed) this.put({ ...draft, saving: false,
          error: error instanceof MessageSaveError ? error.message : localWriteFailureMessage(error) });
        return false;
      })
      .finally(() => this.writes.delete(threadId));
    this.writes.set(threadId, saving);
    return saving;
  }

  async settle(): Promise<boolean> {
    const results = await Promise.all(this.writes.values());
    return !this.disposed && results.every(Boolean);
  }

  dispose(): void {
    this.disposed = true;
    this.state.set(new Map());
  }

  private put(draft: MessageDraft): void {
    this.state.update(rows => new Map(rows).set(draft.threadId, draft));
  }

  private remove(threadId: string): void {
    this.state.update(rows => {
      const next = new Map(rows);
      next.delete(threadId);
      return next;
    });
  }
}
