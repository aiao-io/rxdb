/**
 * OPFS 文件管理服务
 * 直接访问浏览器的 OPFS，无需 content script
 */

import { renameOpfsEntry } from '@aiao/utils';
import { Injectable, signal } from '@angular/core';
import { FILE_EXTENSIONS, OPFSFileEntry, PREVIEW_SIZE_LIMIT } from '../utils/opfs-utils';
import { buildOpfsZip } from '../utils/opfs-zip';

export class OpfsDirectoryNotFoundError extends Error {
  constructor(readonly path: string) {
    super(`目录不存在: ${path}`);
    this.name = 'OpfsDirectoryNotFoundError';
  }
}

@Injectable({
  providedIn: 'root'
})
export class OpfsService {
  readonly rootHandle = signal<FileSystemDirectoryHandle | null>(null);
  readonly currentHandle = signal<FileSystemDirectoryHandle | null>(null);
  readonly currentPath = signal<string>('/');
  readonly entries = signal<OPFSFileEntry[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  /**
   * 获取根目录
   */
  async getRootDirectory(): Promise<FileSystemDirectoryHandle | null> {
    try {
      if (!('storage' in navigator) || !('getDirectory' in navigator.storage)) {
        this.error.set('浏览器不支持 OPFS');
        return null;
      }

      const root = await navigator.storage.getDirectory();
      this.rootHandle.set(root);
      this.currentHandle.set(root);
      this.currentPath.set('/');
      return root;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error.set(`获取根目录失败: ${errorMsg}`);
      return null;
    }
  }

  /**
   * 读取目录内容
   */
  async readDirectory(path: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    const items: OPFSFileEntry[] = [];

    try {
      const dirHandle = await this.getDirectoryHandleByPath(path);
      if (!dirHandle) {
        this.entries.set([]);
        this.currentHandle.set(null);
        const error = new OpfsDirectoryNotFoundError(path);
        this.error.set(error.message);
        throw error;
      }
      for await (const [name, handle] of dirHandle.entries()) {
        const entry: OPFSFileEntry = {
          name,
          kind: handle.kind,
          handle,
          path: `${path}${name}${handle.kind === 'directory' ? '/' : ''}`
        };

        if (handle.kind === 'file') {
          const fileHandle = handle as FileSystemFileHandle;
          try {
            const file = await fileHandle.getFile();
            entry.size = file.size;
            entry.type = file.type;
            entry.lastModified = file.lastModified;
          } catch {
            // 忽略无法读取的文件
          }
        }

        items.push(entry);
      }

      // 排序：目录在前，然后按名称排序
      items.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      this.entries.set(items);
      this.currentPath.set(path);
      this.currentHandle.set(dirHandle);
    } catch (err) {
      if (err instanceof OpfsDirectoryNotFoundError) throw err;
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error.set(`读取目录失败: ${errorMsg}`);
      console.error('OPFS read error:', err);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * 导航到指定路径
   */
  async navigateTo(path: string): Promise<void> {
    await this.readDirectory(path);
  }

  /**
   * 上传文件
   */
  async uploadFile(file: File, targetPath?: string): Promise<boolean> {
    try {
      const path = targetPath || this.currentPath();
      const dirHandle = await this.getDirectoryHandleByPath(path);
      if (!dirHandle) {
        throw new Error('无法访问目标目录');
      }

      const fileHandle = await dirHandle.getFileHandle(file.name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();

      // 刷新当前目录
      await this.readDirectory(path);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error.set(`上传失败: ${errorMsg}`);
      console.error('上传错误:', err);
      return false;
    }
  }

  /**
   * 上传文件（支持相对路径，用于文件夹上传）
   */
  async uploadFileWithPath(file: File, relativePath: string): Promise<boolean> {
    try {
      const currentDir = this.currentHandle();
      if (!currentDir) {
        throw new Error('无法访问当前目录');
      }

      // 解析路径：folder/subfolder/file.txt
      const pathParts = relativePath.split('/').filter(Boolean);
      if (pathParts.length === 0) {
        throw new Error('无效的文件路径');
      }

      // 最后一个是文件名，前面的是目录
      const fileName = pathParts[pathParts.length - 1];
      const dirParts = pathParts.slice(0, -1);

      // 递归创建目录结构
      let targetDir = currentDir;
      for (const dirName of dirParts) {
        targetDir = await targetDir.getDirectoryHandle(dirName, { create: true });
      }

      // 在目标目录创建文件
      const fileHandle = await targetDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();

      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error('上传文件失败:', relativePath, errorMsg);
      return false;
    }
  }

  /**
   * 下载文件
   */
  async downloadFile(entry: OPFSFileEntry): Promise<boolean> {
    try {
      if (entry.kind !== 'file') {
        throw new Error('只能下载文件');
      }

      const fileHandle = entry.handle as FileSystemFileHandle;
      const file = await fileHandle.getFile();

      // 使用 File System Access API
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (
            window as Window & {
              showSaveFilePicker: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
            }
          ).showSaveFilePicker({
            suggestedName: entry.name
          });

          const writable = await handle.createWritable();
          await writable.write(file);
          await writable.close();
          return true;
        } catch (err: unknown) {
          const error = err as Error;
          if (error.name === 'AbortError') {
            return false; // 用户取消
          }
          throw err;
        }
      } else {
        // 降级方案：使用传统下载
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
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error.set(`下载失败: ${errorMsg}`);
      console.error('下载文件失败:', err);
      return false;
    }
  }

  /**
   * 批量下载文件为 ZIP
   */
  async downloadFilesAsZip(entries: OPFSFileEntry[]): Promise<{ success: boolean; error?: string }> {
    try {
      const archive = await buildOpfsZip(entries);
      const zipBuffer = new ArrayBuffer(archive.data.byteLength);
      new Uint8Array(zipBuffer).set(archive.data);
      const blob = new Blob([zipBuffer], { type: 'application/zip' });
      const downloaded = await this.downloadBlob(blob, this.getArchiveName());
      return { success: downloaded };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('批量下载异常:', errorMsg);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * 删除文件或目录
   */
  async deleteEntry(entry: OPFSFileEntry): Promise<boolean> {
    try {
      // 直接使用当前目录句柄删除
      const currentDir = this.currentHandle();
      if (!currentDir) {
        throw new Error('无法访问当前目录');
      }

      if (entry.kind === 'file') {
        await currentDir.removeEntry(entry.name);
      } else {
        await currentDir.removeEntry(entry.name, { recursive: true });
      }

      // 刷新当前目录
      await this.readDirectory(this.currentPath());
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error.set(`删除失败: ${errorMsg}`);
      console.error('删除错误:', err);
      return false;
    }
  }

  /**
   * 创建目录
   */
  async createDirectory(name: string, targetPath?: string): Promise<boolean> {
    try {
      const path = targetPath || this.currentPath();
      const dirHandle = await this.getDirectoryHandleByPath(path);
      if (!dirHandle) {
        throw new Error('无法访问目标目录');
      }

      await dirHandle.getDirectoryHandle(name, { create: true });

      // 刷新当前目录
      await this.readDirectory(path);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error.set(`创建目录失败: ${errorMsg}`);
      return false;
    }
  }

  /**
   * 重命名文件或目录
   */
  async renameEntry(entry: OPFSFileEntry, newName: string): Promise<boolean> {
    try {
      const path = entry.path;
      const parentPath =
        path
          .split('/')
          .slice(0, entry.kind === 'directory' ? -2 : -1)
          .join('/') || '/';
      const parentDir = await this.getDirectoryHandleByPath(parentPath);
      if (!parentDir) {
        throw new Error('无法访问父目录');
      }

      await renameOpfsEntry(parentDir, entry.name, newName, entry.kind);

      // 刷新当前目录
      await this.readDirectory(this.currentPath());
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error.set(`重命名失败: ${errorMsg}`);
      console.error('重命名错误:', err);
      return false;
    }
  }

  /**
   * 预览文件内容
   */
  async previewFile(entry: OPFSFileEntry): Promise<{ data: Blob | string; type: string } | null> {
    try {
      if (entry.kind !== 'file') {
        return null;
      }

      // 尝试使用 entry.handle，如果失败则根据路径重新获取
      let fileHandle = entry.handle as FileSystemFileHandle;
      let file: File;

      try {
        file = await fileHandle.getFile();
      } catch {
        // 根据路径重新获取文件句柄
        const pathParts = entry.path.split('/').filter(Boolean);
        if (pathParts.length === 0) {
          throw new Error('无效的文件路径');
        }

        const root = this.rootHandle();
        if (!root) {
          throw new Error('根目录未初始化');
        }

        let currentDir = root;
        const fileName = pathParts[pathParts.length - 1];
        const dirParts = pathParts.slice(0, -1);

        for (const part of dirParts) {
          currentDir = await currentDir.getDirectoryHandle(part);
        }

        fileHandle = await currentDir.getFileHandle(fileName);
        file = await fileHandle.getFile();
      }

      // 限制预览文件大小
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

      // 文本文件
      const text = await file.text();
      return { data: text, type: 'text/plain' };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error.set(`预览失败: ${errorMsg}`);
      return null;
    }
  }

  /**
   * 刷新当前目录
   */
  async refresh(): Promise<void> {
    await this.readDirectory(this.currentPath());
  }

  /**
   * 初始化
   */
  async init(initialPath?: string): Promise<void> {
    const root = await this.getRootDirectory();
    if (root) {
      await this.readDirectory(initialPath || '/');
    }
  }

  private async downloadBlob(blob: Blob, suggestedName: string): Promise<boolean> {
    const windowWithPicker = window as Window & {
      showSaveFilePicker?: (options: { suggestedName: string }) => Promise<FileSystemFileHandle>;
    };

    if (windowWithPicker.showSaveFilePicker) {
      try {
        const saveHandle = await windowWithPicker.showSaveFilePicker({ suggestedName });
        const writable = await saveHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return false;
        }
        throw error;
      }
    }

    const url = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = suggestedName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } finally {
      URL.revokeObjectURL(url);
    }
    return true;
  }

  private getArchiveName(): string {
    const folderName = this.currentPath().split('/').filter(Boolean).pop() || 'opfs';
    return `${folderName}.zip`;
  }

  /**
   * 根据路径获取目录句柄
   */
  private async getDirectoryHandleByPath(path: string): Promise<FileSystemDirectoryHandle | null> {
    // 标准化路径：移除尾部斜杠（除了根路径）
    const normalizedPath = path === '/' ? '/' : path.replace(/\/+$/, '');

    if (normalizedPath === '/' || !normalizedPath) {
      return this.rootHandle();
    }

    const root = this.rootHandle();
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
  }
}
