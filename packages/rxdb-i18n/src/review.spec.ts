import {
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  getEntityMetadata,
  RxDB,
  SyncType,
  type EntityType,
  type TransactionExecutor
} from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { BehaviorSubject, firstValueFrom, Subject, type Subscription } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
  buildLocaleChain,
  I18n,
  i18nEntities,
  I18nSettings,
  MessageEntry,
  messageId,
  MissingMessageEntry,
  RemoteMessageEntry
} from './index.js';

const controlledDatabase = () => {
  const settings = {
    id: 'singleton',
    deviceLocale: 'zh-Hans',
    defaultLocale: 'zh-Hans',
    devicePreferredLocale: null as string | null,
    updatedAt: new Date()
  };
  const local: MessageEntry[] = [];
  const sources = new Map<EntityType, Subject<unknown[]>>([
    [I18nSettings, new BehaviorSubject<unknown[]>([settings])],
    [MessageEntry, new BehaviorSubject<unknown[]>([])],
    [RemoteMessageEntry, new BehaviorSubject<unknown[]>([])]
  ]);
  const readGate = Promise.withResolvers<void>();
  const queryOptions = new Map<EntityType, unknown>();
  let blockReads = false;
  let reading = false;
  const executor = {
    getRepository: (Entity: EntityType) => ({
      find: async () =>
        Entity === I18nSettings ? [settings]
        : Entity === MessageEntry ? local
        : []
    })
  } as unknown as TransactionExecutor;
  const db = {
    config: { entities: i18nEntities(), sync: { local: { adapter: 'controlled' } } },
    init: () => undefined,
    schemaManager: {
      getEntityType: (name: string) => i18nEntities().find(Entity => getEntityMetadata(Entity).name === name)
    },
    connect: async () => undefined,
    entityManager: {
      getRepository: (Entity: EntityType) => ({
        sync: { type: SyncType.None },
        findAll: (options: unknown) => {
          queryOptions.set(Entity, options);
          return sources.get(Entity);
        }
      })
    },
    localAdapterSync: {
      transaction: async (action: (executor: TransactionExecutor) => Promise<unknown>) => {
        if (blockReads) {
          reading = true;
          await readGate.promise;
        }
        return action(executor);
      }
    }
  } as unknown as RxDB;
  return {
    db,
    settings,
    local,
    sources,
    readGate,
    queryOptions,
    block: () => {
      blockReads = true;
    },
    isReading: () => reading
  };
};

