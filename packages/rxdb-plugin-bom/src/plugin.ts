/**
 * @fileoverview BOM 插件：仓储门面 + 存储层触发器的下发
 *
 * 触发器下发照 `@aiao/rxdb-plugin-search` 的先例：`inject: ['adapter:local']` 保证
 * `install()` 被调用时本地适配器引导链（迁移、建表、索引收敛）已跑完；DDL 经
 * `bootstrapTransaction` 执行（此刻 `RxDB.connect()` 还卡在等插件安装，裸查询会等自己）。
 * 后端按适配器名分叉：SQLite 家族与 PGlite 各一份 DDL，其余显式声明不支持（US-030 AC#6）。
 * 判环只有可达闭包版一份实现（`reach/`），随发生项与全部实体 DDL 在同一事务里下发：
 * 先做纯校验（同步策略 / 适配器仓储轴 / 实体依赖闭合），再整批执行，全有或全无。
 * DDL 幂等（`DROP … IF EXISTS` + `CREATE` / `CREATE OR REPLACE`），重连不产生第二份对象；
 * 库里已装定义与本批语句一致时整批跳过，不一致（升级、缺失、漂移）时整批重装。
 */

import type { EntityMetadata, EntityType, IRxDBPlugin, Plugin, RxDB, TransactionExecutor } from '@aiao/rxdb';
import { getEntityMetadata, RxDBPluginBase, SyncType } from '@aiao/rxdb';
import type { LifecycleScope } from '@aiao/utils';
import { firstValueFrom, Observable } from 'rxjs';
import type { BomTriggerDdlOptions } from './backend/bom-trigger-ddl.js';
import {
  BOM_ENTITIES,
  BomAttrDef,
  BomConfigChar,
  BomConfigCharValue,
  BomConfigCondition,
  BomHeader,
  BomItem,
  BomLineOccurrence
} from './entities.js';
import type {
  BomInstanceQueryOptions,
  BomInstanceTraceResult,
  BomInstanceTraceTarget,
  BomInstanceTreeResult
} from './instance.js';
import { rollupCost as runRollupCost } from './quantity/cost-api.js';
import type { CostRollupContext, CostRollupResult } from './quantity/cost.js';
import { explodeBom as runExplodeBom } from './quantity/explosion-api.js';
import type { ExplosionOptions, ExplosionResult } from './quantity/explosion.js';
import { buildReachInstallDdl } from './reach/install.js';
import { createBomReachSystem } from './reach/system.js';
import { BomRepository } from './repository.js';
import { isBomPostgres } from './resolve/bom-sql.js';
import { cycleConstraintDdlForRemotePg } from './resolve/cycle-constraint-ddl.js';
import { ecnDiff as runEcnDiff, ecnImpact as runEcnImpact } from './resolve/ecn-api.js';
import type { EcnDiffResult, EcnImpactResult } from './resolve/ecn.js';
import {
  expandBom as runExpandBom,
  whereUsed as runWhereUsed,
  type ExpansionOptions,
  type ExpansionResult,
  type WhereUsedTarget
} from './resolve/expansion.js';
import type { BomExportPayload } from './resolve/export-contract.js';
import { filterByAttr as runFilterByAttr, type ExtAttrQueryFilter, type ExtAttrScope } from './resolve/ext-attr.js';
import { loadHistory } from './resolve/history-api.js';
import type { HistoryBatchInput } from './resolve/history-loader.js';
import { exportBom as runExportBom, importBomDraft as runImportBomDraft } from './resolve/integration-api.js';
import type { BomImportResult } from './resolve/integration.js';
import type { ResolutionContext, ResolutionResult } from './resolve/resolution.js';
import { resolveBom, type ResolveTarget } from './resolve/resolver.js';
import { BomBackendCapabilityError, BomError, BomSyncUnsupportedError } from './types.js';
import type { BomViewInput, BomViewSnapshot } from './view-types.js';

