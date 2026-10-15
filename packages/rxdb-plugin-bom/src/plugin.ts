/**
 * @fileoverview BOM 插件：仓储门面 + 存储层触发器的下发
 *
 * 触发器下发照 `@aiao/rxdb-plugin-search` 的先例：`inject: ['adapter:local']` 保证
 * `install()` 被调用时本地适配器引导链（迁移、建表、索引收敛）已跑完；DDL 经
 * `bootstrapTransaction` 执行（此刻 `RxDB.connect()` 还卡在等插件安装，裸查询会等自己）。
 * 后端按适配器名分叉：SQLite 家族与 PGlite 各一份 DDL，其余显式声明不支持（US-030 AC#6）。
 * DDL 幂等（`IF NOT EXISTS` / `CREATE OR REPLACE`），重连不产生第二份对象。
 */

import { SyncType } from '@aiao/rxdb';
import type { EntityType, IRxDBPlugin, Plugin, RxDB } from '@aiao/rxdb';
import { getEntityMetadata, RxDBPluginBase } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { firstValueFrom } from 'rxjs';
import { buildPgBomTriggerDdl, buildSqliteBomTriggerDdl } from './backend/bom-trigger-ddl.js';
import { cycleConstraintDdlForRemotePg } from './resolve/cycle-constraint-ddl.js';
import {
  expandBom as runExpandBom,
  whereUsed as runWhereUsed,
  type ExpansionOptions,
  type ExpansionResult,
  type WhereUsedTarget
} from './resolve/expansion.js';
import { explodeBom as runExplodeBom, type ExplosionOptions, type ExplosionResult } from './quantity/explosion.js';
import { rollupCost as runRollupCost, type CostRollupContext, type CostRollupResult } from './quantity/cost.js';
import { ecnDiff as runEcnDiff, ecnImpact as runEcnImpact, type EcnDiffResult, type EcnImpactResult } from './resolve/ecn.js';
import { loadHistory, type HistoryBatchInput } from './resolve/history-loader.js';
import { resolveBom, type ResolveTarget } from './resolve/resolver.js';
import type { ResolutionContext, ResolutionResult } from './resolve/resolution.js';
import { BOM_ENTITIES } from './entities.js';
import { BomRepository } from './repository.js';
import { BomBackendCapabilityError, BomSyncUnsupportedError } from './types.js';

/** SQLite 家族适配器名（与各适配器包的 `ADAPTER_NAME` 一致）。 */
const SQLITE_ADAPTER_NAMES: ReadonlySet<string> = new Set([
  'wa-sqlite',
  'sqlite',
  'sqlite-wasm',
  'sqliteai',
  'sqlite-tauri',
  'sqlite-electron'
]);

export type BomTriggerDdlBuilder = (metadata: ReturnType<typeof getEntityMetadata>) => string[];

/**
 * US-509 AC#12 的校验函数（导出供单测）：BOM 实体生效的同步策略必须为 `None`。
 */
export const assertBomSyncNotDeclared = (
  entitySync: { resolve(metadata: ReturnType<typeof getEntityMetadata>): { type: SyncType } | undefined },
  entities: readonly EntityType[]
): void => {
  for (const EntityType of entities) {
    const metadata = getEntityMetadata(EntityType);
    const sync = entitySync.resolve(metadata);
    if (sync && sync.type !== SyncType.None) {
      throw new BomSyncUnsupportedError(metadata.name);
    }
  }
};

/** 按适配器名解析后端 DDL 构造器；不认识的后端显式拒绝，不静默降级（导出供 AC#6 单测）。 */
export const resolveBomBackend = (adapterName: string | undefined): BomTriggerDdlBuilder => {
  if (adapterName === 'pglite') return buildPgBomTriggerDdl;
  if (adapterName && SQLITE_ADAPTER_NAMES.has(adapterName)) return buildSqliteBomTriggerDdl;
  if (adapterName === 'http' || adapterName === 'supabase') {
    // US-509 AC#6：DDL 在远端，本仓发不出写入期环约束——显式声明能力缺席并 fail-fast
    throw new BomBackendCapabilityError(adapterName, '无写入期环约束（DDL 在远端），可经 cycleConstraintDdlForRemotePg() 导出 DDL 自行部署');
  }
  throw new BomBackendCapabilityError(adapterName ?? '(no local adapter)');
};

