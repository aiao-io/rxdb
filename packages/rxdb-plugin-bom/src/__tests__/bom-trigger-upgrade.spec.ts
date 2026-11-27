/**
 * @fileoverview 存储层触发器的升级替换回归测试
 *
 * 插件升级后旧版本留下的同名触发器（SQLite）/ 触发器函数（PGlite）必须在下一次连接时被新定义替换，
 * 不能新旧语义并存。双后端同断言：先把插件下发的全部触发器换成带标记的旧体（模拟旧版本），
 * 重开同一持久库后标记全部消失、触发器数量不变（重复连接幂等），守卫按新体生效。
 */

import { getEntityMetadata, uuid } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { buildPgBomTriggerDdl, buildSqliteBomTriggerDdl } from '../backend/bom-trigger-ddl.js';
import { BOM_ENTITIES, BomHeader, BomItem, BomItemRevision, BomLine } from '../entities.js';
import { createBomTestAdapter, disposeBomTestAdapter, type BomTestAdapter, type BomTestBackend } from './test-utils.js';

const LEGACY_MARKER = 'rxdb-legacy-trigger-body';

const rows = (adapter: BomTestAdapter, sql: string): Promise<unknown[][]> =>
  adapter.transaction(async executor => (await executor.query(sql)).rows, false);

const scalar = async (adapter: BomTestAdapter, sql: string): Promise<number> =>
  Number((await rows(adapter, sql))[0][0]);

/** 插件对全部 BOM 实体下发的 SQLite 触发器名。 */
const sqliteTriggerNames = (): string[] =>
  BOM_ENTITIES.flatMap(Entity => buildSqliteBomTriggerDdl(getEntityMetadata(Entity))).flatMap(statement =>
    [...statement.matchAll(/CREATE TRIGGER (?:IF NOT EXISTS )?"([^"]+)"/g)].map(match => match[1])
  );

/** 插件对全部 BOM 实体下发的 PGlite 触发器函数名。 */
const pgFunctionNames = (): string[] =>
  BOM_ENTITIES.flatMap(Entity => buildPgBomTriggerDdl(getEntityMetadata(Entity))).flatMap(statement =>
    [...statement.matchAll(/CREATE OR REPLACE FUNCTION "bom"\."([^"]+)"\(\)/g)].map(match => match[1])
  );

const inList = (names: string[]): string => names.map(name => `'${name}'`).join(', ');

/** SQLite：把插件下发的每个触发器换成同名、带标记、不做任何校验的旧体。 */
const installLegacySqliteBodies = async (adapter: BomTestAdapter): Promise<void> => {
  const triggers = await rows(
    adapter,
    `SELECT "name", "tbl_name" FROM sqlite_master WHERE type = 'trigger' AND "name" IN (${inList(sqliteTriggerNames())})`
  );
  for (const [name, table] of triggers) {
    await adapter.rawQuery(`DROP TRIGGER "${String(name)}"`);
    await adapter.rawQuery(
      `CREATE TRIGGER "${String(name)}" BEFORE INSERT ON "${String(table)}" BEGIN SELECT '${LEGACY_MARKER}'; END`
    );
  }
};

/** PGlite：把插件下发的每个触发器函数换成同名、带标记、直接放行的旧体。 */
const installLegacyPgBodies = async (adapter: BomTestAdapter): Promise<void> => {
  for (const name of new Set(pgFunctionNames())) {
    await adapter.rawQuery(
      `CREATE OR REPLACE FUNCTION "bom"."${name}"() RETURNS trigger AS $$ BEGIN PERFORM '${LEGACY_MARKER}'; ` +
        `IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`
    );
  }
};