/** SQLite 家族适配器名（与各适配器包的 `ADAPTER_NAME` 一致）。 */
const SQLITE_ADAPTER_NAMES: ReadonlySet<string> = new Set([
  'wa-sqlite',
  'sqlite',
  'sqlite-wasm',
  'sqliteai',
  'sqlite-tauri',
  'sqlite-electron'
]);

export type BomTriggerDdlBuilder = (
  metadata: ReturnType<typeof getEntityMetadata>,
  options?: BomTriggerDdlOptions
) => string[];

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
export const resolveBomBackend = async (adapterName: string | undefined): Promise<BomTriggerDdlBuilder> => {
  if (adapterName !== 'postgres' && isBomPostgres(adapterName))
    return (await import('./backend/bom-trigger-ddl.js')).buildPgBomTriggerDdl;
  if (adapterName && SQLITE_ADAPTER_NAMES.has(adapterName)) {
    return (await import('./backend/bom-trigger-ddl.js')).buildSqliteBomTriggerDdl;
  }
  if (adapterName === 'http' || adapterName === 'supabase') {
    // US-509 AC#6：DDL 在远端，本仓发不出写入期环约束——显式声明能力缺席并 fail-fast
    throw new BomBackendCapabilityError(
      adapterName,
      '无写入期环约束（DDL 在远端），可经 cycleConstraintDdlForRemotePg() 导出 DDL 自行部署'
    );
  }
  throw new BomBackendCapabilityError(adapterName ?? '(no local adapter)');
};

/** install 期取仓储与执行 DDL 所需的本地适配器能力。 */
type BomInstallAdapter = Pick<NonNullable<RxDB['localAdapterSync']>, 'name' | 'getRepository'>;

/**
 * 适配器仓储轴校验：BOM 实体声明的仓储名必须已在适配器 `options.repositories` 注册。
 *
 * @remarks
 * 门面轴随 `use()` 注册，适配器轴只能由宿主在构造适配器时给出；漏配时建表与触发器
 * 都能成功，直到第一次读写才炸。install 期逐实体取一次仓储，把接线遗漏前移成可操作的
 * {@link BomBackendCapabilityError}。
 */
const assertBomRepositoriesRegistered = (adapter: BomInstallAdapter, entities: readonly EntityType[]): void => {
  for (const EntityType of entities) {
    try {
      adapter.getRepository(EntityType);
    } catch (cause) {
      const { repository } = getEntityMetadata(EntityType);
      const implementation = isBomPostgres(adapter.name) ? 'PGliteRepository' : 'SqliteRepository';
      throw new BomBackendCapabilityError(
        adapter.name,
        `适配器仓储轴未注册 ${repository}（${cause instanceof Error ? cause.message : String(cause)}）；` +
          `请在适配器 options.repositories 中注册 { ${repository}: ${implementation} }`
      );
    }
  }
};

/**
 * 仓储写入期校验会读、却不经关系 / 外键声明的实体（DDL 推不出，显式登记）。
 *
 * @remarks
 * 与 `repository.ts` 的 `validateBomWrite` 同步维护：ext 作用域实体创建时按 `attr_def` 校验扩展属性，
 * 配置条件写入时按特征 / 特征值校验表达式。关系与外键的目标由核心在连接期校验，不在此列。
 */
const WRITE_PATH_DEPENDENCIES: ReadonlyMap<EntityType, readonly EntityType[]> = new Map<
  EntityType,
  readonly EntityType[]
>([
  [BomItem, [BomAttrDef]],
  [BomHeader, [BomAttrDef]],
  [BomLineOccurrence, [BomAttrDef]],
  [BomConfigCondition, [BomConfigChar, BomConfigCharValue]]
]);

/** 识别 DDL 对一张 BOM 表的引用：SQLite `"bom$表"`，PG `"bom"."表"` / `bom.表`。 */
const tableReference = ({ namespace, tableName }: EntityMetadata): RegExp =>
  new RegExp(`"${namespace}\\$${tableName}"|(?:"${namespace}"|\\b${namespace})\\."?${tableName}(?!\\w)`);

