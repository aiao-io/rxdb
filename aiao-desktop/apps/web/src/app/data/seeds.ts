import type { RxDB, TransactionExecutor } from '@aiao/rxdb';

/**
 * 一个数据域的初始数据：首次打开时在一个事务里写入，和种子标记（`seed:<domain>`）一起提交，
 * 所以要么完整写入、要么什么都没写。之后用户的增删改都保留，不再重写。
 */
export interface DataSeed {
  readonly domain: string;
  /** 改了初始数据时递增；只影响新库，已有库不会被覆盖。 */
  readonly version: number;
  /** 只能经 `executor.getRepository(…)` 写入；实体用 `rxdb.entityManager.instantiate` 创建。 */
  run(executor: TransactionExecutor, rxdb: RxDB): Promise<void>;
}

/** 各内置应用的初始数据（每个应用一行）。磁盘的初始内容带文件体，由 FileSystem 单独写入。 */
export const DATA_SEEDS: readonly DataSeed[] = [];
