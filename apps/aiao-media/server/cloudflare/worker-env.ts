/** Worker 入口使用的 Cloudflare 绑定与服务配置。 */
export interface WorkerEnv {
  ASSETS?: Fetcher;
  MEDIA_PLATFORM?: DurableObjectNamespace;
  RELAY_TASKS?: DurableObjectNamespace;
  MEDIA_RESULTS?: R2Bucket;
  RELAY_RESULTS?: R2Bucket;
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
  [secret: string]: unknown;
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
