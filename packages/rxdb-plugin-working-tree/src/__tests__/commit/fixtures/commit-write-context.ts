/**
 * @fileoverview 写路径 unit 用例共用的 {@link CommitWriteContext} 夹具。
 *
 * @remarks
 * `writeCommit()` 的 FR-038 断言会**解析每个变更单元的目标实体**，解析不到就按
 * `UnknownWorkingTreePatchEntityError` 抛（写入侧刻意 fail-closed，见 `commit-codec.ts`）。
 * 而 `commit/` 下这一批 unit 用例建的库一律是 `entities: []`——它们验的是 CAS、校验顺序、
 * 幂等与迁移，一条业务实体都不需要真注册。于是真 `schemaManager` 在这些库上一个都解析不到，
 * 每条用例都会换成一个与被测行为毫无关系的失败。
 *
 * 这里给的是那批用例唯一需要的东西：**解析得到、且一个加密列都没有**的元数据。加密列的
 * 判定本身由 `commit-codec.spec.ts` 与 `commit-encrypted-at-rest-wiring.spec.ts` 负责，
 * 两边共用 `encrypted-entities.ts` 的 {@link createMetadata}——这里也用它，免得「元数据长什么样」
 * 在本目录里出现第二份口径。
 */

import type { EntityManager, EntityMetadata } from '@aiao/rxdb';
import { PropertyType } from '@aiao/rxdb';
import type { CommitWriteContext } from '../../../commit/commit-context.js';
import { createMetadata } from './encrypted-entities.js';

/**
 * 把任何实体名解析成一份「没有加密列」的元数据。
 *
 * @param entity - 变更单元里的实体名
 * @returns 一份只有 `title` 一列的元数据
 *
 * @remarks
 * 不按名字分流：用例们各写各的实体名（`app.Note` / `app.Recipe` / …），而它们要的都是
 * 同一件事——「解析得到，且没有加密列」。按名字建一张注册表只会让新增一条用例时多一处要改的
 * 地方，而那处漏了的症状是 fail-closed 抛错，读起来像被测代码坏了。
 */
export const resolveAnyAsPlain = (entity: string): EntityMetadata =>
  createMetadata(entity, [{ name: 'title', type: PropertyType.string }]);

/**
 * 把一个 {@link EntityManager} 包成 `writeCommit()` / `runEnableMigration()` 要的写上下文。
 *
 * @param entityManager - 目标库的实体管理器
 * @returns 见 {@link CommitWriteContext}
 *
 * @remarks
 * codec 里只给元数据解析器、不给 at-rest 判定器：断言对没有加密属性的实体是 no-op，
 * 缺判定器不影响它们（缺席的语义见 `commit-codec.ts` 的 `missing_recognizer`）。
 */
export const plainCommitWriteContext = (entityManager: EntityManager): CommitWriteContext => ({
  entityManager,
  codec: { resolveTargetMetadata: resolveAnyAsPlain }
});
