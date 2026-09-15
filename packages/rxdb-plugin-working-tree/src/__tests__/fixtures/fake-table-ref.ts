/**
 * @fileoverview 替身用的 {@link TransactionExecutor.tableRef} 实现。
 *
 * @remarks
 * 替身**不冒充任何一个后端的物理命名**：真实后端是 `"rxdb"."rxdb_change"`（PGlite，
 * namespace 建成 schema）或 `"rxdb$rxdb_change"`（SQLite 家族，namespace 拼成表名前缀），
 * 这里只把逻辑表名加上引号。挑其中一种来模仿会让单测看起来在验证物理命名，而实际上只是
 * 在验证这份替身自己 —— 物理命名由 `workingTreeCommitConformanceSuite` 在六个后端上验。
 *
 * 单测该断言的是「这条 CAS 打在 executor 交回来的那个表引用上」，因此断言用
 * `\b<tableName>\b` 这种词边界匹配，三种形态都能通过。
 */

import type { EntityType } from '@aiao/rxdb';
import { getEntityMetadata, quoteSqlIdentifier } from '@aiao/rxdb';

/** 把实体的逻辑表名加引号返回，见本文件 `@fileoverview`。 */
export const fakeTableRef = (EntityType: EntityType): string =>
  quoteSqlIdentifier(getEntityMetadata(EntityType).tableName);
