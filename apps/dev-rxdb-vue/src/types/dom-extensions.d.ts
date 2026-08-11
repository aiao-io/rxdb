// 浏览器 File System Access API 与 Chromium 私有扩展：
// 这些 API 尚未进入 TS 标准 DOM lib，单独声明避免在调用点用 `as any`。
//
// ⚠️ 同步要求：此文件在 `apps/dev-rxdb-react/src/types/dom-extensions.d.ts` 有镜像副本，
// 必须逐字符一致。改动此处务必同步另一处；若以后有第 3 个 app 复制再次出现，
// 应当抽到 `packages/utils` 或新建 `modules/dom-types` 共享 module。

declare global {
  /** Chromium 86+：原生保存对话框。 */
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      types?: Array<{ description?: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle>;
  }

  /**
   * Chromium-only AsyncIterable 接口，标准 DOM lib 尚未声明。
   * `FileSystemDirectoryHandle.entries()` 返回名称-句柄对。
   */
  interface FileSystemDirectoryHandle {
    entries?(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
  }
}

export {};
