export function readAllDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = [];

  return new Promise((resolve, reject) => {
    const readNext = (): void => {
      reader.readEntries(batch => {
        if (batch.length === 0) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readNext();
      }, reject);
    };

    readNext();
  });
}

function readFile(entry: FileSystemFileEntry, path: string): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(file => {
      Object.defineProperty(file, 'webkitRelativePath', {
        value: `${path}${file.name}`,
        writable: false
      });
      resolve(file);
    }, reject);
  });
}

export async function readDroppedEntryTree(entry: FileSystemEntry, path: string, files: File[]): Promise<void> {
  if (entry.isFile) {
    files.push(await readFile(entry as FileSystemFileEntry, path));
    return;
  }

  if (!entry.isDirectory) return;
  const children = await readAllDirectoryEntries((entry as FileSystemDirectoryEntry).createReader());
  await Promise.all(children.map(child => readDroppedEntryTree(child, `${path}${entry.name}/`, files)));
}
