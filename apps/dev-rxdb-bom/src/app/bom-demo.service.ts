import {
  getEntityMetadata,
  RxDB,
  SyncType,
  type EntityType,
  type TransactionExecutor,
  type TransactionFun,
  type UUID
} from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, SqliteRepository, type WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import {
  BOM_ENTITIES,
  BomEcn,
  BomError,
  BomHeader,
  BomInstanceNode,
  BomItem,
  BomItemRevision,
  BomLine,
  BomLineDesignator,
  BomLineOccurrence,
  BomSubstituteGroup,
  confirmMapping,
  decimalFromCanonical,
  decimalSub,
  decimalToCanonical,
  ecnDiff,
  ecnImpact,
  explodeBom,
  mappingCoverage,
  mappingGaps,
  normalizeBomError,
  rollupCost,
  rxDBPluginBom,
  type BomInstanceTraceResult,
  type BomInstanceTreeResult,
  type CostRollupResult,
  type EcnDiffResult,
  type EcnImpactResult,
  type ExpansionResult,
  type ExplosionResult,
  type MappingCoverageResult,
  type MappingGapsResult,
  type RequirementLine,
  type ResolutionContext
} from '@aiao/rxdb-plugin-bom';
import {
  deterministicId,
  goldenItemId,
  loadCoproductDataset,
  loadScooterDataset,
  loadScooterDatasetC,
  loadScooterDatasetD,
  loadScooterDatasetE,
  loadScooterDatasetF,
  SCOOTER_DATASET_F,
  SCOOTER_SEED_BATCH_NO,
  SCOOTER_SEED_TIMESTAMP
} from '@aiao/rxdb-plugin-bom/testing';
import { computed, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { BomWorkspaceContext } from './bom-workspace-state';
import type { RequirementCalculationBasis } from './components/step-panel';
import { materialChanges, type BomChangeReview } from './presentation/change-review';
import { loadRequirementBasis } from './presentation/requirement-basis';

/** demo 库名（reset 删除的 IndexedDB 库）。 */
const BOM_DEMO_DB_NAME = 'dev-rxdb-bom';

/**
 * 把已连接的 RxDB 实例挂到 RxDB DevTools 连接器，供 DevTools 扩展检查。
 *
 * @remarks
 * 动态 `import()` 换的是初始 chunk 的体积：`project.json` 的 production budget 卡在
 * initial 3mb，把整套 v2 线协议静态拉进首屏等于让调试设施消耗验收预算。晚到不影响
 * 可用性：面板连上后由 background 发 `PING`，连接器收到会重发握手，在那之前页面侧
 * 的事件先进缓冲区。
 *
 * 模块级导出是给单测留的直接打点口；生产路径只有 {@link BomDemoService} 的连接流程一处调用。
 */
export const connectDevTools = (instance: RxDB): void => {
  void import('@aiao/rxdb-devtools')
    .then(({ getDevToolsConnector }) => {
      getDevToolsConnector().init(instance, getEntityMetadata);
    })
    .catch((error: unknown) => {
      // 调试设施失败不该拖垮演示，但要报出来：chunk 加载失败多半是部署产物不全
      console.error('[dev-rxdb-bom] DevTools 连接器加载失败', error);
    });
};

/** 跨页面共用的解析条件，计划单位只交给数量接口。 */
export type BomDemoResolutionOptions = Partial<Omit<ResolutionContext, 'asOfDate'>> & { plannedUom?: string };

/**
 * 演示写入的判别结果：成功，或存储层 / 领域校验给出的预期拒绝（保留原始错误供核对）。
 * 预期之外的错误不进结果，照常抛给调用方。
 */
export type BomDemoOutcome<T extends object = Record<never, never>> =
  ({ readonly ok: true } & Readonly<T>) | { readonly ok: false; readonly error: unknown };

/** 只把存储层与领域校验的预期拒绝转成失败结果；其余错误照常抛出，不混进校验结论。 */
const rejected = (error: unknown): { readonly ok: false; readonly error: unknown } => {
  if (error instanceof BomError || normalizeBomError(error) !== undefined) return { ok: false, error };
  throw error;
};

/** 种子固定行的写入必须恰好命中一行，落空说明种子与演示脚本已经漂移。 */
const assertSeedRow = (rowsAffected: number, subject: string, seed: string): void => {
  if (rowsAffected !== 1) throw new Error(`${subject}不存在或不唯一：${seed}（命中 ${rowsAffected} 行）`);
};

/** 经同一执行器建实体：演示写入要么整笔提交，要么随预期的拒绝整笔回滚。 */
const executorCreate =
  (executor: TransactionExecutor, rxdb: RxDB) =>
  <T extends EntityType>(Entity: T, fields: Partial<InstanceType<T>>): Promise<InstanceType<T>> =>
    executor.getRepository(Entity).create(Object.assign(rxdb.entityManager.instantiate(Entity), fields));

/** 在原快照内读取结果实际引用的修订，不从物料编码或种子推测版本。 */
const loadReviewRevisions = async (
  executor: TransactionExecutor,
  explosions: ExplosionResult[]
): Promise<BomChangeReview['revisions']> => {
  const ids = [
    ...new Set(
      explosions.flatMap(result => [
        result.manifest.parentRevisionId,
        ...result.requirementLines.map(line => line.revisionId).filter((id): id is string => id !== null)
      ])
    )
  ];
  const found = new Map<string, BomItemRevision>();
  const repository = executor.getRepository(BomItemRevision);
  for (let offset = 0; offset < ids.length; offset += 200) {
    const revisions = await repository.find({
      where: {
        combinator: 'or',
        rules: ids.slice(offset, offset + 200).map(value => ({ field: 'id' as const, operator: '=' as const, value }))
      }
    });
    for (const revision of revisions) found.set(revision.id, revision);
  }
  return Object.fromEntries(
    ids.map(id => {
      const revision = found.get(id);
      if (!revision) throw new Error(`改版核对缺少修订元数据：${id}，请重新核对`);
      return [
        id,
        {
          revisionNo: revision.revisionNo,
          effectiveFrom: revision.effectiveFrom === null ? null : revision.effectiveFrom.toISOString()
        }
      ];
    })
  );
};

/** 位号演示行的行号（演示头下唯一）。 */
const DESIGNATOR_DEMO_LINE_NO = 77;

/** 清单类型的业务名：映射路径标签靠它区分同一物料的设计 / 制造两张清单。 */
const BOM_LIST_NAMES: ReadonlyMap<unknown, string> = new Map([
  ['ebom', '设计清单'],
  ['mbom', '制造清单'],
  ['sales', '销售清单']
]);

/** 可从数据库恢复并逐项核对的待发布结构。 */
export interface ImportedDraftSummary {
  headerId: string;
  itemNo: string;
  revisionNo: string;
  bomType: string;
  orgId: string;
  lineCount: number;
}

/**
 * demo 数据服务：连接（IDBBatchAtomicVFS + BOM 插件）→ 装载 SC-100 种子 →
 * explodeBom / 直连写入演示。reset 先删 IndexedDB 库再重装（AC#1 的两遍 seed 入口）。
 */
@Injectable({ providedIn: 'root' })
export class BomDemoService {
  readonly #operations = new Set<Promise<unknown>>();
  private rxdb?: RxDB;
  private adapter?: RxDBAdapterWaSqlite;
  /** 直连演示用的 draft 头（挂在 PCBA 的演示修订下，环演示边经它插入）。 */
  private demoHeaderId?: UUID;
  /** 进行中的连接（页面自动连接与手动重置共用一把互斥，防双实例）。 */
  private connectPromise?: Promise<void>;
  /** 所有重置入口共享同一个完整操作，阻塞期间不创建第二个删除请求。 */
  private resetPromise?: Promise<void>;
  readonly resetting = signal(false);
  readonly resetStatus = signal('');
  readonly dataEpoch = signal(0);
  readonly dataRevision = signal(0);
  readonly importedDrafts = signal<ImportedDraftSummary[]>([]);
  readonly ready = signal(false);
  readonly seedBatchNo = SCOOTER_SEED_BATCH_NO;
  readonly seedTimestamp = SCOOTER_SEED_TIMESTAMP;
  /** itemId → itemNo（业务键，种子 itemNo 即业务键）。 */
  readonly itemNos = signal(new Map<string, string>());
  readonly itemUoms = signal(new Map<string, string>());
  /** occurrenceId → 位号清单（AC#2 的行级位号展示）。 */
  readonly designators = signal(new Map<string, string[]>());
  readonly itemCount = computed(() => this.itemNos().size);
  /** ECN 清单（阶段 C：ecnId → { ecnNo, state, effectiveDate }）。 */
  readonly ecns = signal(new Map<string, { ecnNo: string; state: string; effectiveDate: string }>());
  readonly instanceRoots = signal<{ id: string; itemNo: string; serialNumber: string | null }[]>([]);
  readonly firstInstanceId = deterministicId('instance:SC-100:SN-001');
  readonly protectedInstanceSourceId = deterministicId(SCOOTER_DATASET_F.sourceOccurrenceSeed);

  /** 重置并装载种子（两遍执行结果逐字节相同，AC#1）。 */
  resetAndSeed(): Promise<void> {
    if (this.resetPromise) return this.resetPromise;
    this.resetting.set(true);
    this.resetStatus.set('正在等待当前操作完成…');
    this.dataEpoch.update(value => value + 1);
    this.dataRevision.update(value => value + 1);
    this.ready.set(false);
    this.importedDrafts.set([]);
    this.itemUoms.set(new Map());
    this.resetPromise = this.#resetAndSeed().finally(() => {
      this.resetPromise = undefined;
      this.resetting.set(false);
      this.resetStatus.set('');
    });
    return this.resetPromise;
  }

  /** 连接既有库（页面重载的路径：插件触发器幂等安装，种子行原样可用）。 */
  async connectExisting(): Promise<void> {
    if (this.resetPromise) return this.resetPromise;
    if (this.rxdb) return;
    this.ready.set(false);
    await this.#connect();
  }

  /** 按评估日与计划量展开（父修订按时点取最新；根物料可选，默认整机 SC-100）。 */
  async explode(
    asOfDate: string,
    plannedQty: string,
    rootKey = 'SC-100',
    effectivity: BomDemoResolutionOptions = { unit: 137 }
  ): Promise<ExplosionResult> {
    return this.#run(async () => {
      if (!this.rxdb) throw new Error('demo 未就绪');
      return this.rxdb.bom.explodeBom(
        {
          ...this.#resolution(asOfDate, effectivity),
          configSelection: effectivity.configSelection ?? { 颜色: ['红'] }
        },
        { parentItemId: this.#itemId(rootKey) },
        { plannedQty: { value: plannedQty, uom: effectivity.plannedUom ?? 'pcs' } }
      );
    });
  }

  /** 扩展属性演示（US-525 AC#17）：经实体 API 写 ext（BomRepository 按 attr_def 校验）。 */
  async extWrite(itemKey: string, ext: Record<string, unknown>): Promise<BomDemoOutcome> {
    return this.#run(() => this.#writeExt(itemKey, () => ext));
  }

  /** 只修改本次编辑的属性，其他已保存字段继续保留。 */
  async extPatch(itemKey: string, patch: Record<string, unknown>): Promise<BomDemoOutcome> {
    return this.#run(() => this.#writeExt(itemKey, current => ({ ...current, ...patch })));
  }

  /** 读取物料的当前 ext（面板展示 eq 过滤结果面）。 */
  async extRead(itemKey: string): Promise<string> {
    return this.#run(async () => {
      if (!this.adapter) throw new Error('demo 未就绪');
      const result = (await this.adapter.rawQuery(
        `SELECT "ext" FROM "bom$item" WHERE "id" = '${goldenItemId(itemKey)}'`
      )) as unknown as { results?: { rows: unknown[][] }[]; rows?: unknown[][] };
      const rows = Array.isArray(result.results) ? result.results[0].rows : (result.rows ?? []);
      return rows.length > 0 && rows[0][0] !== null ? String(rows[0][0]) : '{}';
    });
  }

  /** 按声明的属性类型过滤物料，缺字段与显式空值由查询合同统一处理。 */
  async filterExt(op: 'eq' | 'ne', value: string): Promise<{ itemNo: string; ext: string }[]> {
    return this.#run(async () => {
      if (!this.rxdb) throw new Error('demo 未就绪');
      const rows = await this.rxdb.bom.filterByAttr('item', [{ code: 'rohs', op, value }]);
      return rows.map(row => ({ itemNo: String(row['itemNo']), ext: String(row['ext']) }));
    });
  }

  /** 导出领域合同的完整快照，十进制字段与解析依据随文件交付。 */
  async exportBom(
    asOfDate: string,
    rootKey: string,
    plannedQty: string,
    unitOrOptions?: number | BomDemoResolutionOptions
  ): Promise<string> {
    return this.#run(async () => {
      if (!this.rxdb) throw new Error('demo 未就绪');
      const payload = await this.rxdb.bom.exportBom(
        {
          configSelection: { 颜色: ['红'] },
          ...this.#resolution(asOfDate, typeof unitOrOptions === 'number' ? { unit: unitOrOptions } : unitOrOptions)
        },
        { parentItemId: this.#itemId(rootKey) },
        {
          plannedQty: {
            value: plannedQty,
            uom: typeof unitOrOptions === 'object' ? (unitOrOptions.plannedUom ?? 'pcs') : 'pcs'
          }
        }
      );
      payload.manifest['plannedQty'] = {
        value: plannedQty,
        uom: typeof unitOrOptions === 'object' ? (unitOrOptions.plannedUom ?? 'pcs') : 'pcs'
      };
      return JSON.stringify(payload, null, 2);
    });
  }

  /** 导入文件至草稿，返回整批结果与逐条诊断。 */
  async importBom(payload: unknown) {
    return this.#run(async () => {
      if (!this.rxdb) throw new Error('demo 未就绪');
      const epoch = this.dataEpoch();
      const result = await this.rxdb.bom.importBomDraft(payload);
      if (result.committed && epoch === this.dataEpoch()) await this.#loadImportedDrafts();
      return result;
    });
  }

  /** 恢复数据库中的实际草稿，不依赖页面暂存结果或物料与修订号约定。 */
  async refreshImportedDrafts(): Promise<void> {
    return this.#run(async () => {
      await this.#loadImportedDrafts();
    });
  }

  /** 显式发布导入成功的修订与头，再刷新可展开物料清单。 */
  async publishImported(headerIds: string[], effectiveFrom: string): Promise<void> {
    return this.#run(async () => {
      if (headerIds.length === 0) throw new Error('没有可发布的导入草稿');
      if (!this.adapter) throw new Error('demo 未就绪');
      const instant = this.#date(effectiveFrom);
      try {
        await this.adapter.transaction(async executor => {
          const headers = executor.getRepository(BomHeader);
          const revisions = executor.getRepository(BomItemRevision);
          const selected: BomHeader[] = [];
          const released = new Set<string>();
          for (const id of new Set(headerIds)) {
            const [header] = await headers.find({
              where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id }] }
            });
            if (!header) throw new Error(`导入草稿不存在：${id}`);
            if (header.state !== 'draft') throw new Error(`结构已不是草稿：${id}`);
            selected.push(header);
          }
          for (const header of selected) {
            if (released.has(header.parentRevisionId)) continue;
            const [revision] = await revisions.find({
              where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: header.parentRevisionId }] }
            });
            if (!revision) throw new Error(`导入修订不存在：${header.parentRevisionId}`);
            if (revision.state === 'draft')
              await revisions.update(revision, { effectiveFrom: instant, state: 'released' });
            released.add(revision.id);
          }
          for (const header of selected) await headers.update(header, { state: 'released' });
        });
      } catch (error) {
        throw normalizeBomError(error) ?? error;
      }
      this.dataRevision.update(value => value + 1);
      await this.#loadItemNos();
      await this.#loadImportedDrafts();
    });
  }

  /** 按安装事实查询整机；省略时点时保留全部安装历史。 */
  async instanceTree(rootId: string, asOfDate?: string): Promise<BomInstanceTreeResult> {
    return this.#run(async () => {
      if (!this.rxdb) throw new Error('demo 未就绪');
      const options = asOfDate === undefined ? {} : { asOfDate: new Date(`${asOfDate}T00:00:00.000Z`) };
      return this.rxdb.bom.expandInstance(rootId, options);
    });
  }

  /** 按实际序列号或批次追溯到安装它的整机。 */
  async traceInstance(kind: 'serial' | 'lot', value: string, asOfDate?: string): Promise<BomInstanceTraceResult> {
    return this.#run(async () => {
      if (!this.rxdb) throw new Error('demo 未就绪');
      const target = kind === 'serial' ? { serialNumber: value } : { lotCode: value };
      const options = asOfDate === undefined ? {} : { asOfDate: new Date(`${asOfDate}T00:00:00.000Z`) };
      return this.rxdb.bom.whereUsedInstance(target, options);
    });
  }

  /** 依次截止旧电池安装、追加新电池安装，旧事实保持可查。 */
  async replaceDemoInstance(installedAt: string): Promise<void> {
    return this.#run(async () => {
      if (!this.rxdb || !this.adapter) throw new Error('demo 未就绪');
      const rxdb = this.rxdb;
      const instant = this.#date(installedAt);
      try {
        await this.adapter.transaction(async executor => {
          const repository = executor.getRepository(BomInstanceNode);
          const [old] = await repository.find({
            where: {
              combinator: 'and',
              rules: [{ field: 'id', operator: '=', value: deterministicId('instance:BATT:PACK-001') }]
            }
          });
          if (!old) throw new Error('原电池安装记录不存在');
          if (old.removedAt !== null) throw new Error('SN-001 已记录换件，请查看现有安装历史');
          if (instant < old.installedAt) throw new Error('换件日期不能早于原电池安装日期');
          await repository.update(old, { removedAt: instant });
          const replacement = rxdb.entityManager.instantiate(BomInstanceNode);
          Object.assign(replacement, {
            itemRevisionId: old.itemRevisionId,
            parentInstanceId: old.parentInstanceId,
            sourceOccurrenceId: old.sourceOccurrenceId,
            serialNumber: 'PACK-003',
            lotCode: 'PACK-LOT-B',
            installedAt: instant,
            removedAt: null
          });
          await repository.create(replacement);
        });
      } catch (error) {
        throw normalizeBomError(error) ?? error;
      }
      this.dataRevision.update(value => value + 1);
    });
  }

  /** 从已经保存的安装与修订事实恢复演示操作状态。 */
  async readDemoInstanceState(): Promise<{ replacementDate: string | null; masterRevised: boolean }> {
    return this.#run(async () => {
      if (!this.adapter) throw new Error('demo 未就绪');
      const rows = this.#rows(
        await this.adapter.rawQuery(
          'SELECT (SELECT "removedAt" FROM "bom$bom_instance_node" WHERE "id" = ?), EXISTS(SELECT 1 FROM "bom$item_revision" WHERE "itemId" = ? AND "revisionNo" = ? AND "state" = ?)',
          [deterministicId('instance:BATT:PACK-001'), goldenItemId('BATT'), 'B', 'released']
        )
      );
      return {
        replacementDate: rows[0]?.[0] == null ? null : new Date(String(rows[0][0])).toISOString().slice(0, 10),
        masterRevised: Boolean(rows[0]?.[1])
      };
    });
  }

  /** 发布未来生效的电池 B 版，用实际查询回读发布结果。 */
  async reviseDemoInstanceMaster(effectiveFrom: string): Promise<string> {
    return this.#run(async () => {
      if (!this.rxdb) throw new Error('demo 未就绪');
      const revision = this.rxdb.entityManager.instantiate(BomItemRevision);
      revision.itemId = this.#itemId('BATT');
      revision.revisionNo = 'B';
      revision.effectiveFrom = new Date(`${effectiveFrom}T00:00:00.000Z`);
      await revision.save();
      revision.state = 'released';
      await revision.save();
      this.dataRevision.update(value => value + 1);
      const resolved = await this.rxdb.bom.resolve(
        {
          bomType: 'ebom',
          orgId: 'org-x',
          asOfDate: revision.effectiveFrom,
          unit: 137,
          configSelection: { 颜色: ['红'] }
        },
        { parentItemId: this.#itemId('BATT') }
      );
      if (resolved.manifest.parentRevisionId !== revision.id) throw new Error('主数据未解析到新发布修订');
      return `电池组（BATT） · B 发布成功（生效日 ${effectiveFrom}）`;
    });
  }

  /** 直连删除被实例引用的草稿来源，存储层的引用保护拒绝进判别结果。 */
  async deleteDemoInstanceSource(): Promise<BomDemoOutcome> {
    return this.#run(async () => {
      if (!this.adapter) throw new Error('demo 未就绪');
      let rowsAffected: number;
      try {
        ({ rowsAffected } = await this.adapter.rawQuery('DELETE FROM "bom$bom_line_occurrence" WHERE "id" = ?', [
          this.protectedInstanceSourceId
        ]));
      } catch (error) {
        return rejected(error);
      }
      assertSeedRow(rowsAffected, '来源发生项', SCOOTER_DATASET_F.sourceOccurrenceSeed);
      return { ok: true };
    });
  }

  /**
   * EBOM / MBOM 双图展开（US-525 AC#13）：钣金外壳 SHEET-ASSY 的设计 / 制造两张清单——变换范围两侧
   * 父件同一物料（US-516），同一物料按清单类型各展开一次。
   */
  async dualExplode(asOfDate: string): Promise<{ ebom: ExplosionResult; mbom: ExplosionResult }> {
    return this.#run(async () => {
      if (!this.rxdb) throw new Error('demo 未就绪');
      const ebomContext = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: new Date(`${asOfDate}T00:00:00.000Z`) };
      const root = { parentItemId: goldenItemId('SHEET-ASSY') };
      const [ebom, mbom] = await Promise.all([
        this.rxdb.bom.explodeBom(ebomContext, root, { plannedQty: { value: '1', uom: 'pcs' } }),
        this.rxdb.bom.explodeBom({ ...ebomContext, bomType: 'mbom' }, root, { plannedQty: { value: '1', uom: 'pcs' } })
      ]);
      return { ebom, mbom };
    });
  }

  /** 映射覆盖率（US-516 AC#5/#6 / US-525 AC#13）：路径级优先、未覆盖报出。 */
  async mapCoverage(asOfDate: string): Promise<MappingCoverageResult> {
    return this.#run(async () => {
      if (!this.adapter) throw new Error('demo 未就绪');
      return mappingCoverage(this.adapter, deterministicId('map-scope:D'), {
        bomType: 'ebom',
        orgId: 'org-x',
        asOfDate: new Date(`${asOfDate}T00:00:00.000Z`)
      });
    });
  }

  /** 映射跟进缺口（US-516 AC#16~#22）：解析步骤集合比对。 */
  async mapGaps(asOfDate: string): Promise<MappingGapsResult> {
    return this.#run(async () => {
      if (!this.adapter) throw new Error('demo 未就绪');
      return mappingGaps(this.adapter, deterministicId('map-scope:D'), {
        bomType: 'ebom',
        orgId: 'org-x',
        asOfDate: new Date(`${asOfDate}T00:00:00.000Z`)
      });
    });
  }

  /**
   * 路径显示业务物料、清单类型与行号，完整标识仍由调用方保留：同一物料的设计 / 制造两张清单
   * 行号可以相同，标签带清单类型才不混淆。
   */
  async mappingLabels(): Promise<Map<string, string>> {
    return this.#run(async () => {
      if (!this.adapter) throw new Error('demo 未就绪');
      const rows = this.#rows(
        await this.adapter.rawQuery(
          'SELECT l."id", o."id", p."itemNo", l."lineNo", c."itemNo", h."bomType" FROM "bom$bom_line" l JOIN "bom$bom_header" h ON h."id" = l."headerId" JOIN "bom$item_revision" r ON r."id" = h."parentRevisionId" JOIN "bom$item" p ON p."id" = r."itemId" LEFT JOIN "bom$bom_line_occurrence" o ON o."lineId" = l."id" LEFT JOIN "bom$item" c ON c."id" = o."childItemId" ORDER BY l."lineNo", o."effectiveFrom"'
        )
      );
      const labels = new Map<string, string>();
      for (const row of rows) {
        const listName = BOM_LIST_NAMES.get(row[5]);
        if (listName === undefined) throw new Error(`逻辑行 ${String(row[0])} 所在头的清单类型未知：${String(row[5])}`);
        const line = `${row[2]} ${listName} · 行 ${row[3]}`;
        labels.set(String(row[0]), line);
        if (row[1] !== null) labels.set(String(row[1]), `${line} · ${row[4]}`);
      }
      return labels;
    });
  }

  /** 唯一解析目标发生项后推进映射基线，不以空值覆盖未裁决目标。 */
  async confirmMap(mappingId: string, asOfDate: string): Promise<void> {
    return this.#run(async () => {
      if (!this.adapter || !this.rxdb) throw new Error('demo 未就绪');
      const rows = this.#rows(
        await this.adapter.rawQuery(
          'SELECT m."relation", m."targetLineId", h."parentRevisionId", h."orgId", h."alternativeNo" FROM "bom$bom_map" m LEFT JOIN "bom$bom_line" l ON l."id" = m."targetLineId" LEFT JOIN "bom$bom_header" h ON h."id" = l."headerId" WHERE m."id" = ?',
          [mappingId]
        )
      );
      const row = rows[0];
      if (!row) throw new Error('映射不存在，请重新查询');
      let targetOccurrenceId: string | null = null;
      if (row[0] !== 'removed') {
        if (row[1] === null || row[2] === null) throw new Error('映射缺少制造目标行，不能确认跟进');
        const resolved = await this.rxdb.bom.resolve(
          this.#resolution(asOfDate, {
            bomType: 'mbom',
            orgId: String(row[3]),
            alternativeNo: Number(row[4])
          }),
          { parentRevisionId: String(row[2]) }
        );
        const candidates = resolved.occurrences.filter(value => value.lineId === row[1]);
        if (resolved.manifest.unresolved.length > 0 || candidates.length !== 1)
          throw new Error('制造目标尚未唯一解析，请先核对评估日与适用条件');
        targetOccurrenceId = candidates[0].occurrenceId;
      }
      await confirmMapping(this.adapter, mappingId, targetOccurrenceId, this.#resolution(asOfDate));
    });
  }

  /** 成本卷算（US-525 AC#14/#15）：逐层明细树，金额为规范十进制串。 */
  async rollup(
    rootKey: string,
    asOfDate: string,
    options: BomDemoResolutionOptions & {
      jointCostSources?: Readonly<Record<string, string>>;
      plannedQty?: { value: string; uom: string };
    } = {}
  ): Promise<CostRollupResult> {
    return this.#run(async () => {
      if (!this.rxdb) throw new Error('demo 未就绪');
      const day = new Date(`${asOfDate}T00:00:00.000Z`);
      return rollupCost(
        this.adapter!,
        {
          ...this.#resolution(asOfDate, options),
          currency: 'CNY',
          rateDate: day,
          ...(options.jointCostSources === undefined ? {} : { jointCostSources: options.jointCostSources })
        },
        { parentItemId: this.#itemId(rootKey) },
        options.plannedQty ?? { value: '1', uom: 'pcs' }
      );
    });
  }

  /** 显式追加联产演示，不改变默认SC-100种子及其原有验收行数。 */
  async loadCoproductDemo(): Promise<void> {
    return this.#run(async () => {
      if (!this.adapter) throw new Error('demo 未就绪');
      await loadCoproductDataset(this.adapter, { itemExt: { rohs: 'yes' } });
      await this.#hydrate();
    });
  }

  /** 替代组发布拒绝演示（US-525 AC#7 ②）：draft 组 0.5/0.3 发布 → 拒绝并给实际合计 0.8。 */
  async demoSubstitutePublishRejection(): Promise<BomDemoOutcome> {
    return this.#run(async () => {
      if (!this.rxdb || !this.adapter) throw new Error('demo 未就绪');
      const rxdb = this.rxdb;
      // 草稿与发布在同一事务：预期的拒绝整笔回滚，重复点击不堆积草稿修订
      try {
        await this.adapter.transaction(executor => this.#writeSubstituteDemo(executor, rxdb));
      } catch (error) {
        return rejected(error);
      }
      return { ok: true };
    });
  }

  /** where-used 反查（AC#6：M3 螺钉的全部父件与路径，含虚拟件路径）。 */
  async whereUsed(asOfDate: string, childItemId: string): Promise<ExpansionResult> {
    return this.#run(async () => {
      if (!this.rxdb) throw new Error('demo 未就绪');
      return this.rxdb.bom.whereUsed(
        { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date(`${asOfDate}T00:00:00.000Z`) },
        { childItemId }
      );
    });
  }

  /** 发布演示头（AC#3：39/100 位号计数违约，错误同时给两个数）。 */
  async publishDemoHeader(): Promise<BomDemoOutcome> {
    return this.#run(async () => {
      if (!this.rxdb || !this.adapter) throw new Error('demo 未就绪');
      const rxdb = this.rxdb;
      const headerId = this.demoHeaderId;
      if (!headerId) throw new Error('演示头未就绪');
      // 草稿只建一次（保存草稿允许）：重复点击复用它重试发布，得到同一拒绝而不是撞 (headerId, lineNo) 唯一键
      await this.adapter.transaction(executor => this.#ensureDesignatorDraft(executor, rxdb, headerId));
      // 发布转移：存储层校验位号数 39 ≠ qty 100（经实体 API，走发布触发器）
      const [header] = await firstValueFrom(
        BomHeader.find({ where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: headerId }] } })
      );
      if (!header) throw new Error(`演示头不存在：${headerId}`);
      header.state = 'released';
      try {
        await header.save();
      } catch (error) {
        return rejected(error);
      }
      return { ok: true };
    });
  }

  /** 行数统计（AC#1 的页面可见面：两遍 seed 后行数一致）。 */
  async dumpRowCounts(): Promise<string> {
    return this.#run(async () => {
      if (!this.adapter) return '';
      const tables = [
        'item',
        'item_revision',
        'bom_header',
        'bom_line',
        'bom_line_occurrence',
        'bom_line_designator',
        'bom_history_batch',
        'ecn',
        'bom_instance_node'
      ];
      const lines: string[] = [];
      for (const name of tables) {
        const result = (await this.adapter.rawQuery(`SELECT COUNT(*) AS c FROM "bom$${name}"`)) as unknown as
          { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
        const rows = 'results' in result ? result.results[0].rows : result.rows;
        lines.push(`${name}=${String(rows[0][0])}`);
      }
      return lines.join('\n');
    });
  }

  /**
   * 直连写入一条「PCBA 指回 SC-100」的成环边（US-525 AC#5）：绕过应用层校验直写库，
   * 环约束必须由存储层拒绝并给出错误码与路径。
   */
  async rawCycleInsert(): Promise<BomDemoOutcome> {
    return this.#run(async () => {
      if (!this.adapter) throw new Error('demo 未就绪');
      const headerId = this.demoHeaderId;
      if (!headerId) throw new Error('演示头未就绪');
      // 行号随机：重复点击会留空行，固定行号会撞 (headerId, lineNo) 唯一约束
      const lineId = crypto.randomUUID();
      const lineNo = 500 + Math.floor(Math.random() * 400);
      const now = '2026-01-01T00:00:00.000Z';
      await this.adapter.rawQuery(
        'INSERT INTO "bom$bom_line" ("id", "headerId", "lineNo", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?)',
        [lineId, headerId, lineNo, now, now]
      );
      try {
        await this.adapter.rawQuery(
          'INSERT INTO "bom$bom_line_occurrence" ("id", "lineId", "childItemId", "qty", "uom", "effectiveFrom", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [crypto.randomUUID(), lineId, goldenItemId('SC-100'), '1', 'pcs', now, now, now]
        );
      } catch (error) {
        return rejected(error);
      }
      return { ok: true };
    });
  }

  /** 同一成环边经表单（实体 API）写入——必须与直连得到同一存储层错误码。 */
  async formCycleInsert(): Promise<BomDemoOutcome> {
    return this.#run(async () => {
      if (!this.demoHeaderId) throw new Error('演示头未就绪');
      const line = new BomLine();
      line.headerId = this.demoHeaderId;
      // 行号随机（同直连按钮：重复点击不撞 (headerId, lineNo) 唯一）
      line.lineNo = 500 + Math.floor(Math.random() * 400);
      await line.save();
      const occurrence = new BomLineOccurrence();
      occurrence.lineId = line.id;
      occurrence.childItemId = goldenItemId('SC-100');
      occurrence.qty = '1';
      occurrence.uom = 'pcs';
      occurrence.effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
      try {
        await occurrence.save();
      } catch (error) {
        return rejected(error);
      }
      return { ok: true };
    });
  }

  /** 影响面（US-515 AC#1 / US-525 AC#11）：整机与命中路径。 */
  async ecnImpact(ecnId: string): Promise<EcnImpactResult> {
    return this.#run(async () => {
      if (!this.rxdb) throw new Error('demo 未就绪');
      return this.rxdb.bom.ecnImpact(ecnId);
    });
  }

  /** 差异（US-515 AC#2 / US-525 AC#11）：新增/删除/改量/改版四类。 */
  async ecnDiff(ecnId: string): Promise<EcnDiffResult> {
    return this.#run(async () => {
      if (!this.rxdb) throw new Error('demo 未就绪');
      return this.rxdb.bom.ecnDiff(ecnId);
    });
  }

  /** 在同一只读快照中核对改版前后的备料与标准耗用成本。 */
  async reviewChange(ecnId: string, context: BomWorkspaceContext): Promise<BomChangeReview> {
    const snapshotContext = structuredClone(context);
    return this.#run(async () => {
      if (!this.adapter || !this.rxdb) throw new Error('demo 未就绪');
      const adapter = this.adapter;
      return adapter.transaction(async executor => {
        const ecns = await executor.getRepository(BomEcn).find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: ecnId }] }
        });
        const ecn = ecns[0];
        if (!ecn) throw new Error(`变更单不存在：${ecnId}`);
        if (ecn.state !== 'released') throw new Error('仅能核对已发布的变更单');
        const afterDay = this.#date(ecn.effectiveDate.toISOString().slice(0, 10));
        const beforeDay = new Date(afterDay);
        beforeDay.setUTCDate(beforeDay.getUTCDate() - 1);
        const beforeDate = beforeDay.toISOString().slice(0, 10);
        const afterDate = afterDay.toISOString().slice(0, 10);
        const scoped: Parameters<typeof explodeBom>[0] = {
          name: adapter.name,
          rxdb: adapter.rxdb,
          rawQuery: (sql, params) => executor.query(sql, params),
          transaction: <T extends TransactionFun>(work: T) => executor.run(work) as Promise<Awaited<ReturnType<T>>>
        };
        const target = { parentItemId: this.#itemId(snapshotContext.rootKey) };
        const plannedQty = { value: snapshotContext.plannedQty, uom: snapshotContext.plannedUom };
        const options = {
          ...(snapshotContext.unit === null ? {} : { unit: snapshotContext.unit }),
          ...(snapshotContext.lot.trim() ? { lot: snapshotContext.lot.trim() } : {}),
          ...(snapshotContext.alternativeNo === null ? {} : { alternativeNo: snapshotContext.alternativeNo }),
          configSelection: snapshotContext.configSelection,
          substituteSelections: snapshotContext.substituteSelections
        };
        const read = async (day: string) => {
          const resolution = this.#resolution(day, options);
          const explosion = await explodeBom(scoped, resolution, target, { plannedQty });
          if (explosion.truncated || explosion.unresolved.length > 0 || explosion.manifest.unresolved.length > 0)
            throw new Error('改版核对不完整：请先补全适用条件与替代选择，再重新核对');
          const cost = await rollupCost(
            scoped,
            { ...resolution, currency: 'CNY', rateDate: resolution.asOfDate },
            target,
            plannedQty
          );
          return { explosion, cost };
        };
        const before = await read(beforeDate);
        const after = await read(afterDate);
        const revisions = await loadReviewRevisions(executor, [before.explosion, after.explosion]);
        const impact = await ecnImpact(scoped, ecnId);
        const diff = await ecnDiff(scoped, ecnId);
        return {
          ecnId,
          ecnNo: ecn.ecnNo,
          beforeDate,
          afterDate,
          context: { ...snapshotContext, asOfDate: afterDate },
          revisions,
          before,
          after,
          changes: materialChanges(before.explosion.requirementLines, after.explosion.requirementLines),
          costDelta: decimalToCanonical(
            decimalSub(
              decimalFromCanonical(after.cost.root.batchCost),
              decimalFromCanonical(before.cost.root.batchCost)
            )
          ),
          impact,
          diff
        };
      }, false);
    });
  }

  /**
   * 现场新建并发布一张同样改 5 行、生效日晚于宿主 UTC 当日的 ECN（US-525 AC#12 ①）：
   * 同一事务改 SC-100 / PCBA / BATT 三张头的 5 行（新增 / 截止 / 改量 / 改版 ×2）；
   * 种子行落空即整体回滚，不留半张变更单。
   */
  async demoCreateAndReleaseEcn(): Promise<BomDemoOutcome<{ ecnId: string }>> {
    return this.#run(async () => {
      if (!this.rxdb || !this.adapter) throw new Error('demo 未就绪');
      const rxdb = this.rxdb;
      // 生效日 = 宿主 UTC 当日 + 1 天（未生效：发布与取消都在生效前窗口内）
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const effectiveFrom = new Date(`${tomorrow.toISOString().slice(0, 10)}T00:00:00.000Z`);
      let ecnId: string;
      try {
        ecnId = await this.adapter.transaction(executor =>
          this.#writeLiveEcn(executor, rxdb, `ECN-LIVE-${Math.random().toString(36).slice(2, 8)}`, effectiveFrom)
        );
      } catch (error) {
        return rejected(error);
      }
      this.dataRevision.update(value => value + 1);
      await this.#loadItemNos();
      await this.#loadEcns();
      return { ok: true, ecnId };
    });
  }

  /** 对用户选中的变更单执行取消，状态合法性继续由存储层裁决。 */
  async cancelEcn(ecnId: string): Promise<BomDemoOutcome> {
    return this.#run(async () => {
      if (!this.adapter) throw new Error('demo 未就绪');
      try {
        await this.adapter.transaction(async executor => {
          const repository = executor.getRepository(BomEcn);
          const [ecn] = await repository.find({
            where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: ecnId }] }
          });
          if (!ecn) throw new Error('变更单不存在，请重新查询');
          if (ecn.state === 'cancelled') throw new Error('该变更单已经取消');
          await repository.update(ecn, { state: 'cancelled' });
        });
      } catch (error) {
        return rejected(error);
      }
      this.dataRevision.update(value => value + 1);
      await this.#loadEcns();
      return { ok: true };
    });
  }

  /** 对已生效的种子 ECN 点取消（US-525 AC#12 ②）：存储层拒绝并提示改走更正 ECN。 */
  async demoCancelEffectiveEcn(): Promise<BomDemoOutcome> {
    return this.#run(async () => {
      if (!this.adapter) throw new Error('demo 未就绪');
      const seed = 'ecn:ECN-2026-005';
      let rowsAffected: number;
      try {
        ({ rowsAffected } = await this.adapter.rawQuery('UPDATE "bom$ecn" SET "state" = ? WHERE "id" = ?', [
          'cancelled',
          deterministicId(seed)
        ]));
      } catch (error) {
        return rejected(error);
      }
      assertSeedRow(rowsAffected, '种子变更单', seed);
      return { ok: true };
    });
  }

  /** 在一致快照内读取所选需求的计算系数，页面不直接访问连接。 */
  async readCalculationBasis(line: RequirementLine): Promise<RequirementCalculationBasis> {
    return this.#run(async () => {
      if (!this.adapter) throw new Error('demo 未就绪');
      return loadRequirementBasis(this.adapter, line);
    });
  }

  async #resetAndSeed(): Promise<void> {
    await Promise.allSettled([...this.#operations]);
    // 等页面自动连接收尾再断（否则 deleteDatabase 与双实例竞态）
    await this.connectPromise?.catch(() => undefined);
    // 先断开旧连接（连接开着时 deleteDatabase 会 blocked），再删库。
    // wa-sqlite 的 IDBBatchAtomicVFS 把全部 dbName 存在同一个 IndexedDB 库「IDBBatchAtomicVFS」
    // （实测 indexedDB.databases()），demo 的 reset 删整个库——dev 环境专用，注释写明
    if (this.rxdb) {
      await this.rxdb.disconnectAll();
      this.rxdb = undefined;
      this.adapter = undefined;
    }
    await new Promise<void>((resolve, reject) => {
      this.resetStatus.set('正在清空并重新装载演示数据…');
      const request = indexedDB.deleteDatabase('IDBBatchAtomicVFS');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('删除演示数据失败，请重试'));
      request.onblocked = () => this.resetStatus.set('其他页面仍在使用演示数据，请关闭相关页面；关闭后会继续重置。');
    });
    await this.#connect();
    const itemIds = await loadScooterDataset(this.adapter!);
    // 阶段 C：ECN 时间轴（改 3 张 BOM 5 行 + 已生效 ECN）
    await loadScooterDatasetC(this.adapter!, itemIds);
    // 阶段 D：双图与卷算输入（SHEET-ASSY 双图 + split 映射 + 成本/费率/工时 + 故意缺成本件）
    await loadScooterDatasetD(this.adapter!, itemIds);
    // 阶段 E：扩展属性 / 序列批次 / 配置选择演示输入
    await loadScooterDatasetE(this.adapter!, itemIds);
    await loadScooterDatasetF(this.adapter!, itemIds);
    await this.#hydrate();
  }

  async #writeExt(
    itemKey: string,
    edit: (current: Record<string, unknown>) => Record<string, unknown>
  ): Promise<BomDemoOutcome> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    const [item] = await firstValueFrom(
      BomItem.find({
        where: { combinator: 'and', rules: [{ field: 'itemNo', operator: '=', value: itemKey }] }
      })
    );
    if (!item) throw new Error(`物料不存在：${itemKey}`);
    const previous = item.ext;
    item.ext = JSON.stringify(edit(JSON.parse(previous ?? '{}') as Record<string, unknown>));
    try {
      await item.save();
    } catch (error) {
      item.ext = previous;
      return rejected(error);
    }
    this.dataRevision.update(value => value + 1);
    return { ok: true };
  }

  /** 演示 draft 头下的 managed 行 qty=100 + 39 个位号；已建过就不再写。 */
  async #ensureDesignatorDraft(executor: TransactionExecutor, rxdb: RxDB, headerId: string): Promise<void> {
    const existing = await executor.getRepository(BomLine).find({
      where: {
        combinator: 'and',
        rules: [
          { field: 'headerId', operator: '=', value: headerId },
          { field: 'lineNo', operator: '=', value: DESIGNATOR_DEMO_LINE_NO }
        ]
      }
    });
    if (existing.length > 0) return;
    const create = executorCreate(executor, rxdb);
    const line = await create(BomLine, { headerId, lineNo: DESIGNATOR_DEMO_LINE_NO });
    const occurrence = await create(BomLineOccurrence, {
      lineId: line.id,
      childItemId: goldenItemId('R10K'),
      qty: '100',
      uom: 'pcs',
      designatorManaged: true,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
    });
    for (let index = 1; index <= 39; index++) {
      await create(BomLineDesignator, { occurrenceId: occurrence.id, designator: `D${index}` });
    }
  }

  async #writeSubstituteDemo(executor: TransactionExecutor, rxdb: RxDB): Promise<void> {
    const create = executorCreate(executor, rxdb);
    // 演示头挂 COVER-ASSY 的新建 draft 修订（种子已发布头占着唯一键；成员行不构成自环）
    const revision = await create(BomItemRevision, { revisionNo: 'E', itemId: goldenItemId('COVER-ASSY') });
    const header = await create(BomHeader, { parentRevisionId: revision.id, bomType: 'ebom', orgId: 'org-x' });
    const group = await create(BomSubstituteGroup, { headerId: header.id, code: 'G-DEMO', strategy: 'proportional' });
    const members = [
      { childKey: 'R10K', role: 'primary', probability: '0.5' },
      { childKey: 'R10K-ALT1', role: 'substitute', probability: '0.3' }
    ] as const;
    for (const [index, member] of members.entries()) {
      const line = await create(BomLine, { headerId: header.id, lineNo: 10 * (index + 1) });
      const occurrence = await create(BomLineOccurrence, {
        lineId: line.id,
        childItemId: goldenItemId(member.childKey),
        qty: '100',
        uom: 'pcs',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z')
      });
      await executor.getRepository(BomLineOccurrence).update(occurrence, {
        substituteGroupId: group.id,
        substituteRole: member.role,
        usageProbability: member.probability,
        equivQty: '1'
      });
    }
    await executor.getRepository(BomHeader).update(header, { state: 'released' });
  }

  /** 现场 ECN 的全部写入走同一执行器；种子固定行必须恰好命中一行。 */
  async #writeLiveEcn(executor: TransactionExecutor, rxdb: RxDB, ecnNo: string, effectiveFrom: Date): Promise<string> {
    const create = executorCreate(executor, rxdb);
    const ecn = await create(BomEcn, { ecnNo, effectiveDate: effectiveFrom });
    const closeSeed = async (seed: string): Promise<void> => {
      const { rowsAffected } = await executor.query(
        `UPDATE ${executor.tableRef(BomLineOccurrence)} SET "ecnOutId" = ?, "effectiveTo" = ? WHERE "id" = ?`,
        [ecn.id, effectiveFrom.toISOString(), deterministicId(seed)]
      );
      assertSeedRow(rowsAffected, '种子发生项', seed);
    };
    const addOccurrence = (lineId: string, childItemId: string, qty: string): Promise<BomLineOccurrence> =>
      create(BomLineOccurrence, { lineId, childItemId, qty, uom: 'pcs', ecnInId: ecn.id, effectiveFrom });
    // ① SC-100：截止 WH-01 行（index 2）+ 新增 SEAT-LIVE 行；物料 id 固定，取消后重做复用已建的那行
    const seatId = deterministicId('item:SEAT-LIVE');
    const [existingSeat] = await executor.getRepository(BomItem).find({
      where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: seatId }] }
    });
    const seat =
      existingSeat ??
      (await create(BomItem, { id: seatId, itemNo: 'SEAT-LIVE', ext: JSON.stringify({ rohs: 'yes' }) }));
    await closeSeed('occurrence:SC-100:A:2');
    const scHeaderId = deterministicId('header:SC-100:A');
    const next = await executor.query(
      `SELECT MAX("lineNo") + 10 FROM ${executor.tableRef(BomLine)} WHERE "headerId" = ?`,
      [scHeaderId]
    );
    const seatLine = await create(BomLine, { headerId: scHeaderId, lineNo: Number(next.rows[0][0]), ecnInId: ecn.id });
    await addOccurrence(seatLine.id, seat.id, '1');
    // ② PCBA：R10K 第二行（index 2，未被种子 ECN 碰过）改量 3→4
    await closeSeed('occurrence:PCBA:A:2');
    await addOccurrence(deterministicId('line:PCBA:A:2'), goldenItemId('R10K'), '4');
    // ③ BATT：CELL 行（index 0，未被种子 ECN 碰过）改量 10→11
    await closeSeed('occurrence:BATT:A:0');
    await addOccurrence(deterministicId('line:BATT:A:0'), goldenItemId('CELL'), '11');
    // 发布（生效日在未来 → 通过追溯检查与投影校验）
    await executor.getRepository(BomEcn).update(ecn, { state: 'released' });
    return ecn.id;
  }

  async #connect(): Promise<void> {
    if (this.rxdb) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.#doConnect()
      .then(() => this.#hydrate())
      .finally(() => {
        this.connectPromise = undefined;
      });
    return this.connectPromise;
  }

  async #doConnect(): Promise<void> {
    const rxdb = new RxDB({
      dbName: BOM_DEMO_DB_NAME,
      entities: [...BOM_ENTITIES],
      sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
    });
    rxdb.use(rxDBPluginBom);
    let adapter: RxDBAdapterWaSqlite;
    rxdb.adapter('wa-sqlite', db => {
      adapter = new RxDBAdapterWaSqlite(db, {
        vfs: 'IDBBatchAtomicVFS',
        async: true,
        worker: false,
        wasmPath: '/wa-sqlite/wa-sqlite-async.wasm',
        batchTimeout: 1,
        repositories: { BomRepository: SqliteRepository } as unknown as WaSqliteOptions['repositories']
      });
      return adapter;
    });
    await rxdb.connect('wa-sqlite');
    connectDevTools(rxdb);
    this.rxdb = rxdb;
    this.adapter = adapter!;
  }

  async #hydrate(): Promise<void> {
    await this.#loadItemNos();
    await this.#loadDesignators();
    await this.#loadEcns();
    await this.#loadInstanceRoots();
    if (this.itemCount() === 0) {
      this.dataRevision.update(value => value + 1);
      return;
    }
    await this.#ensureDemoHeader();
    await this.#loadImportedDrafts();
    this.ready.set(true);
    this.dataRevision.update(value => value + 1);
  }

  async #loadInstanceRoots(): Promise<void> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    const result = await this.rxdb.bom.whereUsedInstance({ itemRevisionId: deterministicId('revision:SC-100:A') });
    this.instanceRoots.set(
      result.matches
        .filter(match => match.node.parentInstanceId === null)
        .map(match => ({
          id: match.node.id,
          itemNo: match.node.itemNo,
          serialNumber: match.node.serialNumber
        }))
    );
  }

  async #loadEcns(): Promise<void> {
    if (!this.adapter) return;
    const result = (await this.adapter.rawQuery(
      `SELECT "id", "ecnNo", "state", "effectiveDate" FROM "bom$ecn" ORDER BY "effectiveDate"`
    )) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
    const rows = 'results' in result ? result.results[0].rows : result.rows;
    this.ecns.set(
      new Map(
        rows.map(row => [
          String(row[0]),
          {
            ecnNo: String(row[1]),
            state: String(row[2]),
            effectiveDate: new Date(String(row[3])).toISOString().slice(0, 10)
          }
        ])
      )
    );
  }

  async #loadImportedDrafts(): Promise<void> {
    if (!this.adapter) throw new Error('demo 未就绪');
    const epoch = this.dataEpoch();
    const rows = this.#rows(
      await this.adapter.rawQuery(
        'SELECT h."id", i."itemNo", r."revisionNo", h."bomType", h."orgId", COUNT(l."id") FROM "bom$bom_header" h JOIN "bom$item_revision" r ON r."id" = h."parentRevisionId" JOIN "bom$item" i ON i."id" = r."itemId" LEFT JOIN "bom$bom_line" l ON l."headerId" = h."id" WHERE h."state" = ? AND h."id" <> ? GROUP BY h."id" ORDER BY i."itemNo", r."revisionNo", h."bomType", h."orgId"',
        ['draft', deterministicId('header:BATT:F')]
      )
    );
    if (epoch !== this.dataEpoch()) return;
    this.importedDrafts.set(
      rows.map(row => ({
        headerId: String(row[0]),
        itemNo: String(row[1]),
        revisionNo: String(row[2]),
        bomType: String(row[3]),
        orgId: String(row[4]),
        lineCount: Number(row[5])
      }))
    );
  }

  #rows(result: unknown): unknown[][] {
    const value = result as { results?: { rows: unknown[][] }[]; rows?: unknown[][] };
    return value.results ? value.results[0].rows : (value.rows ?? []);
  }

  #date(value: string): Date {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new Error('请输入有效日期');
    return date;
  }

  #resolution(asOfDate: string, options: BomDemoResolutionOptions = {}): ResolutionContext {
    return {
      bomType: options.bomType ?? 'ebom',
      orgId: options.orgId ?? 'org-x',
      asOfDate: this.#date(asOfDate),
      ...(options.unit === undefined ? {} : { unit: options.unit }),
      ...(options.lot === undefined ? {} : { lot: options.lot }),
      ...(options.alternativeNo === undefined ? {} : { alternativeNo: options.alternativeNo }),
      ...(options.configSelection === undefined ? {} : { configSelection: options.configSelection }),
      ...(options.substituteSelections === undefined ? {} : { substituteSelections: options.substituteSelections }),
      ...(options.substituteAvailabilities === undefined ?
        {}
      : { substituteAvailabilities: options.substituteAvailabilities })
    };
  }

  #run<T>(work: () => Promise<T>): Promise<T> {
    if (this.resetting()) return Promise.reject(new Error('正在重置演示数据，请稍后重试'));
    const operation = work();
    this.#operations.add(operation);
    void operation.finally(() => this.#operations.delete(operation)).catch(() => undefined);
    return operation;
  }

  async #loadItemNos(): Promise<void> {
    if (!this.adapter) return;
    const result = (await this.adapter.rawQuery(`SELECT "id", "itemNo", "stockUom" FROM "bom$item"`)) as unknown as
      { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
    const rows = 'results' in result ? result.results[0].rows : result.rows;
    this.itemNos.set(new Map(rows.map(row => [String(row[0]), String(row[1])])));
    this.itemUoms.set(new Map(rows.map(row => [String(row[1]), String(row[2])])));
  }

  async #loadDesignators(): Promise<void> {
    if (!this.adapter) return;
    const result = (await this.adapter.rawQuery(
      `SELECT "occurrenceId", "designator" FROM "bom$bom_line_designator" ORDER BY "designator"`
    )) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
    const rows = 'results' in result ? result.results[0].rows : result.rows;
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const key = String(row[0]);
      const list = map.get(key) ?? [];
      list.push(String(row[1]));
      map.set(key, list);
    }
    this.designators.set(map);
  }

  /** 建演示 draft 头（挂在 PCBA 的演示 draft 修订下）供环演示边使用；重开时复用已有。 */
  async #ensureDemoHeader(): Promise<void> {
    if (!this.adapter) return;
    const pcbaId = goldenItemId('PCBA');
    // 种子的已发布头占着 (revision, type, org, alternative) 唯一键——演示头挂独立的 draft 修订
    const existing = await firstValueFrom(
      BomItemRevision.find({
        where: {
          combinator: 'and',
          rules: [
            { field: 'itemId', operator: '=', value: pcbaId },
            { field: 'revisionNo', operator: '=', value: 'E' }
          ]
        }
      })
    );
    const revision =
      existing[0] ??
      (() => {
        const created = new BomItemRevision();
        created.revisionNo = 'E';
        created.itemId = pcbaId;
        return created;
      })();
    if (!existing[0]) await revision.save();
    const headers = await firstValueFrom(
      BomHeader.find({
        where: { combinator: 'and', rules: [{ field: 'parentRevisionId', operator: '=', value: revision.id }] }
      })
    );
    const header =
      headers[0] ??
      (() => {
        const created = new BomHeader();
        created.parentRevisionId = revision.id;
        created.bomType = 'ebom';
        created.orgId = 'org-x';
        return created;
      })();
    if (!headers[0]) await header.save();
    this.demoHeaderId = header.id;
  }

  #itemId(itemNo: string): string {
    const entry = [...this.itemNos()].find(([, value]) => value === itemNo);
    if (!entry) throw new Error(`物料不存在：${itemNo}`);
    return entry[0];
  }
}
