import type { WorkbenchEditorViewport } from '../editor.js';
import type { ExtensionCommand, ExtensionFileBaseline, ExtensionSnapshot } from './extension-protocol.js';

/** 扩展可观察的真实生命周期状态。 */
export type MarkdownExtensionStatus = 'uninstalled' | 'disabled' | 'idle' | 'loading' | 'active' | 'failed';

/** 已启动的真实扩展宿主。 */
export interface MarkdownRuntime {
  sync(snapshot: ExtensionSnapshot): Promise<void>;
  execute(command: string): Promise<void>;
  cursor?(line: number, column: number): Promise<void>;
  viewport?(viewport: WorkbenchEditorViewport): Promise<void>;
  dispose(): void;
}

/** 单个项目宿主独立持有的文档和文件回调。 */
export interface MarkdownRuntimeOptions {
  readonly snapshot: ExtensionSnapshot;
  readonly signal: AbortSignal;
  onEdit(path: string, content: string, baseContent: string | undefined): void;
  onSave(path: string): Promise<void>;
  onWrite(path: string, content: Uint8Array, baseline: ExtensionFileBaseline): Promise<void>;
  onReveal(path: string, line: number): void;
  onScroll?(path: string, line: number): void;
  onClosed?(): void;
  onError(error: unknown): void;
  onCommands(commands: readonly ExtensionCommand[]): void;
}

/** 工作台注入实际面板、文件保存和运行时加载器。 */
export interface MarkdownExtensionOptions {
  readonly enabled: boolean;
  readonly installed: boolean;
  getHost(side: boolean): HTMLElement;
  mount(host: HTMLElement, options: MarkdownRuntimeOptions): Promise<MarkdownRuntime>;
  onEdit(path: string, content: string): void;
  onSave(path: string): Promise<void>;
  onWrite?(path: string, content: Uint8Array): Promise<void>;
  onReveal(path: string, line: number): void;
  onScroll?(path: string, line: number): void;
  onClosed?(): void;
  onError(error: unknown): void;
  onStatus?(status: MarkdownExtensionStatus): void;
}

const declaredCommands: readonly ExtensionCommand[] = [
  {
    id: 'markdown-preview-enhanced.openPreview',
    label: 'Markdown Preview Enhanced: 打开预览',
    keybinding: '⌘ / Ctrl + Shift + V'
  },
  {
    id: 'markdown-preview-enhanced.openPreviewToTheSide',
    label: 'Markdown Preview Enhanced: 打开侧边预览',
    keybinding: '⌘ / Ctrl + K V'
  },
  { id: 'markdown-preview-enhanced.openLockedPreviewToTheSide', label: 'Markdown Preview Enhanced: 打开锁定的侧边预览' }
];

/** Markdown 文档识别与编辑器引擎无关。 */
export function isMarkdownPath(path: string | null | undefined): boolean {
  return typeof path === 'string' && /\.(md|markdown|mdown|mkd|mdx)$/i.test(path);
}

