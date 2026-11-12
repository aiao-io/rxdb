import { RxDBEntityId, UUID } from '../entity/entity.interface.js';

/**
 * 远程更改数据接口
 */
export interface IRxDBChange {
  id: number;
  namespace: string;
  entity: string;
  entityId: RxDBEntityId;
  branchId?: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  patch?: Record<string, unknown> | null;
  inversePatch?: Record<string, unknown> | null;
  transactionId?: UUID | null;
  localId?: number | null;
  clientId?: string;
  /** 编辑时刻：变更在发起端写入本地的时刻。远端适配器推送时原样保留，`LWWConflictResolver` 比的就是它 */
  createdAt: Date;
  /** 最后写入时刻；远端日志里是推送时刻 */
  updatedAt: Date;
}

/**
 * 远程更改数据接口
 */
export interface RemoteChange extends IRxDBChange {
  id: number;
}
