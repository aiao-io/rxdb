/**
 * 参考后端的变更通知端点（US-023 AC#20）。
 *
 * @remarks
 * 这一层验的是**广播的载荷边界**：一条通知只说「哪个实体变了」和「谁改的」，
 * 绝不携带行数据（D8）。三条理由写在故事里，其中最硬的一条是多租户——
 * 后端广播给的是**所有**订阅者，而「这一行该不该给这个人看」只有查询路径答得出来。
 *
 * 载荷形状因此是**用例的主题**而不是顺带断言：`toEqual` 精确到键集合，
 * 多一个字段就是红的。
 */

import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { CLIENT_ENTITY_NAME, RECIPES_RESOURCE } from '../config.ts';
import { openDatabase } from '../db.ts';
import { seedDatabase, seedIdAt } from '../seed.ts';
import type { DemoServer } from '../server.ts';
import { createDemoServer } from '../server.ts';

/** 一条已经拆好帧的通知。 */
type Notification = Record<string, unknown>;

/** 一条打开着的 SSE 连接。 */
interface OpenFeed {
  response: Response;
  /** 读下一条通知；超时即抛，绝不静默挂住 */
  next: (timeoutMs?: number) => Promise<Notification>;
  /** 在给定窗口内确认**没有**通知到达 */
  expectSilence: (windowMs: number) => Promise<void>;
  abort: () => void;
}

let workdir: string;
let demo: DemoServer;
let baseUrl: string;
let openFeeds: OpenFeed[];
/** 已经在用例里主动关过服务器？afterEach 不再关第二次（`close()` 不是幂等的）。 */
let closed: boolean;

const databasePath = (): string => join(workdir, 'demo.sqlite');

beforeEach(async () => {
  workdir = mkdtempSync(join(tmpdir(), 'us023-feed-'));
  const db = openDatabase(databasePath());
  seedDatabase(db);
  db.close();
  openFeeds = [];
  closed = false;

  demo = createDemoServer({ databasePath: databasePath(), exposeEtag: true, controlEnabled: true });
  await new Promise<void>(resolve => demo.server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(demo.server.address() as AddressInfo).port}/v1`;
});

afterEach(async () => {
  for (const feed of openFeeds) feed.abort();
  if (!closed) await demo.close();
  rmSync(workdir, { recursive: true, force: true });
});

/**
 * 打开一条 SSE 连接，并把字节流拆成一条条通知。
 *
 * @remarks
 * 队列 + 等待者两条链：帧可能在 `next()` 被调用**之前**就到了（写入端点返回得比测试
 * 下一行语句慢不了多少），先到的帧必须排队而不是丢掉，否则用例会变成偶发红。
 */
const openFeedConnection = async (path = 'changes'): Promise<OpenFeed> => {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/${path}`, { signal: controller.signal });
  const queue: Notification[] = [];
  const waiters: ((notification: Notification) => void)[] = [];

  const push = (notification: Notification): void => {
    const waiter = waiters.shift();
    if (waiter) {
      waiter(notification);
      return;
    }
    queue.push(notification);
  };

  const body = response.body;
  if (body === null) {
    throw new Error('SSE 响应没有 body');
  }

  void (async () => {
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const notification = parseFrame(frame);
          if (notification !== undefined) push(notification);
        }
      }
    } catch {
      /* abort() 会以 AbortError 结束迭代，这是正常收尾 */
    }
  })();

  const next = async (timeoutMs = 2000): Promise<Notification> => {
    const queued = queue.shift();
    if (queued) return queued;
    return await new Promise<Notification>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`等了 ${timeoutMs}ms 没有等到通知`)), timeoutMs);
      waiters.push(notification => {
        clearTimeout(timer);
        resolve(notification);
      });
    });
  };

  const expectSilence = async (windowMs: number): Promise<void> => {
    await new Promise<void>(resolve => setTimeout(resolve, windowMs));
    expect(queue).toEqual([]);
  };

  const feed: OpenFeed = { response, next, expectSilence, abort: () => controller.abort() };
  openFeeds.push(feed);
  return feed;
};

/** `data: {...}` → 对象；注释帧（`:ok` / `:keep-alive`）不是通知，返回 `undefined`。 */
const parseFrame = (frame: string): Notification | undefined => {
  const line = frame.split('\n').find(candidate => candidate.startsWith('data:'));
  if (line === undefined) return undefined;
  return JSON.parse(line.slice('data:'.length).trim()) as Notification;
};

