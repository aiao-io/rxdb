/**
 * @fileoverview 系统实体的关系属性只能是类型声明，不能落成实例字段。
 *
 * 关系属性（`parent$` 等）由 `entity_relation_helper` 装在实体原型上（getter + 空 setter）。
 * 类里写成 `parent$!: …` 会产出实例字段：
 *
 * - define 语义（库产物 es2025）：实例上多一个值为 `undefined` 的自有属性，遮住原型上的关系 getter；
 * - 赋值语义（小程序产物降级后是 `this.parent$ = void 0`）：构造时就碰原型上的 accessor。支付宝真机调试的
 *   Boatman 解释器赋值后还会再读一次 getter，而那时实体状态还没挂上，`getEntityStatus` 抛错，库连不上。
 *
 * 所以关系属性一律写 `declare`，与 `remove` / `save` 等原型方法同一写法。
 */
import { describe, expect, it } from 'vitest';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { CORE_SYSTEM_ENTITIES } from '../../system/system-entities.js';

describe('系统实体的关系属性', () => {
  it.each(CORE_SYSTEM_ENTITIES.map(entity => [getEntityMetadata(entity).name, entity] as const))(
    '%s 的原始类构造出的实例上没有关系属性',
    (_name, entity) => {
      // `@Entity` 返回的是继承原始类的子类；原始类的构造函数只跑字段初始化，不需要 EntityManager
      const Original = Object.getPrototypeOf(entity) as new () => object;
      const instance = new Original();
      const relationProperties = getEntityMetadata(entity).relations.map(relation => `${relation.name}$`);

      expect(relationProperties.filter(property => Object.hasOwn(instance, property))).toEqual([]);
    }
  );
});
