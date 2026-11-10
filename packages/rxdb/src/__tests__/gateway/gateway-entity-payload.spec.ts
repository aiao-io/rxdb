/**
 * 多实例网关的出站负载必须可结构化克隆（RV-01a1bbbdb6a07c31a83e2ee1d21f64bf）。
 *
 * `notifyExternalUpdate(EntityType, id, patch)` 的 `patch` 类型是 `Partial<InstanceType<T>>`，
 * 直接传一个实体实例是合法输入；实体实例是核心构造的 Proxy，原样交给 BroadcastChannel
 * 会同步抛 `DataCloneError`，跨 tab 通知也就送不出去。这里用真实的 BroadcastChannel 收消息。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { GATEWAY_MESSAGE_ENTITY_EVENT, type GatewayMessage } from '../../gateway/gateway.interface.js';
import { RxDB } from '../../RxDB.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';
import { Post, TEST_ENTITIES, User } from '../fixtures/test-entities.js';

let database: RxDB | undefined;
let listener: BroadcastChannel | undefined;

afterEach(async () => {
  listener?.close();
  listener = undefined;
  await database?.destroy();
  database = undefined;
});

/** 建一个开着多实例网关的库，并在同名频道上旁听网关发出的消息。 */
const openWithListener = async () => {
  const dbName = `gateway-entity-payload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  database = new RxDB({ dbName, entities: TEST_ENTITIES, sync: { local: { adapter: 'mock' }, type: SyncType.None } });
  database.adapter('mock', db => createMockAdapter(db));
  await database.connect('mock');
  const received: GatewayMessage[] = [];
  // 网关频道按实例配置里的库名命名（带版本后缀），不是构造时传的原名
  listener = new BroadcastChannel(`${database.config.dbName}_gateway`);
  listener.onmessage = (message: MessageEvent<GatewayMessage>) => received.push(message.data);
  const entityPatches = () =>
    received.flatMap(message =>
      message.type === GATEWAY_MESSAGE_ENTITY_EVENT && 'entities' in message.event ?
        (message.event.entities as { patch: Record<string, unknown> }[]).map(entity => entity.patch)
      : []
    );
  return { database, entityPatches };
};

describe('网关出站负载可结构化克隆', () => {
  it('把实体实例本身当 patch 传给 notifyExternalUpdate：不抛 DataCloneError，另一端收到列值', async () => {
    const { database: db, entityPatches } = await openWithListener();
    const post = new Post();
    post.title = 'current';

    expect(() => db.entityManager.notifyExternalUpdate(Post, post.id, post)).not.toThrow();

    await vi.waitFor(() => expect(entityPatches()).toHaveLength(1));
    const [patch] = entityPatches();
    expect(patch['id']).toBe(post.id);
    expect(patch['title']).toBe('current');
    expect(patch['createdAt']).toBeInstanceOf(Date);
  });

  it('patch 里夹着别的实体实例（关系对象）：它不跨 tab，其余字段照常送达', async () => {
    const { database: db, entityPatches } = await openWithListener();
    const author = new User();
    author.name = 'author';

    expect(() =>
      db.entityManager.notifyExternalUpdate(Post, '00000000-0000-7000-8000-00000000e001', {
        title: 'with relation',
        authorId: author.id,
        author
      })
    ).not.toThrow();

    await vi.waitFor(() => expect(entityPatches()).toHaveLength(1));
    const [patch] = entityPatches();
    expect(patch).toEqual({ title: 'with relation', authorId: author.id });
  });

  // `notifyExternalUpdate` 的 TSDoc 契约：关系对象不跨 tab，关系变化要同时给出外键列；
  // 只给关系对象时广播出去的是空 patch，对端看不到变化，也不报错。
  it('patch 里只有关系对象、没有外键列：广播出去的是空 patch', async () => {
    const { database: db, entityPatches } = await openWithListener();
    const author = new User();
    author.name = 'author';

    expect(() =>
      db.entityManager.notifyExternalUpdate(Post, '00000000-0000-7000-8000-00000000e003', { author })
    ).not.toThrow();

    await vi.waitFor(() => expect(entityPatches()).toHaveLength(1));
    expect(entityPatches()[0]).toEqual({});
  });

  it('普通 patch 的异构值（bigint、Date、二进制视图）原样送达', async () => {
    const { database: db, entityPatches } = await openWithListener();
    const at = new Date('2026-11-09T00:00:00Z');
    const bytes = new Uint8Array([1, 2, 255]);

    db.entityManager.notifyExternalUpdate(Post, '00000000-0000-7000-8000-00000000e002', {
      title: 'plain',
      updatedAt: at,
      content: { big: 9_007_199_254_740_993n, bytes } as never
    });

    await vi.waitFor(() => expect(entityPatches()).toHaveLength(1));
    const [patch] = entityPatches();
    expect(patch['title']).toBe('plain');
    expect(patch['updatedAt']).toEqual(at);
    expect(patch['content']).toEqual({ big: 9_007_199_254_740_993n, bytes });
  });
});
