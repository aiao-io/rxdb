import { expect, it, vi } from 'vitest';
import { volumeJournal } from './github-volume-journal';

it('记录写入前的版本，重新打开恢复，损坏或写入失败都可观察', async () => {
  let text: string | null = null;
  const writer = {
    write: vi.fn(async (value: string) => {
      text = value;
    }),
    close: vi.fn(),
    abort: vi.fn(async () => undefined)
  };
  const directory = {
    getDirectoryHandle: async () => directory,
    getFileHandle: async (_name: string, options?: { create: boolean }) => {
      if (text === null && !options?.create) throw new DOMException('missing', 'NotFoundError');
      return { getFile: async () => new Blob([text ?? '']), createWritable: async () => writer };
    },
    removeEntry: async () => {
      text = null;
    }
  };
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => directory } });
  const journal = await volumeJournal('project');
  expect(await journal.read()).toBeNull();
  await journal.write([['readme', 'sha']]);
  expect(await (await volumeJournal('project')).read()).toEqual([['readme', 'sha']]);
  text = '{}';
  await expect(journal.read()).rejects.toThrow('损坏');
  await journal.clear();
  expect(await journal.read()).toBeNull();
  writer.write.mockRejectedValueOnce(new Error('quota'));
  await expect(journal.write([])).rejects.toThrow('quota');
  expect(writer.abort).toHaveBeenCalled();
});
