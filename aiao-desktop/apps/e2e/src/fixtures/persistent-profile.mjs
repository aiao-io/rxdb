import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { engineOf } from './engines.mjs';

/**
 * 可在两次启动之间保留数据的浏览器 profile（ADESK-US-008 的「持久 profile」夹具）。
 * 普通的 `browser.newContext()` 关闭后什么都不留；这个夹具把站点数据（OPFS、IndexedDB、localStorage）
 * 放在一个用户数据目录里，`open()` 可以对同一个目录反复启动。旧库升级验收（ADESK-US-106）靠它跨启动保留旧库。
 *
 * @param {{ engine?: string, headless?: boolean, viewport?: { width: number, height: number }, directory?: string }} [options]
 */
export async function createPersistentProfile({
  engine = 'chromium',
  headless = true,
  viewport = { width: 1440, height: 900 },
  directory
} = {}) {
  const userDataDir = directory ?? (await mkdtemp(join(tmpdir(), 'aiao-desktop-profile-')));
  return {
    userDataDir,
    /** 启动浏览器并返回持久上下文；关闭它才会把数据写盘。 */
    open: () => engineOf(engine).launchPersistentContext(userDataDir, { headless, viewport }),
    /** 删除 profile 目录。 */
    dispose: () => rm(userDataDir, { recursive: true, force: true })
  };
}
