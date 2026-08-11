/**
 * @fileoverview 实体关系辅助函数
 * 提供处理实体间关系的核心实现，包括一对一、一对多、多对一和多对多关系的处理
 */

import { BehaviorSubject, defer, distinctUntilChanged, of, shareReplay, switchMap } from 'rxjs';
import { RxDBError } from '../RxDBError.js';
import { getEntityMetadata, getEntityStatus } from '../rxdb-utils.js';
import { ENTITY_MANAGER } from '../rxdb.private.js';
import type { EntityManager } from './entity-manager.js';
import { EntityType, RelationEntitiesObservable, RelationEntityObservable, RxDBEntityId } from './entity.interface.js';
import { setSafeObjectKey } from './entity.utils.js';
import { EntityRelationMetadata, RelationKind } from './metadata-options.interface.js';
import { RelationObservableEntry } from './relation-cache.js';

/**
 * 帮助 EntityManager 处理实体关系
 * 为实体类型添加关系属性，根据关系类型创建不同的可观察对象
 *
 * 该函数会：
 * 1. 获取关联实体类型
 * 2. 根据关系类型（一对一、一对多、多对一、多对多）创建相应的可观察对象
 * 3. 为可观察对象添加操作方法（set、remove、add等）
 * 4. 将关系属性添加到实体类型的原型上
 */
