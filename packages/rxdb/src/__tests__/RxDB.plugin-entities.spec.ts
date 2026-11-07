/**
 * 插件往 `config.entities` 补实体时依赖的两条宿主契约。
 *
 * 1. {@link RxDB.initialized} 如实反映本纪元是否已走过 `init()`：实体只在 `init()` 时绑定，
 *    插件据此判断 `use()` 是否已经太晚；
 * 2. `EntityManager.destroy()` 按 `init()` 时实际绑定的实体类解绑：插件作用域的释放早于
 *    `entityManager.destroy()`，插件在释放时摘掉自己补的实体后，实体类也不能留在已拆掉的实例上。
 */
import { describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../entity/entity-base.js';
import { Entity } from '../entity/entity.decorator.js';
import type { EntityType } from '../entity/entity.interface.js';
import { PropertyType, SyncType } from '../entity/metadata-options.interface.js';
import type { IRxDBPlugin } from '../rxdb-plugin.js';
import { RxDB } from '../RxDB.js';
import { registerRxDBTeardown } from './fixtures/rxdb-lifecycle.js';

@Entity({
  name: 'PluginContributedNote',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class PluginContributedNote extends EntityBase {
  title!: string;
}

const { trackRxDB } = registerRxDBTeardown();
let sequence = 0;

const createDatabase = (entities: EntityType[] = []): RxDB => {
  sequence += 1;
  return trackRxDB(
    new RxDB({
      dbName: `rxdb-plugin-entities-${sequence}`,
      entities,
      multiInstance: false,
      sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
    })
  );
};

/** 与 storage 插件同形：安装时往本实例配置里补实体，作用域释放时摘掉。 */
const scopedEntityPlugin = (db: RxDB): IRxDBPlugin => ({
  name: 'scopedEntity',
  lifecycle: 'scoped',
  install: scope => {
    scope.acquire(() => {
      const entities = db.config.entities as EntityType[];
      entities.push(PluginContributedNote as EntityType);
      return () => void entities.splice(entities.indexOf(PluginContributedNote as EntityType), 1);
    }, 'scoped-entity:entity');
  }
});

describe('RxDB.initialized', () => {
  it('init() 之前为 false，init() 之后为 true，断连复位为 false', async () => {
    const db = createDatabase();
    expect(db.initialized).toBe(false);
    db.init();
    expect(db.initialized).toBe(true);
    await db.disconnectAll();
    expect(db.initialized).toBe(false);
  });

  it('init() 抛错回滚之后为 false', () => {
    const db = createDatabase();
    vi.spyOn(db.schemaManager, 'init').mockImplementationOnce(() => {
      throw new Error('schema boom');
    });
    expect(() => db.init()).toThrow('schema boom');
    expect(db.initialized).toBe(false);
  });
});

describe('EntityManager.destroy() 按 init() 时的绑定解绑', () => {
  it('插件在作用域释放时摘掉的实体，断连后不再绑在旧实例上', async () => {
    const first = createDatabase();
    first.use(scopedEntityPlugin);
    first.init();
    expect(() => new PluginContributedNote()).not.toThrow();

    await first.disconnectAll();

    expect(first.config.entities).not.toContain(PluginContributedNote);
    expect(() => new PluginContributedNote()).toThrow(/needs an initialized RxDB/);
  });

  it('旧实例断连后，另一个实例可以独占同一实体类', async () => {
    const first = createDatabase();
    first.use(scopedEntityPlugin);
    first.init();
    await first.disconnectAll();

    const second = createDatabase([PluginContributedNote as EntityType]);
    second.init();

    const note = new PluginContributedNote();
    expect(second.entityManager.hasEntityRef(PluginContributedNote, note.id)).toBe(true);
  });
});
