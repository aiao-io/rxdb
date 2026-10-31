import { EntityLocalCreatedEvent, getEntityMetadata, type RxDB } from '@aiao/rxdb';
import { IntlMessageFormat, type PrimitiveType } from 'intl-messageformat';
import { BehaviorSubject, combineLatest, merge, Subject, type Subscription } from 'rxjs';
import {
  catalogMessages,
  messageId,
  type CatalogMessage,
  type MessageCatalog,
  type MessageSource,
  type ResolvedMessage
} from './catalog.js';
import { i18nEntities, I18nSettings, MessageEntry, MissingMessageEntry, RemoteMessageEntry } from './entities.js';
import type { I18nInspectedMessage, I18nInspection } from './inspection.js';
import { buildLocaleChain, canonicalizeLocale, type LocalePreferences } from './locale.js';
import { observeRemoteMessages } from './remote-source.js';

/** 客户端国际化运行时选项。 */
export interface I18nOptions {
  /** 可选本地数据库；省略时使用纯静态目录。 */
  readonly rxdb?: RxDB;
  /** 默认语言，缺省 zh-Hans。 */
  readonly defaultLocale?: string;
  /** 宿主语言，缺省 navigator.language。 */
  readonly deviceLocale?: string;
  /** 初始显式语言；已持久化的用户偏好优先。 */
  readonly locale?: string;
  /** 随应用发布的目录。 */
  readonly catalogs?: readonly MessageCatalog[];
  /** t() 的默认命名空间，缺省 app。 */
  readonly namespace?: string;
}

interface StoredMessage extends CatalogMessage {
  readonly source: MessageSource;
}
const ALL: { combinator: 'and'; rules: [] } = { combinator: 'and', rules: [] };
const byId = (id: string) => ({
  combinator: 'and' as const,
  rules: [{ field: 'id' as const, operator: '=' as const, value: id }]
});
const nextUpdatedAt = (current?: Date): Date => new Date(Math.max(Date.now(), (current?.getTime() ?? 0) + 1));
const normalizePreferences = (settings: LocalePreferences): LocalePreferences => ({
  deviceLocale: canonicalizeLocale(settings.deviceLocale),
  defaultLocale: canonicalizeLocale(settings.defaultLocale),
  devicePreferredLocale:
    settings.devicePreferredLocale == null ? null : canonicalizeLocale(settings.devicePreferredLocale)
});
const valuesFor = (params: Record<string, unknown>): Record<string, PrimitiveType> =>
  Object.fromEntries(
    Object.entries(params).map(([key, value]) => {
      if (value instanceof Date) return [key, value.getTime()];
      if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return [key, value as PrimitiveType];
      throw new TypeError(`ICU parameter ${key} must be a string, number, boolean, Date, null or undefined`);
    })
  );

/**
 * 以 RxDB 语言偏好及目录为数据源的国际化运行时。
 *
 * @remarks
 * 静态模式构造后即可使用；持久模式在首屏渲染前 await init()。
 * 同源跨 Tab 通知由 RxDBTabsGateway 承担，multiInstance:false 不接收其他实例的写入。
 */
export class I18n {
  readonly #db?: RxDB;
  readonly #namespace: string;
  readonly #bundle = new Map<string, StoredMessage>();
  #messages = new Map<string, StoredMessage>();
  #local: MessageEntry[] = [];
  #remote: RemoteMessageEntry[] = [];
  #preferences: LocalePreferences;
  #subscription?: Subscription;
  #initializing?: Promise<void>;
  #initialized = false;
  #destroyed = false;
  readonly #formats = new Map<string, IntlMessageFormat>();
  readonly #missing = new Set<string>();
  #pendingDiagnostics: Promise<void> = Promise.resolve();
  #refreshing: Promise<void> = Promise.resolve();
  readonly #inspectionChanges = new Subject<void>();

