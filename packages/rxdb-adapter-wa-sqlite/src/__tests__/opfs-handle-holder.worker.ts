/// <reference lib="webworker" />

/**
 * US-221 的夹具：对 OPFS 根目录下的一个文件开同步访问句柄并一直持有，收到 `release` 才关。
 *
 * @remarks
 * 不拿 `OPFSCoopSyncVFS` 用的 Web Lock：整页刷新时，上一个页面的 Worker 正在销毁，锁先放、句柄后关，
 * 新页面拿到锁去开句柄就撞上 `NoModificationAllowedError`。这里只占句柄、不占锁，复现的正是那个现场。
 * 与 sqlite-wasm 包里的同名夹具一致：Vite 只认同目录下字面写出的 Worker 入口，跨包引用会被当成普通测试模块。
 */

type HolderCommand = { readonly type: 'hold'; readonly fileName: string } | { readonly type: 'release' };

let held: FileSystemSyncAccessHandle | undefined;

self.onmessage = async (event: MessageEvent<HolderCommand>) => {
  if (event.origin !== '' && event.origin !== self.location.origin) return;
  if (event.data.type === 'hold') {
    const root = await navigator.storage.getDirectory();
    const file = await root.getFileHandle(event.data.fileName, { create: true });
    held = await file.createSyncAccessHandle();
    self.postMessage('held');
    return;
  }
  held?.close();
  held = undefined;
  self.postMessage('released');
};
