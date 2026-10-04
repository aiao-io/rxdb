import {
  Entity,
  EntityBase,
  getEntityMetadata,
  getRxDBChangeEntityIdQueryValues,
  NetworkOfflineError,
  RxDB,
  RxDBChange,
  SyncType,
  type EntityUpdateData,
  type RuleGroup
} from '@aiao/rxdb';
import { RxDBAdapterElectron } from '@aiao/rxdb-adapter-electron';
import { createElectronSqliteHost } from '@aiao/rxdb-adapter-electron/host';
import { createRestHandlers, RxDBAdapterHttp } from '@aiao/rxdb-adapter-http';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';
import { RECIPE_SCHEMA } from '@modules/recipes-domain';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { tap } from 'rxjs';
import { expect, vi } from 'vitest';
import { seedIdAt, seedRowAt, type RecipeRow } from '../../seed.ts';
import { createDemoServer } from '../../server.ts';

@Entity({
  ...RECIPE_SCHEMA,
  name: 'ReviewHttpCacheRecipe',
  tableName: 'review_http_cache',
  sync: { type: SyncType.QueryCache, local: { adapter: 'sqlite-electron' }, remote: { adapter: 'http' } }
})
export class ReviewHttpCacheRecipe extends EntityBase<string> {
  declare title: string;
  declare status: string;
  declare price: number;
  declare tag: string | null;
}

export const TARGET_ID = seedIdAt(0);
export const ORIGINAL = seedRowAt(0);
export const ONE: RuleGroup<ReviewHttpCacheRecipe> = {
  combinator: 'and',
  rules: [{ field: 'id', operator: '=', value: TARGET_ID }]
};
export const META = getEntityMetadata(ReviewHttpCacheRecipe);

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

interface Exchange {
  path: string;
  method: string;
  status: number;
  body: string;
}

const listen = async (server: Server): Promise<string> => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const closeServer = (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close(error => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });

