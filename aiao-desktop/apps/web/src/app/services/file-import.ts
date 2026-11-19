import { Service, inject, signal } from '@angular/core';

import { DiskPath } from '../disk/disk-path';
import { validateImportSize } from '../disk/file-operations';
import { FileSystem, describeDiskError, isLocked } from './file-system';
import { Toast } from './toast';

/** 本机文件的拖放与文件选择器共用一条批量导入路径。 */
@Service({ autoProvided: false })
export class FileImport {
  private readonly fs = inject(FileSystem);
  private readonly toast = inject(Toast);
  private readonly importing = signal(false);
  readonly dropTarget = signal<HTMLElement | null>(null);

  accepts(dir: DiskPath | null): dir is DiskPath {
    return dir !== null && !isLocked(dir) && !this.importing();
  }

  async importFiles(dir: DiskPath, files: readonly File[]): Promise<DiskPath[]> {
    if (!files.length || !this.accepts(dir)) return [];
    this.importing.set(true);
    try {
      validateImportSize(files.map(file => file.size));
      const entries = await Promise.all(
        files.map(async file => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }))
      );
      const paths = await this.fs.importFiles(dir, entries);
      this.toast.show(`Imported ${paths.length} file${paths.length === 1 ? '' : 's'}`);
      return paths;
    } catch (error) {
      this.toast.show(describeDiskError(error));
      return [];
    } finally {
      this.importing.set(false);
    }
  }
}
