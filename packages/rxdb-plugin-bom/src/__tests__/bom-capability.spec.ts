import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { LifecycleScope } from '@aiao/utils';
import { reachSqlFor } from '../reach/reach-sql.js';
import { bomSqlDialectFor } from '../resolve/bom-sql.js';
/**
 * @fileoverview 适配器矩阵能力声明测试（US-509 首轮 AC#6 / AC#7 / AC#12）
 *
 * AC#6：`http` / `supabase` 下 `init()` 显式 fail-fast（DDL 在远端，本仓发不出写入期环约束）；
 * AC#7：`cycleConstraintDdlForRemotePg()` 导出含 advisory 锁与隔离级别检查的 DDL 片段；
 * AC#12：BOM 实体声明同步配置即拒绝（`BomSyncUnsupportedError`，点名实体）。
 */

import { getEntityMetadata, RxDB, SyncType } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { buildPgBomTriggerDdl, buildSqliteBomTriggerDdl } from '../backend/bom-trigger-ddl.js';
import { BomItem, BomLineOccurrence } from '../entities.js';
import { assertBomSyncNotDeclared, resolveBomBackend, RxDBPluginBom } from '../plugin.js';
import { buildReachCycleDdl } from '../reach/cycle-ddl.js';
import { cycleConstraintDdlForRemotePg } from '../resolve/cycle-constraint-ddl.js';
import { BomResolutionError } from '../resolve/resolution.js';
import {
  BOM_CYCLE_PREFIX,
  BOM_DECIMAL_FORMAT_PREFIX,
  BOM_PUBLISH_VALIDATION_PREFIX,
  BOM_WRITE_PROTOCOL_PREFIX,
  BomBackendCapabilityError,
  BomCycleError,
  BomDecimalFormatError,
  BomPublishValidationError,
  BomSyncUnsupportedError,
  BomWriteProtocolError,
  normalizeBomError
} from '../types.js';

describe('resolveBomBackend（AC#6）', () => {
  it('http / supabase 显式 fail-fast：能力缺席不静默降级', async () => {
    for (const name of ['http', 'supabase'] as const) {
      await expect(resolveBomBackend(name)).rejects.toBeInstanceOf(BomBackendCapabilityError);
      await expect(resolveBomBackend(name)).rejects.toThrow('无写入期环约束');
      await expect(resolveBomBackend(name)).rejects.toThrow('cycleConstraintDdlForRemotePg');
    }
  });

  it('不认识的适配器同样显式拒绝，不落到默认 DDL', async () => {
    await expect(resolveBomBackend('memory')).rejects.toBeInstanceOf(BomBackendCapabilityError);
    await expect(resolveBomBackend(undefined)).rejects.toBeInstanceOf(BomBackendCapabilityError);
  });

  it('SQLite 家族与 pglite 返回各自触发器构造器', async () => {
    for (const name of ['wa-sqlite', 'sqlite', 'sqlite-wasm', 'sqliteai', 'sqlite-tauri', 'sqlite-electron']) {
      expect(await resolveBomBackend(name)).toBe(buildSqliteBomTriggerDdl);
    }
    expect(await resolveBomBackend('pglite')).toBe(buildPgBomTriggerDdl);
    expect(await resolveBomBackend('pglite-electron')).toBe(buildPgBomTriggerDdl);
  });

  it('Electron PGlite 的解析、可达维护和约束使用同一 PG 方言', () => {
    expect(bomSqlDialectFor('pglite-electron')).toBe(bomSqlDialectFor('pglite'));
    expect(reachSqlFor('pglite-electron')).toEqual(reachSqlFor('pglite'));
    expect(buildReachCycleDdl('pglite-electron')).toEqual(buildReachCycleDdl('pglite'));
  });

  it('适配器配置与活体实例不一致时在执行 DDL 前拒绝', async () => {
    const db = new RxDB({
      dbName: 'bom-mismatch',
      entities: [],
      sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
    });
    const adapter = new RxDBAdapterPGlite(db, { store: 'memory' });
    const bootstrap = vi.spyOn(adapter, 'bootstrapTransaction');
    const local = vi
      .spyOn(db, 'localAdapterSync', 'get')
      .mockReturnValue(adapter as unknown as RxDB['localAdapterSync']);
    const scope = new LifecycleScope('bom-mismatch');
    try {
      await expect(new RxDBPluginBom(db).install(scope)).rejects.toThrow(/配置适配器.*与实例不一致/);
      expect(bootstrap).not.toHaveBeenCalled();
    } finally {
      local.mockRestore();
      bootstrap.mockRestore();
      await scope.dispose();
    }
  });

  it('构造器对发生项元数据产出非空 DDL；判环只由可达闭包版 DDL 提供', () => {
    const metadata = getEntityMetadata(BomLineOccurrence);
    const sqlite = buildSqliteBomTriggerDdl(metadata).join('\n');
    expect(sqlite).toContain('CREATE TRIGGER');
    expect(sqlite).not.toContain('bom_line_occurrence_cycle_i');
    const pgBackend = buildPgBomTriggerDdl(metadata).join('\n');
    expect(pgBackend).toContain('CREATE OR REPLACE FUNCTION');
    expect(pgBackend).not.toContain('bom_line_occurrence__cycle_guard');
    expect(buildReachCycleDdl('wa-sqlite').join('\n')).toContain('bom_line_occurrence_cycle_i');
    const pg = buildReachCycleDdl('pglite').join('\n');
    expect(pg).toContain('bom_line_occurrence__cycle_guard');
    expect(pg).toContain('WITH RECURSIVE');
  });
});

