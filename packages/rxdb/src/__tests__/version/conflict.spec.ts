import { beforeEach, describe, expect, it } from 'vitest';
import { RxDBChange } from '../../system/change.js';
import { Conflict, ConflictResolution, ConflictResolver } from '../../version/conflict.js';
import { LWWConflictResolver } from '../../version/LWWConflictResolver.js';

/**
 * LWWConflictResolver 单元测试
 *
 * Last-Write-Wins 冲突解决器：基于 createdAt 时间戳，更晚的变更胜出
 */
describe('LWWConflictResolver', () => {
  let resolver: LWWConflictResolver;

  // 辅助函数：创建模拟 RxDBChange
  function createChange(createdAt: Date, clientId?: string): RxDBChange {
    return {
      id: Math.floor(Math.random() * 10000),
      clientId,
      namespace: 'public',
      entity: 'User',
      entityId: 'test-entity-id',
      type: 'UPDATE',
      patch: { name: 'test' },
      inversePatch: null,
      createdAt,
      updatedAt: createdAt
    } as unknown as RxDBChange;
  }

  // 辅助函数：创建 Conflict
  function createConflict(localTime: Date, remoteTime: Date, localClient?: string, remoteClient?: string): Conflict {
    return {
      entityKey: 'public:User:test-entity-id',
      local: createChange(localTime, localClient),
      remote: createChange(remoteTime, remoteClient)
    };
  }

  beforeEach(() => {
    resolver = new LWWConflictResolver();
  });

  describe('resolve', () => {
    it('should implement ConflictResolver interface', () => {
      expect(resolver.resolve).toBeDefined();
      expect(typeof resolver.resolve).toBe('function');
    });

    it('should return KEEP_LOCAL when local change is newer', async () => {
      const conflict = createConflict(
        new Date('2025-01-01T10:01:00Z'), // local - newer
        new Date('2025-01-01T10:00:00Z') // remote - older
      );

      const result = await resolver.resolve(conflict);

      expect(result.type).toBe('KEEP_LOCAL');
    });

    it('should return KEEP_REMOTE when remote change is newer', async () => {
      const conflict = createConflict(
        new Date('2025-01-01T10:00:00Z'), // local - older
        new Date('2025-01-01T10:01:00Z') // remote - newer
      );

      const result = await resolver.resolve(conflict);

      expect(result.type).toBe('KEEP_REMOTE');
    });

    // RXD-057：时间戳相同时固定 KEEP_LOCAL，两个副本各自都「保留自己」→ 永久分叉，
    // 后续每次同步都再冲突一次。LWW 必须有**全局确定**的 tie-breaker，
    // 使两侧独立解决后收敛到同一份数据。
    describe('RXD-057 相同时间戳必须收敛', () => {
      const sameTime = new Date('2025-01-01T10:00:00Z');

      it('两个副本交换本地/远端视角后，选中的是同一条变更', async () => {
        // 副本 A 视角：自己是 client-a，对端是 client-b
        const fromA = await resolver.resolve(createConflict(sameTime, sameTime, 'client-a', 'client-b'));
        // 副本 B 视角：自己是 client-b，对端是 client-a
        const fromB = await resolver.resolve(createConflict(sameTime, sameTime, 'client-b', 'client-a'));

        // 必须恰好一方保留自己、另一方接受对端 —— 而不是双方都 KEEP_LOCAL
        const winners = [
          fromA.type === 'KEEP_LOCAL' ? 'client-a' : 'client-b',
          fromB.type === 'KEEP_LOCAL' ? 'client-b' : 'client-a'
        ];
        expect(winners[0]).toBe(winners[1]);
      });

      it('tie-breaker 是确定的：同样输入永远得到同样结果', async () => {
        const first = await resolver.resolve(createConflict(sameTime, sameTime, 'client-a', 'client-b'));
        const second = await resolver.resolve(createConflict(sameTime, sameTime, 'client-a', 'client-b'));

        expect(first.type).toBe(second.type);
      });

      it('缺少 clientId 时退化为既有约定（本地优先），不抛错', async () => {
        const conflict = createConflict(sameTime, sameTime);

        await expect(resolver.resolve(conflict)).resolves.toEqual({ type: 'KEEP_LOCAL' });
      });
    });

    it('should handle millisecond differences', async () => {
      const conflict = createConflict(
        new Date('2025-01-01T10:00:00.500Z'), // local - 500ms
        new Date('2025-01-01T10:00:00.499Z') // remote - 499ms
      );

      const result = await resolver.resolve(conflict);

      expect(result.type).toBe('KEEP_LOCAL');
    });

    it('should handle very old timestamps', async () => {
      const conflict = createConflict(new Date('2020-01-01T00:00:00Z'), new Date('2025-01-01T00:00:00Z'));

      const result = await resolver.resolve(conflict);

      expect(result.type).toBe('KEEP_REMOTE');
    });
  });

  describe('resolveAll', () => {
    it('should resolve all conflicts correctly', async () => {
      const conflicts: Conflict[] = [
        createConflict(
          new Date('2025-01-01T10:01:00Z'), // local newer
          new Date('2025-01-01T10:00:00Z')
        ),
        createConflict(
          new Date('2025-01-01T10:00:00Z'), // remote newer
          new Date('2025-01-01T10:02:00Z')
        ),
        createConflict(
          new Date('2025-01-01T10:05:00Z'), // local newer
          new Date('2025-01-01T10:03:00Z')
        )
      ];

      const results = await resolver.resolveAll(conflicts);

      expect(results).toHaveLength(3);
      expect(results[0].type).toBe('KEEP_LOCAL');
      expect(results[1].type).toBe('KEEP_REMOTE');
      expect(results[2].type).toBe('KEEP_LOCAL');
    });

    it('should return empty array for empty conflicts', async () => {
      const results = await resolver.resolveAll([]);
      expect(results).toEqual([]);
    });
  });

  describe('edge cases', () => {
    // createdAt 在 IRxDBChange 上必填。从前它缺失会被折成 epoch 0：两侧同时塌成 0 就成平局，
    // 胜负转由 clientId 字典序决定 —— 时间戳丢了这件事被吞掉，赢家却已经换人。
    // LWW 的全部依据就是这个时间戳，拿不到就没有「合理的默认」，只能拒绝裁决。
    it('createdAt 缺失时拒绝裁决而不是折成 epoch 0', async () => {
      const localChange = createChange(new Date('2025-01-01T10:00:00Z'));
      const remoteChange = createChange(new Date('2025-01-01T10:01:00Z'));

      (localChange as { createdAt: Date | null }).createdAt = null;

      const conflict: Conflict = {
        entityKey: 'public:User:test',
        local: localChange,
        remote: remoteChange
      };

      await expect(resolver.resolve(conflict)).rejects.toThrow();
    });

    it('should be async to support future async implementations', async () => {
      const conflict = createConflict(new Date('2025-01-01T10:01:00Z'), new Date('2025-01-01T10:00:00Z'));

      const resultPromise = resolver.resolve(conflict);

      expect(resultPromise).toBeInstanceOf(Promise);
      await expect(resultPromise).resolves.toHaveProperty('type');
    });
  });
});

