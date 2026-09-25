/**
 * 门面轴仓储注册表的类型契约（US-025 阶段 A：A1 / A2）。
 *
 * 门面轴决定 `getRepository(E)` 的**公开面**，入口是 `@Entity({ repository: 'X' })`。
 * 改造前这个字段写死成 `'Repository' | 'TreeRepository' | string`：核心硬编码的两个成员是
 * 一等公民，插件注册的门面（`GraphRepository`）只能落到那条 `| string` 上，补全里一个字都没有。
 * US-025 阶段 E 之后核心只剩 `Repository` 一个成员，`TreeRepository` 也改由
 * `@aiao/rxdb-plugin-tree` 经 `declare module` 合并进来 —— 更说明这条路径必须通。
 *
 * 这里守两件事：
 * 1. 注册表可经 `declare module` 合并，且**没有索引签名** —— 带索引签名时 `keyof` 恒为
 *    `string`，所有 `declare module` 会静默失效（{@link RxDBAdapters} 踩过同一个坑）；
 * 2. 类型放宽**不削弱**运行期护栏 —— 未注册的名字照样编译得过，拦它的是 `EntityManager.init()`。
 */
import { describe, expect, expectTypeOf, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import type { EntityMetadataOptions } from '../../entity/entity-options.interface.js';
import { Entity } from '../../entity/entity.decorator.js';
import type { EntityType } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { RxDBRepositories, RxDBRepositoryName } from '../../rxdb-adapter.js';
import { RxDB } from '../../RxDB.js';
import { registerRxDBTeardown } from '../fixtures/rxdb-lifecycle.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

/** 假装自己是个插件包：这正是 `rxdb-plugin-graph` 对 `GraphRepository` 做的事。 */
declare module '../../rxdb-adapter.js' {
  interface RxDBRepositories {
    SpecRepository: typeof Object;
  }
}

@Entity({
  name: 'UnregisteredRepositoryEntity',
  repository: 'NotRegisteredRepository',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class UnregisteredRepositoryEntity extends EntityBase {
  title?: string;
}

const { trackRxDB } = registerRxDBTeardown();

describe('RxDBRepositories 门面轴注册表', () => {
  it('A1 注册表无索引签名，核心门面与插件合并进来的成员同为一等公民', () => {
    // 索引签名一旦存在，keyof 就塌成 string，下面三条断言全部退化成恒真
    expectTypeOf<keyof RxDBRepositories>().not.toEqualTypeOf<string>();
    expectTypeOf<'Repository'>().toExtend<keyof RxDBRepositories>();
    expectTypeOf<'SpecRepository'>().toExtend<keyof RxDBRepositories>();
    // 反向也要钉住：核心自己**不再**登记 `TreeRepository`。它由
    // `@aiao/rxdb-plugin-tree` 的 `declare module` 挂上来，核心里写死一条就是阶段 E 的残留。
    expectTypeOf<'TreeRepository'>().not.toExtend<keyof RxDBRepositories>();
  });

  it('A1 `repository?` 取自注册表而不是硬编码字面量联合', () => {
    expectTypeOf<EntityMetadataOptions['repository']>().toEqualTypeOf<RxDBRepositoryName | undefined>();
    // `(string & {})` 那一支：未注册的名字照样传得进去，补全同时保留已注册的键
    expectTypeOf<'NotRegisteredRepository'>().toExtend<RxDBRepositoryName>();
  });

  it('A2 类型放宽不削弱运行期护栏：未注册的仓储名仍在 init() 阶段抛错', () => {
    const rxdb = trackRxDB(
      new RxDB({
        dbName: 'repository-registry-guard',
        entities: [UnregisteredRepositoryEntity] as EntityType[],
        sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
      })
    );
    rxdb.adapter('sqlite', createMockAdapter);

    expect(() => rxdb.init()).toThrow(
      "Repository 'NotRegisteredRepository' not found for entity 'UnregisteredRepositoryEntity'"
    );
  });
});
