/** Worker 入口使用的 Cloudflare 绑定与服务配置。 */
export interface WorkerEnv {
  [secret: string]: unknown;
  ASSETS?: Fetcher;
  MEDIA_PLATFORM?: DurableObjectNamespace;
  RELAY_TASKS?: RelayTaskNamespace;
  MEDIA_RESULTS?: R2Bucket;
  RELAY_RESULTS?: RelayResultStore;
  ALLOWED_PROVIDER_BASE_URLS?: string;
  MEDIA_ALLOW_DESKTOP_ORIGIN?: string;
  MEDIA_SUPABASE_URL?: string;
  MEDIA_SUPABASE_ANON_KEY?: string;
  MEDIA_SUPABASE_SERVICE_ROLE_KEY?: string;
  MEDIA_STRIPE_SECRET_KEY?: string;
  MEDIA_STRIPE_WEBHOOK_SECRET?: string;
  MEDIA_PLATFORM_MODELS?: string;
  MEDIA_PLATFORM_FREE_DAILY?: string;
  MEDIA_PLATFORM_DAILY_BUDGET_MICROS?: string;
  MEDIA_CREDIT_PACK?: string;
}

/** 两种部署共用的任务寻址和请求接口。 */
export interface RelayTaskNamespace {
  idFromName(name: string): { toString(): string };
  get(id: { toString(): string }): { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };
}

/** 代理结果只需要密文写入、读取、存在检查和删除。 */
export interface RelayResultStore {
  put(
    key: string,
    value: Uint8Array<ArrayBuffer>,
    options?: { httpMetadata: { contentType: string } }
  ): Promise<unknown>;
  get(key: string): Promise<{ body: ReadableStream<Uint8Array> } | null>;
  head(key: string): Promise<unknown | null>;
  delete(key: string): Promise<void>;
}

/** 持久对象使用的同步 SQL 接口，允许本地 SQLite 提供同一契约。 */
export interface WorkerSql {
  exec<Row extends Record<string, SqlStorageValue>>(query: string, ...bindings: SqlStorageValue[]): Iterable<Row>;
}

/** 平台协调器依赖的事务和闹钟。 */
export interface PlatformContext {
  storage: Pick<DurableObjectStorage, 'transactionSync' | 'setAlarm'> & { sql: WorkerSql };
}

/** 代理任务依赖的存储生命周期和后台任务。 */
export interface RelayTaskContext {
  storage: Pick<DurableObjectStorage, 'setAlarm' | 'deleteAlarm' | 'deleteAll'> & { sql: WorkerSql };
  waitUntil(promise: Promise<unknown>): void;
}

/** 上游调用可由测试替换。 */
export type WorkerRequest = (url: string, init: RequestInit) => Promise<Response>;
