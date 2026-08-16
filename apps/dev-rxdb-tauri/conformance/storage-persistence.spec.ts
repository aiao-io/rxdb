/**
 * 文件内容跨宿主进程与跨目录搬迁的持久性（US-505 AC#1 / AC#3）。
 *
 * @remarks
 * 一致性套件（`storage-parity.spec.ts`）每条用例都在自己的临时目录里从零开始，因此它
 * 证明的是「行为一致」，**不是**「数据留得住」——所有用例即使换成一个纯内存后端也照样全绿。
 * 这里补的正是那一半：字节要在**宿主进程死掉之后**还躺在磁盘上。
 *
 * 与 AC#1 / AC#3 的差距只剩「打包应用」这一层：本文件杀的是 stdio 宿主进程，不是一个
 * 装好的 .app / .exe，所以窗口生命周期、单实例锁、安装包布局都没被覆盖。沿用 US-210 的
 * 尺度，据此把两条 AC 标 ⚠️ 而不是 ✅。
 *
 * @vitest-environment happy-dom
 */

import { DESKTOP_ADAPTER_NAME } from '@aiao/rxdb-adapter-desktop';
import type { StorageFilesystem } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createRustHostTransport } from './rust-host-transport.js';

/** 与 `src-tauri/src/rxdb/paths.rs` 的 `STORAGE_DIRECTORY` 逐字相同。 */
const STORAGE_DIRECTORY = 'rxdb-files';

/** 与 `src/app/setup_rxdb_desktop.ts` 的 `DESKTOP_STORAGE_ROOT_DIR` 逐字相同。 */
const ROOT_DIR = 'files';

/** 用得上「重启后还在」的素材：内容按下标推出来，肉眼也能看出错位。 */
const CONTENT = new Uint8Array(4096).map((_, index) => (index * 31 + 7) & 0xff);

/**
 * 起一个宿主进程并交出装配好的文件系统；`quit` 直接杀进程。
 *
 * @remarks
 * 刻意**不**先 `filesystem.dispose()` 走优雅关闭：用户退出应用时没人替他把会话关干净，
 * 而「优雅关闭之后数据还在」比「进程被砍掉之后数据还在」弱一档，正好弱在这条 AC 要的地方。
 */
const openHost = (root: string): { filesystem: StorageFilesystem; quit: () => void } => {
  const host = createRustHostTransport(root);
  const filesystem = createDesktopStorageFilesystem({ transport: host.transport })(ROOT_DIR, {
    localAdapterName: DESKTOP_ADAPTER_NAME
  });
  return { filesystem, quit: () => host.process.stop() };
};

/** 递归收集目录下所有**普通文件**的绝对路径。 */
const collectFiles = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(path)));
    else files.push(path);
  }
  return files;
};

const workspaces: string[] = [];

/** 建一个自动回收的临时工作区。 */
const createWorkspace = async (): Promise<string> => {
  const workspace = await mkdtemp(join(tmpdir(), 'rxdb-tauri-persist-'));
  workspaces.push(workspace);
  return workspace;
};

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map(workspace => rm(workspace, { recursive: true, force: true })));
});

describe('Rust 文件宿主的持久性', () => {
  /**
   * US-505 AC#1：宿主进程换了一个，字节还在。
   *
   * @remarks
   * 顺带钉住「内容确实是应用数据目录里的一个原生文件」——把磁盘上那份读出来逐字节比对。
   * 少了这一步，一个把内容藏在别处（webview 存储、内存、宿主自己的边车库）的实现同样能
   * 让上面的读回断言过关，而那恰恰是本故事要否掉的形态。
   */
  it('写入的字节在宿主进程重启后仍可读回，且落在应用数据目录里的原生文件上', async () => {
    const workspace = await createWorkspace();

    const first = openHost(workspace);
    await first.filesystem.ensureRoot();
    await first.filesystem.ensureDirectory('notes');
    const writer = await first.filesystem.openWrite('notes/a.bin');
    await writer.write(CONTENT);
    await writer.close();
    first.quit();

    const onDisk = await collectFiles(join(workspace, STORAGE_DIRECTORY));
    expect(onDisk).toHaveLength(1);
    expect(new Uint8Array(await readFile(onDisk[0]))).toEqual(CONTENT);

    const second = openHost(workspace);
    const blob = await second.filesystem.readBlob('notes/a.bin');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(CONTENT);
    second.quit();
  });

  /**
   * US-505 AC#3：整个应用数据目录拷到新位置后，结构与字节都完整。
   *
   * @remarks
   * 拷的是 `<workspace>` 整棵树——US-210 的 `rxdb-data/` 与本故事的 `rxdb-files/` 并列其中，
   * 「同一个备份域」这句话的全部含义就是这一次 `cp -r` 能同时带走两者。
   */
  it('整个数据目录拷到新位置后，目录结构与文件字节都完整', async () => {
    const source = await createWorkspace();

    const origin = openHost(source);
    await origin.filesystem.ensureRoot();
    await origin.filesystem.ensureDirectory('notes/deep');
    for (const path of ['notes/a.bin', 'notes/deep/b.bin']) {
      const writer = await origin.filesystem.openWrite(path);
      await writer.write(CONTENT);
      await writer.close();
    }
    origin.quit();

    const destination = join(await createWorkspace(), 'restored');
    await cp(source, destination, { recursive: true });

    const restored = openHost(destination);
    const listed: string[] = [];
    for await (const entry of restored.filesystem.list('notes')) listed.push(`${entry.kind}:${entry.name}`);
    expect(listed.sort()).toEqual(['directory:deep', 'file:a.bin']);

    for (const path of ['notes/a.bin', 'notes/deep/b.bin']) {
      const blob = await restored.filesystem.readBlob(path);
      expect(new Uint8Array(await blob.arrayBuffer()), path).toEqual(CONTENT);
    }
    restored.quit();
  });
});
