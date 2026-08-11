import { useCallback, useState } from 'react';
import { createFilePathValidator, FilePathNode, PathConflict } from './useFilePathValidator';
import { createMenuPathValidator, MenuPathConflict, MenuPathNode } from './useMenuPathValidator';

type RenameUpdate<T> = (entity: T, nextName: string) => Promise<unknown>;

export async function renameMenuWithPathGuard<T extends MenuPathNode>(
  menu: T,
  nextTitle: string,
  allMenus: T[],
  update: RenameUpdate<T>
): Promise<MenuPathConflict<T> | null> {
  const conflict = createMenuPathValidator<T>().checkConflict(nextTitle, menu.parentId ?? null, allMenus, menu.id);
  if (conflict) return conflict;

  await update(menu, nextTitle);
  return null;
}

export async function renameFileWithPathGuard<T extends FilePathNode>(
  file: T,
  nextName: string,
  allFiles: T[],
  update: RenameUpdate<T>
): Promise<PathConflict<T> | null> {
  const extension = file.type === 'file' ? (file.extension ?? null) : null;
  const conflict = createFilePathValidator<T>().checkConflict(
    nextName,
    extension,
    file.parentId ?? null,
    allFiles,
    file.id
  );
  if (conflict) return conflict;

  await update(file, nextName);
  return null;
}

export function useMenuRenamePathGuard<T extends MenuPathNode>() {
  const [pathConflict, setPathConflict] = useState<MenuPathConflict<T> | null>(null);

  const rename = useCallback(async (menu: T, nextTitle: string, allMenus: T[], update: RenameUpdate<T>) => {
    const conflict = await renameMenuWithPathGuard(menu, nextTitle, allMenus, update);
    setPathConflict(conflict);
    return conflict === null;
  }, []);

  const clearPathConflict = useCallback(() => setPathConflict(null), []);
  return { pathConflict, rename, clearPathConflict };
}

export function useFileRenamePathGuard<T extends FilePathNode>() {
  const [pathConflict, setPathConflict] = useState<PathConflict<T> | null>(null);

  const rename = useCallback(async (file: T, nextName: string, allFiles: T[], update: RenameUpdate<T>) => {
    const conflict = await renameFileWithPathGuard(file, nextName, allFiles, update);
    setPathConflict(conflict);
    return conflict === null;
  }, []);

  const clearPathConflict = useCallback(() => setPathConflict(null), []);
  return { pathConflict, rename, clearPathConflict };
}
