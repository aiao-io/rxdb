import { computed, Injectable, signal } from '@angular/core';
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { firstValueFrom } from 'rxjs';
import { BOM_ENTITIES, BomEcn, BomHeader, BomItem, BomItemRevision, BomLine, BomLineDesignator, BomLineOccurrence, BomSubstituteGroup, mappingCoverage, mappingGaps, rollupCost, rxDBPluginBom, type CostRollupResult, type ExpansionResult, type ExplosionResult, type EcnDiffResult, type EcnImpactResult, type MappingCoverageResult, type MappingGapsResult } from '@aiao/rxdb-plugin-bom';
import { deterministicId, goldenItemId, loadScooterDataset, loadScooterDatasetC, loadScooterDatasetD, SCOOTER_SEED_BATCH_NO, SCOOTER_SEED_TIMESTAMP } from '@aiao/rxdb-plugin-bom/testing';

/** demo 库名（reset 删除的 IndexedDB 库）。 */
export const BOM_DEMO_DB_NAME = 'dev-rxdb-bom';

/**
 * demo 数据服务：连接（IDBBatchAtomicVFS + BOM 插件）→ 装载 SC-100 种子 →
 * explodeBom / 直连写入演示。reset 先删 IndexedDB 库再重装（AC#1 的两遍 seed 入口）。
 */
@Injectable({ providedIn: 'root' })
export class BomDemoService {
  private rxdb?: RxDB;
  private adapter?: RxDBAdapterWaSqlite;
  /** 直连演示用的 draft 头（挂在 PCBA 的演示修订下，环演示边经它插入）。 */
  private demoHeaderId?: string;
  private demoRevisionId?: string;
  /** 进行中的连接（页面自动连接与手动重置共用一把互斥，防双实例）。 */
  private connectPromise?: Promise<void>;
  /** 现场新建并发布的 ECN id（取消演示的对象；未建为 null）。 */
  private liveEcnId?: string;
  readonly ready = signal(false);
  readonly seedBatchNo = SCOOTER_SEED_BATCH_NO;
  readonly seedTimestamp = SCOOTER_SEED_TIMESTAMP;
  /** itemId → itemNo（业务键，种子 itemNo 即业务键）。 */
  readonly itemNos = signal(new Map<string, string>());
  /** occurrenceId → 位号清单（AC#2 的行级位号展示）。 */
  readonly designators = signal(new Map<string, string[]>());
  readonly itemCount = computed(() => this.itemNos().size);
  /** ECN 清单（阶段 C：ecnId → { ecnNo, state, effectiveDate }）。 */
  readonly ecns = signal(new Map<string, { ecnNo: string; state: string; effectiveDate: string }>());

  /** 重置并装载种子（两遍执行结果逐字节相同，AC#1）。 */
  async resetAndSeed(): Promise<void> {
    this.ready.set(false);
    // 等页面自动连接收尾再断（否则 deleteDatabase 与双实例竞态）
    await this.connectPromise?.catch(() => undefined);
    // 先断开旧连接（连接开着时 deleteDatabase 会 blocked），再删库。
    // wa-sqlite 的 IDBBatchAtomicVFS 把全部 dbName 存在同一个 IndexedDB 库「IDBBatchAtomicVFS」
    // （实测 indexedDB.databases()），demo 的 reset 删整个库——dev 环境专用，注释写明
    if (this.rxdb) {
      await this.rxdb.disconnectAll().catch(() => undefined);
      this.rxdb = undefined;
    }
    await new Promise<void>(resolve => {
      const request = indexedDB.deleteDatabase('IDBBatchAtomicVFS');
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      // blocked 意味着还有连接握着：先 resolve 让本轮失败在重连时暴露（页面可重试）
      request.onblocked = () => resolve();
    });
    await this.#connect();
    const itemIds = await loadScooterDataset(this.adapter!);
    // 阶段 C：ECN 时间轴（改 3 张 BOM 5 行 + 已生效 ECN）
    await loadScooterDatasetC(this.adapter!, itemIds);
    // 阶段 D：双图与卷算输入（SHEET-ASSY 双图 + split 映射 + 成本/费率/工时 + 故意缺成本件）
    await loadScooterDatasetD(this.adapter!, itemIds);
    await this.#hydrate();
  }