/** 代理只延迟已经由真实应用/PGlite 生成的响应，不替换 endpoint、SQL 或 fetch。 */
const createDelayProxy = (origin: string) => {
  const exchanges: Exchange[] = [];
  const errors: unknown[] = [];
  let nextGate: ReturnType<typeof makeGate> | undefined;
  const held = new Set<ReturnType<typeof makeGate>>();
  function makeGate() {
    const started = deferred<Exchange>();
    const released = deferred<void>();
    return {
      started: started.promise,
      announce: started.resolve,
      wait: released.promise,
      release: () => released.resolve()
    };
  }
  const forward = async (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    const headers = new Headers();
    for (const name of ['content-type', 'authorization']) {
      const value = request.headers[name];
      if (typeof value === 'string') headers.set(name, value);
    }
    const path = request.url ?? '/';
    const method = request.method ?? 'GET';
    const upstream = await fetch(`${origin}${path}`, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks).toString('utf8')
    });
    const exchange = { path, method, status: upstream.status, body: await upstream.text() };
    exchanges.push(exchange);
    const gate = path.endsWith('/recipes/by-ids') ? nextGate : undefined;
    if (gate) {
      nextGate = undefined;
      held.add(gate);
      gate.announce(exchange);
      await gate.wait;
      held.delete(gate);
    }
    response.writeHead(upstream.status, { 'content-type': 'application/json' });
    response.end(exchange.body);
  };
  const server = createServer((request, response) => {
    void forward(request, response).catch((error: unknown) => {
      errors.push(error);
      response.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  });
  const holdNextByIds = () => {
    if (nextGate) throw new Error('上一份响应尚未开始');
    nextGate = makeGate();
    return { started: nextGate.started, release: nextGate.release };
  };
  const releaseAll = () => {
    nextGate?.release();
    held.forEach(gate => gate.release());
  };
  return { server, exchanges, errors, holdNextByIds, releaseAll };
};

let sequence = 0;

/** 原参考服务/PGlite + 原 HTTP 适配器 + 原 SQLite host/client/adapter + 三插件。IPC 管道为进程内直连。 */
export const createReviewHttpSqlite = async () => {
  const workdir = mkdtempSync(join(tmpdir(), 'rxdb-review-http-sqlite-'));
  const releases: Array<() => void | Promise<void>> = [() => rmSync(workdir, { recursive: true, force: true })];
  let releaseRequests: () => void = () => undefined;
  const close = async () => {
    releaseRequests();
    const errors: unknown[] = [];
    for (const release of releases.reverse()) {
      try {
        await release();
      } catch (error) {
        errors.push(error);
      }
    }
    releases.length = 0;
    if (errors.length) throw new AggregateError(errors, '复验资源回收失败');
  };
  try {
    const demo = await createDemoServer({
      dataDir: join(workdir, 'server-pglite'),
      exposeEtag: true,
      controlEnabled: true
    });
    let originClosed = false;
    const stopOrigin = async () => {
      if (originClosed) return;
      originClosed = true;
      await demo.close();
    };
    releases.push(stopOrigin);
    const origin = await listen(demo.server);
    const proxy = createDelayProxy(origin);
    releaseRequests = proxy.releaseAll;
    releases.push(() => closeServer(proxy.server));
    const proxyUrl = await listen(proxy.server);
    const listeners = new Set<(message: unknown) => void>();
    const sqlitePath = join(workdir, 'client.sqlite3');
    const host = createElectronSqliteHost({
      resolveDatabasePath: name => join(workdir, name),
      postChange: message => listeners.forEach(listener => listener(message)),
      onDeliveryError: error => proxy.errors.push(error)
    });
    releases.push(() => host.closeAll());
    const transport = {
      request: (message: unknown) => host.handle(message),
      subscribe: (listener: (message: unknown) => void) => {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      }
    };
    const rxdb = new RxDB({
      dbName: `ReviewHttpSqlite${++sequence}`,
      entities: [ReviewHttpCacheRecipe],
      sync: { type: SyncType.Full, local: { adapter: 'sqlite-electron' }, remote: { adapter: 'http' } }
    });
    releases.push(() => rxdb.destroy());
    const local = new RxDBAdapterElectron(rxdb, { transport, databaseName: 'client.sqlite3', batchTimeout: 0 });
    let denyAuth = false;
    const remote = new RxDBAdapterHttp(rxdb, {
      baseUrl: `${proxyUrl}/v1`,
      handlers: createRestHandlers({ resources: { [META.name]: 'recipes' } }),
      auth: (): Record<string, string> => (denyAuth ? { Authorization: 'Bearer' } : {})
    });
    rxdb.adapter('sqlite-electron', () => local);
    rxdb.adapter('http', () => remote);
    rxdb.use(rxDBPluginHistory);
    rxdb.use(rxDBPluginQueryCache);
    rxdb.use(rxDBPluginSync);
    await rxdb.connect('sqlite-electron');
    await rxdb.connect('http');
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await vi.waitFor(() => expect(rxdb.syncState.snapshot.syncing).toBe(false));
    const repository = rxdb.entityManager.getRepository(ReviewHttpCacheRecipe);
    const readSqliteTitle = () => {
      const database = new DatabaseSync(sqlitePath, { readOnly: true });
      try {
        return database.prepare('SELECT title FROM "public$review_http_cache" WHERE id = ?').get(TARGET_ID)?.['title'];
      } finally {
        database.close();
      }
    };
    const cacheCommits: unknown[] = [];
    const originalUpsert = local.upsertMany.bind(local);
    const upsertSpy = vi
      .spyOn(local, 'upsertMany')
      .mockImplementation((name, rows) =>
        originalUpsert(name, rows).pipe(tap(() => cacheCommits.push(readSqliteTitle())))
      );
    releases.push(() => upsertSpy.mockRestore());
    const toEntity = (data: Partial<RecipeRow>) =>
      rxdb.entityManager.createEntityRef(
        ReviewHttpCacheRecipe,
        data as EntityUpdateData<typeof ReviewHttpCacheRecipe>,
        {
          local: true
        }
      );
    const remoteRows = async (): Promise<RecipeRow[]> => {
      const response = await fetch(`${origin}/v1/recipes/by-ids`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: [TARGET_ID] })
      });
      expect(response.status).toBe(200);
      return (await response.json()) as RecipeRow[];
    };
    const patchRemote = async (title: string) => {
      const response = await fetch(`${origin}/v1/recipes/${TARGET_ID}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title })
      });
      expect(response.status).toBe(200);
      return (await response.json()) as RecipeRow;
    };
    const pendingChanges = () =>
      local.getRepository(RxDBChange).find({
        where: {
          combinator: 'and',
          rules: [
            { field: 'namespace', operator: '=', value: META.namespace },
            { field: 'entity', operator: '=', value: META.name },
            { field: 'entityId', operator: 'in', value: getRxDBChangeEntityIdQueryValues([TARGET_ID]) },
            { field: 'remoteId', operator: '=', value: null },
            { field: 'revertChangeId', operator: '=', value: null }
          ]
        },
        orderBy: [{ field: 'id', sort: 'asc' }]
      });
    const goOffline = () => {
      rxdb.reachability.report(new NetworkOfflineError(new Error('受控离线状态')));
      expect(rxdb.reachability.online).toBe(false);
    };
    return {
      stopOrigin,
      rxdb,
      local,
      remote,
      repository,
      toEntity,
      readSqliteTitle,
      remoteRows,
      patchRemote,
      pendingChanges,
      cacheCommits,
      proxy,
      host,
      goOffline,
      close,
      setDenyAuth: (value: boolean) => {
        denyAuth = value;
      }
    };
  } catch (error) {
    await close();
    throw error;
  }
};
