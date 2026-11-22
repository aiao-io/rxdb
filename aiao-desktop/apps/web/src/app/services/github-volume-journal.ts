import { projectFolder } from './github-volume-binding';

const NAME = 'volume-write.json';

export async function volumeJournal(id: string) {
  const dir = await projectFolder(id);
  return {
    async read(): Promise<[string,string][] | null> {
      let file: FileSystemFileHandle;
      try { file = await dir.getFileHandle(NAME); }
      catch (error) { if (error instanceof DOMException && error.name === 'NotFoundError') return null; throw error; }
      const data: unknown = JSON.parse(await (await file.getFile()).text());
      if (!Array.isArray(data) || !data.every(row => Array.isArray(row) && row.length === 2 && row.every(value => typeof value === 'string'))) throw new Error('Git 工作目录恢复日志损坏');
      return data;
    },
    async write(hashes: readonly [string,string][]) {
      const writer = await (await dir.getFileHandle(NAME,{ create: true })).createWritable();
      try { await writer.write(JSON.stringify(hashes)); await writer.close(); }
      catch (error) { await writer.abort().catch(() => undefined); throw error; }
    },
    clear: () => dir.removeEntry(NAME)
  };
}
