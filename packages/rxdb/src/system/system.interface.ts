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
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 远程更改数据接口
 */
export interface RemoteChange extends IRxDBChange {
  id: number;
}
