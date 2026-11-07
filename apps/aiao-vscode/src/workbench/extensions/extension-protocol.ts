import type { WorkbenchEditorViewport } from '../editor.js';
import type { WorkbenchFiles } from '../session.js';

/** 编辑缓冲是扩展文档的唯一上游，文件保存由工作台显式执行。 */
export interface ExtensionSnapshot {
  readonly projectId: string;
  readonly activePath: string | null;
  readonly files: WorkbenchFiles;
  readonly savedFiles: WorkbenchFiles;
}

/** 插件产生文件修改时所基于的草稿和磁盘版本。 */
export interface ExtensionFileBaseline {
  readonly draft: string | Uint8Array | undefined;
  readonly saved: string | Uint8Array | undefined;
}

/** 扩展声明并实际注册的命令。 */
export interface ExtensionCommand {
  readonly id: string;
  readonly label: string;
  readonly keybinding?: string;
}

/** 宿主页面与工作台之间的请求；双方均串行处理编号请求。 */
export type ExtensionRequest =
  | { readonly id: number; readonly type: 'sync'; readonly snapshot: ExtensionSnapshot }
  | { readonly id: number; readonly type: 'execute'; readonly command: string }
  | { readonly id: number; readonly type: 'cursor'; readonly line: number; readonly column: number }
  | { readonly id: number; readonly type: 'viewport'; readonly viewport: WorkbenchEditorViewport };

/** 单次请求的实际执行结果。 */
export interface ExtensionReply {
  readonly type: 'reply';
  readonly id: number;
  readonly error?: string;
}

/** 插件文档和界面事件。 */
export type ExtensionEvent =
  | { readonly type: 'ready'; readonly commands: readonly ExtensionCommand[] }
  | { readonly type: 'error'; readonly message: string }
  | { readonly type: 'edit'; readonly path: string; readonly content: string; readonly baseContent: string | undefined }
  | { readonly type: 'write'; readonly id: number; readonly path: string; readonly content: Uint8Array; readonly baseline: ExtensionFileBaseline }
  | { readonly type: 'reveal'; readonly path: string; readonly line: number }
  | { readonly type: 'scroll'; readonly path: string; readonly line: number }
  | { readonly type: 'closed' };

/** 同源初始化必须来自嵌入此页的直接父窗口。 */
export const EXTENSION_CHANNEL = 'aiao-vscode-extension-host-v1';
