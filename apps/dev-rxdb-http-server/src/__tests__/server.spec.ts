/**
 * 参考后端的端点级测试。
 *
 * @remarks
 * 这一层验的是**协议契约**（回执从库里回读、翻页不重不漏、条件请求语义），
 * 浏览器一侧的现象（预检、跨源读不到 ETag、离线降级）在 `apps/dev-rxdb-http-e2e` 里验——
 * 那些只有真浏览器才做得出来。
 *
 * 每个用例起一份独立的临时库：`port: 0` 让内核挑端口，测试之间不会抢 4301。
 */

import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SEED_ROW_COUNT } from '../config.ts';
import { seedIdAt } from '../seed.ts';
import type { DemoServer } from '../server.ts';
import { createDemoServer } from '../server.ts';

interface MetadataRow {
  id: string;
  updatedAt: string;
}

interface TokenPageBody {
  rows: MetadataRow[];
  nextPageToken?: string;
}

let workdir: string;
let demo: DemoServer;
let baseUrl: string;

const dataDir = (): string => join(workdir, 'pglite');

beforeEach(async () => {
  workdir = mkdtempSync(join(tmpdir(), 'us214-server-'));
  demo = await createDemoServer({ dataDir: dataDir(), exposeEtag: true, controlEnabled: true });
  await new Promise<void>(resolve => demo.server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(demo.server.address() as AddressInfo).port}/v1`;
});

afterEach(async () => {
  await demo.close();
  rmSync(workdir, { recursive: true, force: true });
});

const post = async (path: string, body: unknown, init: RequestInit = {}): Promise<Response> =>
  await fetch(`${baseUrl}/${path}`, {
    ...init,
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify(body)
  });

const postJson = async <T>(path: string, body: unknown): Promise<T> => {
  const response = await post(path, body);
  expect(response.ok).toBe(true);
  return (await response.json()) as T;
};

describe('fetchMetadata —— offset 形态（AC#4）', () => {
  it('每一页都取满 limit，短页只出现在真正的末页', async () => {
    const pageSize = 50;
    const lengths: number[] = [];
    let offset = 0;

    // 与前端 pageSize: 50 同参。循环条件模仿客户端：拿到短页才停。
    for (;;) {
      const rows = await postJson<MetadataRow[]>('recipes/metadata', { offset, limit: pageSize });
      lengths.push(rows.length);
      offset += rows.length;
      if (rows.length < pageSize) break;
    }

    // 250 / 50 正好整除，于是最后多一次空页——这是 offset 形态末页判定的固有代价，
    // 不是缺陷：客户端只能靠短页判断到底，整除时那个「短页」就只能是空页。
    expect(lengths).toEqual([50, 50, 50, 50, 50, 0]);
    expect(offset).toBe(SEED_ROW_COUNT);
  });

  it('各页拼接起来无重复无遗漏，且跨页排序稳定', async () => {
    const collected: MetadataRow[] = [];
    for (let offset = 0; offset < SEED_ROW_COUNT; offset += 50) {
      collected.push(...(await postJson<MetadataRow[]>('recipes/metadata', { offset, limit: 50 })));
    }

    expect(collected).toHaveLength(SEED_ROW_COUNT);
    expect(new Set(collected.map(row => row.id)).size).toBe(SEED_ROW_COUNT);

    const sorted = [...collected].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id));
    expect(collected.map(row => row.id)).toEqual(sorted.map(row => row.id));
  });
});

describe('fetchMetadata —— token 形态（AC#15）', () => {
  const drainByToken = async (onPage?: (page: number) => Promise<void>): Promise<string[]> => {
    const ids: string[] = [];
    let pageToken: string | undefined;
    let page = 0;

    do {
      const body = pageToken === undefined ? { limit: 50 } : { limit: 50, pageToken };
      const response = await post('recipes/metadata?pageMode=token', body);
      const parsed = (await response.json()) as TokenPageBody;
      ids.push(...parsed.rows.map(row => row.id));
      pageToken = parsed.nextPageToken;
      page += 1;
      if (onPage !== undefined) await onPage(page);
    } while (pageToken !== undefined);

    return ids;
  };

  it('逐页推进，末页缺省 nextPageToken 且不产生尾随空页', async () => {
    const ids = await drainByToken();
    expect(ids).toHaveLength(SEED_ROW_COUNT);
    expect(new Set(ids).size).toBe(SEED_ROW_COUNT);
  });

  it('token 里的读取水位线挡住翻页途中新插入的行', async () => {
    const ids = await drainByToken(async page => {
      if (page !== 2) return;
      // 另一个「连接」在翻页中途写入。它的 updatedAt 是服务端当前时刻，必然高于水位线。
      await postJson('recipes', { title: 'Injected mid-paging', status: 'published' });
    });

    // 既没有被重复计入，也没有把后续行挤掉——这正是 offset 形态做不到的那条快照一致。
    expect(ids).toHaveLength(SEED_ROW_COUNT);
    expect(new Set(ids).size).toBe(SEED_ROW_COUNT);
  });

  it('坏 token 回 400 而不是静默当作首页', async () => {
    const response = await post('recipes/metadata', { limit: 50, pageToken: 'not-a-token' });
    expect(response.status).toBe(400);
  });
});

describe('写端点回执来自库，不是回显入参（AC#5）', () => {
  /**
   * `id` 与时间戳的归属**不一样**，这条用例正是拿来分开它们的。
   *
   * `updatedAt` 是新鲜度依据，客户端的钟不可信，服务端必须重新定型。
   * `id` 只是身份，谁造的无所谓——而离线新建时只有客户端造得出来：
   * 那一刻网线是断的，行已经进了本地缓存、拿着本地 id 被 UI 引用、
   * 出站队列里也记着这个 id。联网重放时后端另造一个 id，本地那份就永远
   * 对不上远端，成了一条远端从不认识的孤儿行——恰是本文件另一处警告的
   * 那个后果，只是从反方向到达。
   */
  it('create 采纳客户端给的 id，但时间戳仍由服务端定型', async () => {
    const supplied = {
      id: 'client-supplied',
      title: 'Risotto',
      status: 'draft',
      updatedAt: '1999-01-01T00:00:00.000Z'
    };
    const created = await postJson<Record<string, unknown>>('recipes', supplied);

    expect(created['id']).toBe('client-supplied');
    expect(created['updatedAt']).not.toBe('1999-01-01T00:00:00.000Z');

    // 回执仍来自库，不是回显入参——这条不变。
    const [persisted] = await postJson<Record<string, unknown>[]>('recipes/by-ids', { ids: ['client-supplied'] });
    expect(persisted).toEqual(created);
  });

  it('create 不带 id 时由服务端造一个', async () => {
    const created = await postJson<Record<string, unknown>>('recipes', { title: 'Risotto', status: 'draft' });

    expect(created['id']).toEqual(expect.any(String));
    expect(created['id']).not.toBe('');
  });

  /**
   * 采纳客户端 id 就得给「撞车」一个说法：静默覆盖会把另一条行的内容抹掉，
   * 而客户端并不知道自己覆盖了谁。409 让重放侧看得见冲突。
   *
   * 正常重放走不到这里：出站队列发 `create` 之前会先 `fetchMetadata` 探一次远端，
   * 远端已有同 id 就改发 `update`（`query-cache-outbox.ts` 的 `LOCAL_WINS_VERB`）。
   */
  it('create 撞上已有 id 回 409，不覆盖已有行', async () => {
    await postJson('recipes', { id: 'dup', title: 'First', status: 'draft' });
    const response = await post('recipes', { id: 'dup', title: 'Second', status: 'published' });

    expect(response.status).toBe(409);
    const [persisted] = await postJson<Record<string, unknown>[]>('recipes/by-ids', { ids: ['dup'] });
    expect(persisted['title']).toBe('First');
  });

  it('update 重新定型 updatedAt 并返回完整行', async () => {
    const created = await postJson<Record<string, unknown>>('recipes', { title: 'Pho', status: 'draft' });
    const response = await fetch(`${baseUrl}/recipes/${String(created['id'])}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'published', updatedAt: '1999-01-01T00:00:00.000Z' })
    });
    const updated = (await response.json()) as Record<string, unknown>;

    expect(updated['status']).toBe('published');
    expect(updated['title']).toBe('Pho');
    expect(updated['updatedAt']).not.toBe('1999-01-01T00:00:00.000Z');
    expect(String(updated['updatedAt']) > String(created['updatedAt'])).toBe(true);
  });

  it('delete 走 POST :entity/delete + { ids }，集合路径上没有 DELETE', async () => {
    const created = await postJson<Record<string, unknown>>('recipes', { title: 'Tacos', status: 'draft' });
    await postJson('recipes/delete', { ids: [created['id']] });

    const remaining = await postJson<unknown[]>('recipes/by-ids', { ids: [created['id']] });
    expect(remaining).toEqual([]);

    const collectionDelete = await fetch(`${baseUrl}/recipes`, { method: 'DELETE' });
    expect(collectionDelete.status).toBe(404);
  });

  it('findByIds 对不存在的 id 少返回几行，而不是 500', async () => {
    const rows = await postJson<unknown[]>('recipes/by-ids', { ids: ['no-such-row', 'also-missing'] });
    expect(rows).toEqual([]);
  });

  /**
   * 「完整行」是按**实体**算的，不是按业务列算的。
   *
   * `Recipe extends EntityBase`，而 `EntityBase` 预声明的 `createdAt` 没写 `nullable`，
   * 于是本地行缓存那张表上它是 `NOT NULL`。后端少回这一列，客户端把远端行 upsert 进
   * wa-sqlite 时会直接撞 `NOT NULL constraint failed: public$recipes.createdAt`——
   * 网线上一切正常，错误发生在落盘那一步。
   *
   * 所以参考后端必须把 `createdAt` 一起持久化、一起回。`createdBy` / `updatedBy`
   * 在基类上是 `nullable: true`，缺省即可。
   */
  it('回执带齐实体基类的非空字段：createdAt 与 updatedAt 都在，且 createdAt 不随 update 变', async () => {
    const created = await postJson<Record<string, unknown>>('recipes', { title: 'Gnocchi', status: 'draft' });
    expect(created['createdAt']).toBe(created['updatedAt']);

    const response = await fetch(`${baseUrl}/recipes/${String(created['id'])}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'published', createdAt: '1999-01-01T00:00:00.000Z' })
    });
    const updated = (await response.json()) as Record<string, unknown>;

    expect(updated['createdAt']).toBe(created['createdAt']);
    expect(String(updated['updatedAt']) > String(updated['createdAt'])).toBe(true);

    const [seeded] = await postJson<Record<string, unknown>[]>('recipes/by-ids', { ids: [seedIdAt(0)] });
    expect(typeof seeded['createdAt']).toBe('string');
  });
});

describe('条件请求', () => {
  it('内容未变回 304 且无 body，内容一变立刻回 200 + 新 ETag', async () => {
    const first = await post('recipes/metadata', { offset: 0, limit: 5 });
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();

    const second = await post('recipes/metadata', { offset: 0, limit: 5 }, { headers: { 'if-none-match': etag! } });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');

    // 改掉首页第一行，同一个请求就必须重新回 200——协议里那条「内容变了不得再回 304」。
    const [firstRow] = (await first.clone().json()) as MetadataRow[];
    await fetch(`${baseUrl}/recipes/${firstRow.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Renamed' })
    });

    const third = await post('recipes/metadata', { offset: 0, limit: 5 }, { headers: { 'if-none-match': etag! } });
    expect(third.status).toBe(200);
    expect(third.headers.get('etag')).not.toBe(etag);
  });
});

