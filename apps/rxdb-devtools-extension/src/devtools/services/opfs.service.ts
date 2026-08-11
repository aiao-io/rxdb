import { inject, Injectable, signal } from '@angular/core';
import { MAX_OPFS_UPLOAD_BYTES, withOpfsRequestId, type OpfsRequest, type OpfsResponse } from '../../content/opfs';
import { bytesToBase64, normalizePath } from '../../shared/utils';
import { ToastService } from '../components/toast.component';
import type { OpfsErrorKind, OPFSFile } from '../types/devtools.types';

interface DirectoryEntry {
  name: string;
  kind: 'file' | 'directory';
  size?: number;
  type?: string;
  lastModified?: number;
  relativePath: string;
  entries?: Record<string, DirectoryEntry>;
}

const UPLOAD_CHUNK_BYTES = 256 * 1024;

/**
 * OPFS 文件系统服务
 * 直接使用 chrome.tabs.sendMessage 与 opfs-content.ts 通信
 */
@Injectable({ providedIn: 'root' })
export class OpfsService {
  private readonly toastService = inject(ToastService);
  private requestSequence = 0;
  private uploadSequence = 0;

  /** 当前路径 */
  readonly currentPath = signal('/');

  /** 文件列表 */
  readonly files = signal<OPFSFile[]>([]);

  /** 加载状态 */
  readonly loading = signal(false);

  /** 错误信息 */
  readonly error = signal<string | null>(null);

  /**
   * 当前错误的**结构化判别位**。
   *
   * @remarks
   * P1-5：UI 早先靠 `error()?.includes('刷新')` 选分支，
   * 而那串中文又是从 Chrome 的英文错误文案（`Could not establish connection` /
   * `message channel closed`）匹配出来的 —— 三段字符串串在一起，
   * 任何一环改字（含 i18n、Chrome 升级改文案）都会**静默**改掉 UI 行为且没有任何测试会红。
   * 文案继续留给 `error`，分支判定一律用这个。
   */
  readonly errorKind = signal<OpfsErrorKind | null>(null);

  /** 视图模式 */
  readonly viewMode = signal<'list' | 'grid'>('list');

  /**
   * 导航到目录
   */
  navigateTo(path: string): void {
    this.currentPath.set(path);
    this.refresh();
  }

  /**
   * 刷新文件列表
   */
  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.errorKind.set(null);