/**
 * 实体依赖闭合校验：在列实体的存储层 DDL 与仓储写入校验读取的每张 BOM 表都必须在 `entities` 里。
 *
 * @param statements - 每个在列实体的后端 DDL
 * @param reach - 判环与可达维护 DDL，计入发生项的依赖
 * @throws {@link BomError} 点名缺依赖的实体与它们读取却未配置的实体
 *
 * @remarks
 * 存储层依赖取自即将下发的 DDL 文本本身，随触发器演进自动同步；写入路径依赖见
 * {@link WRITE_PATH_DEPENDENCIES}。合法的部分配置是依赖闭合的子集（如物料 + 扩展属性定义，
 * 再加修订 + 历史批次）；不闭合时两后端在任何 DDL 之前同一时点拒绝，而不是把「表不存在」
 * 推迟到首次写入（SQLite 在语句编译期、PG 在函数执行到对应分支时才暴露，时点不一致）。
 */
const assertBomEntityDependencies = (
  statements: ReadonlyMap<EntityType, readonly string[]>,
  reach: readonly string[]
): void => {
  const absent = BOM_ENTITIES.filter(EntityType => !statements.has(EntityType));
  const gaps = [...statements].flatMap(([EntityType, ddl]) => {
    const text = [...ddl, ...(EntityType === BomLineOccurrence ? reach : [])].join('\n');
    const writes = WRITE_PATH_DEPENDENCIES.get(EntityType) ?? [];
    const missing = absent.filter(
      Other => writes.includes(Other) || tableReference(getEntityMetadata(Other)).test(text)
    );
    if (missing.length === 0) return [];
    return [
      `${getEntityMetadata(EntityType).name} → ${missing.map(Other => getEntityMetadata(Other).name).join('、')}`
    ];
  });
  if (gaps.length > 0) {
    throw new BomError(
      `BOM 实体配置不闭合，存储层约束或仓储写入校验读取了未配置的实体：${gaps.join('；')}。` +
        '请把它们一并加入 entities（部分配置只支持依赖闭合的子集，如物料 + 扩展属性定义）'
    );
  }
};

const executeDdl = async (executor: TransactionExecutor, statement: string): Promise<void> => {
  try {
    await executor.query(statement);
  } catch (error) {
    throw new Error(`BOM 触发器 DDL 安装失败：${statement}`, { cause: error });
  }
};

/** 一批安装语句所定义的对象；认不出的语句没有对象可比对，整批不可跳过。 */
interface DdlObjects {
  triggers: string[];
  functions: { schema: string; name: string }[];
}

