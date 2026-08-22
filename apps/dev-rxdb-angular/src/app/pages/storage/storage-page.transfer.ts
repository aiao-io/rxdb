import type { RxDB } from '@aiao/rxdb';
import { STORAGE_LABELS } from '@aiao/utils';
import { getUploadDirectory } from './storage-page.helpers';
import { downloadEntriesAsZip } from './storage-page.zip';
import type { StorageBrowserItem } from './utils/storage-utils';

export type StoragePageTransferService = Pick<RxDB['storage'], 'download' | 'listEntries' | 'read' | 'upload'>;

export interface StoragePageTransferHost {
  currentPath: () => string;
  fileInputFiles?: () => FileList | null | undefined;
  findExistingFileEntry: (fileName: string, directoryPath: string) => StorageBrowserItem | null;
  refresh: () => Promise<void>;
  resolveOverwrite?: (file: File, existingEntry: StorageBrowserItem) => Promise<boolean>;
  showToast: (message: string, type?: 'error' | 'success' | 'info') => void;
}

export class StoragePageTransfer {
  constructor(
    private readonly storage: StoragePageTransferService,
    private readonly host: StoragePageTransferHost
  ) {}

  async handleUpload(files?: File[]): Promise<void> {
    const filesToUpload = files || this.host.fileInputFiles?.();
    if (!filesToUpload || filesToUpload.length === 0) {
      return;
    }

    const fileList = Array.from(filesToUpload);
    let successCount = 0;

    for (const file of fileList) {
      const existingFile = this.host.findExistingFileEntry(file.name, this.host.currentPath());
      let overwrite = false;

      if (existingFile) {
        const shouldOverwrite =
          this.host.resolveOverwrite ? await this.host.resolveOverwrite(file, existingFile) : false;

        if (!shouldOverwrite) {
          continue;
        }

        overwrite = true;
      }

      try {
        await this.storage.upload(file, { path: this.host.currentPath(), overwrite });
        successCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.host.showToast(message.includes('already exists') ? STORAGE_LABELS.FILE_EXISTS : message, 'error');
        return;
      }
    }

    if (successCount > 0) {
      this.host.showToast(
        successCount === 1 ? STORAGE_LABELS.UPLOAD_SUCCESS : `Uploaded ${successCount} files`,
        'success'
      );
      await this.host.refresh();
    }
  }

  async handleUploadFolder(files: File[]): Promise<void> {
    if (files.length === 0) return;

    this.host.showToast(`Uploading folder with ${files.length} files...`, 'info');

    let successCount = 0;
    let failedCount = 0;

    for (const file of files) {
      const relativePath = file.webkitRelativePath || file.name;
      const targetDirectory = getUploadDirectory(relativePath, this.host.currentPath());
      const existingFile = this.host.findExistingFileEntry(file.name, targetDirectory);
      let overwrite = false;

      if (existingFile) {
        const shouldOverwrite =
          this.host.resolveOverwrite ? await this.host.resolveOverwrite(file, existingFile) : false;

        if (!shouldOverwrite) {
          continue;
        }

        overwrite = true;
      }

      try {
        await this.storage.upload(file, { path: targetDirectory, overwrite });
        successCount++;
      } catch {
        failedCount++;
      }
    }

    await this.host.refresh();

    if (failedCount > 0) {
      this.host.showToast(`Upload finished: ${successCount} succeeded, ${failedCount} failed`, 'error');
    } else {
      this.host.showToast(`Uploaded ${successCount} files`, 'success');
    }
  }

  async handleDownload(entry: StorageBrowserItem): Promise<void> {
    if (entry.kind === 'directory') {
      this.host.showToast(`Preparing ${entry.name}...`, 'info');

      try {
        const fileCount = await downloadEntriesAsZip(this.storage, [entry], `${entry.name}.zip`);
        this.host.showToast(
          fileCount === 0 ?
            `Downloaded empty folder ${entry.name}`
          : `Downloaded ${fileCount} files from ${entry.name}`,
          'success'
        );
      } catch (err) {
        this.host.showToast(err instanceof Error ? err.message : String(err), 'error');
      }

      return;
    }

    if (!entry.meta) {
      return;
    }

    try {
      await this.storage.download(entry.meta.id);
    } catch (err) {
      this.host.showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }

  async handleBatchDownload(selectedEntries: StorageBrowserItem[], archiveName: string): Promise<void> {
    if (selectedEntries.length === 0) {
      this.host.showToast('No files selected', 'error');
      return;
    }

    if (selectedEntries.length === 1) {
      await this.handleDownload(selectedEntries[0]);
      return;
    }

    this.host.showToast(`Preparing ${selectedEntries.length} items...`, 'info');

    try {
      const fileCount = await downloadEntriesAsZip(this.storage, selectedEntries, archiveName);
      this.host.showToast(
        fileCount === 0 ?
          `Downloaded ${selectedEntries.length} empty folders`
        : `Downloaded ${selectedEntries.length} items (${fileCount} files)`,
        'success'
      );
    } catch (err) {
      this.host.showToast(err instanceof Error ? err.message : String(err), 'error');
    }
  }
}
