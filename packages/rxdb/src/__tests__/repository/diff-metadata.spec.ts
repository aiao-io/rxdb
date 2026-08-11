/**
 * @fileoverview diffMetadata 工具函数单元测试（QueryCache）。
 *
 * 测试增量同步的元数据比较逻辑：
 * - 检测缺失 ID（需要 pull）
 * - 检测过期 ID（远程 updatedAt > 本地 updatedAt）
 * - 检测最新 ID（不需要同步）
 * - 检测孤儿 ID（本地有数据但不在远程结果集中）
 */

import { describe, expect, it } from 'vitest';
import type { QueryCacheEntityMetadata } from '../../entity/metadata-options.interface.js';
import { diffMetadata, DiffResult } from '../../repository/diff-metadata.js';

describe('diffMetadata', () => {
  describe('基础场景', () => {
    it('T016.1 应该返回空结果当远程和本地都为空', () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [];
      const localMetadata = new Map<string, string>();

      const result = diffMetadata(remoteMetadata, localMetadata);

      expect(result.missingIds).toEqual([]);
      expect(result.staleIds).toEqual([]);
      expect(result.freshIds).toEqual([]);
      expect(result.orphanIds).toEqual([]);
    });

    it('T016.2 应该识别缺失的 ID（本地没有，远程有）', () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [
        { id: 'id1', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'id2', updatedAt: '2024-01-01T00:00:00Z' }
      ];
      const localMetadata = new Map<string, string>();

      const result = diffMetadata(remoteMetadata, localMetadata);

      expect(result.missingIds).toEqual(['id1', 'id2']);
      expect(result.staleIds).toEqual([]);
      expect(result.freshIds).toEqual([]);
    });

    it('T016.3 应该识别过时的 ID（本地 updatedAt < 远程 updatedAt）', () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'id1', updatedAt: '2024-01-02T00:00:00Z' }];
      const localMetadata = new Map<string, string>([['id1', '2024-01-01T00:00:00Z']]);

      const result = diffMetadata(remoteMetadata, localMetadata);

      expect(result.missingIds).toEqual([]);
      expect(result.staleIds).toEqual(['id1']);
      expect(result.freshIds).toEqual([]);
    });

    it('T016.4 应该识别新鲜的 ID（本地 updatedAt >= 远程 updatedAt）', () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'id1', updatedAt: '2024-01-01T00:00:00Z' }];
      const localMetadata = new Map<string, string>([['id1', '2024-01-01T00:00:00Z']]);

      const result = diffMetadata(remoteMetadata, localMetadata);

      expect(result.missingIds).toEqual([]);
      expect(result.staleIds).toEqual([]);
      expect(result.freshIds).toEqual(['id1']);
    });

    it('T016.5 应该识别孤儿 ID（本地有但不在远程结果集中）', () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'id1', updatedAt: '2024-01-01T00:00:00Z' }];
      const localMetadata = new Map<string, string>([
        ['id1', '2024-01-01T00:00:00Z'],
        ['id2', '2024-01-01T00:00:00Z'] // 不在远程结果中
      ]);

      const result = diffMetadata(remoteMetadata, localMetadata);

      expect(result.orphanIds).toEqual(['id2']);
    });
  });

  describe('混合场景', () => {
    it('T016.6 应该正确分类混合状态的数据', () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [
        { id: 'missing1', updatedAt: '2024-01-01T00:00:00Z' },
        { id: 'stale1', updatedAt: '2024-01-03T00:00:00Z' },
        { id: 'fresh1', updatedAt: '2024-01-01T00:00:00Z' }
      ];
      const localMetadata = new Map<string, string>([
        ['stale1', '2024-01-01T00:00:00Z'],
        ['fresh1', '2024-01-01T00:00:00Z'],
        ['orphan1', '2024-01-01T00:00:00Z']
      ]);

      const result = diffMetadata(remoteMetadata, localMetadata);

      expect(result.missingIds).toEqual(['missing1']);
      expect(result.staleIds).toEqual(['stale1']);
      expect(result.freshIds).toEqual(['fresh1']);
      expect(result.orphanIds).toEqual(['orphan1']);
    });

    it('T016.7 应该处理大批量数据', () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [];
      const localMetadata = new Map<string, string>();

      // 生成 1000 条远程数据
      for (let i = 0; i < 1000; i++) {
        remoteMetadata.push({ id: `id${i}`, updatedAt: '2024-01-01T00:00:00Z' });
      }
      // 本地只有一半，且一半过时
      for (let i = 0; i < 500; i++) {
        const isStale = i < 250;
        localMetadata.set(`id${i}`, isStale ? '2023-01-01T00:00:00Z' : '2024-01-01T00:00:00Z');
      }

      const result = diffMetadata(remoteMetadata, localMetadata);

      expect(result.missingIds.length).toBe(500); // id500-id999
      expect(result.staleIds.length).toBe(250); // id0-id249
      expect(result.freshIds.length).toBe(250); // id250-id499
    });
  });

  describe('边界情况', () => {
    it('T016.8 应该正确比较 ISO 8601 时间戳', () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'id1', updatedAt: '2024-01-01T12:00:00.500Z' }];
      const localMetadata = new Map<string, string>([['id1', '2024-01-01T12:00:00.499Z']]);

      const result = diffMetadata(remoteMetadata, localMetadata);

      expect(result.staleIds).toEqual(['id1']);
    });

    it('T016.9 本地时间戳更新应视为新鲜（不拉取）', () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [{ id: 'id1', updatedAt: '2024-01-01T00:00:00Z' }];
      const localMetadata = new Map<string, string>([['id1', '2024-01-02T00:00:00Z']]);

      const result = diffMetadata(remoteMetadata, localMetadata);

      expect(result.freshIds).toEqual(['id1']);
      expect(result.staleIds).toEqual([]);
    });
  });

  describe('返回类型验证', () => {
    it('T016.10 DiffResult 应包含所有必需字段', () => {
      const remoteMetadata: QueryCacheEntityMetadata[] = [];
      const localMetadata = new Map<string, string>();

      const result: DiffResult = diffMetadata(remoteMetadata, localMetadata);

      expect(result).toHaveProperty('missingIds');
      expect(result).toHaveProperty('staleIds');
      expect(result).toHaveProperty('freshIds');
      expect(result).toHaveProperty('orphanIds');
      expect(Array.isArray(result.missingIds)).toBe(true);
      expect(Array.isArray(result.staleIds)).toBe(true);
      expect(Array.isArray(result.freshIds)).toBe(true);
      expect(Array.isArray(result.orphanIds)).toBe(true);
    });
  });
});