const post = async (path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
  await fetch(`${baseUrl}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });

describe('订阅（AC#20）', () => {
  it('GET changes 回 200 且是 SSE 流', async () => {
    const feed = await openFeedConnection();
    expect(feed.response.status).toBe(200);
    expect(feed.response.headers.get('content-type')).toBe('text/event-stream');
    expect(feed.response.headers.get('cache-control')).toBe('no-cache');
  });

  it('端点带跨源头——EventSource 是跨源连接，没有它连不上', async () => {
    const feed = await openFeedConnection();
    expect(feed.response.headers.get('access-control-allow-origin')).not.toBeNull();
  });

  it('有活着的订阅时 close() 照样返回，不挂死', async () => {
    await openFeedConnection();
    // server.close() 只等**连接**关完，而 SSE 连接永远不会自己关。
    // 订阅者不先被掐掉，这一行就是永久挂起——demo 的 SIGINT 会变成必须 kill -9。
    await expect(demo.close()).resolves.toBeUndefined();
    closed = true;
  });
});

describe('写入 → 广播（AC#20）', () => {
  it('新建一条 recipe → 订阅者收到通知', async () => {
    const feed = await openFeedConnection();
    await post(RECIPES_RESOURCE, { title: '新菜' });
    expect(await feed.next()).toEqual({ entity: CLIENT_ENTITY_NAME });
  });

  it('改一条 recipe → 订阅者收到通知', async () => {
    const feed = await openFeedConnection();
    const response = await fetch(`${baseUrl}/${RECIPES_RESOURCE}/${encodeURIComponent(seedIdAt(0))}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '改过的菜' })
    });
    expect(response.ok).toBe(true);
    expect(await feed.next()).toEqual({ entity: CLIENT_ENTITY_NAME });
  });

  it('删一条 recipe → 订阅者收到通知', async () => {
    const feed = await openFeedConnection();
    await post(`${RECIPES_RESOURCE}/delete`, { ids: [seedIdAt(1)] });
    expect(await feed.next()).toEqual({ entity: CLIENT_ENTITY_NAME });
  });

  it('两个订阅者都收到同一条写入的通知', async () => {
    const first = await openFeedConnection();
    const second = await openFeedConnection();
    await post(RECIPES_RESOURCE, { title: '广播给所有人' });
    expect(await first.next()).toEqual({ entity: CLIENT_ENTITY_NAME });
    expect(await second.next()).toEqual({ entity: CLIENT_ENTITY_NAME });
  });

  it('通知里的实体名是**客户端**实体名，不是资源路径', async () => {
    // 客户端拿它去调 invalidateRemoteEntity(entity)，对不上就是一条静默无效的通知（D9）
    const feed = await openFeedConnection();
    await post(RECIPES_RESOURCE, { title: '实体名' });
    expect((await feed.next())['entity']).toBe(CLIENT_ENTITY_NAME);
    expect(CLIENT_ENTITY_NAME).not.toBe(RECIPES_RESOURCE);
  });
});

describe('载荷边界（D8）', () => {
  it('载荷里没有行数据——只有实体名', async () => {
    const feed = await openFeedConnection();
    await post(RECIPES_RESOURCE, { title: '不该出现在通知里的标题' });
    expect(Object.keys(await feed.next())).toEqual(['entity']);
  });

  it('写入方带 x-client-id 时原样回显，载荷仍然只有这两个字段', async () => {
    const feed = await openFeedConnection();
    await post(RECIPES_RESOURCE, { title: '回声' }, { 'x-client-id': 'client-a' });
    expect(await feed.next()).toEqual({ entity: CLIENT_ENTITY_NAME, clientId: 'client-a' });
  });

  it('读端点不广播', async () => {
    const feed = await openFeedConnection();
    await post(`${RECIPES_RESOURCE}/metadata`, { limit: 5, offset: 0 });
    await feed.expectSilence(150);
  });

  it('写入失败不广播', async () => {
    const feed = await openFeedConnection();
    const response = await fetch(`${baseUrl}/${RECIPES_RESOURCE}/${encodeURIComponent('no-such-id')}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '改一个不存在的' })
    });
    expect(response.ok).toBe(false);
    await feed.expectSilence(150);
  });
});

/**
 * `__control/clear` 与 `__control/reset` 同样是**数据变更**。
 *
 * @remarks
 * 这两条路径不在 `http-protocol.md` 里，很容易被当成「演示开关」而漏掉广播——
 * 症状是清空数据之后别的客户端毫无察觉，屏幕上留着一份已经不存在的列表，
 * 而这正是本故事要消灭的那一类现象。判据不是「端点属不属于协议」，是**库里的行变没变**。
 *
 * 对照组同样重要：状态开关与日志清理**不**碰数据，广播它们只会让每个订阅者白跑一趟远端。
 */
describe('控制端点改了数据也广播', () => {
  it('清空数据 → 订阅者收到通知', async () => {
    const feed = await openFeedConnection();
    const response = await post('__control/clear', {});
    expect(response.ok).toBe(true);
    expect(await feed.next()).toEqual({ entity: CLIENT_ENTITY_NAME });
  });

  it('重置为种子 → 订阅者收到通知', async () => {
    const feed = await openFeedConnection();
    const response = await post('__control/reset', {});
    expect(response.ok).toBe(true);
    expect(await feed.next()).toEqual({ entity: CLIENT_ENTITY_NAME });
  });

  it('两个订阅者都收到同一次清空的通知', async () => {
    const first = await openFeedConnection();
    const second = await openFeedConnection();
    await post('__control/clear', {});
    expect(await first.next()).toEqual({ entity: CLIENT_ENTITY_NAME });
    expect(await second.next()).toEqual({ entity: CLIENT_ENTITY_NAME });
  });

  it('带 x-client-id 时原样回显——发起方据此抑制自己的回声', async () => {
    // 发起方点完按钮自己就会重查一次。不回显 clientId 的话它抑制不掉这条通知，
    // 于是一次点击在流量面板上留下两轮 metadata，而这个 demo 的主题正是流量。
    const feed = await openFeedConnection();
    await post('__control/clear', {}, { 'x-client-id': 'client-a' });
    expect(await feed.next()).toEqual({ entity: CLIENT_ENTITY_NAME, clientId: 'client-a' });
  });

  it('不碰数据的控制端点不广播', async () => {
    const feed = await openFeedConnection();
    await post('__control/offline', { offline: false });
    await post('__control/cors', { exposeEtag: true });
    await post('__control/page-mode', { mode: 'offset' });
    await post('__control/log/clear', {});
    await fetch(`${baseUrl}/__control/state`);
    await feed.expectSilence(150);
  });
});
