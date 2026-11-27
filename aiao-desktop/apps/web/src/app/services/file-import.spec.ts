import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DESKTOP } from '../disk/disk-path';
import { MAX_IMPORT_BYTES } from '../disk/file-operations';
import { configureServices } from '../testing/angular';
import { FileImport } from './file-import';
import { FileSystem } from './file-system';
import { Toast } from './toast';

function setup() {
  const importFiles = vi.fn<FileSystem['importFiles']>();
  const show = vi.fn<Toast['show']>();
  configureServices([
    FileImport,
    { provide: FileSystem, useValue: { importFiles } },
    { provide: Toast, useValue: { show } }
  ]);
  return { importer: TestBed.inject(FileImport), importFiles, show };
}

describe('FileImport', () => {
  it('整批保留名称和原始字节，完成后才接受下一批', async () => {
    const { importer, importFiles, show } = setup();
    const bytes = Uint8Array.of(0, 128, 255);
    const files = [new File([bytes], 'bytes.bin'), new File([], 'empty.txt')];
    const paths = files.map(file => [...DESKTOP, file.name]);
    importFiles.mockResolvedValue(paths);

    const pending = importer.importFiles(DESKTOP, files);
    expect(importer.accepts(DESKTOP)).toBe(false);
    await expect(importer.importFiles([...DESKTOP, 'Projects'], files)).resolves.toEqual([]);
    await expect(pending).resolves.toEqual(paths);

    expect(importFiles).toHaveBeenCalledExactlyOnceWith(DESKTOP, [
      { name: 'bytes.bin', data: bytes },
      { name: 'empty.txt', data: new Uint8Array() }
    ]);
    expect(importer.accepts(DESKTOP)).toBe(true);
    expect(show).toHaveBeenCalledWith('apps.finder.importedFiles', { count: 2 });
  });

  it('虚拟位置、只读目录和空文件列表不会读取或写入', async () => {
    const { importer, importFiles } = setup();
    const file = new File(['note'], 'note.txt');
    const read = vi.spyOn(file, 'arrayBuffer');
    expect(importer.accepts(null)).toBe(false);
    expect(importer.accepts([])).toBe(false);
    await expect(importer.importFiles(['System'], [file])).resolves.toEqual([]);
    await expect(importer.importFiles(DESKTOP, [])).resolves.toEqual([]);
    expect(read).not.toHaveBeenCalled();
    expect(importFiles).not.toHaveBeenCalled();
  });

  it('文件还未读取就拒绝总量超过 256 MiB 的批次', async () => {
    const { importer, importFiles, show } = setup();
    const file = new File(['note'], 'note.txt');
    vi.spyOn(file, 'size', 'get').mockReturnValue(MAX_IMPORT_BYTES);
    const read = vi.spyOn(file, 'arrayBuffer');
    await expect(importer.importFiles(DESKTOP, [file, new File(['!'], 'other.txt')])).resolves.toEqual([]);
    expect(read).not.toHaveBeenCalled();
    expect(importFiles).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith(expect.stringContaining('256 MiB'));
    expect(importer.accepts(DESKTOP)).toBe(true);
  });

  it('读盘或写盘失败后提示原因，下一批可以重试', async () => {
    const { importer, importFiles, show } = setup();
    const readable = new File(['hello'], 'readable.txt');
    const unreadable = new File([], 'unreadable.txt');
    vi.spyOn(unreadable, 'arrayBuffer').mockRejectedValue(new Error('Cannot read file'));
    await expect(importer.importFiles(DESKTOP, [readable, unreadable])).resolves.toEqual([]);
    expect(importFiles).not.toHaveBeenCalled();
    expect(show).toHaveBeenLastCalledWith('Cannot read file');

    const path = [...DESKTOP, readable.name];
    importFiles.mockRejectedValueOnce(new Error('Disk full')).mockResolvedValueOnce([path]);
    await expect(importer.importFiles(DESKTOP, [readable])).resolves.toEqual([]);
    expect(show).toHaveBeenLastCalledWith('Disk full');
    await expect(importer.importFiles(DESKTOP, [readable])).resolves.toEqual([path]);
    expect(show).toHaveBeenLastCalledWith('apps.finder.importedFile', { count: 1 });
  });
});
