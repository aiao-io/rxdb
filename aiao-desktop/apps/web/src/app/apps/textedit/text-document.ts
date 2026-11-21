import { computed, signal } from '@angular/core';

import type { DiskPath } from '../../disk/disk-path';
import type { AppContextFiles, FileStamp } from '../../services/app-files';

export interface SaveLocation {
  readonly path: DiskPath;
  readonly replace: boolean;
}

export class TextDocument {
  private revision = 0;
  private reading = 0;
  private pendingSave: Promise<boolean> | null = null;
  private disposed = false;

  readonly text = signal('');
  readonly savedText = signal('');
  readonly path = signal<DiskPath | null>(null);
  readonly stamp = signal<FileStamp | undefined>(undefined);
  readonly status = signal<'new' | 'ready' | 'loading' | 'saving' | 'failed' | 'conflict'>('new');
  readonly error = signal<string | null>(null);
  readonly dirty = computed(() => this.text() !== this.savedText());
  readonly name = computed(() => this.path()?.at(-1) ?? 'Untitled.txt');

  constructor(
    private readonly files: AppContextFiles,
    private readonly chooseSave: (name: string) => Promise<SaveLocation | null>,
    initialPath: DiskPath | null = null
  ) {
    this.path.set(initialPath);
  }

  edit(text: string): void {
    this.revision++;
    this.text.set(text);
  }

  async load(path: DiskPath): Promise<boolean> {
    if (this.pendingSave || this.disposed) return false;
    const round = ++this.reading;
    const revision = this.revision;
    this.status.set('loading');
    this.error.set(null);
    try {
      const result = await this.files.snapshot(path, Number.MAX_SAFE_INTEGER);
      if (this.disposed || round !== this.reading) return false;
      if (revision !== this.revision) return this.cancel();
      if (result.kind === 'missing') throw new Error('This file has been moved, renamed or deleted.');
      if (result.kind === 'too-large') throw new Error('This file is too large to open as text.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(result.bytes);
      this.path.set(path);
      this.stamp.set(result.stamp);
      this.text.set(text);
      this.savedText.set(this.text());
      this.status.set('ready');
      return true;
    } catch (error) {
      if (this.disposed || round !== this.reading) return false;
      return this.fail(error);
    }
  }

  save(asCopy = false): Promise<boolean> {
    if (this.pendingSave) return this.pendingSave;
    if (this.disposed || this.status() === 'loading') return Promise.resolve(false);
    this.pendingSave = this.write(asCopy).finally(() => (this.pendingSave = null));
    return this.pendingSave;
  }

  dispose(): void {
    this.disposed = true;
    this.reading++;
  }

  private async write(asCopy: boolean): Promise<boolean> {
    this.status.set('saving');
    this.error.set(null);
    const path = this.path();
    try {
      const target = asCopy || !path ? await this.chooseSave(this.name()) : null;
      if (this.disposed || ((asCopy || !path) && !target)) return this.cancel();
      const text = this.text();
      const bytes = new TextEncoder().encode(text);
      const result = target ? await this.files.create(target.path, bytes, target.replace) : await this.replace(bytes);
      if (result.kind === 'changed')
        return this.fail('This file changed in another window. Reload or Save As a copy.', 'conflict');
      if (result.kind === 'missing')
        throw new Error(
          `“${this.name()}” can’t be saved because it was moved, renamed or deleted. Your changes are still in this window.`
        );
      if (result.kind === 'missing-folder')
        throw new Error('The selected folder no longer exists. Choose another location.');
      if (result.kind === 'exists') throw new Error('The selected name is already in use. Choose another name.');
      if (target) this.path.set(target.path);
      this.stamp.set(result.stamp);
      this.savedText.set(text);
      this.status.set('ready');
      return true;
    } catch (error) {
      return this.fail(error);
    }
  }

  private replace(bytes: Uint8Array) {
    const path = this.path();
    const stamp = this.stamp();
    if (!path || !stamp) throw new Error('Load the original file before saving, or Save As a copy.');
    return this.files.replace(path, bytes, stamp);
  }

  private cancel(): false {
    this.status.set(this.stamp() ? 'ready' : 'new');
    return false;
  }

  private fail(error: unknown, status: 'failed' | 'conflict' = 'failed'): false {
    this.status.set(status);
    this.error.set(error instanceof Error ? error.message : String(error));
    return false;
  }
}
