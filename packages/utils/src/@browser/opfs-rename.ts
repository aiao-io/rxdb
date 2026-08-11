export type OpfsEntryKind = 'file' | 'directory';

function isMissingEntryError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError');
}

async function entryExists(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await directory.getFileHandle(name);
    return true;
  } catch (error) {
    if (!isMissingEntryError(error)) throw error;
  }

  try {
    await directory.getDirectoryHandle(name);
    return true;
  } catch (error) {
    if (!isMissingEntryError(error)) throw error;
    return false;
  }
}

function normalizeEntryName(name: string, oldName: string): string {
  const normalized = name.trim();
  if (!normalized || normalized === '.' || normalized === '..' || /[\\/]/.test(normalized)) {
    throw new Error('Invalid target entry name');
  }
  if (normalized === oldName) throw new Error('Target entry name must differ from the source');
  return normalized;
}

/**
 * 校验 OPFS 重命名请求；在平台提供原子且不覆盖目标的移动操作前直接拒绝。
 *
 * @param parent - 包含源条目的目录。
 * @param oldName - 现有源名称。
 * @param newName - 请求的目标名称。
 * @param kind - 源条目类型。
 * @throws `NotSupportedError` 当平台没有可用的安全操作时抛出。
 */
export async function renameOpfsEntry(
  parent: FileSystemDirectoryHandle,
  oldName: string,
  newName: string,
  kind: OpfsEntryKind
): Promise<void> {
  const targetName = normalizeEntryName(newName, oldName);
  if (await entryExists(parent, targetName)) throw new Error('Target entry already exists');

  await (kind === 'file' ? parent.getFileHandle(oldName) : parent.getDirectoryHandle(oldName));
  throw new DOMException('Safe OPFS rename requires atomic no-replace move() support', 'NotSupportedError');
}