describe('国际化运行时独立复核', () => {
  it('Unicode 扩展先降到完整基础语言，再按脚本和地区逐级回退', () => {
    expect(
      buildLocaleChain({
        locale: 'zh-Hans-CN-u-nu-hanidec',
        devicePreferredLocale: 'zh-Hans',
        deviceLocale: 'en-US',
        defaultLocale: 'en'
      })
    ).toEqual(['zh-Hans-CN-u-nu-hanidec', 'zh-Hans-CN', 'zh-Hans', 'zh', 'en-US', 'en']);
  });

  it('查询读回尚未完成时销毁，不发布迟到状态，并解除三个查询订阅', async () => {
    const controlled = controlledDatabase();
    const runtime = new I18n({ rxdb: controlled.db });
    await runtime.init();
    controlled.block();
    const publish = vi.spyOn(runtime.locale$, 'next');
    controlled.settings.devicePreferredLocale = 'en';
    controlled.sources.get(I18nSettings)!.next([controlled.settings]);
    await vi.waitFor(() => expect(controlled.isReading()).toBe(true));
    runtime.destroy();
    controlled.readGate.resolve();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(publish).not.toHaveBeenCalled();
    expect(runtime.locale).toBe('zh-Hans');
    for (const source of controlled.sources.values()) expect(source.observed).toBe(false);
  });

  it('初始化必须等待三个响应式源的首轮查询完成', async () => {
    const controlled = controlledDatabase();
    const delayed = new Subject<unknown[]>();
    controlled.sources.set(RemoteMessageEntry, delayed);
    const runtime = new I18n({ rxdb: controlled.db });
    let ready = false;
    const initializing = runtime.init().then(() => {
      ready = true;
    });
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(delayed.observed).toBe(true);
      expect(ready).toBe(false);
      delayed.next([]);
      await initializing;
      expect(ready).toBe(true);
      expect(controlled.queryOptions.get(RemoteMessageEntry)).toMatchObject({
        offlineFallback: true,
        localCacheFirst: true
      });
    } finally {
      runtime.destroy();
    }
  });

  it('等待首轮查询期间销毁会拒绝初始化，并解除全部源订阅', async () => {
    const controlled = controlledDatabase();
    const delayed = new Subject<unknown[]>();
    controlled.sources.set(RemoteMessageEntry, delayed);
    const runtime = new I18n({ rxdb: controlled.db });
    const initializing = runtime.init();
    await vi.waitFor(() => expect(delayed.observed).toBe(true));
    const rejected = expect(initializing).rejects.toThrow(/initialization|destroyed/i);
    runtime.destroy();
    await rejected;
    for (const source of controlled.sources.values()) expect(source.observed).toBe(false);
  });

  it('后台无效状态发出可观测错误，修正后的下一次查询继续刷新', async () => {
    const controlled = controlledDatabase();
    const runtime = new I18n({ rxdb: controlled.db });
    try {
      await runtime.init();
      controlled.settings.devicePreferredLocale = 'not_a_locale';
      controlled.sources.get(I18nSettings)!.next([controlled.settings]);
      await vi.waitFor(() => expect(runtime.errors$.value).toBeInstanceOf(RangeError));
      expect(runtime.locale).toBe('zh-Hans');
      controlled.settings.devicePreferredLocale = 'fr';
      controlled.sources.get(I18nSettings)!.next([controlled.settings]);
      await vi.waitFor(() => expect(runtime.locale).toBe('fr'));
    } finally {
      runtime.destroy();
    }
  });

  it('首次初始化失败释放查询，修正数据后重试只建立一组订阅', async () => {
    const controlled = controlledDatabase();
    controlled.settings.devicePreferredLocale = 'invalid_locale';
    const runtime = new I18n({ rxdb: controlled.db });
    try {
      await expect(runtime.init()).rejects.toThrow(RangeError);
      for (const source of controlled.sources.values()) expect(source.observed).toBe(false);
      controlled.settings.devicePreferredLocale = 'en';
      await runtime.init();
      expect(runtime.locale).toBe('en');
      for (const source of controlled.sources.values()) expect(source.observers).toHaveLength(1);
    } finally {
      runtime.destroy();
    }
    for (const source of controlled.sources.values()) expect(source.observed).toBe(false);
  });

  it('发布新 locale 时，同一数据库快照的新文案已可同步读取', async () => {
    const controlled = controlledDatabase();
    const runtime = new I18n({ rxdb: controlled.db });
    const rendered: string[] = [];
    await runtime.init();
    const subscription = runtime.locale$.subscribe(locale => {
      if (locale === 'en') rendered.push(runtime.t('hello'));
    });
    try {
      controlled.local.push({
        id: messageId('en', 'app', 'hello'),
        locale: 'en',
        namespace: 'app',
        key: 'hello',
        value: 'current',
        source: 'db',
        updatedAt: new Date()
      });
      controlled.settings.devicePreferredLocale = 'en';
      controlled.sources.get(I18nSettings)!.next([controlled.settings]);
      await vi.waitFor(() => expect(rendered.length).toBeGreaterThan(0));
      expect(rendered.every(text => text === 'current')).toBe(true);
    } finally {
      subscription.unsubscribe();
      runtime.destroy();
    }
  });

  it('数据库已 init 后再向 config 塞实体，也在连接及查询之前拒绝', async () => {
    const db = new RxDB({
      dbName: `i18n-late-${crypto.randomUUID()}`,
      entities: [],
      multiInstance: false,
      sync: { type: SyncType.None, local: { adapter: 'never-connect' } }
    });
    db.init();
    db.config.entities.push(...i18nEntities());
    const runtime = new I18n({ rxdb: db });
    const connect = vi.spyOn(db, 'connect');
    try {
      await expect(runtime.init()).rejects.toThrow('before RxDB.init');
      expect(connect).not.toHaveBeenCalled();
    } finally {
      runtime.destroy();
      await db.destroy();
    }
  });

  it('真实目录响应式查询接收新行，连续改语言的修订号单调且其他运行时跟随', async () => {
    const NativeBroadcastChannel = globalThis.BroadcastChannel;
    const channels: string[] = [];
    vi.stubGlobal(
      'BroadcastChannel',
      class extends NativeBroadcastChannel {
        constructor(name: string) {
          super(name);
          channels.push(name);
        }
      }
    );
    const dbName = `i18n-review-${crypto.randomUUID()}`;
    const db = new RxDB({
      dbName,
      entities: i18nEntities(),
      multiInstance: false,
      context: { userId: 'review' },
      sync: { type: SyncType.None, local: { adapter: 'pglite' } }
    });
    db.adapter('pglite', rxdb => new RxDBAdapterPGlite(rxdb, { store: 'memory' }));
    const first = new I18n({ rxdb: db, deviceLocale: 'zh-Hans' });
    const second = new I18n({ rxdb: db, deviceLocale: 'zh-Hans' });
    const events: unknown[] = [];
    db.addEventListener(ENTITY_LOCAL_CREATE_EVENT, event => events.push(event));
    db.addEventListener(ENTITY_LOCAL_UPDATE_EVENT, event => events.push(event));
    let latest: MessageEntry[] = [];
    let subscription: Subscription | undefined;
    try {
      await first.init();
      await second.init();
      expect(channels).not.toContain(`${dbName}_gateway`);
      subscription = db.entityManager
        .getRepository(MessageEntry)
        .findAll({ where: { combinator: 'and', rules: [] } })
        .subscribe(rows => (latest = rows));
      await first.setMessages({ locale: 'en', namespace: 'app', messages: { hello: 'Hello' } });
      await vi.waitFor(() =>
        expect(
          latest.length,
          JSON.stringify({
            metadata: {
              name: getEntityMetadata(MessageEntry).name,
              namespace: getEntityMetadata(MessageEntry).namespace
            },
            events
          })
        ).toBe(1)
      );
      const repository = db.localAdapterSync.getRepository(I18nSettings);
      await first.setLocale('en');
      const before = (await repository.find({ where: { combinator: 'and', rules: [] } }))[0].updatedAt.getTime();
      await first.setLocale('fr');
      const after = (await repository.find({ where: { combinator: 'and', rules: [] } }))[0].updatedAt.getTime();
      expect(after).toBeGreaterThan(before);
      await vi.waitFor(() => expect(second.locale).toBe('fr'));
      expect(
        (
          await firstValueFrom(
            db.entityManager.getRepository(MessageEntry).findAll({ where: { combinator: 'and', rules: [] } })
          )
        ).length
      ).toBe(1);
      await first.setLocale('en');
      first.registerCatalog({ locale: 'en', namespace: 'app', messages: { hello: 'bundle' } });
      await first.setRemoteMessages({ locale: 'en', namespace: 'app', messages: { hello: 'remote' } });
      expect(first.resolve('hello').source).toBe('db');
      expect(
        (await first.inspect()).messages.filter(row => row.key === 'hello').map(row => [row.source, row.active])
      ).toEqual([
        ['bundle', false],
        ['remote', false],
        ['db', true]
      ]);
      await first.removeRemoteMessages('en', 'app', ['hello']);
      expect(first.t('hello')).toBe('Hello');
      await first.setMessages({ locale: 'en', namespace: 'app', messages: { hello: 'updated' } });
      await vi.waitFor(() => expect(second.t('hello')).toBe('updated'));
      await first.setRemoteMessages({ locale: 'en', namespace: 'app', messages: { hello: 'remote' } });
      await first.removeMessages('en', 'app', ['hello', 'absent']);
      expect(first.t('hello')).toBe('remote');
      await vi.waitFor(() => expect(second.t('hello')).toBe('remote'));
      await first.removeRemoteMessages('en', 'app', ['hello']);
      expect(first.t('hello')).toBe('bundle');
      expect(first.t('review.missing')).toBe('review.missing');
      expect(first.t('review.missing')).toBe('review.missing');
      await first.flushDiagnostics();
      expect((await first.inspect()).missingMessages.some(row => row.key === 'review.missing')).toBe(true);
      const diagnostics = db.localAdapterSync.getRepository(MissingMessageEntry);
      await second.flushDiagnostics();
      expect(
        await diagnostics.find({
          where: { combinator: 'and', rules: [{ field: 'key', operator: '=', value: 'review.missing' }] }
        })
      ).toHaveLength(1);
      await first.clearMissingMessages();
      expect((await first.inspect()).missingMessages).toEqual([]);
      expect(await diagnostics.find({ where: { combinator: 'and', rules: [] } })).toHaveLength(0);
      first.t('review.missing');
      await first.flushDiagnostics();
      expect(await diagnostics.find({ where: { combinator: 'and', rules: [] } })).toHaveLength(1);
    } finally {
      subscription?.unsubscribe();
      first.destroy();
      second.destroy();
      await db.destroy();
      vi.unstubAllGlobals();
    }
  });
});
