import type { RxDB } from '@aiao/rxdb';
import type { RxDBConnectionStateWriter } from './rxdb-connection-state';

/**
 * 建立本地适配器连接。**失败不向上抛。**
 *
 * @param database - RxDB 实例
 * @param state - 承接失败的应用内状态
 * @param adapterName - 要连的本地适配器名，必须与 `provideRxDB` 用的工厂来自同一次
 *   `selectLocalBackend` 判定（US-210）
 *
 * @remarks
 * TAURI-01：原实现是 `database.connect('wa-sqlite')` 直接返回给
 * `provideAppInitializer` —— initializer 一旦 reject，Angular 会**中止 bootstrap**：
 *
 * - 组件树不渲染 → 窗口全白；
 * - `main.ts` 只有 `.catch(err => console.error(err))`，桌面端连控制台都未必开着；
 * - `home.page.html` 里那块 `@case ('error')` 诊断面板**永远到不了** ——
 *   它恰恰是为这种失败准备的，却被失败本身挡在了门外。
 *
 * 所以连接失败必须降级成**应用内状态**：bootstrap 照常完成，页面渲染出来，
 * 诊断面板第一次真正可达。
 */
export const connectRxDB = async (
  database: Pick<RxDB, 'connect'>,
  state: RxDBConnectionStateWriter,
  adapterName: string
): Promise<void> => {
  try {
    await database.connect(adapterName);
  } catch (error) {
    state.markFailed(error);
  }
};
