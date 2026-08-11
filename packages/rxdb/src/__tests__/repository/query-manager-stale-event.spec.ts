/**
 * P0-004 回归测试：查询事件回写不得覆盖更新的缓存版本。
 *
 * 缺陷链（instrument 抓栈得到，非推理）：
 *   迟到的 change 事件 → `QueryManager#serialize` → `createEntityRef` 命中缓存
 *   → `EntityStatus.replace` 的 `Object.assign(this.target, data)` **绕过 Proxy**
 *   → 用户刚编辑的值和 `_origin` 被一起打回旧值，且 `_modified` 归零
 *   → 用户再编辑成同一个值时 proxy 的 `isEqual` 判定「没变」→ patch 为空
 *   → `save()` **静默 no-op**，写丢了且没有任何错误。
 *
 * 这里刻意用**真实** EntityManager / EntityStatus / Proxy，只 mock 适配器：
 * 缺陷就在 `replace` 的 `Object.assign` 上，mock 掉实体层等于什么都没测。
 */
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES, type EntityType, type UUID } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import { applyExternalEntityUpdate } from '../../query/merge-update.utils.js';
import { QueryManager } from '../../repository/QueryManager.js';
import type { Repository } from '../../repository/Repository.js';
import type { IRxDBAdapter } from '../../rxdb-adapter.js';
import type { RxDBEntityLocalEventData } from '../../rxdb-events.js';
import { getEntityStatus } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';

@Entity({
  name: 'Node',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'parentId', type: PropertyType.string, nullable: true }
  ]
})
class Node extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: UUID };
  title!: string;
  parentId?: string | null;
}

const NODE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
/** 缓存里的版本（较新） */
const NEWER = new Date('2026-07-28T10:00:02.000Z');
/** 迟到事件携带的版本（较旧） */
const STALE = new Date('2026-07-28T10:00:01.000Z');
/** 真正的后续更新（更新） */
const NEWEST = new Date('2026-07-28T10:00:03.000Z');

const mockAdapter = {
  name: 'sqlite',
  find: async () => [],
  count: async () => 0,
  mutations: async () => [],
  getRepository: () => mockAdapter
};

const buildEvent = (patch: Record<string, unknown>, recordAt: Date): RxDBEntityLocalEventData<typeof Node> =>
  ({
    type: 'INSERT',
    namespace: 'public',
    entity: 'Node',
    entityType: Node,
    id: NODE_ID,
    patch,
    recordAt
  }) as unknown as RxDBEntityLocalEventData<typeof Node>;

