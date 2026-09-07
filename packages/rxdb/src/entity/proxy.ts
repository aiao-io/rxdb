/**
 * @fileoverview 实体代理辅助函数
 *
 * 把一个裸的 entity 实例包成 `Proxy`，拦截 `set` 操作以驱动：
 *
 * - **dirty tracking**：被写入的属性 key 进入 `STATUS` 的 `changed_keys`，
 *   下一次微任务里汇总成 patch；
 * - **binary 写入优化**：`Uint8Array` 同引用赋值跳过 diff（buffer 复用很常见），
 *   异引用赋值保留深拷贝语义；
 * - **外键同步**：被直接赋值的 foreign key 字段会同步回灌到关系 Observable，
 *   让已订阅但没有走 `set()/remove()` 的下游仍能读到新引用；
 * - **身份缓存补登记**：主键被写入时把实例（重新）挂到身份缓存的对应槽位上。
 *
 * 代理只负责**变更检测**与**关系回灌**；真正的"持久化 / 派发事件 / change
 * 合并"在 {@link EntityStatus} 内完成。
 */

import { isEqual, isSymbol } from '@aiao/utils';
import { getEntityMetadata, getEntityStatus } from '../rxdb-utils.js';
import { ENTITY_MANAGER } from '../rxdb.private.js';
import { EntityType, RxDBEntityId } from './entity.interface.js';
import { PropertyType, RelationKind } from './metadata-options.interface.js';

/**
 * 身份缓存里需要用到的那部分 EntityManager
 *
 * @remarks
 * 用结构类型而不是 `import type { EntityManager }`：`entity-manager.ts` 本来就 import 本模块，
 * 反向引用会让两者互相依赖。
 */
interface IdentityCacheOwner {
  reindexEntityCache(entity: object, previousId: RxDBEntityId | undefined): void;
}

/**
 * 创建实体代理对象
 */
export const createEntityProxy = <T extends EntityType>(entity: InstanceType<T>): T => {
  const state = getEntityStatus(entity);
  const metadata = getEntityMetadata(entity.constructor as EntityType);
  let pendingCheck = false;

  const handler: ProxyHandler<InstanceType<T>> = {
    /**
     * 拦截属性设置操作
     * 当属性值发生变化时，同步记录变更属性键，并安排异步检查
     * 同时根据 metadata 配置进行类型转换
     */
    set: (target, prop, value, receiver) => {
      const currentValue = target[prop];
      const isBinaryReassignment =
        typeof prop === 'string' &&
        metadata.propertyMap.get(prop)?.type === PropertyType.binary &&
        currentValue instanceof Uint8Array &&
        value instanceof Uint8Array &&
        currentValue !== value;
      if (!isBinaryReassignment && isEqual(currentValue, value)) return true;
      if (isSymbol(prop) === false) {
        // 同步记录变更属性，用于优化 patch 计算
        state.markChanged(prop as keyof InstanceType<T>);
        state.modified = true;
        if (!pendingCheck) {
          pendingCheck = true;
          // 记下排队时的代数：reset()/replace() 若在微任务触发前同步跑过，
          // #changed_keys/_patches 已被清空，此次防抖排队的 checkChange 已过期，
          // 执行只会把一条空 patch 塞回刚清空的 _patches
          const scheduledGeneration = state.generation;
          queueMicrotask(() => {
            pendingCheck = false;
            if (state.generation !== scheduledGeneration) return;
            state.checkChange();
          });
        }
        // 外键属性被直接赋值（而非通过关系 Observable 的 set()/remove()）时，
        // 同步回灌已记忆化的关系 Observable，避免持有旧引用的订阅者读到过期数据
        if (metadata.isForeignKey(prop)) {
          const mappedRelation = metadata.foreignKeyRelationMap.get(prop);
          if (
            mappedRelation &&
            (mappedRelation.kind === RelationKind.MANY_TO_ONE || mappedRelation.kind === RelationKind.ONE_TO_ONE)
          ) {
            // 设为 null 时清理关系缓存，语义与之前保持一致（不扩大改动范围）
            if (value === null) {
              state.cleanRelationEntity(mappedRelation);
            }
            state.getRelationObservableEntry(mappedRelation)?.syncForeignKeyId?.(value);
          }
        }
      }
      const applied = Reflect.set(target, prop, value, receiver);
      // 主键写入后补登记身份缓存。放在 Reflect.set 之后：reindex 读的是实体上的新 id。
      // 走到这里说明值确实变了（上面对相等值已经提前返回），所以不会有空转。
      if (applied && prop === 'id') {
        const manager = (target as { [ENTITY_MANAGER]?: IdentityCacheOwner })[ENTITY_MANAGER];
        manager?.reindexEntityCache(state.proxyTarget, currentValue as RxDBEntityId | undefined);
      }
      return applied;
    }
  };

  return new Proxy(entity, handler);
};
