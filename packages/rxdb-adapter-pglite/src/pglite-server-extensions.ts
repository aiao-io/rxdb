/**
 * @fileoverview 适配器按实体元数据装载的 PGlite 服务端扩展（US-030 阶段 C）。
 *
 * 目前只有 `btree_gist`：区间排他（`exclusions`）落成 `EXCLUDE USING gist`，相等列上的 `=`
 * 要靠它提供 GiST 运算符类。只在有实体声明了 `exclusions` 时装载——不用的应用不多拉一个扩展包。
 *
 * 不并进用户的 `extensions`：那份清单进备份兼容性判定（`pgliteBackupExtensions`），
 * 而这里的装载由实体元数据决定——恢复目标声明同样的实体就装同样的扩展，两边自然一致。
 *
 * 本文件刻意不依赖 `@aiao/rxdb`：OPFS 模式的 worker 入口也引用它，worker 包不该把核心拖进去。
 */

import type { Extensions } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

/** 适配器替用户装载的服务端扩展。 */
export interface PGliteServerExtensionRequirements {
  /** 是否装载 `btree_gist`（有实体声明了 `exclusions`） */
  readonly btreeGist: boolean;
}

/** 不装载任何服务端扩展。 */
export const NO_PGLITE_SERVER_EXTENSIONS: PGliteServerExtensionRequirements = { btreeGist: false };

/**
 * OPFS worker 模式下传给 worker 的标记字段名。
 *
 * @remarks
 * `PGliteWorker` 把 `extensions` 留在主线程侧执行（服务端扩展在那里装不上，PGlite 只会告警），
 * 其余选项原样发给 worker；所以服务端扩展只能以普通字段的形式带过去，由 worker 入口自己装。
 */
export const PGLITE_WORKER_BTREE_GIST_OPTION = 'rxdbBtreeGist';

/**
 * 按要求展开成 PGlite 的 `extensions` 片段（与用户的 `extensions` 合并后交给构造函数）。
 *
 * @param requirements - 需要装载的服务端扩展
 */
export const pgliteServerExtensions = (requirements: PGliteServerExtensionRequirements): Extensions =>
  requirements.btreeGist ? { btree_gist } : {};