export default (relation: EntityRelationMetadata, EntityType: EntityType, manager: EntityManager) => {
  const mappedRelationEntityType = manager.rxdb.schemaManager.getEntityType(
    relation.mappedEntity,
    relation.mappedNamespace
  );
  if (!mappedRelationEntityType) throw new RxDBError(`mapped entity not found: ${relation.mappedEntity}`);

  const relationPropertyIdName = relation.name + 'Id';
  const relationPropertyName = relation.name + '$';
  let buildRelationEntry: (this: InstanceType<EntityType>) => RelationObservableEntry;

  /**
   * 根据不同的关系类型创建不同的可观察对象
   * 每种关系类型都有特定的实现逻辑和操作方法
   */
  switch (relation.kind) {
    /**
     * 多对一, 一对一关系处理
     * 创建一个可观察对象，通过外键ID获取关联实体
     * 提供set和remove方法操作关系
     */
    case RelationKind.MANY_TO_ONE:
    case RelationKind.ONE_TO_ONE:
      buildRelationEntry = function (this: InstanceType<EntityType>) {
        const { em, MappedRelationEntityType } = getRelationContext(this, relation, manager);
        const self = this as InstanceType<EntityType>;
        const selfStatus = getEntityStatus(self);

        const relationPropertyIdSub = new BehaviorSubject<RxDBEntityId | null>(self[relationPropertyIdName]);

        const observable = relationPropertyIdSub.asObservable().pipe(
          // Proxy 外键直写会同步调用 syncForeignKeyId，可能与下面 set()/remove() 自身的
          // next() 重入形成同值重复发射；去重后下游 switchMap/repository.get 才不会被重复触发
          distinctUntilChanged(),
          switchMap(id => {
            if (id != null) return em.getRepository(MappedRelationEntityType).get(id);
            return of(null);
          }),
          shareReplay(1)
        ) as RelationEntityObservable<typeof MappedRelationEntityType>;

        setSafeObjectKey(observable, 'set', (entity: InstanceType<typeof MappedRelationEntityType> | null) => {
          if (!entity) {
            observable.remove();
            return;
          }
          if (self[relationPropertyIdName] == entity.id) return;
          selfStatus.addRelationEntity(relation, entity);
          relationPropertyIdSub.next(entity.id);
          self[relationPropertyIdName] = entity.id;
        });

        setSafeObjectKey(observable, 'remove', () => {
          if (self[relationPropertyIdName] == null) return;
          relationPropertyIdSub.next(null);
          // 单值关系（MANY_TO_ONE/ONE_TO_ONE）至多关联一个实体，
          // 直接清空该关系缓存。原先传入 EntityType（类而非实例）会导致
          // cache.delete 删不掉任何项，残留陈旧关联实体。
          selfStatus.cleanRelationEntity(relation);
          self[relationPropertyIdName] = null;
        });

        return {
          observable: Object.freeze(observable),
          // Proxy 外键直写（bypass set()）时用来回灌 BehaviorSubject，见 proxy.ts
          syncForeignKeyId: (id: RxDBEntityId | null) => relationPropertyIdSub.next(id)
        };
      };
      break;

    /**
     * 一对多关系处理
     * 创建一个可观察对象，查询所有关联到当前实体的实体集合
     * 提供add和remove方法操作关系集合
     */
    case RelationKind.ONE_TO_MANY:
      buildRelationEntry = function (this: InstanceType<EntityType>) {
        const { em, MappedRelationEntityType } = getRelationContext(this, relation, manager);
        const mappedPropertyId = relation.mappedProperty + 'Id';
        const mappedPropertyName = relation.mappedProperty + '$';
        const self = this as InstanceType<EntityType>;
        const selfStatus = getEntityStatus(self);
        const observable = defer(
          () =>
            em.getRepository(MappedRelationEntityType).findAll({
              where: {
                combinator: 'and',
                rules: [
                  {
                    field: mappedPropertyId,
                    operator: '=',
                    value: self.id
                  }
                ]
              }
            }) as RelationEntitiesObservable<typeof MappedRelationEntityType>
        );
        const count$ = defer(() =>
          em.getRepository(MappedRelationEntityType).count({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: mappedPropertyId,
                  operator: '=',
                  value: self.id
                }
              ]
            }
          })
        );
        setSafeObjectKey(observable, 'count$', count$);
        setSafeObjectKey(observable, 'add', (...entities: InstanceType<typeof MappedRelationEntityType>[]) => {
          entities.forEach(entity => {
            selfStatus.addRelationEntity(relation, entity);
            ((entity as Record<string, unknown>)[mappedPropertyName] as RelationEntityObservable<EntityType>).set(self);
          });
        });
        setSafeObjectKey(observable, 'remove', (...entities: InstanceType<typeof MappedRelationEntityType>[]) => {
          entities.forEach(entity => {
            selfStatus.removeRelationEntity(relation, entity);
            ((entity as Record<string, unknown>)[mappedPropertyName] as RelationEntityObservable<EntityType>).remove();
          });
        });
        return { observable: Object.freeze(observable) };
      };
      break;

    /**
     * 多对多关系处理
     * 通过中间表（junction entity）实现多对多关系
     * 创建一个可观察对象，查询通过中间表关联到当前实体的实体集合
     * 提供add和remove方法操作关系集合
     */
    case RelationKind.MANY_TO_MANY:
      buildRelationEntry = function (this: InstanceType<EntityType>) {
        const { em, MappedRelationEntityType } = getRelationContext(this, relation, manager);
        const self = this as InstanceType<EntityType>;
        const selfStatus = getEntityStatus(self);
        const mappedPropertyIdName = relation.name + 'Id';
        const junctionMetadata = relation.junctionEntityType && getEntityMetadata(relation.junctionEntityType);
        const JunctionEntityType =
          junctionMetadata && em.rxdb.schemaManager.getEntityType(junctionMetadata.name, junctionMetadata.namespace);
        if (!JunctionEntityType) throw new RxDBError('junction entity not found');

        const observable = defer(
          () =>
            em
              .getRepository(JunctionEntityType)
              .findAll({
                where: {
                  combinator: 'and',
                  rules: [
                    {
                      field: relation.mappedProperty + 'Id',
                      operator: '=',
                      value: self.id
                    }
                  ]
                }
              })
              .pipe(
                switchMap(junctionEntities => {
                  const ids = junctionEntities.map(junctionEntity => junctionEntity[mappedPropertyIdName]);
                  return em.getRepository(MappedRelationEntityType).findAll({
                    where: {
                      combinator: 'and',
                      rules: [
                        {
                          field: 'id',
                          operator: 'in',
                          value: ids
                        }
                      ]
                    }
                  });
                })
              ) as RelationEntitiesObservable<typeof MappedRelationEntityType>
        );

        const count$ = defer(() =>
          em.getRepository(JunctionEntityType).count({
            where: {
              combinator: 'and',
              rules: [
                {
                  field: relation.mappedProperty + 'Id',
                  operator: '=',
                  value: self.id
                }
              ]
            }
          })
        );

        setSafeObjectKey(observable, 'count$', count$);
        setSafeObjectKey(observable, 'add', (...entities: InstanceType<typeof MappedRelationEntityType>[]) =>
          entities.forEach(entity => selfStatus.addRelationEntity(relation, entity))
        );
        setSafeObjectKey(observable, 'remove', (...entities: InstanceType<typeof MappedRelationEntityType>[]) =>
          entities.forEach(entity => {
            selfStatus.removeRelationEntity(relation, entity);
          })
        );
        return { observable: Object.freeze(observable) };
      };
      break;

    default:
      // relation.kind 理论上被 RelationKind 枚举穷尽（TS 因此把这里的 relation 窄化为
      // never），但装饰器 options 在跨越序列化/动态元数据边界时不受类型系统保护，运行时
      // 仍可能出现非法值；不拦截会让 buildRelationEntry 停留在 unassigned，直到 getter
      // 首次被访问才在 buildRelationEntry!.call(this) 处抛出无上下文的 TypeError，此处改为
      // 在安装关系属性前就地 fail fast，并带上具体的非法 kind 值。cast 回具名类型只是为了
      // 在这个刻意保留的运行时兜底分支里取到 .kind，不改变上面 4 个 case 的穷尽性检查
      throw new RxDBError(`unsupported relation kind: ${(relation as EntityRelationMetadata).kind}`);
  }

  /**
   * 添加可观察关系属性到实体类型的原型
   * 设置为不可枚举和不可配置的属性，只提供getter方法
   * 这样每个实体实例都能访问这个关系属性
   *
   * getter 按关系元数据（对象恒等）记忆化于 EntityStatus：同一实体重复访问同一关系时
   * 复用已构建的 Observable，而不是每次都重新执行 defer/switchMap 建立新订阅。
   * 缓存随 EntityStatus.replace()/mergeExternal() 一并失效（见 relation-cache.ts#clear）。
   */
  Object.defineProperty(EntityType.prototype, relationPropertyName, {
    get: function (this: InstanceType<EntityType>) {
      const selfStatus = getEntityStatus(this);
      const cached = selfStatus.getRelationObservableEntry(relation);
      if (cached) return cached.observable;
      const entry = buildRelationEntry!.call(this);
      selfStatus.setRelationObservableEntry(relation, entry);
      return entry.observable;
    },
    set: () => {
      // 忽略。
    },
    enumerable: false,
    configurable: true
  });
};

const getRelationContext = (
  entity: InstanceType<EntityType>,
  relation: EntityRelationMetadata,
  fallback: EntityManager
) => {
  const em = (entity as unknown as { [ENTITY_MANAGER]?: EntityManager })[ENTITY_MANAGER] ?? fallback;
  const MappedRelationEntityType = em.rxdb.schemaManager.getEntityType(relation.mappedEntity, relation.mappedNamespace);
  if (!MappedRelationEntityType) throw new RxDBError(`mapped entity not found: ${relation.mappedEntity}`);
  return { em, MappedRelationEntityType };
};
