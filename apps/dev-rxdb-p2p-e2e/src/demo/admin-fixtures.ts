/**
 * 管理后台验收的服务端夹具（US-713）：以不同身份直接打 Worker 与 Supabase，不经浏览器。
 *
 * @remarks
 * service role key 取自 `e2e-serve.sh` 写下的 `.dev.vars`——Worker 用的就是这一把，测试用它读数据库的真实状态，
 * 断言处置的结果落在了库里，而不只是界面上变了。
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ACCOUNT_PASSWORD, DEMO_PORT, newAccount } from './fixtures.ts';

/** Worker 的地址。 */
export const ORIGIN = `http://127.0.0.1:${DEMO_PORT}`;

const DEV_VARS = new URL('../../../dev-rxdb-p2p/.dev.vars', import.meta.url);

/** 一个已登记设备的账号。 */
export interface Account {
  readonly id: string;
  readonly email: string;
  readonly token: string;
  readonly deviceId: string;
}

const devVar = (name: string): string => {
  const value = new RegExp(`^${name}=(.+)$`, 'm').exec(readFileSync(DEV_VARS, 'utf8'))?.[1];
  if (!value) throw new Error(`${name} is not in apps/dev-rxdb-p2p/.dev.vars`);
  return value;
};

/** Supabase 的地址与 anon key：取自 Worker 下发的 `/app-config.js`，与前端看到的是同一份。 */
export const supabaseOf = async (request: APIRequestContext): Promise<{ url: string; anonKey: string }> => {
  const script = await (await request.get(`${ORIGIN}/app-config.js`)).text();
  const config = JSON.parse(/=\s*(\{.*\});/.exec(script)?.[1] ?? '{}') as {
    supabaseUrl: string;
    supabaseAnonKey: string;
  };
  return { url: config.supabaseUrl, anonKey: config.supabaseAnonKey };
};

/** 邮箱 + 密码登录，返回 access token 与用户 id。 */
export const signIn = async (
  request: APIRequestContext,
  email: string,
  password: string = ACCOUNT_PASSWORD
): Promise<{ readonly token: string; readonly userId: string }> => {
  const { url, anonKey } = await supabaseOf(request);
  const response = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey },
    data: { email, password }
  });
  const body = (await response.json()) as { access_token?: string; user?: { id: string } };
  if (!body.access_token || !body.user) throw new Error(`sign-in as ${email} failed: ${response.status()}`);
  return { token: body.access_token, userId: body.user.id };
};

/** 以管理员（或别的身份）调 `/api/admin/*`。 */
export const adminCall = (
  request: APIRequestContext,
  token: string | null,
  method: 'GET' | 'POST' | 'DELETE',
  path: string
): Promise<APIResponse> =>
  request.fetch(`${ORIGIN}/api/admin${path}`, { method, headers: token ? { authorization: `Bearer ${token}` } : {} });

const serviceHeaders = (profile?: 'p2p'): Record<string, string> => {
  const key = devVar('SUPABASE_SERVICE_ROLE_KEY');
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    ...(profile ? { 'accept-profile': profile, 'content-profile': profile } : {})
  };
};

/** 以 service role 读 PostgREST 的一张 p2p 表。 */
export const readTable = async <T>(request: APIRequestContext, table: string, query: string): Promise<T[]> => {
  const { url } = await supabaseOf(request);
  const response = await request.get(`${url}/rest/v1/${table}?${query}`, { headers: serviceHeaders('p2p') });
  return (await response.json()) as T[];
};

/** 以某个身份调 `p2p` schema 里的数据库函数（PostgREST RPC）。 */
export const callFunction = async (
  request: APIRequestContext,
  as: 'anon' | 'service' | { readonly token: string },
  name: string,
  args: object = {}
): Promise<APIResponse> => {
  const { url, anonKey } = await supabaseOf(request);
  const headers =
    as === 'service' ?
      serviceHeaders('p2p')
    : {
        apikey: anonKey,
        authorization: `Bearer ${as === 'anon' ? anonKey : as.token}`,
        'content-profile': 'p2p'
      };
  return request.post(`${url}/rest/v1/rpc/${name}`, { headers, data: args });
};

/** 账号在 Supabase Auth 里是否还在。 */
export const accountExists = async (request: APIRequestContext, userId: string): Promise<boolean> => {
  const { url } = await supabaseOf(request);
  const response = await request.get(`${url}/auth/v1/admin/users/${userId}`, { headers: serviceHeaders() });
  return response.status() === 200;
};

/** `holderId` 的派生：与 `p2p.holder_id` 及 `@aiao/rxdb-plugin-p2p` 的 `deriveHolderId` 相同。 */
export const holderIdOf = async (principal: string, deviceId: string): Promise<string> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([principal, deviceId])))
  );
  return `holder_${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
};

/** 某台设备持有的声明条数（以 service role 直接读库）。 */
export const claimCount = async (request: APIRequestContext, holderId: string): Promise<number> =>
  (await readTable<{ id: string }>(request, 'p2p_file_manifest', `holderId=eq.${holderId}&select=id`)).length;

/** 某个账号登记的设备 id。 */
export const devicesOf = async (request: APIRequestContext, userId: string): Promise<string[]> =>
  (await readTable<{ id: string }>(request, 'devices', `user_id=eq.${userId}&select=id`)).map(row => row.id);

/** 经 REST 注册一个账号、登记一台设备并为它写一条持有声明（不开浏览器）。 */
export const signUpWithClaim = async (request: APIRequestContext, label: string): Promise<Account> => {
  const { url, anonKey } = await supabaseOf(request);
  const email = newAccount(label);
  const signUp = await request.post(`${url}/auth/v1/signup`, {
    headers: { apikey: anonKey },
    data: { email, password: ACCOUNT_PASSWORD }
  });
  const session = (await signUp.json()) as { access_token: string; user: { id: string } };
  const asUser = {
    apikey: anonKey,
    authorization: `Bearer ${session.access_token}`,
    'content-profile': 'p2p',
    prefer: 'return=representation'
  };
  const device = await request.post(`${url}/rest/v1/devices`, { headers: asUser, data: { name: `${label} device` } });
  const [row] = (await device.json()) as { id: string }[];
  const deviceId = (row as { id: string }).id;
  await request.post(`${url}/rest/v1/p2p_file_manifest`, {
    headers: asUser,
    data: {
      id: crypto.randomUUID(),
      contentHash: 'e'.repeat(64),
      fileName: `${label}.bin`,
      size: 1,
      chunkSize: 1,
      chunkHashes: ['f'.repeat(64)],
      holderId: await holderIdOf(session.user.id, deviceId)
    }
  });
  return { id: session.user.id, email, token: session.access_token, deviceId };
};

/**
 * 负向断言用：等一段足以让（不该发生的）自动重连发生的时间。信令客户端的重连间隔是 2 秒，
 * 等两个多周期还没有新连接，才说明它确实不再重连。
 */
export const outwait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** 发一条 hello，返回服务端的第一条应答。 */
export const helloReply = (hello: Record<string, string>): Promise<{ type: string; code?: string }> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${DEMO_PORT}/api/signal`);
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', ...hello }));
    socket.onmessage = event => {
      resolve(JSON.parse(String(event.data)) as { type: string; code?: string });
      socket.close();
    };
    socket.onerror = () => reject(new Error('signaling socket failed'));
  });
