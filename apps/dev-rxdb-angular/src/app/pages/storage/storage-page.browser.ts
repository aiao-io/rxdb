import type { RxDB } from '@aiao/rxdb';
import { joinDirectoryAndFileName, type StorageFileMeta } from '@aiao/rxdb-plugin-storage';
import { signal, type WritableSignal } from '@angular/core';
import { mapStorageEntry, pruneSelectedPaths, sortAllFiles, sortMappedEntries } from './storage-page.helpers';
import type { StorageBrowserItem } from './utils/storage-utils';

export type StoragePageBrowserService = Pick<RxDB['storage'], 'clear' | 'delete' | 'list' | 'listEntries'>;

export interface StoragePageBrowserHost {
  currentPath: WritableSignal<string>;
  lastSelectedPath?: WritableSignal<string | null>;
  selectedPaths?: WritableSignal<Set<string>>;
  showToast: (message: string, type?: 'error' | 'success' | 'info') => void;
}

export class StoragePageBrowser {
  readonly allFiles = signal<StorageFileMeta[]>([]);
  readonly entries = signal<StorageBrowserItem[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  constructor(
    readonly storage: StoragePageBrowserService,
    private readonly host: StoragePageBrowserHost
  ) {}

  async refreshCurrentDirectory(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      this.setAllFiles(await this.storage.list());

      const entries = await this.storage.listEntries({ path: this.host.currentPath() });
      const mappedEntries = sortMappedEntries(entries.map(entry => mapStorageEntry(entry)));
      this.entries.set(mappedEntries);
      this.syncSelectedPaths(mappedEntries);
    } catch (err) {
      this.entries.set([]);
      this.error.set(err instanceof Error ? err.message : String(err));
      this.host.showToast(this.error() || 'Unknown error', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  async deleteEntry(entry: StorageBrowserItem): Promise<boolean> {
    try {
      if (entry.kind === 'file' && entry.meta) {
        await this.storage.delete(entry.meta.id);
      } else {
        await this.storage.clear(entry.path);
      }

      await this.refreshCurrentDirectory();
      return true;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  findExistingFileEntry(fileName: string, directoryPath: string): StorageBrowserItem | null {
    const targetOpfsPath = joinDirectoryAndFileName(directoryPath, fileName);
    const meta = this.allFiles().find(file => file.opfsPath === targetOpfsPath);

    if (!meta) {
      return null;
    }

    return mapStorageEntry({
      kind: 'file',
      name: meta.name,
      path: `/${meta.opfsPath}`,
      meta
    });
  }

  private setAllFiles(metas: StorageFileMeta[]): void {
    this.allFiles.set(sortAllFiles(metas));
  }

  private syncSelectedPaths(entries: StorageBrowserItem[]): void {
    const selectedPaths = this.host.selectedPaths;
    const lastSelectedPath = this.host.lastSelectedPath;
    if (!selectedPaths || !lastSelectedPath) {
      return;
    }

    const next = pruneSelectedPaths(selectedPaths(), lastSelectedPath(), entries);
    if (next.selectedChanged) {
      selectedPaths.set(next.selectedPaths);
    }
    if (lastSelectedPath() !== next.lastSelectedPath) {
      lastSelectedPath.set(next.lastSelectedPath);
    }
  }
}
