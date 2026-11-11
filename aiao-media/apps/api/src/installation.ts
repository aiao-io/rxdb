import type { InstallationInput, InstallationStatus } from '@aiao-media/api-contracts';
import { backend, body, endpoint, fields, ProductApiError, reject, sameOriginWrite, uuid } from './product-http.ts';
import type { WorkerEnv, WorkerSql } from './worker-env.ts';

type Configuration = Required<
  Pick<WorkerEnv, 'MEDIA_SUPABASE_URL' | 'MEDIA_SUPABASE_ANON_KEY' | 'MEDIA_SUPABASE_SERVICE_ROLE_KEY'>
>;
type State = { config: Configuration; email: string; requestId: string; initialized: boolean };
const originalAdministrator = '此站点已有管理员，请使用原管理员邮箱和密码完成初始化。';

function publicKey(key: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  try {
    return (
      JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon' &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)
    );
  } catch {
    return false;
  }
}
const managed = (env: WorkerEnv) =>
  Boolean(env.MEDIA_SUPABASE_URL && env.MEDIA_SUPABASE_ANON_KEY && env.MEDIA_SUPABASE_SERVICE_ROLE_KEY);
function configuration(value: InstallationInput, env: WorkerEnv): Configuration {
  const config =
    managed(env) ?
      {
        MEDIA_SUPABASE_URL: env.MEDIA_SUPABASE_URL!,
        MEDIA_SUPABASE_ANON_KEY: env.MEDIA_SUPABASE_ANON_KEY!,
        MEDIA_SUPABASE_SERVICE_ROLE_KEY: env.MEDIA_SUPABASE_SERVICE_ROLE_KEY!
      }
    : {
        MEDIA_SUPABASE_URL: value.supabaseUrl?.trim() ?? '',
        MEDIA_SUPABASE_ANON_KEY: value.anonKey?.trim() ?? '',
        MEDIA_SUPABASE_SERVICE_ROLE_KEY: value.serviceRoleKey?.trim() ?? ''
      };
  if (
    !publicKey(config.MEDIA_SUPABASE_ANON_KEY) ||
    !config.MEDIA_SUPABASE_SERVICE_ROLE_KEY ||
    config.MEDIA_SUPABASE_SERVICE_ROLE_KEY === config.MEDIA_SUPABASE_ANON_KEY
  )
    reject(400, '请填写有效的 Supabase 公开 Key 和服务端密钥。');
  try {
    backend(config);
  } catch {
    reject(400, 'Supabase URL 必须为 HTTPS 项目地址，本机回环地址可用 HTTP。');
  }
  return config;
}

