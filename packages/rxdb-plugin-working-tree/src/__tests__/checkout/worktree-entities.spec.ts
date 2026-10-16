/**
 * @fileoverview 快照里有哪些实体（US-313）：复制哪些表、克隆哪些类、主实例的类对应快照实例的哪个类。
 */

import type { EntityType, RxDB, SyncOptions } from '@aiao/rxdb';
import { Entity, EntityBase, getEntityMetadata, RxDBBranch, SyncType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  worktreeCopiedEntities,
  worktreeDeclaredEntities,
  worktreeEntityOf
} from '../../checkout/worktree-entities.js';
import { WorktreeUnavailableError } from '../../checkout/worktree-errors.js';

@Entity({ name: 'CheckoutLocal' })
class CheckoutLocal extends EntityBase {}

@Entity({ name: 'CheckoutGenerated' })
class CheckoutGenerated extends EntityBase {}

@Entity({ name: 'CheckoutCache' })
class CheckoutCache extends EntityBase {}

@Entity({ name: 'CheckoutRemote' })
class CheckoutRemote extends EntityBase {}

@Entity({ name: 'CheckoutUnbound' })
class CheckoutUnbound extends EntityBase {}

const LOCAL: SyncOptions = { local: { adapter: 'local' }, type: SyncType.None };

/** 只给 `worktreeCopiedEntities` 读的那几样：实体清单、同步解析器、生成类清单。 */
const mainOf = (syncOf: ReadonlyMap<EntityType, SyncOptions>, generated: readonly EntityType[] = []): RxDB =>
  ({
    config: { entities: [RxDBBranch, ...syncOf.keys()] },
    entitySync: {
      databaseSync: LOCAL,
      resolve: (EntityClass: EntityType) => syncOf.get(EntityClass),
      resolveType: () => 'none'
    },
    schemaManager: { generatedEntities: generated }
  }) as unknown as RxDB;

describe('worktreeCopiedEntities', () => {
  it('留下本地的业务表与生成的类；去掉系统表、查询缓存与没有本地一侧的实体', () => {
    const main = mainOf(
      new Map<EntityType, SyncOptions>([
        [CheckoutLocal, LOCAL],
        [CheckoutGenerated, LOCAL],
        [
          CheckoutCache,
          { local: { adapter: 'local' }, remote: { adapter: 'remote' }, type: SyncType.QueryCache } as SyncOptions
        ],
        [CheckoutRemote, { remote: { adapter: 'remote' }, type: SyncType.None } as SyncOptions]
      ]),
      [CheckoutGenerated]
    );

    const copied = worktreeCopiedEntities(main);

    expect(copied).toEqual([CheckoutLocal, CheckoutGenerated]);
    expect(worktreeDeclaredEntities(main, copied)).toEqual([CheckoutLocal]);
  });

  // 存储插件的文件元数据就是这样：声明里只有 `type: None`，插件经库级本地适配器读写它，数据在主库里
  it('两侧都没声明的实体照常复制：它的数据在库级本地适配器里', () => {
    const main = mainOf(new Map<EntityType, SyncOptions>([[CheckoutUnbound, { type: SyncType.None }]]));

    expect(worktreeCopiedEntities(main)).toEqual([CheckoutUnbound]);
  });
});

describe('worktreeEntityOf', () => {
  const snapshotWith = (entities: readonly EntityType[]): RxDB =>
    ({
      schemaManager: {
        getEntityType: (name: string, namespace: string) =>
          entities.find(EntityClass => {
            const metadata = getEntityMetadata(EntityClass);
            return metadata.name === name && metadata.namespace === namespace;
          })
      }
    }) as unknown as RxDB;

  it('按命名空间与名字找到快照实例上的对应类', () => {
    expect(worktreeEntityOf(snapshotWith([CheckoutLocal]), CheckoutLocal)).toBe(CheckoutLocal);
  });

  it('快照实例上没有：incomplete_entities', () => {
    const error = (() => {
      try {
        return worktreeEntityOf(snapshotWith([]), CheckoutLocal);
      } catch (thrown) {
        return thrown;
      }
    })();
    expect(error).toBeInstanceOf(WorktreeUnavailableError);
    expect((error as WorktreeUnavailableError).reason).toBe('incomplete_entities');
  });
});