describe('QueryManager 事件回写的单调性（P0-004）', () => {
  let rxdb: RxDB;
  let serialize: (data: RxDBEntityLocalEventData<typeof Node>) => Node;

  beforeEach(() => {
    rxdb = new RxDB({
      dbName: `p0-004-${Math.floor(performance.now() * 1000)}`,
      entities: [Node],
      sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
    });
    rxdb.adapter('sqlite', () => mockAdapter as unknown as IRxDBAdapter);
    rxdb.init();

    const queryManager = new QueryManager(
      rxdb,
      Node as unknown as EntityType,
      { find: vi.fn(() => of([])), count: vi.fn(() => of(0)) } as unknown as Repository<EntityType>
    );
    const task = queryManager.createTask({
      options: { type: 'find', options: { where: { combinator: 'and', rules: [] } } } as never,
      runner: () => of([]),
      getFingerprint: () => []
    });
    serialize = task.serialize as unknown as typeof serialize;
  });

  /** 缓存中放一个「已保存到 DB、版本为 NEWER」的实体 */
  const seedCached = (): Node =>
    rxdb.entityManager.createEntityRef(
      Node,
      { id: NODE_ID, title: 'from-db', parentId: 'root', updatedAt: NEWER } as never,
      { modified: false, local: true }
    ) as Node;

  it('迟到事件不得打回用户尚未保存的编辑', () => {
    const node = seedCached();

    node.parentId = 'user-edit';
    expect(getEntityStatus(node).modified).toBe(true);

    // 更早版本的事件迟到抵达
    serialize(buildEvent({ title: 'from-db', parentId: 'root', updatedAt: STALE }, STALE));

    expect(node.parentId).toBe('user-edit');
  });

  // 这条才是「静默丢写」本身：值被打回后，用户重新编辑成同一个值会被 proxy 的
  // isEqual 判成「没变化」，patch 为空 → save() 什么都不做，且不报错。
  it('迟到事件不得清空 patch，否则重新编辑后 save() 变成静默 no-op', () => {
    const node = seedCached();

    node.parentId = 'user-edit';
    serialize(buildEvent({ title: 'from-db', parentId: 'root', updatedAt: STALE }, STALE));

    const status = getEntityStatus(node);
    expect(status.modified).toBe(true);
    expect(Object.keys(status.patch)).toContain('parentId');
  });

  // 守卫是「单调性」而不是「只读」：更新的事件必须照常回写，否则缓存永远刷不动。
  it('更新的事件仍然照常回写', () => {
    const node = seedCached();

    serialize(buildEvent({ title: 'remote-newer', parentId: 'root', updatedAt: NEWEST }, NEWEST));

    expect(node.title).toBe('remote-newer');
  });

  // 同一时间戳不算陈旧：保持既有行为，避免守卫把正常回写也拦掉。
  it('时间戳相等时按既有行为回写', () => {
    const node = seedCached();

    serialize(buildEvent({ title: 'same-tick', parentId: 'root', updatedAt: NEWER }, NEWER));

    expect(node.title).toBe('same-tick');
  });

  // 事件不带 updatedAt 时无从判断新旧 —— 不启用守卫，保持既有行为，
  // 否则会静默拦掉一整类合法回写（比 P0-004 本身更糟）。
  it('事件不带 updatedAt 时不启用守卫', () => {
    const node = seedCached();

    serialize(buildEvent({ title: 'no-timestamp' }, STALE));

    expect(node.title).toBe('no-timestamp');
  });

  // P0-004 的第二条路径：UPDATE 事件**不经过** `#serialize`——`merge_update._recalculate`
  // 直接调 `applyExternalEntityUpdate` → `EntityStatus.replace`，同样是绕 Proxy 的
  // `Object.assign` + 重置 `_origin` + `_modified` 归零。装在 `#serialize` 上的守卫
  // 够不到这里，陈旧负载会以完全相同的机制打回用户尚未保存的编辑。
  //
  // RXD-019：判别式改成纯粹的时间戳单调性，不再看「有没有未保存的本地编辑」——干净实体
  // 接受真正陈旧的负载同样是数据倒退（字段回退、updatedAt 水位倒退），只是没有「重新编辑
  // 成同一个值」这层触发条件，不代表无害。曾经的顾虑是 undo/redo 会写出比被替换行更旧的
  // `updatedAt`（`HistoryManager` 用 `max(Date.now(), …)` 重算，没参考实体当前的
  // `updatedAt`）——P1-011（2026-07-29）已在适配器层 `getSwitchUpdatedAt` 把 undo/redo 改成
  // 三路取 max（当前时钟/已知候选值+1ms/进程内水位+1ms），写出的必然是单调递增的新时间戳，
  // 不再是「重放旧值」，实测见 shared undoRedoSuite（四个 SQLite 家族适配器 + pglite）。
  describe('UPDATE 路径（applyExternalEntityUpdate → EntityStatus.replace）', () => {
    it('陈旧负载不得打回用户尚未保存的编辑', () => {
      const node = seedCached();
      node.parentId = 'user-edit';

      applyExternalEntityUpdate(node, { title: 'from-db', parentId: 'root', updatedAt: STALE } as never);

      expect(node.parentId).toBe('user-edit');
    });

    it('陈旧负载不得清空 patch，否则重新编辑后 save() 变成静默 no-op', () => {
      const node = seedCached();
      node.parentId = 'user-edit';

      applyExternalEntityUpdate(node, { title: 'from-db', parentId: 'root', updatedAt: STALE } as never);

      const status = getEntityStatus(node);
      expect(status.modified).toBe(true);
      expect(Object.keys(status.patch)).toContain('parentId');
    });

    // RXD-019：实体干净不等于「无物可丢」——真正陈旧的负载即便打在干净实体上，也会把字段
    // 和 updatedAt 水位一起回退。P1-011 之前曾靠“干净就放行”给 undo/redo 让路，但 undo/redo
    // 现在写出的是单调递增的新时间戳（见 getSwitchUpdatedAt），根本不会触发这条陈旧分支，
    // 所以收紧不会误伤它——下面一条用 undo/redo 实际产出的时间戳形态验证这一点。
    it('实体干净时，真正陈旧的负载也不得应用（不再靠"干净"放行）', () => {
      const node = seedCached();

      applyExternalEntityUpdate(node, { title: 'stale-payload', updatedAt: STALE } as never);

      expect(node.title).toBe('from-db');
    });

    // undo/redo 现在写出的是单调递增的新时间戳（P1-011），落在这条 UPDATE 路径上时
    // 表现为「更新负载」而非「陈旧负载」，因此照常整体应用——不依赖“干净就放行”这条已废前提。
    it('实体干净时，undo/redo 产出的更新时间戳照常应用', () => {
      const node = seedCached();

      applyExternalEntityUpdate(node, { title: 'undone', updatedAt: NEWEST } as never);

      expect(node.title).toBe('undone');
    });

    // 用户没编辑过的字段照常接受外部值 —— 外部更新推进基线，只是不许吞掉本地编辑。
    it('未被本地编辑的字段照常接受更新的负载', () => {
      const node = seedCached();
      node.parentId = 'user-edit';

      applyExternalEntityUpdate(node, { title: 'remote-newer', updatedAt: NEWEST } as never);

      expect(node.title).toBe('remote-newer');
    });
  });

  // RXD-047：上面那条守卫只拦「陈旧」负载。实体脏时，**相同或更新**的负载仍会进 replace()，
  // 而 replace() 是 Object.assign + 重设 _origin + _modified 归零 —— 本地编辑被写进 origin
  // 后 patch 清空，UI 看起来没变，下一次 save() 却静默 no-op（编辑永久丢失）。
  // 正确语义：外部更新推进 origin 基线，但**逐字段**避让本地未保存的编辑。
  describe('RXD-047 脏实体遇到相同/更新负载', () => {
    const cases = [
      { label: '相同时间戳', updatedAt: NEWER },
      { label: '更新时间戳', updatedAt: NEWEST }
    ] as const;

    it.each(cases)('$label 的负载不得吞掉本地未保存编辑', ({ updatedAt }) => {
      const node = seedCached();
      node.parentId = 'user-edit';

      applyExternalEntityUpdate(node, { title: 'from-remote', parentId: 'remote-value', updatedAt } as never);

      // 本地编辑过的字段保留本地值
      expect(node.parentId).toBe('user-edit');
      // 未编辑的字段接受外部值
      expect(node.title).toBe('from-remote');
    });

    it.each(cases)('$label 的负载不得清空 patch，否则后续 save() 静默 no-op', ({ updatedAt }) => {
      const node = seedCached();
      node.parentId = 'user-edit';

      applyExternalEntityUpdate(node, { title: 'from-remote', parentId: 'remote-value', updatedAt } as never);

      const status = getEntityStatus(node);
      expect(status.modified).toBe(true);
      expect(Object.keys(status.patch)).toContain('parentId');
      expect(status.patch.parentId).toBe('user-edit');
    });

    it('外部值恰好等于本地编辑时，patch 收敛为空（确实无需再写）', () => {
      const node = seedCached();
      node.parentId = 'same-value';

      applyExternalEntityUpdate(node, { parentId: 'same-value', updatedAt: NEWEST } as never);

      const status = getEntityStatus(node);
      expect(node.parentId).toBe('same-value');
      expect(Object.keys(status.patch)).not.toContain('parentId');
    });

    it('本地编辑已改回基线时，不得用历史变更键阻挡远端更新', () => {
      const node = seedCached();
      node.parentId = 'user-edit';
      node.parentId = 'root';

      const before = getEntityStatus(node);
      expect(before.patch).toEqual({});

      applyExternalEntityUpdate(node, { parentId: 'remote-value', updatedAt: NEWEST } as never);

      const after = getEntityStatus(node);
      expect(node.parentId).toBe('remote-value');
      expect(after.modified).toBe(false);
      expect(after.patch).toEqual({});
    });

    it('外部更新推进 origin 基线：未编辑字段的 inversePatch 不再指向陈旧值', () => {
      const node = seedCached();
      node.parentId = 'user-edit';

      applyExternalEntityUpdate(node, { title: 'from-remote', updatedAt: NEWEST } as never);
      // 用户随后也改了 title
      node.title = 'user-title';

      const status = getEntityStatus(node);
      // 撤销应回到外部推进后的基线，而不是外部更新之前的旧值
      expect(status.inversePatch.title).toBe('from-remote');
    });

    // 实体干净时无物可丢，仍走原有的整体替换路径
    it('实体干净时相同/更新负载照常整体应用', () => {
      const node = seedCached();

      applyExternalEntityUpdate(node, { title: 'clean-apply', updatedAt: NEWEST } as never);

      const status = getEntityStatus(node);
      expect(node.title).toBe('clean-apply');
      expect(status.modified).toBe(false);
    });
  });
});
