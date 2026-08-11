/**
 * OPFS 文件管理服务 Hook
 */

import { renameOpfsEntry } from '@aiao/utils';
import { useCallback, useRef, useState } from 'react';
import { findExistingFilePaths } from '../utils/find-path-conflicts';
import { FILE_EXTENSIONS, OPFSFileEntry, PREVIEW_SIZE_LIMIT } from '../utils/opfs-utils';

export function useOpfsService() {
  const [entries, setEntries] = useState<OPFSFileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rootHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const currentHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  const getDirectoryHandleByPath = useCallback(async (path: string): Promise<FileSystemDirectoryHandle | null> => {
    const normalizedPath = path === '/' ? '/' : path.replace(/\/+$/, '');
    if (normalizedPath === '/' || !normalizedPath) return rootHandleRef.current;

    const root = rootHandleRef.current;
    if (!root) return null;

    const pathParts = normalizedPath.split('/').filter(Boolean);
    let currentDir = root;
    for (const part of pathParts) {
      try {
        currentDir = await currentDir.getDirectoryHandle(part);
      } catch {
        return null;
      }
    }
    return currentDir;
  }, []);

  const readDirectory = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      const items: OPFSFileEntry[] = [];

      try {
        const dirHandle = await getDirectoryHandleByPath(path);
        if (!dirHandle) return;

        const entriesIter = dirHandle.entries?.();
        if (!entriesIter) throw new Error('FileSystemDirectoryHandle.entries 在当前环境不可用');
        for await (const [name, handle] of entriesIter) {
          const entry: OPFSFileEntry = {
            name,
            kind: handle.kind,
            handle,
            path: `${path}${name}${handle.kind === 'directory' ? '/' : ''}`
          };

          if (handle.kind === 'file') {
            try {
              const file = await (handle as FileSystemFileHandle).getFile();
              entry.size = file.size;
              entry.type = file.type;
              entry.lastModified = file.lastModified;
            } catch {
              /* ignore */
            }
          }
          items.push(entry);
        }

        items.sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        setEntries(items);
        setCurrentPath(path);
        currentHandleRef.current = dirHandle;
      } catch (err) {
        setError(`读取目录失败: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    },
    [getDirectoryHandleByPath]
  );

  const init = useCallback(
    async (initialPath = '/') => {
      try {
        if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
          setError('浏览器不支持 OPFS');
          return;
        }
        const root = await navigator.storage.getDirectory();
        rootHandleRef.current = root;
        currentHandleRef.current = root;
        setCurrentPath('/');
        await readDirectory(initialPath);
      } catch (err) {
        setError(`获取根目录失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [readDirectory]
  );

  const navigateTo = useCallback(
    async (path: string) => {
      await readDirectory(path);
    },
    [readDirectory]
  );

  const uploadFile = useCallback(
    async (file: globalThis.File, targetPath?: string): Promise<boolean> => {
      try {
        const path = targetPath || currentPath;
        const dirHandle = await getDirectoryHandleByPath(path);
        if (!dirHandle) throw new Error('无法访问目标目录');

        const fileHandle = await dirHandle.getFileHandle(file.name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(file);
        await writable.close();
        await readDirectory(path);
        return true;
      } catch (err) {
        setError(`上传失败: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    },
    [currentPath, getDirectoryHandleByPath, readDirectory]
  );

  const findUploadConflicts = useCallback(async (relativePaths: string[]): Promise<string[]> => {
    const currentDir = currentHandleRef.current;
    if (!currentDir) throw new Error('无法访问当前目录');
    return findExistingFilePaths(currentDir, relativePaths);
  }, []);

  const uploadFileWithPath = useCallback(async (file: globalThis.File, relativePath: string): Promise<boolean> => {
    try {
      const currentDir = currentHandleRef.current;
      if (!currentDir) throw new Error('无法访问当前目录');

      const pathParts = relativePath.split('/').filter(Boolean);
      if (pathParts.length === 0) throw new Error('无效的文件路径');

      const fileName = pathParts[pathParts.length - 1];
      const dirParts = pathParts.slice(0, -1);

      let targetDir = currentDir;
      for (const dirName of dirParts) {
        targetDir = await targetDir.getDirectoryHandle(dirName, { create: true });
      }

      const fileHandle = await targetDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      return true;
    } catch (err) {
      console.error('上传文件失败:', relativePath, err instanceof Error ? err.message : String(err));
      return false;
    }
  }, []);

  const downloadFile = useCallback(async (entry: OPFSFileEntry): Promise<boolean> => {
    try {
      if (entry.kind !== 'file') throw new Error('只能下载文件');
      const fileHandle = entry.handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();

      if ('showSaveFilePicker' in window) {
        try {
          if (!window.showSaveFilePicker) throw new Error('showSaveFilePicker 在当前环境不可用');
          const handle = await window.showSaveFilePicker({ suggestedName: entry.name });
          const writable = await handle.createWritable();
          await writable.write(file);
          await writable.close();
          return true;
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') return false;
          throw err;
        }
      } else {
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = entry.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
      }
    } catch (err) {
      setError(`下载失败: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }, []);

  const deleteEntry = useCallback(
    async (entry: OPFSFileEntry): Promise<boolean> => {
      try {
        const currentDir = currentHandleRef.current;
        if (!currentDir) throw new Error('无法访问当前目录');

        if (entry.kind === 'file') {
          await currentDir.removeEntry(entry.name);
        } else {
          await currentDir.removeEntry(entry.name, { recursive: true });
        }
        await readDirectory(currentPath);
        return true;
      } catch (err) {
        setError(`删除失败: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    },
    [currentPath, readDirectory]
  );

  const createDirectory = useCallback(
    async (name: string, targetPath?: string): Promise<boolean> => {
      try {
        const path = targetPath || currentPath;
        const dirHandle = await getDirectoryHandleByPath(path);
        if (!dirHandle) throw new Error('无法访问目标目录');
        await dirHandle.getDirectoryHandle(name, { create: true });
        await readDirectory(path);
        return true;
      } catch (err) {
        setError(`创建目录失败: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    },
    [currentPath, getDirectoryHandleByPath, readDirectory]
  );

  const renameEntry = useCallback(
    async (entry: OPFSFileEntry, newName: string): Promise<boolean> => {
      try {
        const parentPath =
          entry.path
            .split('/')
            .slice(0, entry.kind === 'directory' ? -2 : -1)
            .join('/') || '/';
        const parentDir = await getDirectoryHandleByPath(parentPath);
        if (!parentDir) throw new Error('无法访问父目录');

        await renameOpfsEntry(parentDir, entry.name, newName, entry.kind);
        await readDirectory(currentPath);
        return true;
      } catch (err) {
        setError(`重命名失败: ${err instanceof Error ? err.message : String(err)}`);
        return false;
      }
    },
    [currentPath, getDirectoryHandleByPath, readDirectory]
  );

  const previewFile = useCallback(
    async (entry: OPFSFileEntry): Promise<{ data: Blob | string; type: string } | null> => {
      try {
        if (entry.kind !== 'file') return null;

        let fileHandle = entry.handle as FileSystemFileHandle;
        let file: globalThis.File;

        try {
          file = await fileHandle.getFile();
        } catch {
          const pathParts = entry.path.split('/').filter(Boolean);
          if (pathParts.length === 0) throw new Error('无效的文件路径');

          const root = rootHandleRef.current;
          if (!root) throw new Error('根目录未初始化');

          let currentDir = root;
          const fileName = pathParts[pathParts.length - 1];
          const dirParts = pathParts.slice(0, -1);
          for (const part of dirParts) {
            currentDir = await currentDir.getDirectoryHandle(part);
          }
          fileHandle = await currentDir.getFileHandle(fileName);
          file = await fileHandle.getFile();
        }

        if (file.size > PREVIEW_SIZE_LIMIT) {
          throw new Error(`文件太大，无法预览（最大 ${PREVIEW_SIZE_LIMIT / 1024 / 1024}MB）`);
        }

        const ext = entry.name.split('.').pop()?.toLowerCase() || '';
        const isImage = FILE_EXTENSIONS.image.has(ext);
        const isAudio = FILE_EXTENSIONS.audio.has(ext);
        const isVideo = FILE_EXTENSIONS.video.has(ext);

        if (isImage || isAudio || isVideo) {
          return { data: file, type: file.type || 'application/octet-stream' };
        }

        const text = await file.text();
        return { data: text, type: 'text/plain' };
      } catch (err) {
        setError(`预览失败: ${err instanceof Error ? err.message : String(err)}`);
        return null;
      }
    },
    []
  );

  const refresh = useCallback(async () => {
    await readDirectory(currentPath);
  }, [currentPath, readDirectory]);

  return {
    entries,
    currentPath,
    loading,
    error,
    init,
    navigateTo,
    uploadFile,
    uploadFileWithPath,
    findUploadConflicts,
    downloadFile,
    deleteEntry,
    createDirectory,
    renameEntry,
    previewFile,
    refresh
  };
}