/** 管理正式插件宿主，项目切换后拒绝所有迟到的文件事件。 */
export function createMarkdownExtension(options: MarkdownExtensionOptions) {
  let installed = options.installed;
  let enabled = installed && options.enabled;
  let status: MarkdownExtensionStatus =
    !installed ? 'uninstalled'
    : enabled ? 'idle'
    : 'disabled';
  let snapshot: ExtensionSnapshot | undefined;
  let runtime: MarkdownRuntime | undefined;
  let loading: Promise<MarkdownRuntime> | undefined;
  let lifetime: AbortController | undefined;
  let generation = 0;
  let disposed = false;
  let viewport: WorkbenchEditorViewport | undefined;
  let cursor: { line: number; column: number } | undefined;
  let commands = declaredCommands;

  function updateStatus(next: MarkdownExtensionStatus): void {
    status = next;
    options.onStatus?.(next);
  }
  function stop(): void {
    generation++;
    lifetime?.abort();
    runtime?.dispose();
    runtime = undefined;
    loading = undefined;
    commands = declaredCommands;
    updateStatus(
      !installed ? 'uninstalled'
      : enabled ? 'idle'
      : 'disabled'
    );
  }
  function sync(next: ExtensionSnapshot): void {
    if (disposed) return;
    if (snapshot && snapshot.projectId !== next.projectId) stop();
    if (snapshot?.projectId !== next.projectId || snapshot?.activePath !== next.activePath) {
      cursor = undefined;
      viewport = undefined;
    }
    snapshot = next;
    if (runtime) void runtime.sync(next).catch(options.onError);
  }
  async function execute(command: string): Promise<void> {
    if (disposed) throw new Error('Markdown 扩展已经释放');
    if (!installed) throw new Error('Markdown Preview Enhanced 未安装，请先安装扩展');
    if (!enabled) throw new Error('Markdown Preview Enhanced 已禁用，请先启用扩展');
    if (!snapshot || !isMarkdownPath(snapshot.activePath)) throw new Error('请先打开一个 Markdown 文件');
    const ticket = generation;
    const initial = snapshot;
    if (runtime && declaredCommands.some(entry => entry.id === command)) options.getHost(command.endsWith('ToTheSide'));
    if (!loading) {
      updateStatus('loading');
      lifetime = new AbortController();
      const current = () => !disposed && ticket === generation;
      const assertCurrent = () => {
        if (!current()) throw new Error('项目已切换或扩展已禁用');
      };
      loading = options
        .mount(options.getHost(command.endsWith('ToTheSide')), {
          snapshot: initial,
          signal: lifetime.signal,
          onEdit: (path, content, baseContent) => {
            if (!current()) return;
            if (snapshot?.files[path] === baseContent) {
              options.onEdit(path, content);
              return;
            }
            options.onError(new Error(`插件修改已过期，保留当前草稿：${path}`));
            if (runtime && snapshot) void runtime.sync(snapshot).catch(options.onError);
          },
          onSave: async path => {
            assertCurrent();
            await options.onSave(path);
          },
          onWrite: async (path, content, baseline) => {
            assertCurrent();
            const same = (left: string | Uint8Array | undefined, right: string | Uint8Array | undefined) =>
              left === right ||
              (left instanceof Uint8Array &&
                right instanceof Uint8Array &&
                left.length === right.length &&
                left.every((byte, index) => byte === right[index]));
            if (!same(snapshot?.files[path], baseline.draft) || !same(snapshot?.savedFiles[path], baseline.saved))
              throw new Error(`插件保存已过期，保留当前文件：${path}`);
            if (!options.onWrite) throw new Error('工作台未接入扩展文件写入');
            await options.onWrite(path, content);
          },
          onReveal: (path, line) => {
            if (current()) options.onReveal(path, line);
          },
          onScroll: (path, line) => {
            if (current()) options.onScroll?.(path, line);
          },
          onClosed: () => {
            if (current()) {
              stop();
              options.onClosed?.();
            }
          },
          onError: error => {
            if (current()) options.onError(error);
          },
          onCommands: next => {
            if (current()) commands = next;
          }
        })
        .then(async next => {
          if (!current()) {
            next.dispose();
            throw new Error('项目已切换或扩展已禁用');
          }
          runtime = next;
          if (snapshot !== initial && snapshot) await runtime.sync(snapshot);
          if (cursor) await runtime.cursor?.(cursor.line, cursor.column);
          if (viewport) await runtime.viewport?.(viewport);
          updateStatus('active');
          return next;
        })
        .catch(error => {
          if (current()) {
            loading = undefined;
            runtime?.dispose();
            runtime = undefined;
            updateStatus('failed');
          }
          throw error;
        });
    }
    const active = await loading;
    if (disposed || generation !== ticket) throw new Error('项目已切换或扩展已禁用');
    await active.execute(command);
  }
  return {
    get status() {
      return status;
    },
    get installed() {
      return installed;
    },
    get enabled() {
      return enabled;
    },
    get commands(): readonly ExtensionCommand[] {
      return enabled ? commands : [];
    },
    sync,
    execute,
    cursor(line: number, column: number): void {
      cursor = { line, column };
      void runtime?.cursor?.(line, column).catch(options.onError);
    },
    viewport(value: WorkbenchEditorViewport): void {
      viewport = value;
      void runtime?.viewport?.(value).catch(options.onError);
    },
    setInstallation(next: { installed: boolean; enabled: boolean }): void {
      if (disposed || (installed === next.installed && enabled === (next.installed && next.enabled))) return;
      installed = next.installed;
      enabled = installed && next.enabled;
      stop();
    },
    setEnabled(value: boolean): void {
      if (enabled === value || disposed || !installed) return;
      enabled = value;
      stop();
    },
    closePreview: stop,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      stop();
    }
  };
}
