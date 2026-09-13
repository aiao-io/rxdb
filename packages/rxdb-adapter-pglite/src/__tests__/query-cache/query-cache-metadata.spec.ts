/**
 * PGL-012：QueryCache 的三个批量方法必须遵守实体 metadata。
 *
 * 这些方法是 `QueryCacheRepository` 的真实读写路径，数据来自远端适配器
 * （`RxDBAdapterSupabase.findByIds` 的 `select('*')`），键名由远端决定。
 * 旧实现从第一行取 `Object.keys` 直接拼列名，propertyMap / namespace /
 * 加密 / 类型转换全部绕过 —— 本文件逐条锁定正确契约。
 */
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { RxDBQueryCacheRowContractError } from '../../query-cache/query_cache_row_contract.js';
import { generateDbName } from '../test-utils.js';

const PASSPHRASE = 'pgl-012-passphrase';

@Entity({
  name: 'QcArticle',
  tableName: 'qc_articles',
  // 除 title 外一律 nullable：异构行用例的前提就是「某些行没有这个字段」，
  // 非空列会让缺字段的行直接撞 not-null 约束，测不到列集合分组这件事。
  properties: [
    { name: 'title', type: PropertyType.string, columnName: 'article_title' },
    { name: 'published', type: PropertyType.boolean, columnName: 'is_published', nullable: true },
    { name: 'viewCount', type: PropertyType.integer, columnName: 'view_count', nullable: true },
    { name: 'publishedAt', type: PropertyType.date, columnName: 'published_at', nullable: true },
    { name: 'secret', type: PropertyType.string, columnName: 'secret_note', encrypted: true, nullable: true }
  ]
})
class QcArticle extends EntityBase {
  title!: string;
  published?: boolean;
  viewCount?: number;
  publishedAt?: Date;
  secret?: string;
}

@Entity({
  name: 'QcShopItem',
  namespace: 'shop',
  tableName: 'qc_shop_items',
  properties: [{ name: 'sku', type: PropertyType.string }]
})
class QcShopItem extends EntityBase {
  sku!: string;
}