/** 两种部署共用的单实例安装状态机；持久状态不保存管理员密码。 */
export class Installation {
  private readonly sql: WorkerSql;
  private readonly env: WorkerEnv;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(ctx: { storage: { sql: WorkerSql } }, env: WorkerEnv) {
    this.sql = ctx.storage.sql;
    this.env = env;
    this.sql.exec(
      'CREATE TABLE IF NOT EXISTS media_installation (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)'
    );
  }
  fetch(request: Request): Promise<Response> {
    const operation = this.queue.then(() => endpoint(() => this.handle(request)));
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  private read(): State | null {
    const row = [...this.sql.exec<{ payload: string }>('SELECT payload FROM media_installation WHERE id=1')][0];
    return row ? JSON.parse(row.payload) : null;
  }
  private save(state: State) {
    this.sql.exec(
      'INSERT INTO media_installation VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
      JSON.stringify(state)
    );
  }
  private async handle(request: Request): Promise<unknown> {
    const state = this.read();
    if (new URL(request.url).pathname === '/internal/config') return state?.initialized ? state.config : null;
    if (request.method === 'GET') {
      const config = state?.initialized ? state.config : null;
      return {
        initialized: state?.initialized ?? false,
        managed: managed(this.env),
        bootstrapRequired: !state?.initialized,
        auth:
          config ?
            {
              url: this.env.MEDIA_PUBLIC_SUPABASE_URL ?? config.MEDIA_SUPABASE_URL,
              anonKey: config.MEDIA_SUPABASE_ANON_KEY,
              ...(this.env.MEDIA_PUBLIC_SUPABASE_URL ? { storageUrl: this.env.MEDIA_PUBLIC_SUPABASE_URL } : {})
            }
          : null
      } satisfies InstallationStatus;
    }
    if (request.method !== 'POST') reject(405, '只支持读取或提交初始化。');
    sameOriginWrite(request);
    if (state?.initialized) reject(409, '初始化已完成，请登录后台。');
    const value = fields<InstallationInput>(await body(request, 16384), [
      'email',
      'password',
      'bootstrapSecret',
      'supabaseUrl',
      'anonKey',
      'serviceRoleKey'
    ]);
    if (
      typeof value.bootstrapSecret !== 'string' ||
      value.bootstrapSecret.length < 32 ||
      value.bootstrapSecret !== this.env.MEDIA_INSTALLATION_BOOTSTRAP_SECRET
    )
      reject(403, '需要有效的部署初始化密钥。');
    if (
      typeof value.email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) ||
      value.email.length > 254 ||
      typeof value.password !== 'string' ||
      value.password.length < 12 ||
      value.password.length > 128
    )
      reject(400, '请输入管理员邮箱和 12 至 128 位密码。');
    if (
      ['supabaseUrl', 'anonKey', 'serviceRoleKey'].some(
        key => key in value && typeof value[key as keyof InstallationInput] !== 'string'
      )
    )
      reject(400, '服务配置无效。');
    const config = configuration(value, this.env);
    const email = value.email.trim().toLowerCase();
    if (state && JSON.stringify(state.config) !== JSON.stringify(config))
      reject(409, '上次提交的账号服务尚未确认，请使用原服务配置重试。');
    const client = backend(config);
    let existingAdministrator: boolean;
    try {
      await client.call('/auth/v1/settings', { privileged: false });
      await client.call('/rest/v1/media_installation_state?select=id&limit=1');
      const memberships = await client.call<{ user_id: string }[]>(
        '/rest/v1/media_admin_memberships?select=user_id&limit=1'
      );
      if (!Array.isArray(memberships)) throw new Error('Invalid administrator state');
      existingAdministrator = memberships.length > 0;
    } catch {
      reject(503, 'Supabase 连接检查失败，请核对项目密钥并完成数据库迁移后重试。');
    }
    const pending =
      state?.email === email ? state : { config, email, requestId: crypto.randomUUID(), initialized: false };
    this.save(pending);
    try {
      await this.grantAdministrator(client, pending, value.password, existingAdministrator);
    } catch (error) {
      if (error instanceof ProductApiError && [400, 401, 403, 409].includes(error.status))
        this.sql.exec('DELETE FROM media_installation WHERE id=1');
      throw error;
    }
    this.save({ ...pending, initialized: true });
    return { initialized: true };
  }
  private async grantAdministrator(
    client: ReturnType<typeof backend>,
    pending: State,
    password: string,
    existingAdministrator: boolean
  ) {
    const { email } = pending;
    if (!existingAdministrator) await this.ensureUser(client, email, password);
    const session = await client.call<{ user: { id: string } }>('/auth/v1/token?grant_type=password', {
      method: 'POST',
      privileged: false,
      payload: { email, password }
    });
    if (!uuid(session?.user?.id)) reject(502, '管理员账号验证失败。');
    if (existingAdministrator) {
      const authorized = await client.call('/rest/v1/rpc/media_admin_authorized', {
        method: 'POST',
        payload: { p_actor: session.user.id }
      });
      if (authorized !== true) reject(403, originalAdministrator);
    }
    const administrator = await client
      .call('/rest/v1/rpc/media_bootstrap_admin', {
        method: 'POST',
        payload: { p_target: session.user.id, p_request_id: pending.requestId }
      })
      .catch((error: unknown) => {
        if (error instanceof ProductApiError && error.status === 403) reject(403, originalAdministrator);
        throw error;
      });
    if (administrator !== session.user.id) reject(502, '管理员授权未确认。');
  }
  private async ensureUser(client: ReturnType<typeof backend>, email: string, password: string) {
    try {
      await client.call('/auth/v1/admin/users', { method: 'POST', payload: { email, password, email_confirm: true } });
    } catch (error) {
      if (!(error instanceof ProductApiError) || error.status !== 409) throw error;
    }
  }
}

/** 所有 Worker 实例通过同一持久对象读取安装结果。 */
export function installation(env: WorkerEnv) {
  return env.MEDIA_INSTALLATION?.get(env.MEDIA_INSTALLATION.idFromName('installation'));
}
