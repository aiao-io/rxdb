import type { DevToolsEntityErrorCode } from '@aiao/rxdb-devtools';
import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { ToastService } from '../components/toast.component';
import { DEVTOOLS_TRANSPORT } from '../transport';
import type { DbInfo, EntityData, EntityErrorKind } from '../types/devtools.types';

/** 协议错误码 → UI 判别位；未登记的码（连接器比面板新）一律落到 `'unknown'`。 */
const ENTITY_ERROR_KINDS: Readonly<Record<DevToolsEntityErrorCode, EntityErrorKind>> = {
  ENTITY_NOT_FOUND: 'entity-not-found',
  ENTITY_AMBIGUOUS: 'entity-ambiguous',
  RXDB_NOT_READY: 'rxdb-not-ready',
  KEYRING_LOCKED: 'keyring-locked'
};

/** 一次实体查询的完整参数，用于握手后重发。 */
interface PendingQuery {
  entityName: string;
  namespace: string;
  limit: number;
}

/**
 * Database 状态管理服务
 */
@Injectable({ providedIn: 'root' })
export class DatabaseStateService implements OnDestroy {
  private readonly transport = inject(DEVTOOLS_TRANSPORT);
  private readonly toastService = inject(ToastService);
  private unsubscribe: (() => void) | null = null;

  /** 数据库信息 */
  readonly dbInfo = signal<DbInfo | null>(null);

  /** 数据库加载状态 */
  readonly dbLoading = signal(false);

  /** 按 namespace + entityName 分槽保存实体查询结果。 */
  readonly entityDataByKey = signal<ReadonlyMap<string, EntityData>>(new Map());

  /** 按同一分槽保存最近一次查询失败的结构化类别；成功时清空该槽。 */
  readonly entityErrorKindByKey = signal<ReadonlyMap<string, EntityErrorKind>>(new Map());

  /**
   * 面板「想看什么」——每次 {@link queryEntity} 登记，握手后全量重发。
   *
   * @remarks
   * **不随 {@link reset} 清空**：它记录的是意图，不是连接状态。页面在 `ngOnInit` 里发出的
   * 那条查询正好落在握手前的窗口里，会被 transport（没端口）、background（没 tabId）、
   * 以及连接器（window 总线只放行 `PING`）三处静默丢弃；每次导航合成的 `DISCONNECT`
   * 同样会把面板打回这个窗口。清空它等于让首屏永远空着。
   */
  private readonly lastQueries = new Map<string, PendingQuery>();

  /**
   * 在途查询的实体名集合。
   * 按实体维度记录加载状态，避免多个实体查询并发时，某个实体的响应清掉另一个实体的 loading，
   * 导致对应页面在自身请求仍在途时误渲染空状态。
   */
  private readonly loadingEntities = signal<ReadonlySet<string>>(new Set());

  constructor() {
    this.setupMessageListener();
  }

  ngOnDestroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
  }

  /**
   * 检查数据库
   */
  inspectDb(): void {
    this.dbLoading.set(true);
    this.transport.sendMessage('INSPECT_DB');
  }

  /**
   * 查询实体
   */
  queryEntity(entityName: string, namespace = 'public', limit = 100): void {
    const key = this.entityKey(entityName, namespace);
    this.loadingEntities.update(set => new Set(set).add(key));
    this.lastQueries.set(key, { entityName, namespace, limit });
    this.transport.sendMessage('QUERY_ENTITY', { entityName, namespace, limit });
  }

  /** 指定实体是否正在查询中（在 computed 中调用以建立响应式依赖） */
  isEntityLoading(entityName: string | null, namespace = 'public'): boolean {
    return entityName != null && this.loadingEntities().has(this.entityKey(entityName, namespace));
  }

  /** 读取指定复合身份的最近一次查询结果。 */
  getEntityData(entityName: string, namespace = 'public'): EntityData | null {
    return this.entityDataByKey().get(this.entityKey(entityName, namespace)) ?? null;
  }

  /**
   * 读取指定复合身份最近一次失败的结构化类别。
   *
   * @returns 无失败（含尚未应答、以及最近一次成功）时为 `null`
   */
  getEntityErrorKind(entityName: string, namespace = 'public'): EntityErrorKind | null {
    return this.entityErrorKindByKey().get(this.entityKey(entityName, namespace)) ?? null;
  }

  private setupMessageListener(): void {
    this.unsubscribe = this.transport.subscribe(message => {
      switch (message.type) {
        case 'HANDSHAKE':
          this.replayQueries();
          break;
        case 'DB_INFO':
          this.handleDbInfo(message.payload as DbInfo | null);
          break;
        case 'ENTITY_DATA':
          this.handleEntityData(message.payload as EntityData);
          break;
        case 'DISCONNECT':
          this.reset();
          break;
        case 'ERROR':
          this.handleError(message.payload as { message: string });
          break;
      }
    });
  }

  reset(): void {
    this.dbInfo.set(null);
    this.entityDataByKey.set(new Map());
    this.entityErrorKindByKey.set(new Map());
    this.dbLoading.set(false);
    this.loadingEntities.set(new Set());
  }

  /** 握手落地后把面板想看的查询全部重发一遍。 */
  private replayQueries(): void {
    for (const query of this.lastQueries.values()) {
      this.loadingEntities.update(set => new Set(set).add(this.entityKey(query.entityName, query.namespace)));
      this.transport.sendMessage('QUERY_ENTITY', { ...query });
    }
  }

  private handleDbInfo(dbInfo: DbInfo | null): void {
    this.dbInfo.set(dbInfo);
    this.dbLoading.set(false);
  }

  /**
   * 落地一次实体查询应答。
   *
   * @remarks
   * **不弹 toast**：`ENTITY_DATA` 永远是对某个具体槽位的应答，Database 页与 Storage 页
   * 都已就地渲染这条错误，全局 toast 只是重复通知；而「实体不存在」（对端没装对应插件）
   * 根本不是错误，弹红框会把一个可解释的正常状态渲染成故障。无归属的协议级 `ERROR`
   * 仍然走 toast，见 {@link handleError}。
   */
  private handleEntityData(entityData: EntityData): void {
    const key = this.entityKey(entityData.entityName, entityData.namespace ?? 'public');
    this.entityDataByKey.update(current => new Map(current).set(key, entityData));
    this.entityErrorKindByKey.update(current => {
      const next = new Map(current);
      if (entityData.error) next.set(key, this.toErrorKind(entityData._meta?.errorCode));
      else next.delete(key);
      return next;
    });
    this.loadingEntities.update(set => {
      if (!set.has(key)) return set;
      const next = new Set(set);
      next.delete(key);
      return next;
    });
  }

  private toErrorKind(errorCode: DevToolsEntityErrorCode | undefined): EntityErrorKind {
    return (errorCode && ENTITY_ERROR_KINDS[errorCode]) || 'unknown';
  }

  private handleError(payload: { message: string }): void {
    this.dbLoading.set(false);
    // ERROR 消息不携带 entityName，无法定位具体实体，保守清空全部在途状态
    this.loadingEntities.set(new Set());
    this.toastService.error(payload.message || 'Database error');
  }

  private entityKey(entityName: string, namespace: string): string {
    return `${namespace}:${entityName}`;
  }
}
