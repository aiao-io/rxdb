import type { TransactionExecutor } from '@aiao/rxdb';
import { Entity, EntityBase, PropertyType, RxDB, RxDBSync, SyncType, type Conflict, type UUID } from '@aiao/rxdb';
import { RxDBAdapterSupabase } from '@aiao/rxdb-adapter-supabase';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { firstValueFrom } from 'rxjs';
import { serializePrompt } from '../app/prompts/prompt-state';
import type { ProductAuthorization } from '../app/supabase-auth';
import {
  productPayloadText,
  productRecordId,
  validateSyncPayload,
  validateTaskReport,
  type ProductRecordKind,
  type ProductRecordPayload,
  type TaskReport
} from '../contracts/product-data.mjs';
import { splitReportBatches } from './report-batches';
import SupabaseSDK = require('@supabase/supabase-js');
type SupabaseClient = SupabaseSDK.SupabaseClient;

export interface ProductRecord {
  id: string;
  sourceId: string;
  workspaceId: string;
  kind: ProductRecordKind;
  payload: ProductRecordPayload;
  revision: number;
  deleted: boolean;
}
export interface ProductEntry {
  sourceId: string;
  kind: ProductRecordKind;
  payload: ProductRecordPayload;
}
export interface ProductSyncResult {
  records: ProductRecord[];
  conflicts: ProductConflict[];
  pending: number;
}
export interface ProductSyncOptions {
  rescan?: boolean;
}
export type ApplyProductSync = (result: ProductSyncResult) => Promise<ProductEntry[]>;
export interface ProductConflict {
  id: string;
  recordId: string;
  local: ProductRecord;
  remote: ProductRecord | null;
  latestRemote: ProductRecord | null;
  reason: string;
}

function models() {
  @Entity({
    name: 'MediaSyncRecord',
    tableName: 'media_sync_records',
    namespace: 'public',
    log: true,
    properties: [
      { name: 'workspaceId', type: PropertyType.uuid, required: true },
      { name: 'sourceId', type: PropertyType.string, required: true },
      { name: 'kind', type: PropertyType.string, required: true },
      { name: 'payload', type: PropertyType.string, required: true },
      { name: 'revision', type: PropertyType.integer, required: true },
      { name: 'baseRevision', type: PropertyType.integer, required: true },
      { name: 'deleted', type: PropertyType.boolean, required: true }
    ],
    indexes: [{ name: 'media_record_workspace', properties: ['workspaceId', 'kind', 'sourceId'], unique: true }]
  })
  class Record extends EntityBase {
    workspaceId!: string;
    sourceId!: string;
    kind!: ProductRecordKind;
    payload!: string;
    revision!: number;
    baseRevision!: number;
    deleted!: boolean;
  }
  @Entity({
    name: 'LocalProductConflict',
    tableName: 'local_product_conflict',
    namespace: 'media',
    log: false,
    sync: { type: SyncType.None },
    properties: [
      { name: 'recordId', type: PropertyType.uuid, required: true },
      { name: 'status', type: PropertyType.string, required: true },
      { name: 'payload', type: PropertyType.string, required: true }
    ],
    indexes: [{ name: 'media_conflict_record', properties: ['recordId', 'status'] }]
  })
  class ConflictRow extends EntityBase {
    recordId!: string;
    status!: string;
    payload!: string;
  }
  @Entity({
    name: 'LocalPublishedWork',
    tableName: 'local_published_work',
    namespace: 'media',
    log: false,
    sync: { type: SyncType.None },
    properties: [{ name: 'sourceId', type: PropertyType.uuid, required: true }],
    indexes: [{ name: 'media_published_source', properties: ['sourceId'], unique: true }]
  })
  class PublishedWork extends EntityBase {
    sourceId!: string;
  }
  @Entity({
    name: 'LocalTaskReportOutbox',
    tableName: 'local_task_report_outbox',
    namespace: 'media',
    log: false,
    sync: { type: SyncType.None },
    properties: [
      { name: 'reportId', type: PropertyType.uuid, required: true },
      { name: 'payload', type: PropertyType.string, required: true },
      { name: 'state', type: PropertyType.string, required: true }
    ],
    indexes: [{ name: 'media_report_id', properties: ['reportId'], unique: true }]
  })
  class ReportOutbox extends EntityBase {
    reportId!: string;
    payload!: string;
    state!: string;
  }
  @Entity({
    name: 'LocalProductBaseline',
    tableName: 'local_product_baseline',
    namespace: 'media',
    log: false,
    sync: { type: SyncType.None },
    properties: [
      { name: 'recordId', type: PropertyType.uuid, required: true },
      { name: 'payload', type: PropertyType.string, required: true },
      { name: 'revision', type: PropertyType.integer, required: true }
    ],
    indexes: [{ name: 'media_baseline_record', properties: ['recordId'], unique: true }]
  })
  class Baseline extends EntityBase {
    recordId!: string;
    payload!: string;
    revision!: number;
  }
  @Entity({
    name: 'LocalProductAcknowledged',
    tableName: 'local_product_acknowledged',
    namespace: 'media',
    log: false,
    sync: { type: SyncType.None },
    properties: [
      { name: 'recordId', type: PropertyType.uuid, required: true },
      { name: 'revision', type: PropertyType.integer, required: true }
    ],
    indexes: [{ name: 'media_acknowledged_record', properties: ['recordId'], unique: true }]
  })
  class Acknowledged extends EntityBase {
    recordId!: string;
    revision!: number;
  }
  return { Record, ConflictRow, PublishedWork, ReportOutbox, Baseline, Acknowledged };
}
const emptyWhere = { combinator: 'and' as const, rules: [] };

