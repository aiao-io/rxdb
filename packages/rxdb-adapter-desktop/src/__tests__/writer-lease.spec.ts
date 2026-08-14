/**
 * US-207 AC#5：同一个 SQLite 文件上的多个窗口受 [US-304](../../../../requirements/stories/collaboration/US-304-writer-lease-migration-fencing.md)
 * 的 writer lease / fencing 契约约束。
 *
 * @remarks
 * 桌面 host 给每个 `open` 独立的 `DatabaseSync` 连接（见 `desktop-sqlite-host.ts` 的注释），
 * 于是「两个窗口打开同一个库」在数据库看来就是两个**真实**的 writer，而不是共享一条连接的两个句柄。
 * lease 表能不能在桌面路径上生效，完全取决于这条设计决定。
 *
 * 共享套件里每个用例只有一个 adapter，验不到「第二个 writer」这半边；
 * `system-schema-migration.multiprocess.spec.ts` 验的是跨 OS 进程的裸 `DatabaseSync`，
 * 中间没有 host 与协议层。两者都不覆盖本文件的场景，故单开。
 *
 * @module __tests__/writer-lease
 */

import {
  RXDB_CHANGE_CODEC_WATERMARK,
  RXDB_SYSTEM_SCHEMA_WATERMARK,
  RxDB,
  RxDBMigration,
  SyncType,
  getEntityMetadata
} from '@aiao/rxdb';
import { get_table_name_by_metadata, quote_sql_identifier } from '@aiao/rxdb-adapter-sqlite-core';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ADAPTER_NAME } from '../desktop-adapter.interface.js';
import type { DesktopHostTransport } from '../desktop-sqlite-client.js';
import { createDesktopSqliteHost, type DesktopSqliteHost } from '../desktop-sqlite-host.js';
import { RxDBAdapterDesktop } from '../RxDBAdapterDesktop.js';

const LEASE_TABLE = 'rxdb$rxdb_writer_lease';
const WATERMARKS = [RXDB_SYSTEM_SCHEMA_WATERMARK, RXDB_CHANGE_CODEC_WATERMARK] as const;

let workspace: string;
let host: DesktopSqliteHost;
let transport: DesktopHostTransport;
let connected: RxDB[];

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'rxdb-desktop-lease-'));
  connected = [];
  const listeners = new Set<(message: unknown) => void>();
  host = createDesktopSqliteHost({
    resolveDatabasePath: databaseName => join(workspace, databaseName),
    postChange: message => {
      for (const listener of listeners) listener(message);
    }
  });
  transport = {
    request: payload => host.handle(payload),
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
});

afterEach(async () => {
  for (const rxdb of connected) await rxdb.disconnectAll();
  host.closeAll();
  rmSync(workspace, { recursive: true, force: true });
});

/**
 * 打开一个「窗口」——即一个独立的 `RxDB` 实例，连到同一个物理库文件。
 *
 * @param dbName - 库名；两个窗口传同一个才谈得上争 lease
 * @returns 已连接的桌面适配器
 */
async function openWindow(dbName: string): Promise<RxDBAdapterDesktop> {
  const rxdb = new RxDB({
    dbName,
    context: { userId: 'userId' },
    entities: [],
    sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None }
  });
  connected.push(rxdb);
  rxdb.adapter(ADAPTER_NAME, async db => new RxDBAdapterDesktop(db, { transport }));
  await rxdb.getAdapter(ADAPTER_NAME);
  return (await rxdb.connect(ADAPTER_NAME)) as RxDBAdapterDesktop;
}

/**
 * 抹掉系统 schema 水位，制造一次「待迁移」。
 *
 * @remarks
 * 走裸连接而不是某个窗口的 `internalQuery`：变更触发器是每条连接自己的 TEMP 对象，
 * 从窗口里删，那个窗口会收到自己的变更事件并跟着发起一次迁移——本用例要看的是
 * 第二个窗口撞上第一个窗口的 lease，不是两个窗口同时抢着迁移。
 */
function expireSystemSchemaWatermarks(): void {
  const [fileName] = readdirSync(workspace).filter(name => name.endsWith('.sqlite3'));
  if (!fileName) throw new Error(`no database file was created in ${workspace}`);
  const migrationTable = quote_sql_identifier(get_table_name_by_metadata(getEntityMetadata(RxDBMigration)));
  const db = new DatabaseSync(join(workspace, fileName));
  try {
    db.prepare(`DELETE FROM ${migrationTable} WHERE "name" IN (${WATERMARKS.map(() => '?').join(', ')})`).run(
      ...WATERMARKS
    );
  } finally {
    db.close();
  }
}

describe('两个窗口打开同一个桌面库', () => {
  // AC#5：两个窗口必须各自登记 lease。少登记一条，迁移侧就看不见对方，fencing 无从谈起。
  it('registers one live lease per window', async () => {
    const dbName = 'lease-two-windows';
    const first = await openWindow(dbName);
    const second = await openWindow(dbName);

    // 不按 databaseId 过滤：它是 `<dbName>@<branch>_<version>`，把拼法写进断言只会让
    // 分支/版本策略一变就红。本用例一个临时目录一个库文件，表里本来就只有这一个库的行。
    const rows = await second.internalQuery(
      `SELECT "writerId", "databaseId" FROM "${LEASE_TABLE}" WHERE julianday("expiresAt") > julianday('now')`
    );
    const leases = rows.results.flatMap(result => result.rows);
    expect(new Set(leases.map(row => row[0])).size).toBe(2);
    // 两条 lease 必须落在同一个 databaseId 上，否则它们各写各的，谈不上互相看见。
    const databaseIds = [...new Set(leases.map(row => String(row[1])))];
    expect(databaseIds).toHaveLength(1);
    expect(databaseIds[0]).toMatch(new RegExp(`^${dbName}@`));
    void first;
  });

  // AC#5：第一个窗口的 lease 还活着时，第二个窗口不得擅自迁移系统 schema。
  // 这正是 US-304 拿来挡住「旧 writer 还在写、新版本已经开始改表」的那道闸。
  it('refuses to migrate the system schema while another window holds a live lease', async () => {
    const dbName = 'lease-migration-fencing';
    const first = await openWindow(dbName);

    // 制造一次「待迁移」：下一个连上来的窗口会试图取得 upgrade owner 并改表。
    expireSystemSchemaWatermarks();
    // 第一个窗口自始至终连着，它的 lease 也就一直是活的。
    expect((await first.internalQuery('SELECT 1')).results[0]?.rows).toEqual([[1]]);

    // 报错必须点名 lease —— 换成任何一句泛化的「迁移失败」，
    // 调用方就分不清该等对方退出还是该修数据。
    await expect(openWindow(dbName)).rejects.toThrow(/lease/i);
  });
});