  /** 连接既有库（页面重载的路径：插件触发器幂等安装，种子行原样可用）。 */
  async connectExisting(): Promise<void> {
    if (this.rxdb) return;
    this.ready.set(false);
    await this.#connect();
    await this.#hydrate();
  }

  /** 按评估日与计划量展开（父修订按时点取最新；根物料可选，默认整机 SC-100）。 */
  async explode(asOfDate: string, plannedQty: string, rootKey = 'SC-100'): Promise<ExplosionResult> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    return this.rxdb.bom.explodeBom(
      { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date(`${asOfDate}T00:00:00.000Z`) },
      { parentItemId: goldenItemId(rootKey) },
      { plannedQty: { value: plannedQty, uom: 'pcs' } }
    );
  }

  /** EBOM / MBOM 双图展开（US-525 AC#13：SHEET-ASSY 钣金外壳两张图）。 */
  async dualExplode(asOfDate: string): Promise<{ ebom: ExplosionResult; mbom: ExplosionResult }> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    const ebomContext = { bomType: 'ebom' as const, orgId: 'org-x', asOfDate: new Date(`${asOfDate}T00:00:00.000Z`) };
    const [ebom, mbom] = await Promise.all([
      this.rxdb.bom.explodeBom(ebomContext, { parentItemId: goldenItemId('SHEET-ASSY') }, { plannedQty: { value: '1', uom: 'pcs' } }),
      this.rxdb.bom.explodeBom({ ...ebomContext, bomType: 'mbom' }, { parentItemId: goldenItemId('SHEET-ASSY-M') }, { plannedQty: { value: '1', uom: 'pcs' } })
    ]);
    return { ebom, mbom };
  }

  /** 映射覆盖率（US-516 AC#5/#6 / US-525 AC#13）：路径级优先、未覆盖报出。 */
  async mapCoverage(asOfDate: string): Promise<MappingCoverageResult> {
    if (!this.adapter) throw new Error('demo 未就绪');
    return mappingCoverage(this.adapter, deterministicId('map-scope:D'), {
      bomType: 'ebom',
      orgId: 'org-x',
      asOfDate: new Date(`${asOfDate}T00:00:00.000Z`)
    });
  }

  /** 映射跟进缺口（US-516 AC#16~#22）：解析步骤集合比对。 */
  async mapGaps(asOfDate: string): Promise<MappingGapsResult> {
    if (!this.adapter) throw new Error('demo 未就绪');
    return mappingGaps(this.adapter, deterministicId('map-scope:D'), {
      bomType: 'ebom',
      orgId: 'org-x',
      asOfDate: new Date(`${asOfDate}T00:00:00.000Z`)
    });
  }

  /** 成本卷算（US-525 AC#14/#15）：逐层明细树，金额为规范十进制串。 */
  async rollup(rootKey: string, asOfDate: string): Promise<CostRollupResult> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    const day = new Date(`${asOfDate}T00:00:00.000Z`);
    return rollupCost(
      this.adapter!,
      { bomType: 'ebom', orgId: 'org-x', asOfDate: day, currency: 'CNY', rateDate: day },
      { parentItemId: goldenItemId(rootKey) },
      { value: '1', uom: 'pcs' }
    );
  }

  /** 替代组发布拒绝演示（US-525 AC#7 ②）：draft 组 0.5/0.3 发布 → 拒绝并给实际合计 0.8。 */
  async demoSubstitutePublishRejection(): Promise<string> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    try {
      // 演示头挂 COVER-ASSY 的新建 draft 修订（种子已发布头占着唯一键；成员行不构成自环）
      const revision = new BomItemRevision();
      revision.revisionNo = 'E';
      revision.itemId = goldenItemId('COVER-ASSY');
      await revision.save();
      const draftHeader = new BomHeader();
      draftHeader.parentRevisionId = revision.id;
      draftHeader.bomType = 'ebom';
      draftHeader.orgId = 'org-x';
      await draftHeader.save();
      const group = new BomSubstituteGroup();
      group.headerId = draftHeader.id;
      group.code = 'G-DEMO';
      group.strategy = 'proportional';
      await group.save();
      const addMember = async (childKey: string, role: 'primary' | 'substitute', probability: string): Promise<void> => {
        const line = new BomLine();
        line.headerId = draftHeader.id;
        line.lineNo = 10 + Math.floor(Math.random() * 100000);
        await line.save();
        const occurrence = new BomLineOccurrence();
        occurrence.lineId = line.id;
        occurrence.childItemId = goldenItemId(childKey);
        occurrence.qty = '100';
        occurrence.uom = 'pcs';
        occurrence.effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
        await occurrence.save();
        occurrence.substituteGroupId = group.id;
        occurrence.substituteRole = role;
        occurrence.usageProbability = probability;
        occurrence.equivQty = '1';
        await occurrence.save();
      };
      await addMember('R10K', 'primary', '0.5');
      await addMember('R10K-ALT1', 'substitute', '0.3');
      draftHeader.state = 'released';
      await draftHeader.save();
      return '发布成功（不应发生：合计 0.8 未校验）';
    } catch (error) {
      return String(error);
    }
  }

  /** where-used 反查（AC#6：M3 螺钉的全部父件与路径，含虚拟件路径）。 */
  async whereUsed(asOfDate: string, childItemId: string): Promise<ExpansionResult> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    return this.rxdb.bom.whereUsed(
      { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date(`${asOfDate}T00:00:00.000Z`) },
      { childItemId }
    );
  }

  /** 发布演示头（AC#3：39/100 位号计数违约，错误同时给两个数）。 */
  async publishDemoHeader(): Promise<string> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    const headerId = this.demoHeaderId;
    if (!headerId) throw new Error('演示头未就绪');
    // 在演示 draft 头下建 managed 行 qty=100 + 39 个位号（保存草稿允许）
    const line = new BomLine();
    line.headerId = headerId;
    line.lineNo = 77;
    await line.save();
    const occurrence = new BomLineOccurrence();
    occurrence.lineId = line.id;
    occurrence.childItemId = goldenItemId('R10K');
    occurrence.qty = '100';
    occurrence.uom = 'pcs';
    occurrence.designatorManaged = true;
    occurrence.effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
    await occurrence.save();
    for (let index = 1; index <= 39; index++) {
      const designator = new BomLineDesignator();
      designator.occurrenceId = occurrence.id;
      designator.designator = `D${index}`;
      await designator.save();
    }
    // 发布转移：存储层校验位号数 39 ≠ qty 100（经实体 API，走发布触发器）
    try {
      const headers = await firstValueFrom(
        BomHeader.find({ where: { combinator: 'and', rules: [{ field: 'parentRevisionId', operator: '=', value: this.demoRevisionId ?? '' }] } })
      );
      const header = headers[0];
      if (!header) return '演示头未找到';
      header.state = 'released';
      await header.save();
      return '发布成功（不应发生：位号计数未校验）';
    } catch (error) {
      return String(error);
    }
  }

  /** 行数统计（AC#1 的页面可见面：两遍 seed 后行数一致）。 */
  async dumpRowCounts(): Promise<string> {
    if (!this.adapter) return '';
    const tables = ['item', 'item_revision', 'bom_header', 'bom_line', 'bom_line_occurrence', 'bom_line_designator', 'bom_history_batch', 'ecn'];
    const lines: string[] = [];
    for (const name of tables) {
      const result = (await this.adapter.rawQuery(`SELECT COUNT(*) AS c FROM "bom$${name}"`)) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
      const rows = 'results' in result ? result.results[0].rows : result.rows;
      lines.push(`${name}=${String(rows[0][0])}`);
    }
    return lines.join('\n');
  }

  /**
   * 直连写入一条「PCBA 指回 SC-100」的成环边（US-525 AC#5）：绕过应用层校验直写库，
   * 环约束必须由存储层拒绝并给出错误码与路径。
   */
  async rawCycleInsert(): Promise<string> {
    if (!this.adapter) throw new Error('demo 未就绪');
    const headerId = this.demoHeaderId;
    if (!headerId) throw new Error('演示头未就绪');
    // 行号随机：重复点击会留空行，固定行号会撞 (headerId, lineNo) 唯一约束
    const lineId = crypto.randomUUID();
    const occurrenceId = crypto.randomUUID();
    const lineNo = 500 + Math.floor(Math.random() * 400);
    const now = '2026-01-01T00:00:00.000Z';
    try {
      await this.adapter.rawQuery(
        `INSERT INTO "bom$bom_line" ("id", "headerId", "lineNo", "createdAt", "updatedAt") VALUES ('${lineId}', '${headerId}', ${lineNo}, '${now}', '${now}')`
      );
    } catch (error) {
      return String(error);
    }
    try {
      await this.adapter.rawQuery(
        `INSERT INTO "bom$bom_line_occurrence" ("id", "lineId", "childItemId", "qty", "uom", "effectiveFrom", "createdAt", "updatedAt") VALUES ('${occurrenceId}', '${lineId}', '${goldenItemId('SC-100')}', '1', 'pcs', '${now}', '${now}', '${now}')`
      );
      return '写入成功（不应发生：环约束未生效）';
    } catch (error) {
      return String(error);
    }
  }

  /** 同一成环边经表单（实体 API）写入——必须与直连得到同一存储层错误码。 */
  async formCycleInsert(): Promise<string> {
    if (!this.demoHeaderId) throw new Error('演示头未就绪');
    try {
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
      await occurrence.save();
      return '写入成功（不应发生：环约束未生效）';
    } catch (error) {
      return String(error);
    }
  }

  /** 影响面（US-515 AC#1 / US-525 AC#11）：整机与命中路径。 */
  async ecnImpact(ecnId: string): Promise<EcnImpactResult> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    return this.rxdb.bom.ecnImpact(ecnId);
  }

  /** 差异（US-515 AC#2 / US-525 AC#11）：新增/删除/改量/改版四类。 */
  async ecnDiff(ecnId: string): Promise<EcnDiffResult> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    return this.rxdb.bom.ecnDiff(ecnId);
  }

  /**
   * 现场新建并发布一张同样改 5 行、生效日晚于宿主 UTC 当日的 ECN（US-525 AC#12 ①）：
   * 改 SC-100 / PCBA / BATT 三张头的 5 行（新增 / 截止 / 改量 / 改版 ×2），发布成功返回空串。
   */
  async demoCreateAndReleaseEcn(): Promise<string> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    try {
      // 生效日 = 宿主 UTC 当日 + 1 天（未生效：发布与取消都在生效前窗口内）
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const effectiveDate = `${tomorrow.toISOString().slice(0, 10)}`;
      const ecn = new BomEcn();
      ecn.ecnNo = `ECN-LIVE-${Math.random().toString(36).slice(2, 8)}`;
      ecn.effectiveDate = new Date(`${effectiveDate}T00:00:00.000Z`);
      await ecn.save();
      this.liveEcnId = ecn.id;
      // 改 3 张头的 5 行：SC-100 新增 SEAT-LIVE、截止 WH-01；PCBA 的 R10K 第二行改量 3→4；BATT 的 CELL 行改量 10→11（避开种子 ECN 已截止的旧段）
      const sc100 = goldenItemId('SC-100');
      const seat2Id = deterministicId('item:SEAT-LIVE');
      // 现场新物料
      const seat2 = new BomItem();
      (seat2 as unknown as { id: string }).id = seat2Id;
      seat2.itemNo = 'SEAT-LIVE';
      await seat2.save();
      const table = (name: string): string => `"bom$${name}"`;
      const scHeader = (await this.adapter!.rawQuery(`SELECT h."id" FROM ${table('bom_header')} h JOIN ${table('item_revision')} r ON r."id" = h."parentRevisionId" WHERE r."itemId" = '${sc100}'`)) as unknown as
        | { results: { rows: unknown[][] }[] }
        | { rows: unknown[][] };
      const scHeaderRows = 'results' in scHeader ? scHeader.results[0].rows : scHeader.rows;
      const scHeaderId = String(scHeaderRows[0][0]);
      // ① SC-100：截止 WH-01 行（index 2）+ 新增 SEAT-LIVE 行
      const scWhOcc = deterministicId('occurrence:SC-100:A:2');
      await this.adapter!.rawQuery(
        `UPDATE ${table('bom_line_occurrence')} SET "ecnOutId" = '${ecn.id}', "effectiveTo" = '${effectiveDate}T00:00:00.000Z' WHERE "id" = '${scWhOcc}'`
      );
      const seatLine = new BomLine();
      seatLine.headerId = scHeaderId;
      seatLine.lineNo = 60 + Math.floor(Math.random() * 1000);
      seatLine.ecnInId = ecn.id;
      await seatLine.save();
      const seatOcc = new BomLineOccurrence();
      seatOcc.lineId = seatLine.id;
      seatOcc.childItemId = seat2.id;
      seatOcc.qty = '1';
      seatOcc.uom = 'pcs';
      seatOcc.ecnInId = ecn.id;
      seatOcc.effectiveFrom = new Date(`${effectiveDate}T00:00:00.000Z`);
      await seatOcc.save();
      // ② PCBA：R10K 第二行（index 2，未被种子 ECN 碰过）改量 3→4
      const r10kOcc = deterministicId('occurrence:PCBA:A:2');
      await this.adapter!.rawQuery(
        `UPDATE ${table('bom_line_occurrence')} SET "ecnOutId" = '${ecn.id}', "effectiveTo" = '${effectiveDate}T00:00:00.000Z' WHERE "id" = '${r10kOcc}'`
      );
      const r10kLineId = deterministicId('line:PCBA:A:2');
      const r10kNew = new BomLineOccurrence();
      r10kNew.lineId = r10kLineId;
      r10kNew.childItemId = goldenItemId('R10K');
      r10kNew.qty = '4';
      r10kNew.uom = 'pcs';
      r10kNew.ecnInId = ecn.id;
      r10kNew.effectiveFrom = new Date(`${effectiveDate}T00:00:00.000Z`);
      await r10kNew.save();
      // ③ BATT：CELL 行（index 0，未被种子 ECN 碰过）改量 10→11
      const bmsOcc = deterministicId('occurrence:BATT:A:0');
      await this.adapter!.rawQuery(
        `UPDATE ${table('bom_line_occurrence')} SET "ecnOutId" = '${ecn.id}', "effectiveTo" = '${effectiveDate}T00:00:00.000Z' WHERE "id" = '${bmsOcc}'`
      );
      const bmsLineId = deterministicId('line:BATT:A:0');
      const bmsNew = new BomLineOccurrence();
      bmsNew.lineId = bmsLineId;
      bmsNew.childItemId = goldenItemId('CELL');
      bmsNew.qty = '11';
      bmsNew.uom = 'pcs';
      bmsNew.ecnInId = ecn.id;
      bmsNew.effectiveFrom = new Date(`${effectiveDate}T00:00:00.000Z`);
      await bmsNew.save();
      // 发布（生效日在未来 → 通过追溯检查与投影校验）
      ecn.state = 'released';
      await ecn.save();
      await this.#loadEcns();
      return '';
    } catch (error) {
      return String(error);
    }
  }

  /** 取消现场 ECN（US-525 AC#12 ①）：未生效 → 5 行整体回退。 */
  async demoCancelLiveEcn(): Promise<string> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    const liveEcnId = this.liveEcnId;
    if (!liveEcnId) return '现场 ECN 未创建';
    try {
      const table = '"bom$ecn"';
      await this.adapter!.rawQuery(`UPDATE ${table} SET "state" = 'cancelled' WHERE "id" = '${liveEcnId}'`);
      await this.#loadEcns();
      return '';
    } catch (error) {
      return String(error);
    }
  }

  /** 对已生效的种子 ECN 点取消（US-525 AC#12 ②）：拒绝并提示改走更正 ECN。 */
  async demoCancelEffectiveEcn(): Promise<string> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    try {
      const table = '"bom$ecn"';
      await this.adapter!.rawQuery(
        `UPDATE ${table} SET "state" = 'cancelled' WHERE "id" = '${deterministicId('ecn:ECN-2026-005')}'`
      );
      return '取消成功（不应发生：已生效 ECN 不可取消）';
    } catch (error) {
      return String(error);
    }
  }

  async #connect(): Promise<void> {
    if (this.rxdb) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.#doConnect().finally(() => {
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
        batchTimeout: 1
      });
      return adapter;
    });
    await rxdb.connect('wa-sqlite');
    this.rxdb = rxdb;
    this.adapter = adapter!;
  }

  async #hydrate(): Promise<void> {
    await this.#loadItemNos();
    await this.#loadDesignators();
    await this.#loadEcns();
    await this.#ensureDemoHeader();
    this.ready.set(true);
  }

  async #loadEcns(): Promise<void> {
    if (!this.adapter) return;
    const result = (await this.adapter.rawQuery(`SELECT "id", "ecnNo", "state", "effectiveDate" FROM "bom$ecn" ORDER BY "effectiveDate"`)) as unknown as
      | { results: { rows: unknown[][] }[] }
      | { rows: unknown[][] };
    const rows = 'results' in result ? result.results[0].rows : result.rows;
    this.ecns.set(
      new Map(
        rows.map(row => [
          String(row[0]),
          { ecnNo: String(row[1]), state: String(row[2]), effectiveDate: new Date(String(row[3])).toISOString().slice(0, 10) }
        ])
      )
    );
  }

  async #loadItemNos(): Promise<void> {
    if (!this.adapter) return;
    const result = (await this.adapter.rawQuery(`SELECT "id", "itemNo" FROM "bom$item"`)) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
    const rows = 'results' in result ? result.results[0].rows : result.rows;
    this.itemNos.set(new Map(rows.map(row => [String(row[0]), String(row[1])])));
  }

  async #loadDesignators(): Promise<void> {
    if (!this.adapter) return;
    const result = (await this.adapter.rawQuery(`SELECT "occurrenceId", "designator" FROM "bom$bom_line_designator" ORDER BY "designator"`)) as unknown as { results: { rows: unknown[][] }[] } | { rows: unknown[][] };
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
        where: { combinator: 'and', rules: [{ field: 'itemId', operator: '=', value: pcbaId }, { field: 'revisionNo', operator: '=', value: 'E' }] }
      })
    );
    const revision = existing[0] ?? (() => {
      const created = new BomItemRevision();
      created.revisionNo = 'E';
      created.itemId = pcbaId;
      return created;
    })();
    if (!existing[0]) await revision.save();
    const headers = await firstValueFrom(
      BomHeader.find({ where: { combinator: 'and', rules: [{ field: 'parentRevisionId', operator: '=', value: revision.id }] } })
    );
    const header = headers[0] ?? (() => {
      const created = new BomHeader();
      created.parentRevisionId = revision.id;
      created.bomType = 'ebom';
      created.orgId = 'org-x';
      return created;
    })();
    if (!headers[0]) await header.save();
    this.demoHeaderId = header.id;
    this.demoRevisionId = revision.id;
  }
}