describe('ConflictResolver interface', () => {
  it('should allow custom implementation', async () => {
    // 始终保留远程值的自定义解析器。
    const customResolver: ConflictResolver = {
      async resolve(): Promise<ConflictResolution> {
        return { type: 'KEEP_REMOTE' };
      }
    };

    const conflict: Conflict = {
      entityKey: 'test',
      local: {} as RxDBChange,
      remote: {} as RxDBChange
    };

    const result = await customResolver.resolve(conflict);
    expect(result.type).toBe('KEEP_REMOTE');
  });

  it('should support MERGE resolution type', async () => {
    const mergingResolver: ConflictResolver = {
      async resolve(conflict: Conflict): Promise<ConflictResolution> {
        return {
          type: 'MERGE',
          merged: {
            ...(conflict.local.patch || {}),
            ...(conflict.remote.patch || {})
          }
        };
      }
    };

    const conflict: Conflict = {
      entityKey: 'test',
      local: { patch: { name: 'Local' } } as unknown as RxDBChange,
      remote: { patch: { age: 30 } } as unknown as RxDBChange
    };

    const result = await mergingResolver.resolve(conflict);
    expect(result.type).toBe('MERGE');
    expect((result as { type: 'MERGE'; merged: Record<string, unknown> }).merged).toEqual({
      name: 'Local',
      age: 30
    });
  });

  it('should support DEFER resolution type', async () => {
    const deferringResolver: ConflictResolver = {
      async resolve(): Promise<ConflictResolution> {
        return { type: 'DEFER' };
      }
    };

    const conflict: Conflict = {
      entityKey: 'test',
      local: {} as RxDBChange,
      remote: {} as RxDBChange
    };

    const result = await deferringResolver.resolve(conflict);
    expect(result.type).toBe('DEFER');
  });
});
