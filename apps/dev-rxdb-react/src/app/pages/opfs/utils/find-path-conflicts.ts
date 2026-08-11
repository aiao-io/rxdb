function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

async function fileExists(root: FileSystemDirectoryHandle, relativePath: string): Promise<boolean> {
  const parts = relativePath.split('/').filter(Boolean);
  if (parts.length === 0) return false;

  let directory = root;
  try {
    for (const name of parts.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(name);
    }
    await directory.getFileHandle(parts[parts.length - 1]);
    return true;
  } catch (error) {
    if (isNotFoundError(error)) return false;
    throw error;
  }
}

export async function findExistingFilePaths(
  root: FileSystemDirectoryHandle,
  relativePaths: string[]
): Promise<string[]> {
  const results = await Promise.all(relativePaths.map(async path => ({ path, exists: await fileExists(root, path) })));
  return results.filter(result => result.exists).map(result => result.path);
}
