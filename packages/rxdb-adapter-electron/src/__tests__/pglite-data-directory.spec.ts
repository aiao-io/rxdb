/**
 * 真实数据目录上的持久化契约（US-208 AC#1 / AC#8 / AC#9）。
 *
 * @remarks
 * 与 `electron-pglite-host.spec.ts` 的分工：那边用 `new PGlite()`（内存）验协议与事务语义，
 * 这里必须落在**磁盘目录**上——本文件三条 AC 的判据全都是「进程/会话没了以后目录里还剩什么」，
 * 内存实例连被断言的对象都不存在。
 *
 * 每条用例各起各的临时工作区并在收尾时整棵删掉；共享一个工作区会让「重开同一目录」
 * 这件事在用例之间串味，AC#1 就不再是它自己那条断言了。
 */

import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import type { DesktopPgliteRequest, DesktopPgliteResponse } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { Article, Comment, TypeDemo } from '@aiao/rxdb-test/entities';
import { PGlite } from '@electric-sql/pglite';
import { existsSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { createElectronPgliteHost, type ElectronPgliteHost } from '../pglite-host.js';
import { ADAPTER_NAME } from '../pglite/pglite-adapter.interface.js';
import { RxDBAdapterElectronPGlite } from '../pglite/RxDBAdapterElectronPGlite.js';

const OWNER = 1;
const DATA_DIRECTORY = 'persistence-pgdata';

/** 有符号 64 位边界：跨 IPC 与落盘两道关卡后都不许退化成 number。 */
const SIGNED_64_MAX = 9223372036854775807n;
const SIGNED_64_MIN = -9223372036854775808n;

/**
 * bigint / binary 的重启保真探针。
 *
 * @remarks
 * `@aiao/rxdb-test/entities` 里没有带 bigint 或 binary 列的实体，而 AC#1 点名要验这两类，
 * 所以就地声明一个。不复用 `runBigIntBinaryEncryptedSuite` 的实体是因为那两个类是套件私有的，
 * 且那套断言跑在**同一个连接**里——AC#1 要问的恰恰是「连接和 host 都换了以后还剩什么」。
 */
@Entity({
  name: 'PersistenceProbe',
  tableName: 'persistence_probe',
  properties: [
    { name: 'id', type: PropertyType.bigint, primary: true },
    { name: 'minimum', type: PropertyType.bigint },
    { name: 'payload', type: PropertyType.binary }
  ]
})
class PersistenceProbe extends EntityBase<bigint> {
  minimum!: bigint;
  payload!: Uint8Array;
}

interface Workspace {
  readonly root: string;
  /** 起一个新的 host——等价于「应用重启」：进程内不留任何前一次的会话或实例。 */
  startHost(): ElectronPgliteHost;
  /** 关掉当前 host（等待在途工作落地），返回后目录句柄已释放。 */
  stopHost(): Promise<void>;
  readonly host: ElectronPgliteHost;
}

let workspace: Workspace | undefined;

const createWorkspace = (): Workspace => {
  const root = mkdtempSync(join(tmpdir(), 'rxdb-desktop-pgdir-'));
  let current: ElectronPgliteHost | undefined;
  const ws: Workspace = {
    root,
    startHost: () => {
      current = createElectronPgliteHost({
        createRuntime: async dataDirectoryName => new PGlite(join(root, dataDirectoryName)),
        postNotify: () => undefined
      });
      return current;
    },
    stopHost: async () => {
      const host = current;
      current = undefined;
      if (host) await host.closeAll();
    },
    get host(): ElectronPgliteHost {
      if (!current) throw new Error('host not started');
      return current;
    }
  };
  workspace = ws;
  return ws;
};

afterEach(async () => {
  const ws = workspace;
  workspace = undefined;
  if (!ws) return;
  await ws.stopHost();
  rmSync(ws.root, { recursive: true, force: true });
});

const send = async (host: ElectronPgliteHost, request: DesktopPgliteRequest): Promise<DesktopPgliteResponse> => {
  const response = await host.handle(request, OWNER);
  if (response.kind === 'error') throw new Error(`${response.code}: ${response.message}`);
  return response;
};

/** 开一条裸会话，绕过 RxDB 直接对目录做事——用来伪造「应用未知的既有业务表」。 */
const openRawSession = async (host: ElectronPgliteHost): Promise<string> => {
  const response = await send(host, {
    kind: 'pg.open',
    storage: { engine: 'pglite', dataDirectoryName: DATA_DIRECTORY }
  });
  if (response.kind !== 'pg.open') throw new Error(`unexpected response ${response.kind}`);
  return response.result.sessionId;
};

const rawQuery = async (
  host: ElectronPgliteHost,
  sessionId: string,
  sql: string
): Promise<ReadonlyArray<Record<string, unknown>>> => {
  const response = await send(host, { kind: 'pg.query', sessionId, sql, params: [] });
  if (response.kind !== 'pg.query') throw new Error(`unexpected response ${response.kind}`);
  return response.result.rows;
};

/** 连一个跑在给定 host 上的 RxDB，落在同一个数据目录里。 */
const connectRxDB = async (host: ElectronPgliteHost): Promise<RxDB> => {
  const rxdb = new RxDB({
    dbName: 'desktop-pgdir',
    context: { userId: 'userId' },
    entities: [Article, Comment, TypeDemo, PersistenceProbe],
    sync: { local: { adapter: ADAPTER_NAME }, type: SyncType.None }
  });
  rxdb.adapter(
    ADAPTER_NAME,
    async db =>
      new RxDBAdapterElectronPGlite(db, {
        dataDirectoryName: DATA_DIRECTORY,
        transport: {
          request: payload => host.handle(payload, OWNER),
          subscribe: () => () => undefined
        }
      })
  );
  await rxdb.getAdapter(ADAPTER_NAME);
  await rxdb.connect(ADAPTER_NAME);
  return rxdb;
};

describe('桌面 PGlite 数据目录', () => {
  it('首次连接初始化系统 schema 时原样保留应用未知的业务表（AC#8）', async () => {
    const ws = createWorkspace();

    // 目录里先躺着一张 Aiao 完全不认识的表，外加一行数据。
    const seedHost = ws.startHost();
    const seedSession = await openRawSession(seedHost);
    await send(seedHost, {
      kind: 'pg.exec',
      sessionId: seedSession,
      sql: `CREATE TABLE legacy_ledger (id bigint PRIMARY KEY, memo text NOT NULL);
            INSERT INTO legacy_ledger VALUES (1, 'pre-existing');`
    });
    await ws.stopHost();

    // Aiao 首次连接：会建自己的系统 schema，但不许碰别人的表。
    const host = ws.startHost();
    const rxdb = await connectRxDB(host);
    await rxdb.disconnectAll();

    const session = await openRawSession(host);
    // 安全范围内的 int8 由 PGlite 解析成 JS number，只有越过 Number.MAX_SAFE_INTEGER 才留 bigint。
    expect(await rawQuery(host, session, 'SELECT id, memo FROM legacy_ledger ORDER BY id')).toEqual([
      { id: 1, memo: 'pre-existing' }
    ]);
    // 系统对象确实建起来了——否则上一条断言在「什么都没做」的情况下也会绿。
    const systemTables = await rawQuery(
      host,
      session,
      `SELECT tablename FROM pg_tables WHERE schemaname = 'rxdb' ORDER BY tablename`
    );
    expect(systemTables.length).toBeGreaterThan(0);
  });

  it('断开后重连同一目录，JSONB / 数组 / bigint / binary / 关联 id 逐值一致（AC#1）', async () => {
    const ws = createWorkspace();
    const first = ws.startHost();
    const rxdb = await connectRxDB(first);

    const article = await new Article({
      title: '持久化',
      body: '跨重启',
      category: 'tech',
      tags: ['a', 'b'],
      authorId: 'author-1',
      viewCount: 7
    }).save();
    const typed = await new TypeDemo({
      string: 'json 保真',
      integer: 42,
      date: new Date('2024-01-01T00:00:00Z'),
      json: { nested: { list: [1, 2, 3] }, flag: true },
      stringArray: ['a', 'b'],
      numberArray: [1, 2.5]
    }).save();
    const comment = await new Comment({
      articleId: article.id,
      content: '子行',
      authorName: 'Ada'
    }).save();

    const probe = new PersistenceProbe({
      id: SIGNED_64_MAX,
      minimum: SIGNED_64_MIN,
      payload: new Uint8Array([0, 0xff, 7])
    });
    await probe.save();

    await rxdb.disconnectAll();
    await ws.stopHost();

    // 全新 host + 全新 RxDB：进程内不留任何缓存，读到什么完全取决于目录里存了什么。
    const second = ws.startHost();
    const reopened = await connectRxDB(second);
    const reloadedArticle = await firstValueFrom(reopened.entityManager.getRepository(Article).get(article.id));
    const reloadedTyped = await firstValueFrom(reopened.entityManager.getRepository(TypeDemo).get(typed.id));
    const reloadedComment = await firstValueFrom(reopened.entityManager.getRepository(Comment).get(comment.id));

    expect(reloadedArticle.title).toBe('持久化');
    expect(reloadedArticle.tags).toEqual(['a', 'b']);
    expect(reloadedArticle.viewCount).toBe(7);
    expect(reloadedTyped.json).toEqual({ nested: { list: [1, 2, 3] }, flag: true });
    expect(reloadedTyped.stringArray).toEqual(['a', 'b']);
    expect(reloadedTyped.numberArray).toEqual([1, 2.5]);
    expect(reloadedTyped.date).toEqual(new Date('2024-01-01T00:00:00Z'));
    expect(reloadedComment.articleId).toBe(article.id);

    const reloadedProbe = await firstValueFrom(
      reopened.entityManager.getRepository(PersistenceProbe).get(SIGNED_64_MAX)
    );
    expect(reloadedProbe.id).toBe(SIGNED_64_MAX);
    expect(reloadedProbe.minimum).toBe(SIGNED_64_MIN);
    expect(typeof reloadedProbe.minimum).toBe('bigint');
    expect(reloadedProbe.payload).toBeInstanceOf(Uint8Array);
    expect(reloadedProbe.payload).toEqual(new Uint8Array([0, 0xff, 7]));

    await reopened.disconnectAll();
  });

  it('disconnect 之后目录句柄已释放，目录可被重命名（AC#9）', async () => {
    const ws = createWorkspace();
    const host = ws.startHost();
    const rxdb = await connectRxDB(host);
    await new Article({
      title: '句柄',
      body: '释放',
      category: 'life',
      authorId: 'author-1'
    }).save();

    await rxdb.disconnectAll();
    await ws.stopHost();

    const from = join(ws.root, DATA_DIRECTORY);
    const to = join(ws.root, `${DATA_DIRECTORY}-renamed`);
    expect(existsSync(from)).toBe(true);
    // 句柄没放干净时这一步在 Windows 上会直接 EBUSY；POSIX 上则是目录被删后仍有写入落到孤儿 inode。
    renameSync(from, to);
    expect(existsSync(to)).toBe(true);
    expect(existsSync(from)).toBe(false);
  });
});
