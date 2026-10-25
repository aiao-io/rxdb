import type { WorktreeTableSet } from '@aiao/rxdb';
import type { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import remove_all_triggers_sql from '../table/remove_trigger_sql.js';
import { executeSwitchStatements } from './execute_switch_statements.js';
import { readCurrentBranchId } from './read_current_branch_id.js';
import { generateBranchTriggerSql } from './switch_branch.js';

/**
 * 在一套表的触发器摘掉的窗口里执行写入：摘 → 跑 `body` → 按那套表持有的分支重挂。
 *
 * @param sink - **当前事务**的适配器门面；摘、写、挂三步必须落在同一事务里
 * @param tableSet - 摘、挂哪一套表的触发器
 * @param body - 窗口内要执行的写入，返回值原样透传
 * @returns `body` 的返回值
 * @throws 原样重抛 `body` 的错误；重挂阶段读不到持有分支时抛 `RxdbAdapterPGliteError`
 *
 * @remarks
 * 用于「把远端副本抄进本地表」的路径：拉取回填与 QueryCache 的缓存写入都不是本地变更，不该进 `rxdb_change`。
 * 与 sqlite-core 的同名函数同口径，但不需要那边「`body` 失败也要重挂」的收尾：PostgreSQL 的 DDL 随事务回滚，
 * `body` 抛错时连同摘掉的触发器一起回到事务开始前，不会提交一个没有触发器的库。
 *
 * 分支 id 必须经**本事务**读（见 `readCurrentBranchId`）：走 `versionManager.getCurrentBranch()` 的话，
 * 外层已开着事务时那次读会重新入队，排在自己身后永久挂起。只重挂这套表的触发器，不碰分支表（US-314 B1.3）：
 * 从前复用切分支的整段 SQL，每批拉取都捎带一条分支表的恒等 UPDATE，挂在可写检出位上时会把检出位持有的分支点亮。
 *
 * 拉取摘的是本实例挂的那套；QueryCache 同步的实体只在主表集，摘的是主表集（US-314 B2.1）。
 */
export const withTriggersDisabled = async <T>(
  sink: RxDBAdapterPGlite,
  tableSet: WorktreeTableSet,
  body: () => Promise<T>
): Promise<T> => {
  const removeTriggers = remove_all_triggers_sql(sink, tableSet);
  if (removeTriggers) await executeSwitchStatements(sink, removeTriggers);

  const value = await body();

  const rebuildTriggers = generateBranchTriggerSql(sink, tableSet, await readCurrentBranchId(sink, tableSet));
  if (rebuildTriggers) await executeSwitchStatements(sink, rebuildTriggers);
  return value;
};