describe('PGL-012 QueryCache 必须遵守实体 metadata', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    const db = new RxDB({
      dbName: generateDbName(),
      context: { userId: 'userId' },
      entities: [QcArticle, QcShopItem],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    db.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    rxdb = db;
    adapter = await rxdb.getAdapter('pglite');
    await rxdb.connect('pglite');
    await adapter.encryption.unlock({ passphrase: PASSPHRASE });
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  const now = (): string => new Date().toISOString();

  describe('propertyMap 列名映射', () => {
    it('upsertMany 用 JS 属性名写入时，必须落到 columnName 指定的物理列', async () => {
      const id = crypto.randomUUID();
      await firstValueFrom(
        adapter.upsertMany('QcArticle', [
          { id, title: '映射标题', published: true, viewCount: 7, createdAt: now(), updatedAt: now() }
        ])
      );

      const result = await adapter.internalQuery<Record<string, unknown>>(
        `SELECT "article_title", "is_published", "view_count" FROM "public"."qc_articles" WHERE id = $1`,
        [id]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].article_title).toBe('映射标题');
      expect(result.rows[0].is_published).toBe(true);
      expect(result.rows[0].view_count).toBe(7);
    });

    it('upsertMany 必须做类型转换：ISO 字符串写入 date 列、真值写入 boolean 列', async () => {
      const id = crypto.randomUUID();
      const publishedAt = new Date('2026-03-04T05:06:07.000Z');
      await firstValueFrom(
        adapter.upsertMany('QcArticle', [
          {
            id,
            title: '类型转换',
            published: true,
            publishedAt,
            createdAt: now(),
            updatedAt: now()
          }
        ])
      );

      const result = await adapter.internalQuery<Record<string, unknown>>(
        `SELECT "published_at", "is_published" FROM "public"."qc_articles" WHERE id = $1`,
        [id]
      );
      expect(result.rows).toHaveLength(1);
      expect(new Date(result.rows[0].published_at as string).toISOString()).toBe(publishedAt.toISOString());
      expect(result.rows[0].is_published).toBe(true);
    });
  });

  describe('namespace 定位', () => {
    it('getMetadataByIds 必须定位到实体自己的 schema，而不是硬编码 public', async () => {
      const item = new QcShopItem();
      item.sku = 'SKU-META';
      await item.save();

      const result = await firstValueFrom(adapter.getMetadataByIds('QcShopItem', [item.id]));
      expect(result.size).toBe(1);
      expect(result.has(item.id)).toBe(true);
    });

    it('upsertMany 必须写进实体自己的 schema', async () => {
      const id = crypto.randomUUID();
      await firstValueFrom(
        adapter.upsertMany('QcShopItem', [{ id, sku: 'SKU-UPSERT', createdAt: now(), updatedAt: now() }])
      );

      const result = await adapter.internalQuery<Record<string, unknown>>(
        `SELECT "sku" FROM "shop"."qc_shop_items" WHERE id = $1`,
        [id]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].sku).toBe('SKU-UPSERT');
    });

    it('deleteByIds 必须删实体自己 schema 里的行', async () => {
      const item = new QcShopItem();
      item.sku = 'SKU-DELETE';
      await item.save();

      await firstValueFrom(adapter.deleteByIds('QcShopItem', [item.id]));

      const result = await adapter.internalQuery<Record<string, unknown>>(
        `SELECT "sku" FROM "shop"."qc_shop_items" WHERE id = $1`,
        [item.id]
      );
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('异构行', () => {
    it('后续行多出的字段不能被丢弃（列集合不能只取第一行）', async () => {
      const [first, second] = [crypto.randomUUID(), crypto.randomUUID()];
      await firstValueFrom(
        adapter.upsertMany('QcArticle', [
          { id: first, title: '第一行', createdAt: now(), updatedAt: now() },
          { id: second, title: '第二行', viewCount: 42, createdAt: now(), updatedAt: now() }
        ])
      );

      const result = await adapter.internalQuery<Record<string, unknown>>(
        `SELECT id, "view_count" FROM "public"."qc_articles" WHERE id = ANY($1) ORDER BY "article_title"`,
        [[first, second]]
      );
      expect(result.rows).toHaveLength(2);
      const byId = new Map(result.rows.map(row => [row.id, row.view_count]));
      expect(byId.get(second)).toBe(42);
    });

    it('前面行有、后面行没有的字段，不能被当成 undefined 写进后面行', async () => {
      const [first, second] = [crypto.randomUUID(), crypto.randomUUID()];
      await firstValueFrom(
        adapter.upsertMany('QcArticle', [
          { id: first, title: '有 viewCount', viewCount: 11, createdAt: now(), updatedAt: now() },
          { id: second, title: '没有 viewCount', createdAt: now(), updatedAt: now() }
        ])
      );

      const result = await adapter.internalQuery<Record<string, unknown>>(
        `SELECT id, "view_count" FROM "public"."qc_articles" WHERE id = ANY($1)`,
        [[first, second]]
      );
      const byId = new Map(result.rows.map(row => [row.id, row.view_count]));
      expect(byId.get(first)).toBe(11);
      expect(byId.get(second)).toBeNull();
    });
  });

  describe('远端行的列契约（US-024）', () => {
    it('AC#1 缺必填列时抛契约错误而不是 PG 的 not-null，且已有行分毫不动', async () => {
      const id = crypto.randomUUID();
      await firstValueFrom(
        adapter.upsertMany('QcArticle', [{ id, title: '原值', viewCount: 3, createdAt: now(), updatedAt: now() }])
      );

      // 只带 id：`title` / `createdAt` / `updatedAt` 都是本地表上 NOT NULL 且无 SQL 默认值的列
      const error = await firstValueFrom(adapter.upsertMany('QcArticle', [{ id }])).then(
        () => null,
        (reason: unknown) => reason as Error
      );

      // 病灶：以前这里是 PG 的 23502 `null value in column "createdAt" of relation
      // "qc_articles" violates not-null constraint` —— 表名是加了 schema 的**本地**表名、
      // 列名在**远端**的 schema 里根本不存在、调用栈落在适配器内部而不是那次 find()。
      // 三重误导，读者第一反应是「本地表建错了」。现在换成点名实体与缺失列的契约错误。
      expect(error).toBeInstanceOf(RxDBQueryCacheRowContractError);
      expect(error?.message).not.toMatch(/null value|not-null|syntax error/);
      expect(error?.message).toContain('QcArticle');
      expect(error?.message).toContain('createdAt');
      expect(error?.message).toContain('title');

      const result = await adapter.internalQuery<Record<string, unknown>>(
        `SELECT "article_title", "view_count" FROM "public"."qc_articles" WHERE id = $1`,
        [id]
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].article_title).toBe('原值');
      expect(result.rows[0].view_count).toBe(3);
    });

    it('AC#2 同批一行完整、一行缺列时整批不落地，连事务都不开', async () => {
      const [complete, broken] = [crypto.randomUUID(), crypto.randomUUID()];
      // 校验必须发生在 `transaction()` **之前**：否则「一行都没有落地」只是靠回滚兑现的，
      // 而数据库已经为一个注定失败的批次开过一次事务。钉住这个接缝，
      // 把「诊断在写之前给出」变成可自证的断言而不是注释里的承诺。
      const transactionSpy = vi.spyOn(adapter, 'transaction');

      try {
        const error = await firstValueFrom(
          adapter.upsertMany('QcArticle', [
            { id: complete, title: '完整的一行', createdAt: now(), updatedAt: now() },
            { id: broken, title: '缺 updatedAt 的一行', createdAt: now() }
          ])
        ).then(
          () => null,
          (reason: unknown) => reason as Error
        );

        expect(error).toBeInstanceOf(RxDBQueryCacheRowContractError);
        expect(error?.message).toContain('本批 2 行中 1 行不合格');
        expect(error?.message).toContain('一行都没有落地');
        expect(error?.message).toContain(broken);
        expect(transactionSpy).not.toHaveBeenCalled();
      } finally {
        transactionSpy.mockRestore();
      }

      const result = await adapter.internalQuery<Record<string, unknown>>(
        `SELECT id FROM "public"."qc_articles" WHERE id = ANY($1)`,
        [[complete, broken]]
      );
      // 完整的那一行也不在库里 —— 部分成功比整批失败更难查
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('未知键 fail-fast', () => {
    it('未知键必须在生成 SQL 之前被拒绝，并指名该键', async () => {
      const id = crypto.randomUUID();
      const error = await firstValueFrom(
        // 先带齐必填列：否则列契约（US-024）会在键名白名单之前抛错，这条用例就测不到未知键
        adapter.upsertMany('QcArticle', [
          { id, title: '未知键', notAPropertyAtAll: 1, createdAt: now(), updatedAt: now() }
        ])
      ).then(
        () => null,
        (reason: unknown) => reason as Error
      );

      // 同时要求错误里出现**实体名** —— 否则 PG 自己的
      // `column "notAPropertyAtAll" of relation "qc_articles" does not exist`
      // 会让这条用例意外变绿（它只提物理表名，不提实体名）。
      expect(error?.message).toMatch(/notAPropertyAtAll/);
      expect(error?.message).toMatch(/QcArticle/);

      const result = await adapter.internalQuery<Record<string, unknown>>(
        `SELECT id FROM "public"."qc_articles" WHERE id = $1`,
        [id]
      );
      expect(result.rows).toHaveLength(0);
    });

    it('注入形状的键不得进入 SQL 结构', async () => {
      const id = crypto.randomUUID();
      const injected = `x") VALUES ('pwned') --`;
      await expect(
        firstValueFrom(
          adapter.upsertMany('QcArticle', [
            { id, title: '注入形状', [injected]: 1, createdAt: now(), updatedAt: now() }
          ])
        )
      ).rejects.toThrow(/QcArticle/);

      const result = await adapter.internalQuery<Record<string, unknown>>(
        `SELECT count(*)::int AS total FROM "public"."qc_articles" WHERE id = $1`,
        [id]
      );
      expect(result.rows[0].total).toBe(0);
    });

    it('未配置的实体名必须 fail-fast，而不是静默降级到裸表名', async () => {
      await expect(firstValueFrom(adapter.getMetadataByIds('QcNotConfigured', ['x']))).rejects.toThrow(
        /QcNotConfigured/
      );
      await expect(firstValueFrom(adapter.deleteByIds('QcNotConfigured', ['x']))).rejects.toThrow(/QcNotConfigured/);
      await expect(firstValueFrom(adapter.upsertMany('QcNotConfigured', [{ id: 'x' }]))).rejects.toThrow(
        /QcNotConfigured/
      );
    });
  });

  describe('加密列', () => {
    it('upsertMany 不得把加密列的明文写进本地缓存', async () => {
      const id = crypto.randomUUID();
      const plaintext = 'top-secret-querycache';
      await firstValueFrom(
        adapter.upsertMany('QcArticle', [
          { id, title: '带密文', secret: plaintext, createdAt: now(), updatedAt: now() }
        ])
      );

      const result = await adapter.internalQuery<Record<string, unknown>>(
        `SELECT "secret_note" FROM "public"."qc_articles" WHERE id = $1`,
        [id]
      );
      expect(result.rows).toHaveLength(1);
      const stored = String(result.rows[0].secret_note);
      expect(stored).not.toContain(plaintext);
      expect(stored).toMatch(/^\d+\|/);
    });
  });
});
