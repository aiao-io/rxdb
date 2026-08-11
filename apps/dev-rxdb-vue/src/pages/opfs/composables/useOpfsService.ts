/**
 * OPFS 文件管理服务 Composable
 */

import { renameOpfsEntry } from '@aiao/utils';
import { ref } from 'vue';
import { formatErrorMessage, useToast } from '../../../app/composables/useToast';
import { FILE_EXTENSIONS, OPFSFileEntry, PREVIEW_SIZE_LIMIT } from '../utils/opfs-utils';

const entries = ref<OPFSFileEntry[]>([]);
const currentPath = ref('/');
const loading = ref(false);
const error = ref<string | null>(null);

let rootHandle: FileSystemDirectoryHandle | null = null;
let currentHandle: FileSystemDirectoryHandle | null = null;
let lifecycleVersion = 0;

async function getDirectoryHandleByPath(path: string): Promise<FileSystemDirectoryHandle | null> {
  const normalizedPath = path === '/' ? '/' : path.replace(/\/+$/, '');
  if (normalizedPath === '/' || !normalizedPath) return rootHandle;
  if (!rootHandle) return null;

  const pathParts = normalizedPath.split('/').filter(Boolean);
  let currentDir = rootHandle;
  for (const part of pathParts) {
    try {
      currentDir = await currentDir.getDirectoryHandle(part);
    } catch {
      return null;
    }
  }
  return currentDir;
}

async function readDirectory(path: string) {
  const version = lifecycleVersion;
  loading.value = true;
  error.value = null;
  const items: OPFSFileEntry[] = [];

  try {
    const dirHandle = await getDirectoryHandleByPath(path);
    if (version !== lifecycleVersion) return;
    if (!dirHandle) return;

    const entriesIter = dirHandle.entries?.();
    if (!entriesIter) throw new Error('FileSystemDirectoryHandle.entries 在当前环境不可用');
    for await (const [name, handle] of entriesIter) {
      if (version !== lifecycleVersion) return;
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

    if (version !== lifecycleVersion) return;
    entries.value = items;
    currentPath.value = path;
    currentHandle = dirHandle;
  } catch (err) {
    if (version === lifecycleVersion) {
      error.value = `读取目录失败: ${err instanceof Error ? err.message : String(err)}`;
    }
  } finally {
    if (version === lifecycleVersion) loading.value = false;
  }
}

function reset() {
  lifecycleVersion += 1;
  entries.value = [];
  currentPath.value = '/';
  loading.value = false;
  error.value = null;
  rootHandle = null;
  currentHandle = null;
}

export function useOpfsService() {
  async function init(initialPath = '/') {
    const version = lifecycleVersion;
    try {
      if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
        error.value = '浏览器不支持 OPFS';
        return;
      }
      const root = await navigator.storage.getDirectory();
      if (version !== lifecycleVersion) return;
      rootHandle = root;
      currentHandle = root;
      currentPath.value = '/';
      await readDirectory(initialPath);
    } catch (err) {
      error.value = `获取根目录失败: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async function navigateTo(path: string) {
    await readDirectory(path);
  }

  async function uploadFile(file: globalThis.File, targetPath?: string): Promise<boolean> {
    try {
      const path = targetPath || currentPath.value;
      const dirHandle = await getDirectoryHandleByPath(path);
      if (!dirHandle) throw new Error('无法访问目标目录');

      const fileHandle = await dirHandle.getFileHandle(file.name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      await readDirectory(path);
      return true;
    } catch (err) {
      error.value = `上传失败: ${err instanceof Error ? err.message : String(err)}`;
      return false;
    }
  }

  async function uploadFileWithPath(file: globalThis.File, relativePath: string): Promise<boolean> {
    try {
      if (!currentHandle) throw new Error('无法访问当前目录');

      const pathParts = relativePath.split('/').filter(Boolean);
      if (pathParts.length === 0) throw new Error('无效的文件路径');

      const fileName = pathParts[pathParts.length - 1];
      const dirParts = pathParts.slice(0, -1);

      let targetDir = currentHandle;
      for (const dirName of dirParts) {
        targetDir = await targetDir.getDirectoryHandle(dirName, { create: true });
      }

      const fileHandle = await targetDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();
      return true;
    } catch (err) {
      useToast().error(formatErrorMessage(`上传文件失败: ${relativePath}`, err));
      return false;
    }
  }

  async function downloadFile(entry: OPFSFileEntry): Promise<boolean> {
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
      error.value = `下载失败: ${err instanceof Error ? err.message : String(err)}`;
      return false;
    }
  }

  async function deleteEntry(entry: OPFSFileEntry): Promise<boolean> {
    try {
      if (!currentHandle) throw new Error('无法访问当前目录');
      if (entry.kind === 'file') {
        await currentHandle.removeEntry(entry.name);
      } else {
        await currentHandle.removeEntry(entry.name, { recursive: true });
      }
      await readDirectory(currentPath.value);
      return true;
    } catch (err) {
      error.value = `删除失败: ${err instanceof Error ? err.message : String(err)}`;
      return false;
    }
  }

  async function createDirectory(name: string, targetPath?: string): Promise<boolean> {
    try {
      const path = targetPath || currentPath.value;
      const dirHandle = await getDirectoryHandleByPath(path);
      if (!dirHandle) throw new Error('无法访问目标目录');
      await dirHandle.getDirectoryHandle(name, { create: true });
      await readDirectory(path);
      return true;
    } catch (err) {
      error.value = `创建目录失败: ${err instanceof Error ? err.message : String(err)}`;
      return false;
    }
  }

  async function renameEntry(entry: OPFSFileEntry, newName: string): Promise<boolean> {
    try {
      const parentPath =
        entry.path
          .split('/')
          .slice(0, entry.kind === 'directory' ? -2 : -1)
          .join('/') || '/';
      const parentDir = await getDirectoryHandleByPath(parentPath);
      if (!parentDir) throw new Error('无法访问父目录');

      await renameOpfsEntry(parentDir, entry.name, newName, entry.kind);
      await readDirectory(currentPath.value);
      return true;
    } catch (err) {
      error.value = `重命名失败: ${err instanceof Error ? err.message : String(err)}`;
      return false;
    }
  }

  async function previewFile(entry: OPFSFileEntry): Promise<{ data: Blob | string; type: string } | null> {
    try {
      if (entry.kind !== 'file') return null;

      let fileHandle = entry.handle as FileSystemFileHandle;
      let file: globalThis.File;

      try {
        file = await fileHandle.getFile();
      } catch {
        const pathParts = entry.path.split('/').filter(Boolean);
        if (pathParts.length === 0) throw new Error('无效的文件路径');
        if (!rootHandle) throw new Error('根目录未初始化');

        let currentDir = rootHandle;
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
      if (FILE_EXTENSIONS.image.has(ext) || FILE_EXTENSIONS.audio.has(ext) || FILE_EXTENSIONS.video.has(ext)) {
        return { data: file, type: file.type || 'application/octet-stream' };
      }

      const text = await file.text();
      return { data: text, type: 'text/plain' };
    } catch (err) {
      error.value = `预览失败: ${err instanceof Error ? err.message : String(err)}`;
      return null;
    }
  }

  async function refresh() {
    await readDirectory(currentPath.value);
  }

  return {
    entries,
    currentPath,
    loading,
    error,
    init,
    navigateTo,
    uploadFile,
    uploadFileWithPath,
    downloadFile,
    deleteEntry,
    createDirectory,
    renameEntry,
    previewFile,
    refresh,
    reset
  };
}