/** 私有工作区之外的 DTO 副本；推拉、水位和出站变更由 RxDB 插件维护。 */
export class ProductSyncStore {
  private closed = false;
  private closing?: Promise<void>;
  private constructor(
    private readonly db: RxDB,
    private readonly client: SupabaseClient,
    private readonly types: ReturnType<typeof models>,
    private readonly profileId: string,
    readonly workspaceId: string,
    private readonly lifetime: AbortController
  ) {}

  static async open(
    profileId: string,
    workspaceId: string,
    authorization: ProductAuthorization,
    signal?: AbortSignal
  ): Promise<ProductSyncStore> {
    const lifetime = new AbortController();
    if (signal?.aborted) lifetime.abort();
    signal?.addEventListener('abort', () => lifetime.abort(), { once: true });
    const client = new SupabaseSDK.SupabaseClient(authorization.config.url, authorization.config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            credentials: 'omit',
            cache: 'no-store',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.any([
              lifetime.signal,
              AbortSignal.timeout(15000),
              ...(init?.signal ? [init.signal] : [])
            ])
          })
      }
    });
    const types = models();
    const db = new RxDB({
      dbName: `ams1-${profileId.replaceAll('-', '')}`,
      context: { userId: authorization.userId },
      entities: [
        types.Record,
        types.ConflictRow,
        types.PublishedWork,
        types.ReportOutbox,
        types.Baseline,
        types.Acknowledged
      ],
      sync: { type: SyncType.Full, local: { adapter: 'wa-sqlite' }, remote: { adapter: 'supabase' } }
    });
    db.use(rxDBPluginHistory).use(rxDBPluginSync);
    db.adapter(
      'wa-sqlite',
      host =>
        new RxDBAdapterWaSqlite(host, {
          vfs: 'IDBBatchAtomicVFS',
          async: true,
          wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
        })
    );
    db.adapter(
      'supabase',
      host =>
        new RxDBAdapterSupabase(host, {
          client,
          rlsCheck: { failureMode: 'throw', tables: [{ schema: 'public', table: 'media_sync_records' }] }
        })
    );
    const store = new ProductSyncStore(db, client, types, profileId, workspaceId, lifetime);
    try {
      const result = await client.auth.setSession({
        access_token: authorization.session.access_token,
        refresh_token: authorization.session.refresh_token
      });
      if (result.error || result.data.user?.id !== authorization.userId) throw new Error('当前同步账号未验证。');
      const allowed = await client.from('media_workspaces').select('id').eq('id', workspaceId).single();
      if (allowed.error || allowed.data?.id !== workspaceId) throw new Error('同步工作区授权已失效，本机数据保留。');
      await db.connect('wa-sqlite');
      await db.connect('supabase');
      return store;
    } catch (error) {
      await store.close();
      throw error;
    }
  }

  async records(): Promise<ProductRecord[]> {
    const adapter = await firstValueFrom(this.db.localAdapter$);
    const rows = await adapter.getRepository(this.types.Record).find({ where: emptyWhere });
    return rows.map(row => this.snapshot(row));
  }

  async conflicts(): Promise<ProductConflict[]> {
    const adapter = await firstValueFrom(this.db.localAdapter$);
    const rows = await adapter
      .getRepository(this.types.ConflictRow)
      .find({ where: { combinator: 'and', rules: [{ field: 'status', operator: '=', value: 'pending' }] } });
    return rows.map(row => ({ ...(JSON.parse(row.payload) as Omit<ProductConflict, 'id'>), id: row.id }));
  }

  capture(entries: ProductEntry[], localWorkIds: string[]): Promise<number> {
    return this.exclusive(async () => {
      const blocked = new Set((await this.conflicts()).map(conflict => conflict.recordId));
      const adapter = await firstValueFrom(this.db.localAdapter$);
      const sources = await adapter.getRepository(this.types.Baseline).find({ where: emptyWhere });
      const existing = new Map((await this.records()).map(record => [record.id, record]));
      let changed = 0;
      for (const entry of entries) {
        const id = await productRecordId(this.workspaceId, entry.kind, entry.sourceId);
        if (blocked.has(id)) continue;
        const record = existing.get(id),
          baseline = sources.find(row => row.recordId === id);
        const payload = productPayloadText(entry.kind, entry.payload);
        if (record && !record.deleted && payload === productPayloadText(record.kind, record.payload)) {
          const localAdapter = await firstValueFrom(this.db.localAdapter$);
          await localAdapter.transaction(executor => this.baseline(executor, record.id, payload, record.revision));
          continue;
        }
        if (record?.deleted) {
          const unchangedDraft =
            entry.kind === 'draft' &&
            (payload === baseline?.payload ||
              !serializePrompt(validateSyncPayload('draft', entry.payload).state).text.trim());
          if (entry.kind === 'work' || unchangedDraft) continue;
          await this.persistConflict(
            { ...record, payload: entry.payload, deleted: false, revision: record.revision + 1 },
            record,
            '此记录已在同步端删除'
          );
          blocked.add(id);
          continue;
        }
        if (record && baseline && payload === baseline.payload) continue;
        const unseenRemote =
          record &&
          (baseline ?
            record.revision !== baseline.revision
          : productPayloadText(record.kind, record.payload) !== payload);
        if (unseenRemote && record) {
          await this.persistConflict(
            { ...record, payload: entry.payload, revision: record.revision + 1 },
            record,
            '本机输入与未载入的远程修订同时变化'
          );
          blocked.add(id);
          continue;
        }
        if (await this.write(id, entry, false)) changed++;
      }
      const providerIds = new Set(entries.filter(entry => entry.kind === 'provider').map(entry => entry.sourceId));
      const markers = adapter.getRepository(this.types.PublishedWork);
      const knownWorks = await markers.find({ where: emptyWhere });
      const missingWorks = new Set(
        knownWorks.filter(row => !localWorkIds.includes(row.sourceId)).map(row => row.sourceId)
      );
      for (const record of await this.records()) {
        const baseline = sources.find(row => row.recordId === record.id);
        const removed =
          (record.kind === 'provider' && !providerIds.has(record.sourceId) && baseline) ||
          (record.kind === 'work' && missingWorks.has(record.sourceId));
        if (record.deleted || blocked.has(record.id) || !removed) continue;
        if (baseline && baseline.revision !== record.revision)
          await this.persistConflict(
            { ...record, deleted: true, revision: record.revision + 1 },
            record,
            '本机删除与远程修改同时发生'
          );
        else if (await this.write(record.id, record, true)) changed++;
      }
      for (const id of localWorkIds)
        if (!knownWorks.some(row => row.sourceId === id))
          await markers.create(this.db.entityManager.instantiate(this.types.PublishedWork, { sourceId: id }));
      return changed;
    });
  }

  markProjected(entries: ProductEntry[], blocked: Set<string>): Promise<void> {
    return this.exclusive(() => this.markProjectedInRound(entries, blocked));
  }

  deleteDraft(): Promise<void> {
    return this.exclusive(async () => {
      const record = (await this.records()).find(row => row.kind === 'draft' && row.sourceId === 'main');
      if (record && !record.deleted) await this.write(record.id, record, true);
    });
  }

  synchronize(apply?: ApplyProductSync, options: ProductSyncOptions = {}): Promise<ProductSyncResult> {
    return this.exclusive(() => this.syncRound(apply, options));
  }

  enqueueReports(reports: TaskReport[]): Promise<void> {
    return this.exclusive(async () => {
      const adapter = await firstValueFrom(this.db.localAdapter$),
        repo = adapter.getRepository(this.types.ReportOutbox);
      for (const input of reports) {
        const report = validateTaskReport(input);
        if (report.workspaceId !== this.workspaceId) throw new Error('任务上报工作区不匹配。');
        const payload = JSON.stringify(report);
        const [old] = await repo.find({
          where: { combinator: 'and', rules: [{ field: 'reportId', operator: '=', value: report.id }] }
        });
        if (old?.payload === payload) continue;
        if (old) await repo.update(old, { payload, state: 'pending' });
        else
          await repo.create(
            this.db.entityManager.instantiate(this.types.ReportOutbox, {
              reportId: report.id,
              payload,
              state: 'pending'
            })
          );
      }
    });
  }

  resolve(
    conflictId: string,
    choice: 'local' | 'remote',
    local?: { payload: ProductRecordPayload; deleted: boolean },
    apply?: ApplyProductSync
  ): Promise<ProductSyncResult> {
    return this.exclusive(async () => {
      await this.pull();
      const conflict = (await this.conflicts()).find(item => item.id === conflictId);
      if (!conflict) return this.syncRound(apply);
      const latest = await this.remote(conflict.recordId);
      if (!latest) throw new Error('远程记录不可读；冲突副本保留。');
      if ((latest?.revision ?? 0) !== (conflict.latestRemote?.revision ?? 0)) {
        await this.persistConflict(conflict.local, latest, conflict.reason);
        throw new Error('远程修订已变化，请重新载入冲突。');
      }
      const adapter = await firstValueFrom(this.db.localAdapter$);
      await adapter.transaction(async executor => {
        const recordRepo = executor.getRepository(this.types.Record),
          conflictRepo = executor.getRepository(this.types.ConflictRow);
        const [row] = await recordRepo.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: conflict.recordId as UUID }] }
        });
        const [savedConflict] = await conflictRepo.find({
          where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: conflictId as UUID }] }
        });
        if (!row || !savedConflict) throw new Error('冲突记录已变化。');
        if (choice === 'local') {
          const payload = productPayloadText(row.kind, local?.payload ?? conflict.local.payload),
            revision = row.revision + 1;
          await recordRepo.update(row, {
            payload,
            deleted: local?.deleted ?? conflict.local.deleted,
            revision,
            baseRevision: latest?.revision ?? 0
          });
          await this.baseline(executor, row.id, payload, revision);
        }
        await conflictRepo.update(savedConflict, { status: `resolved-${choice}` });
      });
      return this.syncRound(apply);
    });
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    this.lifetime.abort();
    this.closing = navigator.locks.request(`aiao-media-sync-${this.profileId}`, async () => {
      await this.db.disconnectAll();
      await this.client.removeAllChannels();
      await this.client.auth.stopAutoRefresh();
    });
    return this.closing;
  }

  private async markProjectedInRound(entries: ProductEntry[], blocked: Set<string>): Promise<void> {
    const records = new Map((await this.records()).map(record => [record.id, record]));
    const adapter = await firstValueFrom(this.db.localAdapter$);
    await adapter.transaction(async executor => {
      for (const entry of entries) {
        const id = await productRecordId(this.workspaceId, entry.kind, entry.sourceId),
          record = records.get(id);
        if (
          !record ||
          blocked.has(id) ||
          productPayloadText(record.kind, record.payload) !== productPayloadText(entry.kind, entry.payload)
        )
          continue;
        await this.baseline(executor, id, productPayloadText(entry.kind, entry.payload), record.revision);
      }
    });
  }

  private async syncRound(apply?: ApplyProductSync, options: ProductSyncOptions = {}): Promise<ProductSyncResult> {
    const allowed = await this.client.from('media_workspaces').select('id').eq('id', this.workspaceId).single();
    if (allowed.error || allowed.data?.id !== this.workspaceId) throw new Error('同步工作区授权已失效，本机数据保留。');
    if (options.rescan) await this.resetPullCheckpoint();
    await this.pull();
    for (const conflict of await this.conflicts()) {
      const latest = await this.remote(conflict.recordId);
      if (latest?.revision !== conflict.latestRemote?.revision)
        await this.persistConflict(conflict.local, latest, conflict.reason);
    }
    this.assertActive();
    const pushed = await this.db.syncManager.push({
      repositoryFilter: [{ namespace: 'public', entity: 'MediaSyncRecord' }]
    });
    if (pushed.failed || pushed.failures.length) throw new Error('同步推送失败，本机改动保留。');
    if (pushed.rejected) await this.preserveRejections();
    await this.flushReports();
    this.assertActive();
    const status = await this.db.syncManager.getRepositorySyncStatus('public', 'MediaSyncRecord');
    const result = { records: await this.records(), conflicts: await this.conflicts(), pending: status.pushableCount };
    if (!result.pending) {
      const blocked = new Set(result.conflicts.map(conflict => conflict.recordId));
      const adapter = await firstValueFrom(this.db.localAdapter$);
      await adapter.transaction(async executor => {
        const repository = executor.getRepository(this.types.Acknowledged);
        for (const record of result.records) {
          if (blocked.has(record.id)) continue;
          const [old] = await repository.find({
            where: { combinator: 'and', rules: [{ field: 'recordId', operator: '=', value: record.id }] }
          });
          if (old && old.revision !== record.revision) await repository.update(old, { revision: record.revision });
          if (!old)
            await repository.create(
              this.db.entityManager.instantiate(this.types.Acknowledged, {
                recordId: record.id,
                revision: record.revision
              })
            );
        }
      });
    }
    if (apply)
      await this.markProjectedInRound(
        await apply(result),
        new Set(result.conflicts.map(conflict => conflict.recordId))
      );
    return result;
  }

  private async resetPullCheckpoint(): Promise<void> {
    this.assertActive();
    const adapter = await firstValueFrom(this.db.localAdapter$);
    await adapter.transaction(async executor => {
      const repository = executor.getRepository(RxDBSync);
      const [row] = await repository.find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: 'public:MediaSyncRecord:main' }] }
      });
      if (row) await repository.update(row, { lastPullRemoteChangeId: null, lastPulledAt: null });
    });
  }

  private snapshot(row: {
    id: string;
    workspaceId: string;
    sourceId: string;
    kind: ProductRecordKind;
    payload: string;
    revision: number;
    deleted: boolean;
  }): ProductRecord {
    if (
      row.workspaceId !== this.workspaceId ||
      !Number.isSafeInteger(row.revision) ||
      row.revision < 1 ||
      typeof row.deleted !== 'boolean'
    )
      throw new Error('同步副本的工作区或修订无效。');
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      sourceId: row.sourceId,
      kind: row.kind,
      payload: validateSyncPayload(row.kind, JSON.parse(row.payload)),
      revision: row.revision,
      deleted: row.deleted
    };
  }

  private async write(id: string, entry: ProductEntry, deleted: boolean): Promise<boolean> {
    const payload = productPayloadText(entry.kind, entry.payload);
    const adapter = await firstValueFrom(this.db.localAdapter$);
    return adapter.transaction(async executor => {
      const repo = executor.getRepository(this.types.Record);
      const [row] = await repo.find({
        where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: id as UUID }] }
      });
      const changed = !row || row.payload !== payload || row.deleted !== deleted;
      const revision = row ? row.revision + Number(changed) : 1;
      const [acknowledged] = await executor
        .getRepository(this.types.Acknowledged)
        .find({ where: { combinator: 'and', rules: [{ field: 'recordId', operator: '=', value: id }] } });
      const baseRevision = acknowledged?.revision ?? 0;
      if (row && changed) await repo.update(row, { payload, deleted, revision, baseRevision });
      if (!row)
        await repo.create(
          this.db.entityManager.instantiate(this.types.Record, {
            id: id as UUID,
            workspaceId: this.workspaceId,
            sourceId: entry.sourceId,
            kind: entry.kind,
            payload,
            deleted,
            revision,
            baseRevision: 0
          })
        );
      await this.baseline(executor, id, payload, revision);
      return changed;
    });
  }

  private async baseline(
    executor: TransactionExecutor,
    recordId: string,
    payload: string,
    revision: number
  ): Promise<void> {
    const repo = executor.getRepository(this.types.Baseline);
    const [old] = await repo.find({
      where: { combinator: 'and', rules: [{ field: 'recordId', operator: '=', value: recordId }] }
    });
    if (old?.payload === payload && old.revision === revision) return;
    if (old) await repo.update(old, { payload, revision });
    else await repo.create(this.db.entityManager.instantiate(this.types.Baseline, { recordId, payload, revision }));
  }

  private async pull(): Promise<void> {
    const known = new Set((await this.conflicts()).map(item => item.recordId));
    const detected: Conflict[] = [];
    const options = {
      repositoryFilter: [{ namespace: 'public', entity: 'MediaSyncRecord' }],
      fetchAll: true,
      conflictResolver: {
        resolve: async (conflict: Conflict) => {
          if (known.has(String(conflict.local.entityId))) return { type: 'KEEP_REMOTE' as const };
          detected.push(conflict);
          return { type: 'DEFER' as const };
        }
      }
    };
    try {
      const result = await this.db.syncManager.pull(options);
      if (result.failures.length) throw new Error('同步拉取未完成。');
    } catch (error) {
      if (!detected.length) throw error;
      for (const conflict of detected) await this.preserve(String(conflict.local.entityId), '并发修订');
      const retained = new Set((await this.conflicts()).map(item => item.recordId));
      const later: Conflict[] = [];
      try {
        const result = await this.db.syncManager.pull({
          ...options,
          conflictResolver: {
            resolve: async (conflict: Conflict) => {
              if (retained.has(String(conflict.local.entityId))) return { type: 'KEEP_REMOTE' as const };
              later.push(conflict);
              return { type: 'DEFER' as const };
            }
          }
        });
        if (result.failures.length) throw new Error('冲突已保留，同步尚未完成。', { cause: error });
      } catch (failure) {
        for (const conflict of later) await this.preserve(String(conflict.local.entityId), '后续并发修订');
        throw failure;
      }
    }
  }

  private async remote(id: string): Promise<ProductRecord | null> {
    const { data, error } = await this.client.from('media_sync_records').select().eq('id', id).maybeSingle();
    this.assertActive();
    if (error) throw new Error('远程修订暂不可读，本机改动保留。');
    return data ? this.snapshot(data as Parameters<ProductSyncStore['snapshot']>[0]) : null;
  }

  private async preserve(recordId: string, reason: string): Promise<void> {
    const record = (await this.records()).find(item => item.id === recordId);
    if (!record) throw new Error('待保留的本机修订缺失。');
    return this.persistConflict(record, await this.remote(recordId), reason);
  }
  private async persistConflict(record: ProductRecord, remote: ProductRecord | null, reason: string): Promise<void> {
    const recordId = record.id;
    const adapter = await firstValueFrom(this.db.localAdapter$),
      repo = adapter.getRepository(this.types.ConflictRow);
    const [old] = await repo.find({
      where: {
        combinator: 'and',
        rules: [
          { field: 'recordId', operator: '=', value: recordId },
          { field: 'status', operator: '=', value: 'pending' }
        ]
      }
    });
    const snapshot =
      old ?
        { ...(JSON.parse(old.payload) as Omit<ProductConflict, 'id'>), latestRemote: remote }
      : { recordId, local: record, remote, latestRemote: remote, reason };
    if (old) await repo.update(old, { payload: JSON.stringify(snapshot) });
    else
      await repo.create(
        this.db.entityManager.instantiate(this.types.ConflictRow, {
          recordId,
          status: 'pending',
          payload: JSON.stringify(snapshot)
        })
      );
  }

  private async preserveRejections(): Promise<void> {
    for (const rejection of this.db.syncState.snapshot.lastRejections)
      if (rejection.entity === 'MediaSyncRecord')
        await this.preserve(String(rejection.entityId), '远程拒绝此修订，原版本已保留');
  }

  private async flushReports(): Promise<void> {
    const adapter = await firstValueFrom(this.db.localAdapter$),
      repo = adapter.getRepository(this.types.ReportOutbox);
    const rows = await repo.find({
      where: { combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'pending' }] }
    });
    if (!rows.length) return;
    for (const batch of splitReportBatches(rows)) {
      const reports = batch.map(row => validateTaskReport(JSON.parse(row.payload)));
      const { data, error } = await this.client.rpc('media_submit_task_reports', { p_reports: reports });
      this.assertActive();
      if (error || !Array.isArray(data) || batch.some(row => !data.includes(row.reportId)))
        throw new Error('任务上报未确认；本机队列保留，联网后可重试。');
      for (const row of batch) await repo.update(row, { state: 'acknowledged' });
    }
  }

  private assertActive(): void {
    if (this.closed || this.lifetime.signal.aborted) throw new Error('同步已暂停。');
  }
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    return navigator.locks.request(`aiao-media-sync-${this.profileId}`, async () => {
      this.assertActive();
      return operation();
    });
  }
}