describe('种子确定性（D7）', () => {
  it('reset 跑两遍读出的 250 行逐字节相同', async () => {
    const first = await readAllRowsAfterReset();
    const second = await readAllRowsAfterReset();
    expect(first).toEqual(second);
  });

  const readAllRowsAfterReset = async (): Promise<Record<string, unknown>[]> => {
    const response = await post('__control/reset', {});
    expect(await response.json()).toEqual({ rows: SEED_ROW_COUNT });
    // 全量回读完整行（不是只读 metadata）：D7 的「逐字节相同」覆盖 id / createdAt / updatedAt
    // 与四个业务列。id 由 seedIdAt 派生，前三行钉在协议文档示例值。
    const ids = Array.from({ length: SEED_ROW_COUNT }, (_unused, index) => seedIdAt(index));
    return await postJson<Record<string, unknown>[]>('recipes/by-ids', { ids });
  };
});

describe('文件落盘（B3）', () => {
  it('destroy 后重建同一 dataDir，写入的行仍在且种子不重灌', async () => {
    const created = await postJson<Record<string, unknown>>('recipes', { title: 'Persist me', status: 'draft' });

    // 关服释放 pglite 句柄，再对同一 dataDir 重建——等价于「重启进程」。
    await demo.close();
    demo = await createDemoServer({ dataDir: dataDir(), exposeEtag: true, controlEnabled: true });
    await new Promise<void>(resolve => demo.server.listen(0, '127.0.0.1', () => resolve()));
    baseUrl = `http://127.0.0.1:${(demo.server.address() as AddressInfo).port}/v1`;

    // 写的那行还在，且种子没有被再次灌入（总行数 = 种子 + 1，不是 2 份种子）。
    const rows = await postJson<MetadataRow[]>('recipes/metadata', { offset: 0, limit: 1000 });
    expect(rows).toHaveLength(SEED_ROW_COUNT + 1);

    const [persisted] = await postJson<Record<string, unknown>[]>('recipes/by-ids', { ids: [String(created['id'])] });
    expect(persisted['title']).toBe('Persist me');
  });
});

