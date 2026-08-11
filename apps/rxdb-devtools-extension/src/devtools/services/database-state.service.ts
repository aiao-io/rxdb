import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { ToastService } from '../components/toast.component';
import type { DbInfo, EntityData } from '../types/devtools.types';
import { PortService } from './port.service';

/**
 * Database 状态管理服务
 */
@Injectable({ providedIn: 'root' })
export class DatabaseStateService implements OnDestroy {
  private readonly portService = inject(PortService);
  private readonly toastService = inject(ToastService);
  private unsubscribe: (() => void) | null = null;

  /** 数据库信息 */
  readonly dbInfo = signal<DbInfo | null>(null);

  /** 数据库加载状态 */
  readonly dbLoading = signal(false);

  /** 按 namespace + entityName 分槽保存实体查询结果。 */
  readonly entityDataByKey = signal<ReadonlyMap<string, EntityData>>(new Map());

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
    this.portService.sendMessage('INSPECT_DB');
  }

  /**
   * 查询实体
   */
  queryEntity(entityName: string, namespace = 'public', limit = 100): void {
    const key = this.entityKey(entityName, namespace);
    this.loadingEntities.update(set => new Set(set).add(key));
    this.portService.sendMessage('QUERY_ENTITY', { entityName, namespace, limit });
  }

  /** 指定实体是否正在查询中（在 computed 中调用以建立响应式依赖） */
  isEntityLoading(entityName: string | null, namespace = 'public'): boolean {
    return entityName != null && this.loadingEntities().has(this.entityKey(entityName, namespace));
  }

  /** 读取指定复合身份的最近一次查询结果。 */
  getEntityData(entityName: string, namespace = 'public'): EntityData | null {
    return this.entityDataByKey().get(this.entityKey(entityName, namespace)) ?? null;
  }

  private setupMessageListener(): void {
    this.unsubscribe = this.portService.subscribe(message => {
      switch (message.type) {
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
    this.dbLoading.set(false);
    this.loadingEntities.set(new Set());
  }

  private handleDbInfo(dbInfo: DbInfo | null): void {
    this.dbInfo.set(dbInfo);
    this.dbLoading.set(false);
  }

  private handleEntityData(entityData: EntityData): void {
    const key = this.entityKey(entityData.entityName, entityData.namespace ?? 'public');
    this.entityDataByKey.update(current => new Map(current).set(key, entityData));
    this.loadingEntities.update(set => {
      if (!set.has(key)) return set;
      const next = new Set(set);
      next.delete(key);
      return next;
    });

    if (entityData.error) {
      this.toastService.error(entityData.error);
    }
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