export class RxDBPluginBom extends RxDBPluginBase implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  readonly inject = ['adapter:local'] as const;
  name: Uncapitalize<string> = 'bom';

  constructor(rxdb: RxDB) {
    super(rxdb);
    // 仓储注册必须在 use() 期完成：实体校验（EntityManager.init）先于适配器连接跑，
    // 而 `inject: ['adapter:local']` 把 install() 推迟到连接之后，晚于那个时点
    this.rxdb.repository('BomRepository', { class: BomRepository });
  }

  /**
   * 按显式解析上下文解析出唯一一份有效行集（US-508）。
   */
  resolve(context: ResolutionContext, target: ResolveTarget): Promise<ResolutionResult> {
    return firstValueFrom(this.rxdb.localAdapter$).then(adapter => resolveBom(adapter, context, target));
  }

  /**
   * 历史装载：一次事务写入已发布修订 / 头 / 行（US-508 AC#13/#14/#18）。
   */
  loadHistory(batch: HistoryBatchInput): Promise<void> {
    return firstValueFrom(this.rxdb.localAdapter$).then(adapter => loadHistory(adapter, batch));
  }

  /**
   * 远端 PostgreSQL 的写入期环约束 DDL（US-509 AC#7，部署与否由使用方负责）。
   */
  cycleConstraintDdlForRemotePg(): string {
    return cycleConstraintDdlForRemotePg();
  }

  /**
   * 多级展开（下钻，US-510 阶段 A）：返回各级子件、层级与路径，预算触顶带 `truncated`。
   */
  expandBom(context: ResolutionContext, target: ResolveTarget, options?: ExpansionOptions): Promise<ExpansionResult> {
    return firstValueFrom(this.rxdb.localAdapter$).then(adapter => runExpandBom(adapter, context, target, options));
  }

  /**
   * where-used 反查（US-510 阶段 A）：返回使用给定子件的父件与路径，预算触顶带 `truncated`。
   */
  whereUsed(context: ResolutionContext, target: WhereUsedTarget, options?: ExpansionOptions): Promise<ExpansionResult> {
    return firstValueFrom(this.rxdb.localAdapter$).then(adapter => runWhereUsed(adapter, context, target, options));
  }

  /**
   * 七步数量展开（US-511 阶段 A/B1/C）：虚拟件穿透、损耗与换算后的需求行，
   * 预算触顶带 `truncated`；数量语义违约整次拒绝。
   */
  explodeBom(context: ResolutionContext, target: ResolveTarget, options: ExplosionOptions): Promise<ExplosionResult> {
    return firstValueFrom(this.rxdb.localAdapter$).then(adapter => runExplodeBom(adapter, context, target, options));
  }

  /**
   * 成本卷算（US-514）：拓扑逆序单遍，材料 + 加工 + 制费 − 副产抵减，逐层明细可展开；
   * 缺成本/缺费率/币种不符/环/unresolved 即拒绝，不以 0 兜底。
   */
  rollupCost(context: CostRollupContext, target: ResolveTarget, options?: { batchQty?: { value: string; uom: string } }): Promise<CostRollupResult> {
    return firstValueFrom(this.rxdb.localAdapter$).then(adapter => runRollupCost(adapter, context, target, options?.batchQty));
  }

  /**
   * ECN 影响面（US-515 AC#1）：成员发生项的头物料按 ECN 生效日 where-used 走到顶，
   * 返回被改物料、顶层整机与命中路径。
   */
  ecnImpact(ecnId: string): Promise<EcnImpactResult> {
    return firstValueFrom(this.rxdb.localAdapter$).then(adapter => runEcnImpact(adapter, ecnId));
  }

  /**
   * ECN 差异（US-515 AC#2）：生效前后两个评估日对涉及的头各解析一次，按逻辑行对齐
   * 对比——新增 / 删除（截止）/ 改量 / 改版（换子件）四类。
   */
  ecnDiff(ecnId: string): Promise<EcnDiffResult> {
    return firstValueFrom(this.rxdb.localAdapter$).then(adapter => runEcnDiff(adapter, ecnId));
  }

  install(scope: LifecycleScope): Promise<void> {
    // 安装失败必须显式失败 connect：吞掉会让「触发器没装上」伪装成正常启动
    return this.#installTriggers(scope);
  }

  /** 对 schema 里存在的每个 BOM 实体下发存储层触发器（幂等）。 */
  async #installTriggers(scope: LifecycleScope): Promise<void> {
    const adapterName = this.rxdb.config.sync?.local?.adapter;
    const buildDdl = resolveBomBackend(adapterName);
    const adapter = this.rxdb.localAdapterSync;
    if (!adapter) {
      throw new BomBackendCapabilityError(adapterName ?? '(no local adapter)');
    }
    const presentEntities = BOM_ENTITIES.filter(EntityType =>
      (this.rxdb.config.entities as readonly EntityType[]).includes(EntityType)
    );
    // US-509 AC#12：BOM 实体首轮不参与同步——多写入端会绕过本地写入期环约束，
    // 离线两端分别写反向边合并成环的场景没有检测手段，配置校验即拒绝
    if (this.rxdb.entitySync) {
      assertBomSyncNotDeclared(this.rxdb.entitySync, presentEntities);
    }
    for (const EntityType of presentEntities) {
      if (scope.state !== 'active') return;
      const statements = buildDdl(getEntityMetadata(EntityType));
      if (statements.length === 0) continue;
      await adapter.bootstrapTransaction(async executor => {
        for (const statement of statements) {
          try {
            await executor.query(statement);
          } catch (error) {
            throw new Error(`BOM 触发器 DDL 安装失败：${statement}`, { cause: error });
          }
        }
      }, false);
    }
  }
}

declare module '@aiao/rxdb' {
  interface RxDB {
    bom: RxDBPluginBom;
  }
  interface RxDBRepositories {
    BomRepository: typeof BomRepository;
  }
}

export const rxDBPluginBom: Plugin = (db: RxDB) => {
  const plugin = new RxDBPluginBom(db);
  // 门面属性在工厂里挂（search 插件的先例）：`declare module` 只解决类型，运行时靠这里
  Object.defineProperty(db, 'bom', {
    value: plugin,
    enumerable: false,
    configurable: false,
    writable: false
  });
  return plugin;
};
