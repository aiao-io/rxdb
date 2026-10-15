/**
 * @fileoverview 激活态单例行在 SQL 这一侧的共用件：几张断言取数器，外加布景真的执行的那两条语句。
 *
 * @remarks
 * 激活态行上有三条各自独立的写路径——切换 CAS（`bumpActivationRevision`）、切换内部的
 * 无条件推进（`advanceActivationRevision`）、代际发放（`allocateBranchGeneration`）——
 * 它们分住两个 spec 文件，而三条要钉的性质是同一组：**加法在库里做、WHERE 只钉常量主键、
 * 发语句之前不自读**。取数器留在各自文件里的话，第三条写路径落地时最省事的做法就是
 * 再抄一份，而抄错的那一份只会让断言变松（比如漏掉 `\b` 词边界，于是任何表上的 UPDATE
 * 都算数），不会让用例变红。
 *
 * 入参收的是 `statements` / `finds` 这两个数组本身，不收场景对象：两个 spec 的场景类型
 * 不同（`WorkingTreeScene` 与本地的 `Scene`），收场景就得把取数器做成泛型，或者让两个
 * 场景类型互相认识——而它们唯一的共同点只是「都带一份探针记录」。
 *
 * {@link runBranchGenerationSql} 那一组是另一回事：它们不取数，它们**改行、答行**。代际发放
 * 把加法交给了库、又从库里把号读回来（`activation-state.ts`），而各家替身都不执行 SQL，
 * 于是每个建分支的布景都得自己把这两格补上。补法散在各处的话，补松的那一份（比如不看 SET
 * 就直接 `seq += 1`，或者不管来的是哪条 SELECT 都答一个号）会让实现退回读—改—写、或者退回
 * 「读回来那一次走仓库」时用例照常绿，而那两处正是这两条语句存在的唯一理由。
 */

import type { EntityType } from '@aiao/rxdb';
import { getEntityColumnName, getEntityMetadata, quoteSqlIdentifier, sqlStringLiteral } from '@aiao/rxdb';
import {
  WORKING_TREE_ACTIVATION_STATE_ID,
  WorkingTreeActivationState
} from '../../../working-tree/working-tree-activation-state.entity.js';
import type { ProbeFindCall } from '../../commit/fixtures/commit-graph-probe.js';
import { normalizeSql, setClauseOf, whereClauseOf } from '../../commit/fixtures/commit-graph-probe.js';

const ACTIVATION = getEntityMetadata(WorkingTreeActivationState);

/**
 * 取激活态表某个字段在语句里的真实写法（加引号后小写，便于与归一化后的 SQL 比）。
 *
 * @param field - 实体字段名
 * @returns 已加引号并小写的列名
 *
 * @remarks
 * 带引号取，因为本仓所有手拼 SQL 的模块都经 `quoteSqlIdentifier()` 写列名
 * （`working-tree-state-sql.ts` / `commit-capability.ts` / `write-commit.ts` / `restore-session-transitions.ts`）：
 * 裸名比对会把「按约定加引号」判成不合格，而那条约定正是列名撞上保留字那天唯一的保护。
 */
export const activationColumn = (field: string): string => {
  const columnName = getEntityColumnName(ACTIVATION, field);
  if (!columnName) throw new Error(`WorkingTreeActivationState 元数据里没有 '${field}' 对应的列`);
  return quoteSqlIdentifier(columnName).toLowerCase();
};

/**
 * 这条语句是不是打在激活态表上的——不分读写。
 *
 * @param sql - 一条原始语句
 * @returns 是则 `true`
 *
 * @remarks
 * 给「把激活态那些语句从别的语句里摘出去」用：建分支的路径上现在恒有**两条**代际发放语句
 * （就地 +1 与读回来，见 `activation-state.ts`），而那几条守「这条路上只发了一条 HEAD CAS」
 * 的用例数的不是它们。按 {@link isActivationUpdate} 摘的话只摘得掉前一条，剩下那条 SELECT
 * 会被当成 HEAD 语句数进去。
 */