const TRIGGER_STATEMENT = /^(?:DROP\s+TRIGGER\s+IF\s+EXISTS|CREATE\s+TRIGGER)\s+"([^"]+)"/i;
const FUNCTION_STATEMENT = /^CREATE\s+OR\s+REPLACE\s+FUNCTION\s+"([^"]+)"\."([^"]+)"\s*\(/i;
// PGlite 解析不了裸 CREATE TRIGGER 时的 DO 块形态：块内只许 DROP / CREATE TRIGGER
const DO_BLOCK = /^DO\s+\$\$\s*BEGIN\s+([\s\S]*?)\s*END\s*\$\$\s*;?$/i;

const objectsOf = (statement: string): DdlObjects | undefined => {
  const text = statement.trim();
  const fn = FUNCTION_STATEMENT.exec(text);
  if (fn) return { triggers: [], functions: [{ schema: fn[1], name: fn[2] }] };
  const parts = DO_BLOCK.exec(text)?.[1]
    .split(';')
    .map(part => part.trim()) ?? [text];
  const names = parts.filter(part => part !== '').map(part => TRIGGER_STATEMENT.exec(part)?.[1]);
  return names.every(name => name !== undefined) ? { triggers: names, functions: [] } : undefined;
};

const collectObjects = (statements: readonly string[]): DdlObjects | undefined => {
  const all: DdlObjects = { triggers: [], functions: [] };
  for (const statement of statements) {
    const objects = objectsOf(statement);
    if (objects === undefined) return undefined;
    all.triggers.push(...objects.triggers);
    all.functions.push(...objects.functions);
  }
  return all;
};

/**
 * SQLite：目录里存的就是建触发器语句原文（去掉首尾空白与结尾分号），逐条按创建序比对。
 *
 * @remarks
 * 创建序（rowid）也要一致：同表同事件的触发器按逆创建序执行，决定多个守卫同时违约时先报哪一个。
 * 只比本批语句点名的触发器（含只删不建的旧名），核心的变更日志触发器不在其中。
 */
const sqliteDdlIsCurrent = async (executor: TransactionExecutor, statements: readonly string[]): Promise<boolean> => {
  const objects = collectObjects(statements);
  if (objects === undefined || objects.functions.length > 0) return false;
  const names = new Set(objects.triggers);
  const expected = statements
    .map(statement => statement.trim())
    .filter(statement => /^CREATE\s+TRIGGER\b/i.test(statement))
    .map(statement => statement.replace(/;$/, ''));
  const { rows } = await executor.query(
    `SELECT "name", "sql" FROM sqlite_master WHERE "type" = 'trigger' ORDER BY rowid`
  );
  const installed = rows.filter(row => names.has(String(row[0]))).map(row => String(row[1]));
  return installed.length === expected.length && installed.every((sql, index) => sql === expected[index]);
};

/**
 * PG 安装指纹：本批语句全文与它点名的函数 / 触发器的目录定义一并取 SHA-256。
 *
 * @remarks
 * PG 不存触发器原文（`pg_get_triggerdef` 是反解析结果），无法像 SQLite 那样直接比对语句；
 * 改为全量安装后在同一事务里把指纹记进本插件命名空间的 schema 注释。目录定义入指纹，
 * 是因为旧版本客户端、表重建或手工 DDL 改动对象时不会更新注释——只认注释会把它们当成已装。
 * 触发器按名字限定在本命名空间的表上，函数按「schema.名字」限定，核心的变更日志对象不在其中。
 * 恒返回一行：schema 不存在时注释为空、判为未装，由随后的 DDL 报出真实错误。
 */
const PG_FINGERPRINT_SQL = `SELECT obj_description(n.oid, 'pg_namespace'),
  encode(sha256(convert_to(length($1::text)::text || ':' || $1::text || coalesce((
    SELECT string_agg(definition, E'\\n' ORDER BY definition) FROM (
      SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p
      WHERE p.pronamespace = n.oid AND p.proname = ANY(string_to_array($4::text, ','))
      UNION ALL
      SELECT t.tgenabled::text || pg_get_triggerdef(t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND c.relnamespace = n.oid AND t.tgname = ANY(string_to_array($3::text, ','))
    ) installed
  ), ''), 'UTF8')), 'hex')
  FROM (SELECT $2::text AS nspname) target LEFT JOIN pg_namespace n ON n.nspname = target.nspname`;

/** 已记的注释与按当前目录算出的指纹；本批语句认不全、或函数不在同一个 schema 时为 `undefined`。 */
const readPgFingerprint = async (
  executor: TransactionExecutor,
  statements: readonly string[]
): Promise<{ schema: string; recorded: unknown; installed: string } | undefined> => {
  const objects = collectObjects(statements);
  const schemas = new Set(objects?.functions.map(fn => fn.schema));
  if (objects === undefined || schemas.size !== 1) return undefined;
  const [schema] = schemas;
  const { rows } = await executor.query(PG_FINGERPRINT_SQL, [
    statements.join('\n'),
    schema,
    objects.triggers.join(','),
    objects.functions.map(fn => fn.name).join(',')
  ]);
  return { schema, recorded: rows[0][0], installed: String(rows[0][1]) };
};

/** 库里已装的存储层定义与一批安装语句的比对与记录。 */
export interface InstalledBomDdl {
  /** 库里的对象恰是这批语句的产出（任一处不同、缺失或多出旧名即为 `false`） */
  isCurrent(executor: TransactionExecutor): Promise<boolean>;
  /** 全量下发之后、同一事务内记下本次安装（SQLite 目录原文即记录，无需另写） */
  record(executor: TransactionExecutor): Promise<void>;
}

/**
 * 按后端构造已装定义的比对器（导出供单测）。
 *
 * @param adapterName - 本地适配器名；PGlite 及其 Electron 宿主使用 PG 方言，其余已支持后端使用 SQLite 方言
 * @param statements - 与安装同序的全部 DDL
 * @returns 判定与记录两个动作，都在调用方的同一个安装事务里执行
 *
 * @remarks
 * 只有定义完全一致才跳过：插件升级改了任一条语句、旧版本客户端重装了自己的定义、表重建丢了触发器，
 * 都会判为未装并整批重装，升级后旧体不会留在库里。认不出的语句（触发器 / 触发器函数之外的 DDL）
 * 没有可比对的目录对象，整批永远判为未装。
 */
export const installedBomDdl = (adapterName: string, statements: readonly string[]): InstalledBomDdl => {
  if (!isBomPostgres(adapterName)) {
    return { isCurrent: executor => sqliteDdlIsCurrent(executor, statements), record: () => Promise.resolve() };
  }
  return {
    isCurrent: async executor => {
      const fingerprint = await readPgFingerprint(executor, statements);
      return fingerprint !== undefined && fingerprint.recorded === fingerprint.installed;
    },
    record: async executor => {
      const fingerprint = await readPgFingerprint(executor, statements);
      if (fingerprint === undefined) return;
      await executeDdl(executor, `COMMENT ON SCHEMA "${fingerprint.schema}" IS '${fingerprint.installed}'`);
    }
  };
};

/** 活视图快照（US-522）：结构恒在，数量违约时 explosion 为 null、quantityError 携带原因。 */
export interface LiveSnapshot {
  expansion: ExpansionResult;
  explosion: ExplosionResult | null;
  quantityError: unknown | null;
}

/** BOM 插件门面，提供领域查询并安装存储层约束。 */
export class RxDBPluginBom extends RxDBPluginBase implements IRxDBPlugin {
  readonly lifecycle = 'scoped' as const;
  readonly inject = ['adapter:local'] as const;
  name: Uncapitalize<string> = 'bom';
  /** 内部可达性实体的建表与升级贡献。 */
  readonly system = createBomReachSystem(this.rxdb);

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

  /** 按实际安装事实展开实例；省略时点时返回全部安装历史。 */
  async expandInstance(rootId: string, options?: BomInstanceQueryOptions): Promise<BomInstanceTreeResult> {
    const adapter = await firstValueFrom(this.rxdb.localAdapter$);
    const { expandInstance } = await import('./instance.js');
    return expandInstance(adapter, rootId, options);
  }

  /** 按实际序列号、批次或修订反查命中记录及其整机路径。 */
  async whereUsedInstance(
    target: BomInstanceTraceTarget,
    options?: BomInstanceQueryOptions
  ): Promise<BomInstanceTraceResult> {
    const adapter = await firstValueFrom(this.rxdb.localAdapter$);
    const { whereUsedInstance } = await import('./instance.js');
    return whereUsedInstance(adapter, target, options);
  }

  /**
   * 历史装载：一次事务写入已发布修订 / 头 / 行（US-508 AC#13/#14/#18）。
   */
  loadHistory(batch: HistoryBatchInput): Promise<void> {
    return firstValueFrom(this.rxdb.localAdapter$).then(adapter => loadHistory(adapter, batch));
  }

  /** 在一致快照中导出完整结构、数量与主数据（US-521）。 */
  exportBom(context: ResolutionContext, target: ResolveTarget, options?: ExplosionOptions): Promise<BomExportPayload> {
    return firstValueFrom(this.rxdb.localAdapter$).then(adapter => runExportBom(adapter, context, target, options));
  }

  /** 整批原子导入草稿，逐行返回诊断；发布由调用方显式执行（US-521）。 */
  importBomDraft(payload: unknown): Promise<BomImportResult> {
    return firstValueFrom(this.rxdb.localAdapter$).then(adapter => runImportBomDraft(adapter, payload));
  }

  /** 按属性声明的类型过滤扩展值；缺字段与 null 使用一致语义（US-519）。 */
  filterByAttr(appliesTo: ExtAttrScope, filters: ExtAttrQueryFilter[]): Promise<Record<string, unknown>[]> {
    return firstValueFrom(this.rxdb.localAdapter$).then(adapter => runFilterByAttr(adapter, appliesTo, filters));
  }

  /**
   * 订阅显式输入的结构、数量与显示信息，随真实实体事件更新。
   * @param input - 当前数据库中的完整解析上下文、目标、计划量、预算与公式参数
   * @returns 同一读取快照的派生数据及后台刷新标记
   */
  watchView(input: BomViewInput): Observable<BomViewSnapshot> {
    return this.rxdb.entityManager
      .getRepository<typeof BomHeader, BomRepository<typeof BomHeader>>(BomHeader)
      .watchView(input);
  }

  /** 远端PostgreSQL的写入期环约束DDL，部署由调用方负责。 */
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
  rollupCost(
    context: CostRollupContext,
    target: ResolveTarget,
    options?: { batchQty?: { value: string; uom: string } }
  ): Promise<CostRollupResult> {
    return firstValueFrom(this.rxdb.localAdapter$).then(adapter =>
      runRollupCost(adapter, context, target, options?.batchQty)
    );
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

  /**
   * 对 schema 里存在的每个 BOM 实体下发存储层触发器与可达维护（幂等、单事务）。
   *
   * @remarks
   * 校验全部排在第一条 DDL 之前。全部语句在一个引导事务里执行：任一失败整体回滚
   * （PG 首条失败即中止事务），不留「部分实体装上新触发器」的半成品。作用域在开事务前
   * 已失活就收手——DDL 幂等，新纪元从头重装；事务一旦开始就整体提交或整体回滚。
   * 库里已装定义与本批语句完全一致时（见 {@link installedBomDdl}）整批跳过，重连只读不写，
   * 不与同库其他连接争写锁；不一致就整批重装，保持「每次装全量、同表同事件按安装序执行」。
   */
  async #installTriggers(scope: LifecycleScope): Promise<void> {
    const adapterName = this.rxdb.config.sync?.local?.adapter;
    const buildDdl = await resolveBomBackend(adapterName);
    const adapter = this.rxdb.localAdapterSync;
    if (!adapter) {
      throw new BomBackendCapabilityError(adapterName ?? '(no local adapter)');
    }
    if (adapter.name !== adapterName)
      throw new BomBackendCapabilityError(adapter.name, `配置适配器 ${adapterName} 与实例不一致`);
    const presentEntities = BOM_ENTITIES.filter(EntityType =>
      (this.rxdb.config.entities as readonly EntityType[]).includes(EntityType)
    );
    // US-509 AC#12：BOM 实体首轮不参与同步——多写入端会绕过本地写入期环约束，
    // 离线两端分别写反向边合并成环的场景没有检测手段，配置校验即拒绝
    if (this.rxdb.entitySync) {
      assertBomSyncNotDeclared(this.rxdb.entitySync, presentEntities);
    }
    assertBomRepositoriesRegistered(adapter, presentEntities);
    const ddlOptions: BomTriggerDdlOptions = { historyProjection: presentEntities.includes(BomHeader) };
    const statements = new Map(
      presentEntities.map(EntityType => [EntityType, buildDdl(getEntityMetadata(EntityType), ddlOptions)])
    );
    // 判环与可达维护随发生项下发，排在全部实体 DDL 之后（SQLite 同事件触发器逆创建序执行，判环最先触发）
    const reach = statements.has(BomLineOccurrence) ? buildReachInstallDdl(adapter.name) : [];
    assertBomEntityDependencies(statements, reach);
    const all = [...[...statements.values()].flat(), ...reach];
    if (all.length === 0 || scope.state !== 'active') return;
    const installed = installedBomDdl(adapter.name, all);
    await adapter.bootstrapTransaction(async executor => {
      if (await installed.isCurrent(executor)) return;
      for (const statement of all) await executeDdl(executor, statement);
      await installed.record(executor);
    }, false);
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

/** 为数据库注册 BOM 仓储、领域门面和可达维护系统。 */
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
