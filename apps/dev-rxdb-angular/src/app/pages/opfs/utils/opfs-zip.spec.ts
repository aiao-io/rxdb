import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { OPFSFileEntry } from './opfs-utils';
import { buildOpfsZip } from './opfs-zip';

function fileEntry(path: string, content: string): OPFSFileEntry {
  const name = path.split('/').pop() ?? path;
  const bytes = new TextEncoder().encode(content);
  const file = {
    name,
    arrayBuffer: async () => bytes.buffer
  } as File;
  const handle = {
    kind: 'file',
    name,
    getFile: async () => file
  } as unknown as FileSystemFileHandle;

  return {
    name,
    kind: 'file',
    handle,
    path
  };
}

describe('buildOpfsZip', () => {
  it('archives every selected file using its normalized OPFS path', async () => {
    const archive = await buildOpfsZip([fileEntry('/folder/a.txt', 'alpha'), fileEntry('/folder/子.txt', '中文')]);

    const files = unzipSync(archive.data);

    expect(archive.fileCount).toBe(2);
    expect(strFromU8(files['folder/a.txt'])).toBe('alpha');
    expect(strFromU8(files['folder/子.txt'])).toBe('中文');
  });

  it('rejects a selection without files', async () => {
    const directory = {
      name: 'folder',
      kind: 'directory',
      handle: {} as FileSystemDirectoryHandle,
      path: '/folder/'
    } satisfies OPFSFileEntry;

    await expect(buildOpfsZip([directory])).rejects.toThrow('没有可下载的文件');
  });
});
