import { Service, signal } from '@angular/core';

import { DiskPath } from '../../disk/disk-path';

export type FinderClipboardMode = 'copy' | 'cut';

export interface FinderClipboardEntry {
  readonly path: DiskPath;
  readonly name: string;
}

export interface FinderClipboardSnapshot {
  readonly mode: FinderClipboardMode;
  readonly entries: readonly FinderClipboardEntry[];
}

@Service({ autoProvided: false })
export class FinderClipboard {
  private readonly state = signal<FinderClipboardSnapshot | null>(null);

  readonly snapshot = this.state.asReadonly();

  set(mode: FinderClipboardMode, entries: readonly FinderClipboardEntry[]): void {
    this.state.set(entries.length ? { mode, entries: entries.map(entry => ({ ...entry, path: [...entry.path] })) } : null);
  }

  clear(): void {
    this.state.set(null);
  }
}