describe('cycleConstraintDdlForRemotePg（AC#7）', () => {
  it('DDL 含 advisory 锁、隔离级别检查与递归判环', () => {
    const ddl = cycleConstraintDdlForRemotePg();
    // (bom_type, org_id) 级 pg_advisory_xact_lock
    expect(ddl).toContain('pg_advisory_xact_lock');
    expect(ddl).toContain('hashtext');
    expect(ddl).toContain('bomType');
    expect(ddl).toContain('orgId');
    // 隔离级别是合同的一部分
    expect(ddl).toContain('transaction_isolation');
    expect(ddl).toContain('read committed');
    // 与本地 PGlite 同口径的递归判环 + 函数 / 触发器对象
    expect(ddl).toContain('bom_cycle_guard_remote');
    expect(ddl).toContain('WITH RECURSIVE');
    expect(ddl).toContain('bom_line_occurrence_cycle_remote_trg');
    expect(ddl).toContain('rxdb:bom_cycle:');
  });
});

describe('normalizeBomError（触发器消息归一）', () => {
  it('十进制 / 发布校验 / 写入协议前缀各归一为对应错误类', () => {
    const decimal = normalizeBomError(new Error(`${BOM_DECIMAL_FORMAT_PREFIX}qty: 非规范串`));
    expect(decimal).toBeInstanceOf(BomDecimalFormatError);
    expect((decimal as BomDecimalFormatError).field).toBe('qty');
    const publish = normalizeBomError(new Error(`${BOM_PUBLISH_VALIDATION_PREFIX}item_revision 追溯发布被拒`));
    expect(publish).toBeInstanceOf(BomPublishValidationError);
    const protocol = normalizeBomError(new Error(`${BOM_WRITE_PROTOCOL_PREFIX}bom_line 已发布头的成员写入被拒`));
    expect(protocol).toBeInstanceOf(BomWriteProtocolError);
  });

  it('十进制违约保留触发器给的域细节；无细节时才用通用描述', () => {
    const domain = normalizeBomError(
      new Error('wrap', {
        cause: new Error(`${BOM_DECIMAL_FORMAT_PREFIX}usageProbability:替代概率限 [0,1]、小数至多 9 位`)
      })
    );
    expect(domain).toBeInstanceOf(BomDecimalFormatError);
    expect((domain as BomDecimalFormatError).field).toBe('usageProbability');
    expect((domain as BomDecimalFormatError).detail).toBe('替代概率限 [0,1]、小数至多 9 位');
    const bare = normalizeBomError(new Error(`${BOM_DECIMAL_FORMAT_PREFIX}qty`)) as BomDecimalFormatError;
    expect(bare.field).toBe('qty');
    expect(bare.detail).toBe('存储层拒绝非规范十进制串');
  });

  it('沿 cause 链找到内层触发器消息；非 BOM 消息返回 undefined', () => {
    const wrapped = new Error('适配器包装错误', { cause: new Error(`${BOM_CYCLE_PREFIX}a>b` as string) });
    const cycle = normalizeBomError(wrapped);
    expect(cycle).toBeInstanceOf(BomCycleError);
    expect((cycle as BomCycleError).path).toEqual(['a', 'b']);
    expect(normalizeBomError(new Error('普通 SQL 错误'))).toBeUndefined();
  });

  it.each(['isolation:repeatable read', 'existing_graph'])('远程守卫配置失败不伪造物料环路径：%s', payload => {
    const error = normalizeBomError(new Error('外层', { cause: new Error(`${BOM_CYCLE_PREFIX}${payload}`) }));
    expect(error).toMatchObject({ code: 'BOM_BACKEND_CONFIGURATION', detail: payload });
    expect(error).not.toBeInstanceOf(BomCycleError);
  });

  it('BomResolutionError 的 field 可缺省（消息不含字段段）', () => {
    const error = new BomResolutionError(undefined, '违约');
    expect(String(error.message)).toContain('解析违约：违约');
  });
});

describe('assertBomSyncNotDeclared（AC#12）', () => {
  const syncOf = (type: SyncType | undefined) => ({
    resolve: () => (type === undefined ? undefined : { type })
  });

  it('任一 BOM 实体声明非 None 同步即拒绝并点名实体', () => {
    for (const type of [SyncType.Full, SyncType.Filter]) {
      let caught: unknown;
      try {
        assertBomSyncNotDeclared(syncOf(type), [BomItem, BomLineOccurrence]);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(BomSyncUnsupportedError);
      expect(String((caught as BomSyncUnsupportedError).message)).toContain('BomItem');
      expect(String((caught as BomSyncUnsupportedError).message)).toContain('首轮不参与同步');
    }
  });

  it('SyncType.None 或未声明同步配置则通过', () => {
    expect(() => assertBomSyncNotDeclared(syncOf(SyncType.None), [BomItem, BomLineOccurrence])).not.toThrow();
    expect(() => assertBomSyncNotDeclared(syncOf(undefined), [BomItem, BomLineOccurrence])).not.toThrow();
  });
});
