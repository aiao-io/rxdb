import { inject, Injectable, signal } from '@angular/core';
import type { DevToolsErrorPayload } from '@aiao/rxdb-devtools';
import { ToastService } from '../components/toast.component';
import { DEVTOOLS_FILE_CHANNEL, type DevToolsFileEntry } from '../transport';
import type { OpfsErrorKind, OPFSFile } from '../types/devtools.types';

/**
 * 会让面板提示「刷新被检查的页面」的错误码。
 *
 * @remarks
 * 这四个码的共同点不是「都是错误」，而是**页面侧此刻不在或不可用**，重试没用、刷新有用：
 * session 关了、协议谈不拢、请求超时、provider 存在但当前不可用。
 * 其余错误（路径非法、目标不存在、命名冲突、超限、无此能力）都是这一次操作本身的问题，
 * 刷新页面不会让它变好，提示刷新只会把用户支到错误的方向。
 */
const REFRESH_HINT_CODES: ReadonlySet<string> = new Set([
  'session_closed',
  'protocol_unsupported',
  'request_timeout',
  'provider_unavailable'
]);

/** 错误码 → 面板文案；缺席的码只展示码本身，不编一句话。 */
const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  invalid_path: '路径非法',
  resource_not_found: '目标不存在',
  resource_conflict: '同名条目已存在',
  permission_denied: '没有访问该路径的权限',
  storage_quota_exceeded: '存储配额不足',
  transfer_size_exceeded: '超过协商的单次传输上限',
  provider_unsupported: '被检查的页面不提供文件能力',
  request_limit_exceeded: '同时进行的请求过多，请稍后重试'
};

function describe(error: DevToolsErrorPayload): string {
  return ERROR_MESSAGES[error.code] ?? error.code;
}

function kindOf(error: DevToolsErrorPayload): OpfsErrorKind {
  return REFRESH_HINT_CODES.has(error.code) ? 'content-script-unavailable' : 'unknown';
}

/** 目录在前、文件在后，同类按名称排序。 */
function compareEntries(a: OPFSFile, b: OPFSFile): number {
  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function toFile(entry: DevToolsFileEntry, parent: string): OPFSFile {
  return {
    name: entry.name,
    path: parent === '/' ? `/${entry.name}` : `${parent}/${entry.name}`,
    type: entry.kind,
    ...(entry.size === undefined ? {} : { size: entry.size }),
    ...(entry.lastModified === undefined ? {} : { lastModified: entry.lastModified })
  };
}

/**
 * OPFS 文件系统服务
 *
 * @remarks
 * 只认 {@link DEVTOOLS_FILE_CHANNEL} 这条平台中立信道，且信道的失败一律是**带码的值**，
 * 不是 `Error`：US-904 阶段 C2 之前这里靠匹配 Chrome 的英文错误文案来判断「要不要提示刷新」，
 * 三段字符串串在一起，任何一环改字都会静默改掉 UI 行为。现在分支只看错误码。
 */
@Injectable({ providedIn: 'root' })
export class OpfsService {
  private readonly toastService = inject(ToastService);
  private readonly fileChannel = inject(DEVTOOLS_FILE_CHANNEL);

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
   * UI 只认这个枚举选分支，文案留给 {@link OpfsService.error}。
   */
  readonly errorKind = signal<OpfsErrorKind | null>(null);

  /** 视图模式 */
  readonly viewMode = signal<'list' | 'grid'>('list');

  /**
   * 导航到目录
   */
  navigateTo(path: string): void {
    this.currentPath.set(path);
    void this.refresh();
  }

  /**
   * 刷新文件列表
   */
  async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.errorKind.set(null);

    const path = this.currentPath();
    const result = await this.fileChannel.list(path);
    if (result.outcome === 'failed') {
      this.files.set([]);
      this.fail(result.error, kind =>
        kind === 'content-script-unavailable' ?
          '请刷新被检查的页面以加载 OPFS 管理功能'
        : `OPFS 错误: ${describe(result.error)}`
      );
      this.loading.set(false);
      return;
    }

    this.files.set(result.value.map(entry => toFile(entry, path)).sort(compareEntries));
    this.loading.set(false);
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
    const result = await this.fileChannel.download(file.path);
    if (result.outcome === 'failed') {
      this.toastService.error(`下载失败: ${describe(result.error)}`);
      return;
    }
    this.toastService.success('文件下载成功');
  }

  /**
   * 删除文件或目录
   */
  async delete(file: OPFSFile): Promise<void> {
    const result = await this.fileChannel.remove(file.path);
    if (result.outcome === 'failed') {
      this.toastService.error(`删除失败: ${describe(result.error)}`);
      return;
    }
    this.toastService.success('删除成功');
    await this.refresh();
  }

  /**
   * 上传文件
   *
   * @remarks
   * 信道只能保证「字节已发出」——冻结的 v2 wire 没有提交回执（见 `DevToolsFileUploadAck`）。
   * 所以这里不把 `'sent'` 直接说成「上传成功」，而是刷新一次目录，**看文件在不在**：
   * 成功是可观测的，猜出来的成功不是。
   */
  async upload(file: File): Promise<boolean> {
    const target = this.currentPath();
    const result = await this.fileChannel.upload(target, file);
    if (result.outcome === 'failed') {
      this.toastService.error(`上传失败: ${describe(result.error)}`);
      return false;
    }

    await this.refresh();
    if (!this.files().some(entry => entry.type === 'file' && entry.name === file.name)) {
      this.toastService.error(`上传未确认: ${file.name}`);
      return false;
    }
    this.toastService.success(`上传成功: ${file.name}`);
    return true;
  }

  /**
   * 创建目录
   */
  async createDirectory(name: string): Promise<boolean> {
    const parent = this.currentPath();
    const result = await this.fileChannel.createDirectory(parent === '/' ? `/${name}` : `${parent}/${name}`);
    if (result.outcome === 'failed') {
      this.toastService.error(`创建失败: ${describe(result.error)}`);
      return false;
    }
    this.toastService.success(`创建成功: ${name}`);
    await this.refresh();
    return true;
  }

  /** 记下结构化 kind 与对应文案，并弹一次 toast。 */
  private fail(error: DevToolsErrorPayload, message: (kind: OpfsErrorKind) => string): void {
    const kind = kindOf(error);
    this.errorKind.set(kind);
    this.error.set(message(kind));
    this.toastService.error(this.error() ?? 'OPFS 错误');
  }
}