    try {
      const response = await this.sendToContentScript({ message: 'getDirectoryStructure' });

      if (!response?.['structure']) {
        throw new Error('无法获取 OPFS 数据');
      }

      // 解析结构
      const files = this.parseDirectory(response['structure'] as Record<string, DirectoryEntry>, this.currentPath());
      this.files.set(files);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 文案匹配只在**这一处**发生，且结果立刻被翻译成结构化 kind
      const kind: OpfsErrorKind =
        message.includes('Could not establish connection') || message.includes('message channel closed') ?
          'content-script-unavailable'
        : 'unknown';
      this.errorKind.set(kind);
      this.error.set(
        kind === 'content-script-unavailable' ? '请刷新被检查的页面以加载 OPFS 管理功能' : `OPFS 错误: ${message}`
      );
      this.toastService.error(this.error() ?? 'OPFS 错误');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * 切换视图模式
   */
  toggleViewMode(): void {
    this.viewMode.update(mode => (mode === 'list' ? 'grid' : 'list'));
  }

  /**
   * 下载文件
   */
  async download(file: OPFSFile): Promise<void> {
    try {
      const response = await this.sendToContentScript({
        message: 'downloadFile',
        data: {
          relativePath: normalizePath(file.path),
          fileName: file.name
        }
      });

      if (response?.['error']) {
        throw new Error(response['error'] as string);
      }

      this.toastService.success('文件下载成功');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.toastService.error(`下载失败: ${message}`);
    }
  }

  /**
   * 删除文件或目录
   */
  async delete(file: OPFSFile): Promise<void> {
    try {
      const message = file.type === 'directory' ? 'deleteDirectory' : 'deleteFile';
      const response = await this.sendToContentScript({
        message,
        data: { path: normalizePath(file.path) }
      });

      if (response?.['error']) {
        throw new Error(response['error'] as string);
      }

      this.toastService.success('删除成功');
      await this.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.toastService.error(`删除失败: ${msg}`);
    }
  }

  /**
   * 上传文件
   */
  async upload(file: File): Promise<boolean> {
    const uploadId = `${chrome.devtools.inspectedWindow.tabId}:upload:${++this.uploadSequence}`;
    let started = false;
    try {
      if (file.size > MAX_OPFS_UPLOAD_BYTES) {
        throw new Error(`文件超过 50MB 上限: ${file.name}`);
      }

      const start = await this.sendToContentScript({
        message: 'uploadStart',
        data: {
          uploadId,
          path: this.currentPath(),
          fileName: file.name,
          totalBytes: file.size
        }
      });
      if (start.error) throw new Error(start.error);
      started = true;

      for (let offset = 0; offset < file.size; offset += UPLOAD_CHUNK_BYTES) {
        const bytes = new Uint8Array(await file.slice(offset, offset + UPLOAD_CHUNK_BYTES).arrayBuffer());
        const chunk = await this.sendToContentScript({
          message: 'uploadChunk',
          data: { uploadId, fileData: bytesToBase64(bytes) }
        });
        if (chunk.error) throw new Error(chunk.error);
      }

      const complete = await this.sendToContentScript({ message: 'uploadComplete', data: { uploadId } });
      if (complete.error) throw new Error(complete.error);

      this.toastService.success(`上传成功: ${file.name}`);
      await this.refresh();
      return true;
    } catch (err) {
      if (started) {
        await this.sendToContentScript({ message: 'uploadAbort', data: { uploadId } }).catch(() => undefined);
      }
      const message = err instanceof Error ? err.message : String(err);
      this.toastService.error(`上传失败: ${message}`);
      return false;
    }
  }

  /**
   * 创建目录
   */
  async createDirectory(name: string): Promise<boolean> {
    try {
      const response = await this.sendToContentScript({
        message: 'createDirectory',
        data: {
          path: this.currentPath(),
          dirName: name
        }
      });

      if (response?.['result'] === 'ok') {
        this.toastService.success(`创建成功: ${name}`);
        await this.refresh();
        return true;
      } else {
        throw new Error((response?.['error'] as string) || '创建失败');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.toastService.error(`创建失败: ${message}`);
      return false;
    }
  }

  /**
   * 发送消息到 content script (opfs-content.ts)
   */
  private sendToContentScript(message: Omit<OpfsRequest, 'requestId'>): Promise<OpfsResponse> {
    return withOpfsRequestId(
      message,
      request => chrome.tabs.sendMessage(chrome.devtools.inspectedWindow.tabId, request) as Promise<OpfsResponse>,
      () => `${chrome.devtools.inspectedWindow.tabId}:${++this.requestSequence}`
    );
  }

  /**
   * 解析目录结构，获取指定路径下的文件列表
   */
  private parseDirectory(structure: Record<string, DirectoryEntry>, targetPath: string): OPFSFile[] {
    const targetEntries = this.findEntriesAtPath(structure['.']?.entries ?? {}, targetPath);
    if (!targetEntries) return [];

    const files: OPFSFile[] = [];
    for (const [name, entry] of Object.entries(targetEntries)) {
      if (entry && typeof entry === 'object') {
        files.push({
          name,
          path: targetPath === '/' ? `/${name}` : `${targetPath}/${name}`,
          type: entry.kind,
          size: entry.size,
          lastModified: entry.lastModified
        });
      }
    }

    // 目录在前，文件在后，同类按名称排序
    files.sort((a, b) =>
      a.type !== b.type ?
        a.type === 'directory' ?
          -1
        : 1
      : a.name.localeCompare(b.name)
    );
    return files;
  }

  /**
   * 按路径段逐级深入，返回目标目录的子条目
   */
  private findEntriesAtPath(
    entries: Record<string, DirectoryEntry>,
    targetPath: string
  ): Record<string, DirectoryEntry> | null {
    const segments = targetPath.split('/').filter(Boolean);
    let current = entries;
    for (const segment of segments) {
      const entry = current[segment];
      if (entry?.kind !== 'directory' || !entry.entries) return null;
      current = entry.entries;
    }
    return current;
  }
}