export const isActivationStatement = (sql: string): boolean =>
  new RegExp(`\\b${ACTIVATION.tableName}\\b`).test(normalizeSql(sql));

/**
 * 这条语句是不是打在激活态表上的 UPDATE。
 *
 * @param sql - 一条原始语句
 * @returns 是则 `true`
 *
 * @remarks
 * 只认写的那些。要连读一起摘干净，用 {@link isActivationStatement}。
 */
export const isActivationUpdate = (sql: string): boolean =>
  normalizeSql(sql).startsWith('update') && isActivationStatement(sql);

/**
 * 从探针记下的语句里挑出打在激活态表上的 UPDATE，按发出顺序。
 *
 * @param statements - 探针的 `statements`
 * @returns 归一化（压空白、转小写）之后的语句
 *
 * @remarks
 * 表名用 `\b` 词边界匹配而不是 `includes`：替身的 `tableRef()` 只加引号，真实后端却是
 * `"rxdb"."rxdb_working_tree_activation"`（PGlite）或 `"rxdb$rxdb_working_tree_activation"`
 * （SQLite 家族），三种形态都要认得出来，同时又不能把别的表连带认进来。
 */
export const activationUpdatesOf = (statements: readonly string[]): string[] =>
  statements.filter(isActivationUpdate).map(normalizeSql);

/**
 * 数一数这一趟在激活态表上发过多少次 `find()`。
 *
 * @param finds - 探针的 `finds`
 * @returns 命中次数
 */
export const activationFindCountOf = (finds: readonly ProbeFindCall[]): number =>
  finds.filter(call => call.entity === ACTIVATION.name).length;

/**
 * 认不认得这条语句就是 `allocateBranchGeneration` 发的那一条「代际就地 +1」。
 *
 * @param sql - 一条原始语句
 * @returns 形状完全吻合才为 `true`
 *
 * @remarks
 * SET 与 WHERE 两段都按**全等**比，不用 `includes`：布景照着这条语句去改行，比松了就等于
 * 替实现的另一种写法（比如把加法搬回 JS、或者往 WHERE 里再钉一个自读来的期望值）也把行改对，
 * 于是下游那几个建分支的用例在实现退回读—改—写之后依然是绿的。
 */
const isBranchGenerationAdvance = (sql: string): boolean => {
  if (!isActivationUpdate(sql)) return false;
  const update = normalizeSql(sql);
  const seq = activationColumn('branchGenerationSeq');
  const pinnedId = `${activationColumn('id')} = ${sqlStringLiteral(WORKING_TREE_ACTIVATION_STATE_ID)}`.toLowerCase();
  return setClauseOf(update).trim() === `${seq} = ${seq} + 1` && whereClauseOf(update).trim() === pinnedId;
};

/**
 * 替布景执行那条「代际就地 +1」，并交回它命中的行数。
 *
 * @param sql - `executor.query()` 收到的原始语句
 * @param rowsOf - 按实体取当前行的访问器（探针的 `rowsOf`，或布景自己那一小撮行）
 * @returns 实际改动的行数；语句不是这一条时为 0
 *
 * @remarks
 * 这是**唯一**一条被布景执行的语句。之所以非执行不可：`allocateBranchGeneration` 把那一步
 * 加法交给了库（`SET seq = seq + 1`，见 `activation-state.ts`），而替身不执行 SQL——不补这一下，
 * 单调源在布景里永远停在原地，可下游断言的正是「它往前走了一格」。
 *
 * 返回行数而不是 `void`，是为了让布景能拿它当 `rowsAffected` 交回去：**改了几行**与
 * **报了几行**是同一件事，两者各说各的时，一个「行根本不在、却报命中 1 行」的布景就能把
 * `rowsAffected !== 1` 那条守卫整个绕过去。
 */
