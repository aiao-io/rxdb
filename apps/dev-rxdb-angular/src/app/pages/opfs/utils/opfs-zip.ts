import { zipSync, type Zippable } from 'fflate';
import type { OPFSFileEntry } from './opfs-utils';
import { normalizePath } from './opfs-utils';

export interface OpfsZipArchive {
  data: Uint8Array;
  fileCount: number;
}

export async function buildOpfsZip(entries: OPFSFileEntry[]): Promise<OpfsZipArchive> {
  const fileEntries = entries.filter(entry => entry.kind === 'file');
  if (fileEntries.length === 0) {
    throw new Error('没有可下载的文件');
  }

  const files: Zippable = {};
  for (const entry of fileEntries) {
    const file = await (entry.handle as FileSystemFileHandle).getFile();
    const archivePath = normalizePath(entry.path).replace(/^\.?\//, '') || entry.name;
    files[archivePath] = new Uint8Array(await file.arrayBuffer());
  }

  return {
    data: zipSync(files, { level: 6 }),
    fileCount: fileEntries.length
  };
}
