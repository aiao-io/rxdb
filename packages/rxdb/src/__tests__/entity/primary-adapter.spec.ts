import { describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, type EntityType, UUID } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import {
  collectMutationEntityTypes,
  resolveBatchPrimaryAdapter,
  RxDBMissingPrimaryAdapterError,
  RxDBMixedPrimaryAdapterError,
  selectPrimaryAdapter,
  selectPrimaryAdapterKind
} from '../../entity/primary-adapter.js';
import type { RxDBMutationsMap } from '../../rxdb-adapter.js';

@Entity({
  name: 'LocalOnlyDoc',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.None, local: { adapter: 'sqlite' } }
})
class LocalOnlyDoc extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

@Entity({
  name: 'RemoteOnlyDoc',
  properties: [{ name: 'title', type: PropertyType.string }],
  sync: { type: SyncType.None, remote: { adapter: 'supabase' } }
})
class RemoteOnlyDoc extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
}

const emptyMutations = (): RxDBMutationsMap => ({ create: new Map(), update: new Map(), remove: new Map() });

describe('主适配器选择器（RXD-055）', () => {
  describe('selectPrimaryAdapterKind', () => {
    it('只配 remote 时选 remote', () => {
      expect(selectPrimaryAdapterKind({ type: SyncType.None, remote: { adapter: 'supabase' } })).toBe('remote');
    });

    it('配了 local 就选 local，即使同时配了 remote', () => {
      expect(
        selectPrimaryAdapterKind({
          type: SyncType.Full,
          local: { adapter: 'sqlite' },
          remote: { adapter: 'supabase' }
        })
      ).toBe('local');
    });

    // 两端都没配是配置错误，但选择器本身不抛——它只回答「主端是哪一侧」，
    // 「这一侧到底有没有适配器」由 selectPrimaryAdapter 判定。
    it('两端都没配时落回 local', () => {
      expect(selectPrimaryAdapterKind(undefined)).toBe('local');
      expect(selectPrimaryAdapterKind({ type: SyncType.None } as never)).toBe('local');
    });
  });

  describe('selectPrimaryAdapter', () => {
    it('返回主端及其适配器名', () => {
      expect(selectPrimaryAdapter({ type: SyncType.None, remote: { adapter: 'supabase' } })).toEqual({
        kind: 'remote',
        adapter: 'supabase'
      });
      expect(selectPrimaryAdapter({ type: SyncType.None, local: { adapter: 'sqlite' } })).toEqual({
        kind: 'local',
        adapter: 'sqlite'
      });
    });

    it('两端都没配时返回 null（调用方据此 fail-fast，而不是挂在永不发射的流上）', () => {
      expect(selectPrimaryAdapter(undefined)).toBeNull();
      expect(selectPrimaryAdapter({ type: SyncType.None } as never)).toBeNull();
    });
  });

  describe('collectMutationEntityTypes', () => {
    it('跨 create / update / remove 收集并去重', () => {
      const options = emptyMutations();
      options.create.set(LocalOnlyDoc as EntityType, new Set());
      options.update.set(LocalOnlyDoc as EntityType, new Set());
      options.remove.set(RemoteOnlyDoc as EntityType, new Set());

      const types = collectMutationEntityTypes(options);
      expect(types).toHaveLength(2);
      expect(types).toContain(LocalOnlyDoc);
      expect(types).toContain(RemoteOnlyDoc);
    });

    it('空 map 收集不到任何实体类型', () => {
      expect(collectMutationEntityTypes(emptyMutations())).toEqual([]);
    });
  });

  describe('resolveBatchPrimaryAdapter', () => {
    const dbSync = { type: SyncType.None, local: { adapter: 'sqlite' } } as const;

    it('实体元数据的 sync 覆盖数据库级配置', () => {
      // 数据库是 local，但这个实体自己声明 remote-only —— 批量入口必须跟着实体走，
      // 否则它和单条 save（Repository.primary$）会写到两个不同的库。
      expect(resolveBatchPrimaryAdapter([RemoteOnlyDoc as EntityType], dbSync)).toEqual({
        kind: 'remote',
        adapter: 'supabase'
      });
    });

    it('实体没有自己的 sync 时用数据库级配置', () => {
      @Entity({ name: 'InheritDoc', properties: [{ name: 'title', type: PropertyType.string }] })
      class InheritDoc extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        title!: string;
      }
      expect(resolveBatchPrimaryAdapter([InheritDoc as EntityType], dbSync)).toEqual({
        kind: 'local',
        adapter: 'sqlite'
      });
    });

    it('同一批里主端不一致时抛错，而不是随便挑一个', () => {
      expect(() =>
        resolveBatchPrimaryAdapter([LocalOnlyDoc as EntityType, RemoteOnlyDoc as EntityType], dbSync)
      ).toThrow(RxDBMixedPrimaryAdapterError);
    });

    it('主端不一致的错误消息点名两侧实体', () => {
      let message = '';
      try {
        resolveBatchPrimaryAdapter([LocalOnlyDoc as EntityType, RemoteOnlyDoc as EntityType], dbSync);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('LocalOnlyDoc');
      expect(message).toContain('RemoteOnlyDoc');
    });

    it('主端一致但没配适配器时抛错', () => {
      expect(() => resolveBatchPrimaryAdapter([LocalOnlyDoc as EntityType], undefined)).not.toThrow();
      @Entity({ name: 'NoAdapterDoc', properties: [{ name: 'title', type: PropertyType.string }] })
      class NoAdapterDoc extends EntityBase {
        static [ENTITY_STATIC_TYPES]: { idType: UUID };
        title!: string;
      }
      expect(() => resolveBatchPrimaryAdapter([NoAdapterDoc as EntityType], undefined)).toThrow(
        RxDBMissingPrimaryAdapterError
      );
    });

    it('空实体集合返回 null（无事可做，不需要任何适配器）', () => {
      expect(resolveBatchPrimaryAdapter([], undefined)).toBeNull();
    });

    it('两个错误类型的 instanceof 在转译后依然成立', () => {
      const mixed = new RxDBMixedPrimaryAdapterError([]);
      const missing = new RxDBMissingPrimaryAdapterError('local', []);
      expect(mixed).toBeInstanceOf(RxDBMixedPrimaryAdapterError);
      expect(mixed).toBeInstanceOf(Error);
      expect(missing).toBeInstanceOf(RxDBMissingPrimaryAdapterError);
      expect(missing).toBeInstanceOf(Error);
    });
  });
});