export const applyBranchGenerationAdvance = (sql: string, rowsOf: (EntityClass: EntityType) => object[]): number => {
  if (!isBranchGenerationAdvance(sql)) return 0;
  const hits = (rowsOf(WorkingTreeActivationState) as WorkingTreeActivationState[]).filter(
    row => row.id === WORKING_TREE_ACTIVATION_STATE_ID
  );
  for (const row of hits) row.branchGenerationSeq += 1;
  return hits.length;
};

/**
 * 认不认得这条语句就是 `allocateBranchGeneration` 发的那一条「把刚发放到的号读回来」。
 *
 * @param sql - 一条原始语句
 * @returns 形状完全吻合才为 `true`
 *
 * @remarks
 * 取的那一列与 WHERE 两段都按**全等**比，理由与 {@link isBranchGenerationAdvance} 同源，
 * 另加一条只属于读回来这一步的：实现那边按**位置**取值（`rows[0][0]`），所以
 * `SELECT *` 之类多取几列的写法交回来的第一格根本不是代际号。比松了就等于替那种写法
 * 也把数答对，而它在真实后端上换来的是一个字符串主键被当成代际落进 `CommitBranchRef`。
 */
const isBranchGenerationRead = (sql: string): boolean => {
  if (!isActivationStatement(sql)) return false;
  const select = normalizeSql(sql);
  const pinnedId = `${activationColumn('id')} = ${sqlStringLiteral(WORKING_TREE_ACTIVATION_STATE_ID)}`.toLowerCase();
  return (
    select.startsWith(`select ${activationColumn('branchGenerationSeq')} from `) &&
    whereClauseOf(select).trim() === pinnedId
  );
};

/**
 * 替布景回答那条「把刚发放到的号读回来」，交出的是它在库里现在的值。
 *
 * @param sql - `executor.query()` 收到的原始语句
 * @param rowsOf - 按实体取当前行的访问器（探针的 `rowsOf`，或布景自己那一小撮行）
 * @returns 位置化的结果行；语句不是这一条时为空数组
 *
 * @remarks
 * 命中几行就答几行，不替实现收敛成一行：`readSingleGeneration` 的行数守卫（`activation-state.ts`）
 * 挡的正是「单例行上读回来两行」这种现场，布景先把它抹平的话那道守卫就再也测不到了。
 *
 * 交的是行**当前**的值，不是「+1 之后应该是几」：布景把加法记在
 * {@link applyBranchGenerationAdvance} 里，这里再补一次就成了两处各自算一遍，
 * 而实现那边压根没有「算」这一步——它只是把库里的数取出来。
 */
export const readBranchGenerationRows = (sql: string, rowsOf: (EntityClass: EntityType) => object[]): unknown[][] => {
  if (!isBranchGenerationRead(sql)) return [];
  return (rowsOf(WorkingTreeActivationState) as WorkingTreeActivationState[])
    .filter(row => row.id === WORKING_TREE_ACTIVATION_STATE_ID)
    .map(row => [row.branchGenerationSeq]);
};

/**
 * 替布景把代际发放那两条语句都执行了，交回这一条读到的行。
 *
 * @param sql - `executor.query()` 收到的原始语句
 * @param rowsOf - 按实体取当前行的访问器
 * @returns 位置化的结果行；来的不是读回来那条时为空数组
 *
 * @remarks
 * 形状是照着 `commit-graph-probe.ts` › `onQuery` 来的，好让建分支的布景一句话挂上去：
 * 两条语句同属一条发放路径，谁只挂了其中一条，红的都不是「布景没补全」而是实现本身
 * ——这种红要人去读一遍 `activation-state.ts` 才能判断，代价远大于在这里合成一个。
 *
 * 一条语句只可能命中其中一条（一条是 UPDATE，一条是 SELECT），所以这里的先后与结果无关；
 * 写成「先改后读」只是与真实顺序同向。
 */
export const runBranchGenerationSql = (sql: string, rowsOf: (EntityClass: EntityType) => object[]): unknown[][] => {
  applyBranchGenerationAdvance(sql, rowsOf);
  return readBranchGenerationRows(sql, rowsOf);
};
