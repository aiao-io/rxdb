/**
 * Pure-logic 单元测试：FTS5 installer 的元数据提取与签名计算。
 * 不依赖浏览器 / sqlite-wasm runtime，可在 node 环境运行。
 */
import { getEntityMetadata, type EntityMetadata } from '@aiao/rxdb';
import { indexTextForFts } from '@aiao/rxdb-adapter-sqlite-core';
import { describe, expect, it } from 'vitest';
import { computeFtsSchemaSignature, extractFtsPlanFromMetadata, ftsMigrationName } from '../core/fts5-installer.js';
import { SearchEncryptedFieldError } from '../types.js';
import { Article } from './fixtures/article.entity.js';
import { Comment } from './fixtures/comment.entity.js';

describe('extractFtsPlanFromMetadata', () => {
  it('returns table/pk/fields for entity with searchable properties (Article)', () => {
    const metadata = getEntityMetadata(Article);
    const plan = extractFtsPlanFromMetadata(metadata);
    expect(plan).not.toBeNull();
    expect(plan!.tableName).toBe('Article');
    expect(plan!.sqlTableName).toBe(`${metadata.namespace}$${metadata.tableName}`);
    expect(plan!.primaryKey).toBe('id');
    const names = plan!.fields.map(f => f.name);
    expect(names).toEqual(['title', 'body', 'category', 'tags']);
    const tagsField = plan!.fields.find(f => f.name === 'tags')!;
    expect(tagsField.isArray).toBe(true);
    const titleField = plan!.fields.find(f => f.name === 'title')!;
    expect(titleField.isArray).toBe(false);
  });

  it('extracts Comment searchable fields (content/authorName)', () => {
    const metadata = getEntityMetadata(Comment);
    const plan = extractFtsPlanFromMetadata(metadata);
    expect(plan).not.toBeNull();
    expect(plan!.fields.map(f => f.name)).toEqual(['content', 'authorName']);
    expect(plan!.fields.every(f => !f.isArray)).toBe(true);
  });

  it('excludes non-searchable fields (authorId / viewCount in Article)', () => {
    const metadata = getEntityMetadata(Article);
    const plan = extractFtsPlanFromMetadata(metadata)!;
    const names = plan.fields.map(f => f.name);
    expect(names).not.toContain('authorId');
    expect(names).not.toContain('viewCount');
  });

  it('returns null when entity has no searchable property', () => {
    // RxDBMigration 系统实体没有 searchable 字段
    const meta = {
      tableName: 'no_search',
      properties: [
        { name: 'id', columnName: 'id', type: 'string', primary: true },
        { name: 'name', columnName: 'name', type: 'string' }
      ]
    };
    const plan = extractFtsPlanFromMetadata(meta as unknown as EntityMetadata);
    expect(plan).toBeNull();
  });

  // 004-local-field-encryption FR-022 / T068。
  it('throws SearchEncryptedFieldError when a property is both encrypted and searchable', () => {
    const meta = {
      tableName: 'mixed',
      properties: [
        { name: 'id', columnName: 'id', type: 'string', primary: true },
        { name: 'secret', columnName: 'secret', type: 'string', searchable: true, encrypted: true }
      ]
    };
    expect(() => extractFtsPlanFromMetadata(meta as unknown as EntityMetadata)).toThrow(SearchEncryptedFieldError);
    try {
      extractFtsPlanFromMetadata(meta as unknown as EntityMetadata);
    } catch (err) {
      expect(err).toBeInstanceOf(SearchEncryptedFieldError);
      expect((err as SearchEncryptedFieldError).table).toBe('mixed');
      expect((err as SearchEncryptedFieldError).column).toBe('secret');
    }
  });

  it('allows encrypted property when it is NOT searchable', () => {
    const meta = {
      tableName: 'mixed2',
      properties: [
        { name: 'id', columnName: 'id', type: 'string', primary: true },
        { name: 'title', columnName: 'title', type: 'string', searchable: true },
        { name: 'secret', columnName: 'secret', type: 'string', encrypted: true }
      ]
    };
    const plan = extractFtsPlanFromMetadata(meta as unknown as EntityMetadata)!;
    expect(plan.fields.map(f => f.name)).toEqual(['title']);
  });
});

describe('computeFtsSchemaSignature', () => {
  it('is deterministic for the same fields', () => {
    const fields = [
      { name: 'title', isArray: false },
      { name: 'tags', isArray: true }
    ];
    expect(computeFtsSchemaSignature(fields)).toBe(computeFtsSchemaSignature(fields));
  });

  it('is order-insensitive (sorts fields by name)', () => {
    const a = computeFtsSchemaSignature([
      { name: 'title', isArray: false },
      { name: 'tags', isArray: true }
    ]);
    const b = computeFtsSchemaSignature([
      { name: 'tags', isArray: true },
      { name: 'title', isArray: false }
    ]);
    expect(a).toBe(b);
  });

  it('changes when adding a field', () => {
    const a = computeFtsSchemaSignature([{ name: 'title', isArray: false }]);
    const b = computeFtsSchemaSignature([
      { name: 'title', isArray: false },
      { name: 'body', isArray: false }
    ]);
    expect(a).not.toBe(b);
  });

  it('changes when toggling isArray', () => {
    const a = computeFtsSchemaSignature([{ name: 'tags', isArray: false }]);
    const b = computeFtsSchemaSignature([{ name: 'tags', isArray: true }]);
    expect(a).not.toBe(b);
  });

  // SQLC-013：索引侧变换与签名里的分词标识必须同步演进。
  // 改了 indexTextForFts 却不动标识 → 存量索引按旧切法、查询侧按新切法，
  // 漂移检测放行，整体失配且零告警；本用例把两者钉在一起，改一边必红另一边。
  describe('分词标识与索引侧变换绑定', () => {
    it('indexTextForFts 的切法未变（变了就必须同时 bump 分词标识）', () => {
      expect([
        indexTextForFts('全文搜索'),
        indexTextForFts('rxdb搜索'),
        indexTextForFts('搜索guide'),
        indexTextForFts('第3章'),
        indexTextForFts('rxdb 全文搜索 guide')
      ]).toEqual([
        '全 文 搜 索 全文 文搜 搜索',
        'rxdb 搜 索 搜索',
        '搜 索 搜索 guide',
        '第 3 章',
        'rxdb 全 文 搜 索 全文 文搜 搜索 guide'
      ]);
    });

    it('签名带上当前分词标识', () => {
      // 与上一条用例同步维护：切法一变，这里的版本号必须递增，
      // 存量安装才会被判为漂移而抛 SearchSchemaMismatchError。
      expect(computeFtsSchemaSignature([{ name: 'title', isArray: false }])).toContain(
        'unicode61+cjk-unigram-bigram-v3'
      );
    });
  });
});

describe('ftsMigrationName', () => {
  it('formats install migration name', () => {
    expect(ftsMigrationName('Article', 'install')).toBe('fts5__Article__v1__install');
  });

  it('formats backfill migration name', () => {
    expect(ftsMigrationName('Comment', 'backfill')).toBe('fts5__Comment__v1__backfill');
  });

  it('honours custom version', () => {
    expect(ftsMigrationName('Article', 'install', 2)).toBe('fts5__Article__v2__install');
  });
});