  /** 当前语言，框架绑定订阅它驱动渲染。 */
  readonly locale$: BehaviorSubject<string>;
  /** 当前目录内可用语言。 */
  readonly availableLocales$ = new BehaviorSubject<string[]>([]);
  /** 目录或语言变化的修订号。 */
  readonly changes$ = new BehaviorSubject<number>(0);
  /** 后台诊断写入或外部目录校验错误。 */
  readonly errors$ = new BehaviorSubject<Error | null>(null);
  /** 目录、语言或诊断变化；检视工具订阅它，不触发应用重新翻译。 */
  readonly inspection$ = merge(this.changes$, this.#inspectionChanges);
  /** 当前生效语言的同步快照。 */
  get locale(): string {
    return this.locale$.value;
  }
  /** 已注册目录语言的同步快照。 */
  get availableLocales(): string[] {
    return [...this.availableLocales$.value];
  }

  /**
   * 校验语言与随包目录，创建当前应用独立的运行时。
   * @param options - 数据库、初始偏好与目录。
   * @throws 语言、ICU 或目录身份非法，以及缺少实体注册时抛错。
   */
  constructor(options: I18nOptions = {}) {
    this.#db = options.rxdb;
    if (this.#db && i18nEntities().some(entity => !this.#db?.config.entities.includes(entity))) {
      throw new Error('Register i18nEntities() in config.entities before RxDB.init()');
    }
    const defaultLocale = canonicalizeLocale(options.defaultLocale ?? 'zh-Hans');
    const deviceLocale = canonicalizeLocale(options.deviceLocale ?? globalThis.navigator?.language ?? defaultLocale);
    const locale = canonicalizeLocale(options.locale ?? deviceLocale);
    this.#namespace = options.namespace ?? 'app';
    this.#preferences = { locale, devicePreferredLocale: options.locale ? locale : null, deviceLocale, defaultLocale };
    this.locale$ = new BehaviorSubject(locale);
    for (const catalog of options.catalogs ?? []) this.registerCatalog(catalog);
  }

  /**
   * 连接数据库、创建缺省偏好并订阅响应式查询。
   * @returns 当前运行时的首个权威快照就绪后完成；并发调用共用同一个 Promise。
   * @throws 数据库或实体注册无效、存储数据非法、运行时已销毁时拒绝。
   */
  init = (): Promise<void> => {
    this.#assertActive();
    this.#initializing ??= this.#initialize().catch(error => {
      this.#subscription?.unsubscribe();
      this.#subscription = undefined;
      this.#initializing = undefined;
      throw error;
    });
    return this.#initializing;
  };

  /**
   * 原子校验并注册随包目录。
   * @param catalog - 属于同一语言及命名空间的 ICU 目录。
   * @throws 非法目录或已注册的规范化消息身份立即抛错。
   */
  registerCatalog = (catalog: MessageCatalog): void => {
    this.#assertActive();
    const rows = catalogMessages(catalog);
    for (const row of rows) {
      if (this.#bundle.has(messageId(row.locale, row.namespace, row.key)))
        throw new Error(`Duplicate message: ${row.locale}/${row.namespace}/${row.key}`);
    }
    for (const row of rows)
      this.#bundle.set(messageId(row.locale, row.namespace, row.key), { ...row, source: 'bundle' });
    this.#merge();
  };

  /**
   * 将用户语言偏好写入一次本地事务；无库模式立即更新内存状态。
   * @param locale - 有效的 BCP 47 语言标签。
   * @returns 当前运行时刷新完成后完成，其他运行时经响应式查询异步跟随。
   */
  setLocale = async (locale: string): Promise<void> => {
    this.#assertActive();
    const canonical = canonicalizeLocale(locale);
    if (!this.#db) {
      this.#applySettings({ ...this.#preferences, devicePreferredLocale: canonical });
      return;
    }
    await this.init();
    const updated = await this.#db.localAdapterSync.transaction(async executor => {
      const repo = executor.getRepository(I18nSettings);
      const [settings] = await repo.find({ where: byId('singleton') });
      const patch = { devicePreferredLocale: canonical, updatedAt: nextUpdatedAt(settings.updatedAt) };
      await repo.update(settings, patch);
      return { ...settings, ...patch };
    });
    this.#db.entityManager.notifyExternalUpdate(I18nSettings, updated.id, updated);
    await this.#refresh();
  };

  /**
   * 校验并持久化单条粒度的本地覆盖；空字符串保留。
   * @param catalog - 要创建或更新的本地覆盖目录。
   * @returns 当前运行时读回已提交目录后完成。
   */
  setMessages = async (catalog: MessageCatalog): Promise<void> => this.#writeMessages(MessageEntry, catalog);
  /**
   * 校验远端目录后写入独立缓存表，本地覆盖不受影响。
   * @param catalog - 已分发到客户端的远端目录。
   * @returns 远端缓存合入当前运行时后完成。
   */
  setRemoteMessages = async (catalog: MessageCatalog): Promise<void> =>
    this.#writeMessages(RemoteMessageEntry, catalog);
  /**
   * 删除本地覆盖，使消息重新按 remote、bundle 顺序解析。
   * @param locale - 目录语言。
   * @param namespace - 目录命名空间。
   * @param keys - 要删除的 key，不存在的 key 不改变数据。
   * @returns 当前目录刷新后完成。
   */
  removeMessages = async (locale: string, namespace: string, keys: readonly string[]): Promise<void> =>
    this.#removeMessages(MessageEntry, locale, namespace, keys);
  /**
   * 删除远端缓存行；不删除本地覆盖。
   * @param locale - 目录语言。
   * @param namespace - 目录命名空间。
   * @param keys - 要清除的远端 key。
   * @returns 当前目录刷新后完成。
   */
  removeRemoteMessages = async (locale: string, namespace: string, keys: readonly string[]): Promise<void> =>
    this.#removeMessages(RemoteMessageEntry, locale, namespace, keys);

  /**
   * 根据共享回退链解析源文案与来源。
   * @param key - 消息 key。
   * @param namespace - 消息命名空间，缺省使用构造选项。
   * @returns 首个命中的源文案；未命中时 value 为 undefined。
   */
  resolve = (key: string, namespace = this.#namespace): ResolvedMessage => {
    for (const locale of buildLocaleChain({ ...this.#preferences, locale: this.locale })) {
      const row = this.#messages.get(messageId(locale, namespace, key));
      if (row) return { value: row.value, locale, source: row.source };
    }
    return { value: undefined };
  };

  /**
   * 格式化 ICU 消息，全链缺失时返回 key 并记录本地诊断。
   * @param key - 消息 key。
   * @param params - ICU 插值、复数或 select 参数。
   * @param namespace - 消息命名空间，缺省使用构造选项。
   * @returns 纯文本格式化结果。
   * @throws ICU 参数缺失或不支持参数值类型时抛错。
   */
  t = (key: string, params: Record<string, unknown> = {}, namespace = this.#namespace): string => {
    const resolved = this.resolve(key, namespace);
    if (resolved.value === undefined) {
      this.#recordMissing(key, namespace);
      return key;
    }
    const cacheKey = JSON.stringify([resolved.locale, resolved.value]);
    let format = this.#formats.get(cacheKey);
    if (!format) {
      format = new IntlMessageFormat(resolved.value, resolved.locale, undefined, { ignoreTag: true });
      this.#formats.set(cacheKey, format);
    }
    const result = format.format(valuesFor(params));
    return Array.isArray(result) ? result.join('') : String(result);
  };
  /**
   * 用当前语言格式化数字。
   * @param value - 要显示的数字。
   * @param options - 平台 Intl.NumberFormat 选项。
   * @returns 本地化数字。
   */
  formatNumber = (value: number, options?: Intl.NumberFormatOptions): string =>
    new Intl.NumberFormat(this.locale, options).format(value);
  /**
   * 用当前语言格式化日期。
   * @param value - 要显示的日期。
   * @param options - 平台 Intl.DateTimeFormat 选项。
   * @returns 本地化日期。
   */
  formatDate = (value: Date, options?: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat(this.locale, options).format(value);
  /**
   * 用当前语言格式化相对时间。
   * @param value - 相对于当前时间的数量。
   * @param unit - 时间单位。
   * @param options - 平台 Intl.RelativeTimeFormat 选项。
   * @returns 本地化相对时间。
   */
  formatRelativeTime = (
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions
  ): string => new Intl.RelativeTimeFormat(this.locale, options).format(value, unit);
  /** 等待已排队的缺失 key 诊断落库。 */
  flushDiagnostics = (): Promise<void> => this.#pendingDiagnostics;

  /**
   * 返回全部目录层与缺失 key 的只读诊断快照。
   * @returns 已排队诊断写入完成后的可序列化快照，所有行均脱离内部实体引用。
   * @throws 运行时已销毁或诊断读取失败时拒绝。
   */
  inspect = async (): Promise<I18nInspection> => {
    this.#assertActive();
    if (this.#db) await this.init();
    await this.flushDiagnostics();
    const missing =
      this.#db ? await this.#db.localAdapterSync.getRepository(MissingMessageEntry).find({ where: ALL }) : [];
    this.#assertActive();
    const layers: StoredMessage[] = [
      ...this.#bundle.values(),
      ...this.#remote.map(row => ({ ...row, source: 'remote' as const })),
      ...this.#local.map(row => ({ ...row, source: 'db' as const }))
    ];
    const messages: I18nInspectedMessage[] = layers.map(({ locale, namespace, key, value, source }) => ({
      locale,
      namespace,
      key,
      value,
      source,
      active: this.#messages.get(messageId(locale, namespace, key))?.source === source
    }));
    messages.sort((a, b) =>
      messageId(a.locale, a.namespace, a.key).localeCompare(messageId(b.locale, b.namespace, b.key))
    );
    return {
      locale: this.locale,
      availableLocales: this.availableLocales,
      messages,
      missingMessages: missing.map(row => ({
        id: row.id,
        locale: row.locale,
        namespace: row.namespace,
        key: row.key,
        updatedAt: row.updatedAt.toISOString()
      }))
    };
  };

  /** 清空缺失 key 的诊断，随后再次缺失仍会记录。 */
  clearMissingMessages = async (): Promise<void> => {
    const db = this.#requireDb();
    await this.init();
    await this.flushDiagnostics();
    await db.localAdapterSync.transaction(async executor => {
      const repository = executor.getRepository(MissingMessageEntry);
      for (const row of await repository.find({ where: ALL })) await repository.remove(row);
    });
    this.#missing.clear();
    this.#inspectionChanges.next();
  };

  /** 释放查询订阅与响应式源；不销毁宿主数据库。 */
  destroy = (): void => {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#subscription?.unsubscribe();
    this.locale$.complete();
    this.availableLocales$.complete();
    this.changes$.complete();
    this.errors$.complete();
    this.#inspectionChanges.complete();
  };

  async #initialize(): Promise<void> {
    if (!this.#db) {
      this.#initialized = true;
      return;
    }
    const adapterName = this.#db.config.sync.local?.adapter;
    if (!adapterName) throw new Error('I18n requires a local RxDB adapter');
    this.#db.init();
    for (const Entity of i18nEntities()) {
      const metadata = getEntityMetadata(Entity);
      if (this.#db.schemaManager.getEntityType(metadata.name, metadata.namespace) !== Entity) {
        throw new Error(
          'Register i18nEntities() before RxDB.init(); adding config.entities afterwards does not register schemas'
        );
      }
    }
    await this.#db.connect(adapterName);
    this.#assertActive();
    await this.#createSettings();
    this.#assertActive();
    const manager = this.#db.entityManager;
    await new Promise<void>((resolve, reject) => {
      const fail = (error: unknown): void => {
        const normalized = error instanceof Error ? error : new Error(String(error));
        if (!this.#destroyed) this.errors$.next(normalized);
        reject(normalized);
      };
      this.#subscription = combineLatest([
        manager.getRepository(I18nSettings).findAll({ where: ALL }),
        manager.getRepository(MessageEntry).findAll({ where: ALL }),
        observeRemoteMessages(this.#db!)
      ]).subscribe({
        next: () => {
          void this.#refresh().then(resolve, fail);
        },
        error: fail
      });
      this.#subscription.add(() => reject(new Error('I18n query subscription ended during initialization')));
    });
    this.#assertActive();
    this.#initialized = true;
  }

  async #createSettings(): Promise<void> {
    const db = this.#requireDb();
    try {
      await db.localAdapterSync.transaction(async executor => {
        const repository = executor.getRepository(I18nSettings);
        if ((await repository.find({ where: byId('singleton') })).length) return;
        const row = db.entityManager.instantiate(I18nSettings);
        Object.assign(row, {
          id: 'singleton',
          deviceLocale: this.#preferences.deviceLocale,
          devicePreferredLocale: this.#preferences.devicePreferredLocale ?? null,
          defaultLocale: this.#preferences.defaultLocale,
          updatedAt: nextUpdatedAt()
        });
        await repository.create(row);
      });
    } catch (error) {
      const rows = await db.localAdapterSync.getRepository(I18nSettings).find({ where: byId('singleton') });
      if (!rows.length) throw error;
    }
  }

  #refresh(): Promise<void> {
    const requested = this.#refreshing.then(async () => {
      if (this.#destroyed) return;
      const db = this.#requireDb();
      const snapshot = await db.localAdapterSync.transaction(async executor => {
        const [settings, local, remote] = await Promise.all([
          executor.getRepository(I18nSettings).find({ where: ALL }),
          executor.getRepository(MessageEntry).find({ where: ALL }),
          executor.getRepository(RemoteMessageEntry).find({ where: ALL })
        ]);
        if (!settings[0]) throw new Error('I18nSettings singleton is missing');
        return {
          settings: { ...settings[0] },
          local: local.map(row => ({ ...row })),
          remote: remote.map(row => ({ ...row }))
        };
      }, false);
      if (!this.#destroyed) this.#accept(snapshot.settings, snapshot.local, snapshot.remote);
    });
    this.#refreshing = requested.catch(() => undefined);
    return requested;
  }

  #accept(settings: I18nSettings, local: MessageEntry[], remote: RemoteMessageEntry[]): void {
    const preferences = normalizePreferences(settings);
    for (const row of [...local, ...remote]) {
      catalogMessages({ locale: row.locale, namespace: row.namespace, messages: { [row.key]: row.value } });
      if (messageId(row.locale, row.namespace, row.key) !== row.id) throw new Error('Invalid message identity');
    }
    this.#local = local;
    this.#remote = remote;
    this.#preferences = preferences;
    this.#merge();
  }

  #applySettings(settings: LocalePreferences): void {
    this.#preferences = normalizePreferences(settings);
    this.#merge();
  }

  #merge(): void {
    this.#messages = new Map(this.#bundle);
    for (const row of this.#remote) this.#messages.set(row.id, { ...row, source: 'remote' });
    for (const row of this.#local) this.#messages.set(row.id, { ...row, source: 'db' });
    this.#formats.clear();
    this.locale$.next(this.#preferences.devicePreferredLocale ?? this.#preferences.deviceLocale);
    this.availableLocales$.next([...new Set([...this.#messages.values()].map(row => row.locale))].sort());
    this.changes$.next(this.changes$.value + 1);
  }

  async #writeMessages(Entity: typeof MessageEntry, catalog: MessageCatalog): Promise<void> {
    const rows = catalogMessages(catalog);
    const db = this.#requireDb();
    await this.init();
    const saved = await db.localAdapterSync.transaction(async executor => {
      const repository = executor.getRepository(Entity);
      const notifications: { row: MessageEntry; created: boolean }[] = [];
      for (const row of rows) {
        const id = messageId(row.locale, row.namespace, row.key);
        const [existing] = await repository.find({ where: byId(id) });
        const value: MessageEntry = {
          ...row,
          id,
          source: Entity === MessageEntry ? 'db' : 'remote',
          updatedAt: nextUpdatedAt(existing?.updatedAt)
        };
        if (existing) await repository.update(existing, value);
        else await repository.create(Object.assign(db.entityManager.instantiate(Entity), value));
        notifications.push({ row: value, created: !existing });
      }
      return notifications;
    });
    const metadata = getEntityMetadata(Entity);
    for (const { row, created } of saved) {
      if (!created) {
        db.entityManager.notifyExternalUpdate(Entity, row.id, row);
        continue;
      }
      db.dispatchEvent(
        new EntityLocalCreatedEvent([
          {
            type: 'INSERT',
            namespace: metadata.namespace,
            entity: metadata.name,
            id: row.id,
            patch: row,
            inversePatch: null,
            recordAt: row.updatedAt,
            ...db.worktreeTableSet.eventTagOf(metadata)
          }
        ])
      );
    }
    await this.#refresh();
  }

  async #removeMessages(
    Entity: typeof MessageEntry,
    locale: string,
    namespace: string,
    keys: readonly string[]
  ): Promise<void> {
    const ids = keys.map(key => messageId(locale, namespace, key));
    const db = this.#requireDb();
    await this.init();
    await db.localAdapterSync.transaction(async executor => {
      const repository = executor.getRepository(Entity);
      for (const id of ids) {
        const [row] = await repository.find({ where: byId(id) });
        if (row) await repository.remove(row);
      }
    });
    await this.#refresh();
  }

  #recordMissing(key: string, namespace: string): void {
    if (!this.#db || !this.#initialized || this.#destroyed) return;
    const id = messageId(this.locale, namespace, key);
    if (this.#missing.has(id)) return;
    this.#missing.add(id);
    const db = this.#db;
    const value = { id, locale: this.locale, namespace, key, updatedAt: new Date() };
    this.#pendingDiagnostics = this.#pendingDiagnostics
      .then(() =>
        db.localAdapterSync.transaction(async executor => {
          const repository = executor.getRepository(MissingMessageEntry);
          if ((await repository.find({ where: byId(id) })).length) return;
          await repository.create(Object.assign(db.entityManager.instantiate(MissingMessageEntry), value));
        })
      )
      .then(() => this.#inspectionChanges.next())
      .catch((error: unknown) => {
        this.#missing.delete(id);
        this.errors$.next(error instanceof Error ? error : new Error(String(error)));
      });
  }

  #requireDb(): RxDB {
    this.#assertActive();
    if (!this.#db) throw new Error('This operation requires an RxDB instance');
    return this.#db;
  }
  #assertActive(): void {
    if (this.#destroyed) throw new Error('I18n has been destroyed');
  }
}