/** 仍带旧体标记的触发器（SQLite）/ 触发器函数（PGlite）数。 */
const legacyBodyCount = (adapter: BomTestAdapter, backend: BomTestBackend): Promise<number> =>
  backend === 'wa-sqlite' ?
    scalar(adapter, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND sql LIKE '%${LEGACY_MARKER}%'`)
  : scalar(adapter, `SELECT COUNT(*) FROM pg_proc WHERE prosrc LIKE '%${LEGACY_MARKER}%'`);

/** 插件下发对象的现存数（SQLite 数触发器、PGlite 数触发器函数）。 */
const installedCount = (adapter: BomTestAdapter, backend: BomTestBackend): Promise<number> =>
  backend === 'wa-sqlite' ?
    scalar(
      adapter,
      `SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND "name" IN (${inList(sqliteTriggerNames())})`
    )
  : scalar(
      adapter,
      `SELECT COUNT(*) FROM pg_proc WHERE pronamespace = 'bom'::regnamespace AND proname IN (${inList(pgFunctionNames())})`
    );

const table = (backend: BomTestBackend, name: string): string =>
  backend === 'wa-sqlite' ? `"bom$${name}"` : `"bom"."${name}"`;

/** 直连插入一条 qty 为给定文本的发生项。 */
const insertOccurrence = (
  adapter: BomTestAdapter,
  backend: BomTestBackend,
  ids: { lineId: string; childId: string },
  qty: string
): Promise<unknown> =>
  adapter.rawQuery(
    `INSERT INTO ${table(backend, 'bom_line_occurrence')} ` +
      `("id", "lineId", "childItemId", "qty", "effectiveFrom", "createdAt", "updatedAt") ` +
      `VALUES ('${uuid()}', '${ids.lineId}', '${ids.childId}', '${qty}', '2026-01-01T00:00:00.000Z', ` +
      `'2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
  );

/** 建一套草稿装配（头 → 行 + 子件），返回直连插入发生项所需的 id。 */
const setup = async (): Promise<{ lineId: string; childId: string }> => {
  const item = new BomItem();
  item.itemNo = `up-parent-${Math.random().toString(36).slice(2, 10)}`;
  await item.save();
  const child = new BomItem();
  child.itemNo = `up-child-${Math.random().toString(36).slice(2, 10)}`;
  await child.save();
  const revision = new BomItemRevision();
  revision.revisionNo = 'A';
  revision.itemId = item.id;
  await revision.save();
  const header = new BomHeader();
  header.parentRevisionId = revision.id;
  header.bomType = 'ebom';
  header.orgId = 'org-x';
  await header.save();
  const line = new BomLine();
  line.headerId = header.id;
  line.lineNo = 10;
  await line.save();
  return { lineId: line.id, childId: child.id };
};

describe('存储层触发器升级替换', () => {
  it.each(['wa-sqlite', 'pglite'] satisfies BomTestBackend[])(
    '%s 重连把旧版本同名触发器全部替换为新定义',
    async backend => {
      const dbName = `trg-up-${Math.random().toString(36).slice(2, 10)}`;
      let first: BomTestAdapter | undefined = await createBomTestAdapter(backend, BOM_ENTITIES, {
        dbName,
        persistent: true
      });
      let reopened: BomTestAdapter | undefined;
      try {
        const ids = await setup();
        const installed = await installedCount(first, backend);
        expect(installed).toBeGreaterThan(0);
        await (backend === 'wa-sqlite' ? installLegacySqliteBodies(first) : installLegacyPgBodies(first));
        expect(await legacyBodyCount(first, backend)).toBeGreaterThan(0);
        // 旧体不校验：非规范十进制串直连写入照常成功（证明旧版本语义确已就位）
        await insertOccurrence(first, backend, ids, '01');
        await disposeBomTestAdapter(first);
        first = undefined;

        reopened = await createBomTestAdapter(backend, BOM_ENTITIES, { dbName, persistent: true });
        expect(await legacyBodyCount(reopened, backend)).toBe(0);
        expect(await installedCount(reopened, backend)).toBe(installed);
        await expect(insertOccurrence(reopened, backend, ids, '02')).rejects.toThrow('rxdb:bom_decimal_format:qty');
      } finally {
        if (reopened) await disposeBomTestAdapter(reopened);
        if (first) await disposeBomTestAdapter(first);
      }
    },
    60_000
  );
});
