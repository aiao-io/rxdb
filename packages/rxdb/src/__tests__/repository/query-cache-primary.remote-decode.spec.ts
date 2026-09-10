/**
 * @fileoverview QueryCache 写路径上「远端 JSON → 实体实例」的解码边界
 *
 * @remarks
 * `create` / `update` 末尾的 `Object.assign(entity, settled)` 是整条 QueryCache 写路径上
 * **唯一**把远端响应直接盖到实体实例上的地方。远端回来的是 JSON：日期是 ISO 串、
 * 布尔可能是 0/1。盖上去之后 `entity.updatedAt` 就从 `Date` 变成了 `string`。
 *
 * 这不是个类型洁癖问题。`PropertyType.date` 的运行时契约就是 `Date`
 * （见 `parseEntityFieldValue` 的 date 分支），下游按契约直接调 `.toISOString()`：
 * 在 Angular 模板里这一抛会**提交抛之前的绑定、跳过之后的**，屏幕上留下半行
 * 更新过的 DOM —— 前几格是新值，后几格空着，而控制台之外没有任何一处说得清原因。
 *
 * 拉取回填那条路不会出这事：它经 `upsertMany` 落进 SQLite，再读回来时
 * `getEntityObjectFromResult` 会按元数据解码。只有写路径是直连的。
 */

import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import { createQueryCachePrimary } from '../../repository/query-cache-primary.js';
import { QueryCacheSyncMemo } from '../../repository/query-cache-sync-memo.js';
import { SyncStateHub } from '../../sync-state.js';
import { noPendingWrites } from '../fixtures/pending-writes.js';
import { detachedReachability } from '../fixtures/reachability.js';

@Entity({
  name: 'DecodedRecipe',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'servings', type: PropertyType.number },
    { name: 'archived', type: PropertyType.boolean }
  ],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'sqlite' },
    remote: { adapter: 'http' }
  }
})
class DecodedRecipe extends EntityBase {
  static [ENTITY_STATIC_TYPES]: { idType: string };
  title!: string;
  servings!: number;
  archived!: boolean;
}

const REMOTE_UPDATED_AT = '2026-02-03T04:05:06.000Z';

/** 服务端回的那一份：逐字是 JSON —— 日期是串、布尔是 0/1、数字可能带引号。 */
const remoteJson = (id: string) => ({
  id,
  title: '远端标题',
  servings: '4',
  archived: 0,
  createdAt: REMOTE_UPDATED_AT,
  updatedAt: REMOTE_UPDATED_AT
});

const setup = () => {
  const localRepo = {
    find: vi.fn(async () => [] as DecodedRecipe[]),
    count: vi.fn(async () => 0),
    create: vi.fn(async (entity: DecodedRecipe) => entity),
    update: vi.fn(async (entity: DecodedRecipe, patch: Partial<DecodedRecipe>) => Object.assign(entity, patch)),
    remove: vi.fn(async (entity: DecodedRecipe) => entity)
  };
  const localAdapter = {
    getRepository: vi.fn(() => localRepo),
    getMetadataByIds: vi.fn(() => of(new Map<string, string>())),
    upsertMany: vi.fn(() => of(undefined)),
    deleteByIds: vi.fn(() => of(undefined))
  };
  const remoteAdapter = {
    fetchMetadata: vi.fn(() => of([])),
    findByIds: vi.fn(() => of([])),
    create: vi.fn((_entity: string, data: DecodedRecipe) => of(remoteJson(data.id))),
    update: vi.fn((_entity: string, id: string) => of(remoteJson(id))),
    delete: vi.fn(() => of(undefined))
  };
  const reachability = detachedReachability();
  const primary = createQueryCachePrimary<typeof DecodedRecipe>(
    'DecodedRecipe',
    DecodedRecipe,
    localAdapter as never,
    remoteAdapter as never,
    false,
    new QueryCacheSyncMemo(0),
    reachability,
    new SyncStateHub({ online$: reachability.online$, pushableCount$: of(0) }),
    noPendingWrites
  );
  return { primary, remoteAdapter };
};

/*
 * 用裸对象而不是 `new DecodedRecipe()`：装饰器的构造函数要一个已初始化的 RxDB
 * （`need init rxdb`），而这套用例要验的是 `Object.assign` 那一刻写进去的**值**，
 * 与实体代理无关 —— 起一个真 RxDB 只会把被测边界埋进一堆无关装置里。
 */
const draft = (): DecodedRecipe =>
  ({ id: 'r-1', title: '草稿', servings: 1, archived: false }) as unknown as DecodedRecipe;

describe('QueryCache 写路径把远端 JSON 解码后再落到实体上', () => {
  it('create 之后 updatedAt 是 Date，不是 ISO 字符串', async () => {
    const { primary } = setup();

    const created = await primary.create(draft());

    expect(created.updatedAt).toBeInstanceOf(Date);
    expect(created.updatedAt.toISOString()).toBe(REMOTE_UPDATED_AT);
    expect(created.createdAt).toBeInstanceOf(Date);
  });

  it('create 之后布尔与数字也按元数据归位', async () => {
    const { primary } = setup();

    const created = await primary.create(draft());

    expect(created.archived).toBe(false);
    expect(created.servings).toBe(4);
    expect(created.title).toBe('远端标题');
  });

  it('update 之后 updatedAt 同样是 Date', async () => {
    const { primary } = setup();

    const updated = await primary.update(draft(), { title: '改过的' });

    expect(updated.updatedAt).toBeInstanceOf(Date);
    expect(updated.updatedAt.toISOString()).toBe(REMOTE_UPDATED_AT);
  });
});
