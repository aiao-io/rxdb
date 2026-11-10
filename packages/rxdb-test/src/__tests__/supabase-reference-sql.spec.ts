// @vitest-environment node
/**
 * Supabase 参考 SQL（`docker/sql/03-business-tables.sql`）里的 `public.menu_large` 是 `MenuLarge` 的远端表，
 * 开发 / CI 的 Supabase 初始化链都加载它。本地适配器按实体元数据建表，`normalized` 同级唯一索引由数据库承担；
 * 远端表不建同语义的唯一索引时，重复的同级菜单在 Supabase 上写得进去，拉回本地却被本地唯一约束拒绝。
 *
 * 这里把参考 SQL 中 `menu_large` 的建表与建索引语句原样放进 PGlite（同为 PostgreSQL 17）执行，
 * 按实体声明的唯一索引验证重复写入被拒，并固定本用例覆盖的就是实体当前声明的那一条。
 */
import { getEntityMetadata } from '@aiao/rxdb';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MenuLarge } from '../../entities/MenuLarge.js';

const REFERENCE_SQL = readFileSync(new URL('../../../../docker/sql/03-business-tables.sql', import.meta.url), 'utf8');

/** 参考 SQL 中针对 `public.menu_large` 的建表与建索引语句，按出现顺序。 */
const menuLargeStatements = (sql: string): string[] => {
  const table = sql.match(/CREATE TABLE IF NOT EXISTS public\.menu_large \([\s\S]*?\n\);/)?.[0];
  if (!table) throw new Error('docker/sql/03-business-tables.sql 里找不到 public.menu_large 的建表语句');
  return [table, ...(sql.match(/CREATE (?:UNIQUE )?INDEX[^;]*\bON public\.menu_large\b[^;]*;/g) ?? [])];
};

describe('Supabase 参考 SQL：menu_large 落实 MenuLarge 的同级唯一索引', { timeout: 30_000 }, () => {
  let db: PGlite;

  const insertMenu = async (parentId: string | null, title: string): Promise<string> => {
    const result = await db.query<{ id: string }>(
      'INSERT INTO public.menu_large (title, "parentId") VALUES ($1, $2) RETURNING id',
      [title, parentId]
    );
    return result.rows[0].id;
  };

  beforeAll(async () => {
    db = new PGlite();
    for (const statement of menuLargeStatements(REFERENCE_SQL)) await db.exec(statement);
  }, 30_000);

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec('DELETE FROM public.menu_large');
  });

  it('实体当前只声明 (parentId, title) 一条 normalized 唯一索引', () => {
    const uniqueIndexes = getEntityMetadata(MenuLarge)
      .indexes.filter(index => index.unique)
      .map(index => ({ properties: index.properties, normalized: index.normalized }));

    expect(uniqueIndexes).toEqual([{ properties: ['parentId', 'title'], normalized: true }]);
  });

  it('根节点重名（含大小写变体）被拒', async () => {
    await insertMenu(null, 'Settings');

    await expect(insertMenu(null, 'Settings')).rejects.toThrow(/duplicate key value violates unique constraint/);
    await expect(insertMenu(null, 'settings')).rejects.toThrow(/duplicate key value violates unique constraint/);
  });

  it('同一父节点下重名（含大小写变体）被拒', async () => {
    const root = await insertMenu(null, 'Root');
    await insertMenu(root, 'Child');

    await expect(insertMenu(root, 'CHILD')).rejects.toThrow(/duplicate key value violates unique constraint/);
  });

  it('不同父节点下同名照常写入', async () => {
    const first = await insertMenu(null, 'First');
    const second = await insertMenu(null, 'Second');

    await insertMenu(first, 'Same');
    await insertMenu(second, 'Same');

    const { rows } = await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM public.menu_large WHERE title = 'Same'"
    );
    expect(rows[0].count).toBe(2);
  });
});
