import { expect, it, vi } from 'vitest';
import { archiveOfDirectory, archiveOfUploadedDirectory } from './git-directory';
import { GIT_WORKBENCH_LIMITS } from './git-protocol';

function upload(path: string) {
  const file = new File(['data'], path.split('/').at(-1)!);
  Object.defineProperty(file, 'webkitRelativePath', { value: path });
  return file;
}
it('按选择的根目录收集隐藏元数据，拒绝混入第二个目录', async () => {
  const files = [upload('repo/.git/HEAD'), upload('repo/src/main.ts')];
  expect((await archiveOfUploadedDirectory(files)).name).toBe('repo');
  await expect(archiveOfUploadedDirectory([])).rejects.toThrow('文件夹');
  await expect(archiveOfUploadedDirectory([files[0], upload('other/main')])).rejects.toThrow('文件夹');
  await expect(archiveOfUploadedDirectory([files[1]])).rejects.toThrow('.git/HEAD');
});
it('在读取文件体前检查单文件上限', async () => {
  const read = vi.fn();
  const folder = {
    name: 'repo',
    kind: 'directory' as const,
    async *values() {
      yield {
        name: 'large',
        kind: 'file' as const,
        getFile: async () => ({ size: GIT_WORKBENCH_LIMITS.fileBytes + 1, arrayBuffer: read })
      };
    }
  };
  await expect(archiveOfDirectory(folder)).rejects.toThrow('上限');
  expect(read).not.toHaveBeenCalled();
});
