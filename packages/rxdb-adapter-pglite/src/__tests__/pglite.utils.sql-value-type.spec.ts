/**
 * @fileoverview PGL-011：内联字面量的类型必须由目标列决定，不能按值的形状猜
 *
 * `getSqlValue` 只凭正则判断字符串「长得像 UUID」就加 `::uuid`。
 * 主键是 varchar 而值恰好是 UUID 形状时，写入报 42804、比较报 42883。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGliteClient } from '../PGliteClient.js';
import { getSqlValue } from '../pglite.utils.js';
import { generateDbName } from './test-utils.js';

const UUID_SHAPED = '4e1f6f7c-0000-4000-8000-000000000001';

describe('PGL-011 内联字面量的类型来源', () => {
  let client: PGliteClient;

  beforeAll(async () => {
    client = new PGliteClient();
    await client.init(generateDbName(), { store: 'memory' });
    await client.exec(`CREATE TABLE t_varchar (id varchar PRIMARY KEY, note text)`);
    await client.exec(`CREATE TABLE t_uuid (id uuid PRIMARY KEY, note text)`);
  });

  afterAll(async () => {
    if (client) await client.disconnect();
  });

  it('UUID 形状的字符串不得被强制 cast 成 uuid', () => {
    expect(getSqlValue(UUID_SHAPED)).not.toContain('::uuid');
  });

  it('同一个字面量必须能写进 varchar 列', async () => {
    const literal = getSqlValue(UUID_SHAPED);
    await expect(client.exec(`INSERT INTO t_varchar (id, note) VALUES (${literal}, 'a')`)).resolves.toBeDefined();
  });

  it('同一个字面量同样能写进 uuid 列（由目标列推导类型）', async () => {
    const literal = getSqlValue(UUID_SHAPED);
    await expect(client.exec(`INSERT INTO t_uuid (id, note) VALUES (${literal}, 'a')`)).resolves.toBeDefined();
  });

  it('varchar 主键上的等值比较不得报 42883', async () => {
    const literal = getSqlValue(UUID_SHAPED);
    await client.exec(`INSERT INTO t_varchar (id, note) VALUES (${literal}, 'b') ON CONFLICT (id) DO NOTHING`);

    const found = await client.query<{ id: string }>(`SELECT id FROM t_varchar WHERE id = ${literal}`);
    expect(found.rows).toHaveLength(1);
    expect(found.rows[0].id).toEqual(UUID_SHAPED);
  });

  it('非 UUID 形状的字符串行为不变', () => {
    expect(getSqlValue('plain-text')).toEqual(`E'plain-text'`);
  });
});
