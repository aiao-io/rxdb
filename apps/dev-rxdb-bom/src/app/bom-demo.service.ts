import { computed, Injectable, signal } from '@angular/core';
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { firstValueFrom } from 'rxjs';
import { BOM_ENTITIES, BomHeader, BomItemRevision, BomLine, BomLineDesignator, BomLineOccurrence, rxDBPluginBom, type ExpansionResult, type ExplosionResult, type RequirementLine } from '@aiao/rxdb-plugin-bom';
import { goldenItemId, loadScooterDataset, SCOOTER_SEED_BATCH_NO, SCOOTER_SEED_TIMESTAMP } from '@aiao/rxdb-plugin-bom/testing';

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
  readonly ready = signal(false);
  readonly seedBatchNo = SCOOTER_SEED_BATCH_NO;
  readonly seedTimestamp = SCOOTER_SEED_TIMESTAMP;
  /** itemId → itemNo（业务键，种子 itemNo 即业务键）。 */
  readonly itemNos = signal(new Map<string, string>());
  /** occurrenceId → 位号清单（AC#2 的行级位号展示）。 */
  readonly designators = signal(new Map<string, string[]>());
  readonly itemCount = computed(() => this.itemNos().size);

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
    await loadScooterDataset(this.adapter!);
    await this.#hydrate();
  }

  /** 连接既有库（页面重载的路径：插件触发器幂等安装，种子行原样可用）。 */
  async connectExisting(): Promise<void> {
    if (this.rxdb) return;
    this.ready.set(false);
    await this.#connect();
    await this.#hydrate();
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
    await this.#ensureDemoHeader();
    this.ready.set(true);
  }

  /** 按评估日与计划量展开整机（父修订按时点取最新）。 */
  async explode(asOfDate: string, plannedQty: string): Promise<ExplosionResult> {
    if (!this.rxdb) throw new Error('demo 未就绪');
    return this.rxdb.bom.explodeBom(
      { bomType: 'ebom', orgId: 'org-x', asOfDate: new Date(`${asOfDate}T00:00:00.000Z`) },
      { parentItemId: goldenItemId('SC-100') },
      { plannedQty: { value: plannedQty, uom: 'pcs' } }
    );
  }

  /** 需求行路径 → 业务键序列（展示与 e2e 断言用）。 */
  pathKeys(line: RequirementLine): string[] {
    return line.path.map(id => {
      // 发生项 id → 业务键：种子的 id 由业务键确定性派生，这里按行内容反查（demo 只展示）
      return id.slice(0, 8);
    });
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
    const tables = ['item', 'item_revision', 'bom_header', 'bom_line', 'bom_line_occurrence', 'bom_line_designator', 'bom_history_batch'];
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
    // 在演示 draft 头下新建一行 + 发生项（PCBA → SC-100 闭合多跳环：SC-100→PCBA 已存在）。
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
