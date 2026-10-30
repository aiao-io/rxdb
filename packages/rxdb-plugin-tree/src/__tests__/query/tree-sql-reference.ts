/**
 * @fileoverview 树查询的 SQL 参照：给合并器用例当「重新执行 SQL」的对照组。
 *
 * @remarks
 * 插件包不依赖任何适配器（反过来是适配器依赖插件的类型），这里拿不到真后端，于是按
 * sqlite-core / PGlite 的 `generate_tree_sql` 在一张内存表上重算同一条递归 CTE：
 *
 * - 基准成员：`entityId` 为空时是 `parentId IS NULL` 的全部根，否则是 `id = entityId` 那一行，
 *   **既不过 where 也不过 level**；
 * - 递归成员：自上一层沿父子关系走一跳（后代往下、祖先往上），**逐跳**过 where 与 level ——
 *   某一跳不匹配就截断在那里，它名下（或上方）的节点即便自身匹配也走不到；
 * - 计数：查全树时是 `count(*)`，指定 `entityId` 时是 `max(count(*) - 1, 0)`，减掉起点自己。
 *
 * 合并器无论走本地增量还是回 SQL，订阅者最后看到的都必须等于此刻在这张表上重跑的结果。
 */
import { EntityType, isEntityMatchWhere, QueryTask } from '@aiao/rxdb';
import { collectEmissions, createHarnessQueryTask } from '@aiao/rxdb/testing';
import { of } from 'rxjs';
import type { TreeQuery } from '../../query/tree-query.interface.js';

/** 与适配器的 `TREE_RECURSION_MAX_DEPTH` 同值：不传 level 时递归的失控保护上限 */
const TREE_RECURSION_MAX_DEPTH = 1000;

/** 树查询的结果：`find*` 是节点列表，`count*` 是计数 */
export type TreeResult<T extends EntityType> = InstanceType<T>[] | number;

const idOf = (row: object): unknown => Reflect.get(row, 'id');
const parentIdOf = (row: object): unknown => Reflect.get(row, 'parentId') ?? null;

/**
 * 在内存表上按 `generate_tree_sql` 的口径执行一次树查询
 *
 * @param rows 表里此刻的全部行
 * @param query 查询类型与选项
 * @returns `find*` 返回 CTE 的全部行，`count*` 返回计数
 */
export const runTreeSql = <T extends EntityType>(
  rows: readonly InstanceType<T>[],
  query: TreeQuery<T>
): TreeResult<T> => {
  const { entityId, where, level } = query.options;
  const findRoot = entityId === null || entityId === undefined;
  const descending = query.type === 'findDescendants' || query.type === 'countDescendants';
  const step = (row: InstanceType<T>): InstanceType<T>[] =>
    rows.filter(other => (descending ? parentIdOf(other) === idOf(row) : idOf(other) === parentIdOf(row)));

  let frontier = rows.filter(row => (findRoot ? parentIdOf(row) === null : idOf(row) === entityId));
  const members = [...frontier];
  for (let depth = 0; frontier.length > 0 && depth < (level ?? TREE_RECURSION_MAX_DEPTH); depth++) {
    frontier = frontier.flatMap(step).filter(row => !where || isEntityMatchWhere(row, where));
    members.push(...frontier);
  }

  if (query.type === 'findDescendants' || query.type === 'findAncestors') return members;
  return findRoot ? members.length : Math.max(members.length - 1, 0);
};

/** 列表按 id 排序后再比：SQL 按层级排序，增量合并按加入次序，成员相同即为同一结果 */
const normalize = <T extends EntityType>(result: TreeResult<T> | undefined): TreeResult<T> | undefined =>
  Array.isArray(result) ? [...result].sort((a, b) => String(idOf(a)).localeCompare(String(idOf(b)))) : result;

/** {@link createTreeSqlScenario} 的返回值 */
export interface TreeSqlScenario<T extends EntityType> {
  /** 内存表：用例先把这次写入落到表上，再把事件交给合并器，与「先提交、后发事件」同序 */
  rows: InstanceType<T>[];
  /** 经真正的 `QueryManager` 造出的查询任务，runner 每次都在内存表上重跑 */
  task: QueryTask<T>;
  /** runner 被执行的次数：首次订阅算一次，之后每多一次就是合并器回了一趟 SQL */
  sqlRuns: () => number;
  /** 订阅者此刻看到的结果（列表已按 id 排序） */
  live: () => TreeResult<T> | undefined;
  /** 此刻在内存表上重跑查询的结果（列表已按 id 排序） */
  sql: () => TreeResult<T> | undefined;
}

/**
 * 起一个以内存表为 SQL 的树查询任务，并订阅它
 *
 * @param entityType 被查询的实体类型
 * @param query 查询类型与选项
 * @param rows 表的初始行
 * @returns 场景句柄，见 {@link TreeSqlScenario}
 */
export const createTreeSqlScenario = <T extends EntityType>(
  entityType: T,
  query: TreeQuery<T>,
  rows: InstanceType<T>[]
): TreeSqlScenario<T> => {
  const table = [...rows];
  let runs = 0;
  const task = createHarnessQueryTask<T, TreeResult<T>>(entityType, {
    ...query,
    runner: () => {
      runs += 1;
      const result = runTreeSql(table, query);
      // 每次查询都交出新行，与真后端一致：合并器就地改结果里的实体时不会顺手改到表
      return of(Array.isArray(result) ? result.map(row => ({ ...row })) : result);
    }
  });
  const emissions = collectEmissions(task);
  return {
    rows: table,
    task: task as unknown as QueryTask<T>,
    sqlRuns: () => runs,
    live: () => normalize(emissions.at(-1)),
    sql: () => normalize(runTreeSql(table, query))
  };
};
