/**
 * @fileoverview BOM 解析 / 展开所需的最小适配器面
 *
 * 核心包的 `LocalRxDBAdapter`（`IRxDBAdapter & RxDBAdapterLocalBase`）是交叉类型，
 * 带私有成员的类无法跨包结构兼容——wa-sqlite 适配器不继承 `RxDBAdapterLocalBase`，
 * 实测 TS 报 `repository_map` 不兼容。BOM 的读路径只用 `name` / `transaction` /
 * `rawQuery` 三个成员，本接口只声明它们，两个适配器家族都能满足。
 */

import type { TransactionFun } from '@aiao/rxdb';

/** BOM 读路径使用的适配器面（事务 + 直连查询；与 {@link import('@aiao/rxdb').RxDBAdapterLocalBase.transaction} 同签名）。 */
export interface BomLocalAdapter {
  readonly name: string;
  transaction<T extends TransactionFun>(fun: T, transactionLog?: boolean): Promise<Awaited<ReturnType<T>>>;
  rawQuery?(sql: string, params?: unknown[]): Promise<unknown>;
}