describe('错误与开关', () => {
  it('过滤字段不在白名单时回 400，且不触达 SQL', async () => {
    const response = await post('recipes/metadata', {
      where: { combinator: 'and', rules: [{ field: "title'); DROP TABLE recipes; --", operator: '=', value: 'x' }] },
      offset: 0,
      limit: 10
    });
    expect(response.status).toBe(400);

    // 表还在——注入载荷连 SQL 都没进去。
    const rows = await postJson<MetadataRow[]>('recipes/metadata', { offset: 0, limit: 1 });
    expect(rows).toHaveLength(1);
  });

  it('带了 Authorization 但形状不对时回 401，完全不带则放行（AC#2 的五条 curl 里四条不带）', async () => {
    const malformed = await post('recipes/metadata', { offset: 0, limit: 1 }, { headers: { authorization: 'nope' } });
    expect(malformed.status).toBe(401);

    const anonymous = await post('recipes/metadata', { offset: 0, limit: 1 });
    expect(anonymous.status).toBe(200);
  });

  it('__control/fault 注入的非 2xx 仍然带跨源头，才不会被浏览器误判成网络故障', async () => {
    await postJson('__control/fault', { status: 409 });
    const response = await post('recipes/metadata', { offset: 0, limit: 1 }, { headers: { origin: 'http://x.test' } });

    expect(response.status).toBe(409);
    expect(response.headers.get('access-control-allow-origin')).toBe('http://x.test');
  });

  it('__control/offline 掐断传输（而不是回 5xx），关掉后恢复', async () => {
    await postJson('__control/offline', { offline: true });
    await expect(post('recipes/metadata', { offset: 0, limit: 1 })).rejects.toThrow();

    await postJson('__control/offline', { offline: false });
    const recovered = await post('recipes/metadata', { offset: 0, limit: 1 });
    expect(recovered.status).toBe(200);
  });

  /*
   * `clear` 与 `reset` 是**两件事**，差别全在「表还在不在」上：
   *
   * - `reset` 删库文件重建（AC#6 的逐字节可复现），
   * - `clear` 只清行，表结构留着——于是 `isTableExisted` 继续回 200，
   *   客户端看到的是「这张表存在，只是一行都不匹配」。
   *
   * 后者才是 QueryCache 孤儿清理的极端情形：远端空集 + 本地满缓存。
   */
  it('__control/clear 清空数据但保留表，reset 还能把种子灌回来', async () => {
    expect(await postJson<{ deleted: number }>('__control/clear', {})).toEqual({ deleted: SEED_ROW_COUNT });

    expect(await postJson<MetadataRow[]>('recipes/metadata', { offset: 0, limit: 1000 })).toEqual([]);
    expect((await fetch(`${baseUrl}/recipes`, { method: 'HEAD' })).status).toBe(200);

    // 清空是幂等的：再清一次删 0 行，不报错。
    expect(await postJson<{ deleted: number }>('__control/clear', {})).toEqual({ deleted: 0 });

    expect(await postJson('__control/reset', {})).toEqual({ rows: SEED_ROW_COUNT });
    expect(await postJson<MetadataRow[]>('recipes/metadata', { offset: 0, limit: 1000 })).toHaveLength(SEED_ROW_COUNT);
  });

  /*
   * `reset` 删库文件重建，旧句柄指向的 inode 已经不在了。库连接因此放在闭包的 `let` 里，
   * 由 `getDb()` 每次现取——但只有**每次使用前**现取才算数：在 `await readJsonBody` 之前
   * 取一次、把句柄按值传下去，等于把「当前句柄」冻结在了请求刚进来的那一刻。
   */
  it('请求正在等 body 时 reset 换掉句柄，这条请求不能吃 500', async () => {
    let push!: (chunk: string) => void;
    let finish!: () => void;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        push = chunk => controller.enqueue(encoder.encode(chunk));
        finish = () => controller.close();
      }
    });

    // 半双工流式请求体：头部先到，服务端进到 readJsonBody 的等待里，body 还没发完
    const pending = fetch(`${baseUrl}/recipes/metadata`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      duplex: 'half'
    } as RequestInit & { duplex: 'half' });
    push('{"offset":0,');
    await new Promise(resolve => setTimeout(resolve, 50));

    // 飞行中把库整个换掉
    expect(await postJson('__control/reset', {})).toEqual({ rows: SEED_ROW_COUNT });

    push('"limit":1}');
    finish();

    const response = await pending;
    expect(response.status).toBe(200);
    expect((await response.json()) as MetadataRow[]).toHaveLength(1);
  });

  it('version 与 isTableExisted 按协议返回', async () => {
    const version = await fetch(`${baseUrl}/meta/version`);
    expect(((await version.json()) as { version: string }).version).toMatch(/^node-sqlite-demo\//);

    const head = await fetch(`${baseUrl}/recipes`, { method: 'HEAD' });
    expect(head.status).toBe(200);
  });

  /*
   * 路径段解码**只做一次**。`dispatch` 已经对每个 segment 解过码，路由分支里再解一次，
   * 会把「id 里有个字面 `%`」变成一次 `URIError` —— 而 `URIError` 走的是兜底那一支，
   * 于是「这个 id 不存在」（404）被报成「后端炸了」（500）。
   *
   * `%25` 是 `encodeURIComponent('%')`：第一次解码得到 `%`，第二次解码时它是一个
   * 残缺的转义序列。协议「通用约定」要求客户端 `encodeURIComponent` id，
   * 这条路径因此是可以从外部走到的。
   */
  it('id 里含字面 % 时按 404 处理，不塌成 500——路径段只解一次码', async () => {
    const response = await fetch(`${baseUrl}/recipes/${encodeURIComponent('%')}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'published' })
    });

    expect(response.status).toBe(404);
  });

  it('id 里含 / 时经编码后能定位到行——解码次数与客户端的编码次数对齐', async () => {
    // 写端点不接受客户端指定 id，所以拿一个真实 id 反向验证：多解一次码的实现上，
    // 任何含 `%` 的合法 id 都会在这里塌掉
    const created = await postJson<Record<string, unknown>>('recipes', { title: 'Ramen', status: 'draft' });
    const response = await fetch(`${baseUrl}/recipes/${encodeURIComponent(String(created['id']))}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'published' })
    });

    expect(response.status).toBe(200);
    expect(((await response.json()) as Record<string, unknown>)['status']).toBe('published');
  });
});
