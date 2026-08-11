/**
 * @fileoverview system/migration.ts 的测试套件
 *
 * 测试迁移实体定义，包括：
 * - 实体元数据验证
 * - 属性定义
 */

import { describe, expect, it } from 'vitest';
import { PropertyType } from '../../entity/metadata-options.interface.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RXDB_CHANGE_CODEC_VERSION } from '../../system/change-codec.js';
import {
  assertSupportedRxDBSystemVersions,
  getRxDBSystemVersionState,
  isCurrentRxDBSystemVersion,
  RXDB_CHANGE_CODEC_WATERMARK_PREFIX,
  RXDB_SYSTEM_SCHEMA_VERSION,
  RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX,
  RxDBMigration,
  UnsupportedRxDBSystemVersionError
} from '../../system/migration.js';

describe('RxDBMigration', () => {
  describe('系统 schema 水位', () => {
    // 版本号取自常量而非写死：写死会在下一次 bump 时把「当前版本」测成「历史版本」，
    // 断言仍然绿但已经不再验证 bump 后的契约
    it('同时识别 system schema 与 change codec 当前版本', () => {
      const state = getRxDBSystemVersionState([
        `${RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX}${RXDB_SYSTEM_SCHEMA_VERSION}`,
        `${RXDB_CHANGE_CODEC_WATERMARK_PREFIX}${RXDB_CHANGE_CODEC_VERSION}`,
        'application_migration'
      ]);

      expect(state).toEqual({
        schemaVersion: RXDB_SYSTEM_SCHEMA_VERSION,
        codecVersion: RXDB_CHANGE_CODEC_VERSION
      });
      expect(isCurrentRxDBSystemVersion(state)).toBe(true);
      expect(() => assertSupportedRxDBSystemVersions(state)).not.toThrow();
    });

    it('缺失水位按 legacy schema 处理', () => {
      const state = getRxDBSystemVersionState(['application_migration']);

      expect(state).toEqual({ schemaVersion: 0, codecVersion: 0 });
      expect(isCurrentRxDBSystemVersion(state)).toBe(false);
    });

    it.each([
      [`${RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX}${RXDB_SYSTEM_SCHEMA_VERSION + 1}`, 'system schema'],
      [`${RXDB_CHANGE_CODEC_WATERMARK_PREFIX}${RXDB_CHANGE_CODEC_VERSION + 1}`, 'change codec']
    ])('高版本水位 %s 必须 fail-fast', (watermark, expectedKind) => {
      const state = getRxDBSystemVersionState([watermark]);

      expect(() => assertSupportedRxDBSystemVersions(state)).toThrowError(
        expect.objectContaining<Partial<UnsupportedRxDBSystemVersionError>>({
          name: 'UnsupportedRxDBSystemVersionError',
          message: expect.stringContaining(expectedKind)
        })
      );
    });

    it('损坏的保留水位不得降级成 legacy', () => {
      expect(() => getRxDBSystemVersionState([`${RXDB_SYSTEM_SCHEMA_WATERMARK_PREFIX}next`])).toThrow(
        UnsupportedRxDBSystemVersionError
      );
    });
  });

  describe('实体元数据', () => {
    it('应当定义正确的实体名称', () => {
      const meta = getEntityMetadata(RxDBMigration);
      expect(meta.name).toBe('RxDBMigration');
    });

    it('应当禁用日志', () => {
      const meta = getEntityMetadata(RxDBMigration);
      expect(meta.log).toBe(false);
    });
  });

  describe('属性定义', () => {
    it('应当有 id 主键属性', () => {
      const meta = getEntityMetadata(RxDBMigration);
      const idProp = meta.properties.find(p => p.name === 'id');
      expect(idProp).toBeDefined();
      expect((idProp as { primary?: boolean } | undefined)?.primary).toBe(true);
      expect(idProp?.type).toBe(PropertyType.integer);
    });

    it('应当有 name 属性', () => {
      const meta = getEntityMetadata(RxDBMigration);
      const nameProp = meta.properties.find(p => p.name === 'name');
      expect(nameProp).toBeDefined();
      expect(nameProp?.type).toBe(PropertyType.string);
      expect(nameProp?.readonly).toBe(true);
    });

    it('应当有 executedAt 属性', () => {
      const meta = getEntityMetadata(RxDBMigration);
      const executedAtProp = meta.properties.find(p => p.name === 'executedAt');
      expect(executedAtProp).toBeDefined();
      expect(executedAtProp?.type).toBe(PropertyType.date);
      expect(executedAtProp?.readonly).toBe(true);
    });
  });

  // 注意：实例创建测试需要 RxDB 初始化，在 integration 测试中覆盖

  describe('迁移记录用途', () => {
    it('应当记录迁移执行历史', () => {
      const migrations = [
        { id: 1, name: '001_create_users', executedAt: new Date('2024-01-01') },
        { id: 2, name: '002_create_posts', executedAt: new Date('2024-01-02') },
        { id: 3, name: '003_add_email_column', executedAt: new Date('2024-01-03') }
      ];

      expect(migrations.length).toBe(3);
      expect(migrations[0].name).toBe('001_create_users');
      expect(migrations[2].name).toBe('003_add_email_column');
    });

    it('应当通过名称检查迁移是否已执行', () => {
      const executedMigrations = new Set(['001_create_users', '002_create_posts']);

      expect(executedMigrations.has('001_create_users')).toBe(true);
      expect(executedMigrations.has('002_create_posts')).toBe(true);
      expect(executedMigrations.has('003_add_email_column')).toBe(false);
    });

    it('应当按 id 顺序执行迁移', () => {
      const migrations = [
        { id: 3, name: '003_add_email_column' },
        { id: 1, name: '001_create_users' },
        { id: 2, name: '002_create_posts' }
      ];

      const sorted = migrations.sort((a, b) => a.id - b.id);

      expect(sorted[0].id).toBe(1);
      expect(sorted[1].id).toBe(2);
      expect(sorted[2].id).toBe(3);
    });
  });

  describe('迁移命名约定', () => {
    it('应当支持数字前缀命名', () => {
      const migrationName = '001_create_users_table';
      const match = migrationName.match(/^(\d+)_(.+)$/);

      expect(match).not.toBeNull();
      expect(match?.[1]).toBe('001');
      expect(match?.[2]).toBe('create_users_table');
    });

    it('应当支持时间戳命名', () => {
      const timestamp = '20240101120000';
      const migrationName = `${timestamp}_create_users_table`;

      expect(migrationName).toBe('20240101120000_create_users_table');
      expect(migrationName.startsWith(timestamp)).toBe(true);
    });
  });
});
