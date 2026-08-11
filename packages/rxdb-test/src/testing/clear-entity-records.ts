/**
 * @fileoverview 清空给定实体在当前 RxDB 中的全部记录。
 *
 * E2E 与 demo 的「reset」场景用：先查全量再 removeMany，确保后续插入不会冲突。
 *
 * @module @aiao/rxdb-test/testing/clear-entity-records
 */

import type { EntityType, RxDB } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';

/**
 * 删除 `entityType` 在 `rxdb` 中的所有记录。
 *
 * 若集合为空则 no-op。不会清空 OPFS 等附加存储，只清 entity manager 的行。
 */
export async function clearEntityRecords(rxdb: RxDB, entityType: EntityType): Promise<void> {
  const repo = rxdb.entityManager.getRepository(entityType);
  const entities = await firstValueFrom(repo.findAll({ where: { combinator: 'and', rules: [] } }));
  if (entities.length > 0) {
    await rxdb.entityManager.removeMany(entities);
  }
}
