/**
 * @packageDocumentation
 * 版本工具模块
 * 提供远程变更转换为本地变更等功能
 */
import { UUID } from '../entity/entity.interface.js';
import { RxDBChange } from '../system/change.js';
import { RemoteChange } from '../system/system.interface.js';

export const remote_change_to_local = (
  remoteChange: RemoteChange[],
  base: Partial<RxDBChange>
): Omit<RxDBChange, 'id' | 'branch$'>[] =>
  remoteChange.map(rc => {
    const { id, ...rest } = rc;
    delete rest.clientId;
    return {
      ...rest,
      ...base,
      entityId: (base.entityId ?? rest.entityId) as UUID,
      remoteId: id
    };
  });
