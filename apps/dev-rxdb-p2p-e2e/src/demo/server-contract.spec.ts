/**
 * 认证合同的服务端半边（US-704 AC#9、US-706 AC#2 / AC#6）：直接打 Worker 与 Supabase，不经浏览器。
 * Supabase 地址与 anon key 取自 Worker 下发的 `/app-config.js`，与前端看到的是同一份。
 */
import { expect, test, type APIRequestContext } from '@playwright/test';
import { DEMO_PORT, newAccount } from './fixtures.ts';

interface Account {
  readonly id: string;
  readonly token: string;
  readonly deviceId: string;
}

const ORIGIN = `http://127.0.0.1:${DEMO_PORT}`;

const configOf = async (request: APIRequestContext): Promise<{ supabaseUrl: string; supabaseAnonKey: string }> => {
  const script = await (await request.get(`${ORIGIN}/app-config.js`)).text();
  return JSON.parse(/=\s*(\{.*\});/.exec(script)?.[1] ?? '{}') as { supabaseUrl: string; supabaseAnonKey: string };
};

const holderIdOf = async (principal: string, deviceId: string): Promise<string> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([principal, deviceId])))
  );
  return `holder_${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
};

const signUpWithDevice = async (request: APIRequestContext, label: string): Promise<Account> => {
  const { supabaseUrl, supabaseAnonKey } = await configOf(request);
  const signUp = await request.post(`${supabaseUrl}/auth/v1/signup`, {
    headers: { apikey: supabaseAnonKey },
    data: { email: newAccount(label), password: 'p2p-e2e-password' }
  });
  const session = (await signUp.json()) as { access_token: string; user: { id: string } };
  const device = await request.post(`${supabaseUrl}/rest/v1/devices`, {
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${session.access_token}`,
      'content-profile': 'p2p',
      prefer: 'return=representation'
    },
    data: { name: `${label} device` }
  });
  const [row] = (await device.json()) as { id: string }[];
  return { id: session.user.id, token: session.access_token, deviceId: (row as { id: string }).id };
};

/** 发一条 hello，返回服务端的第一条应答。 */
const helloReply = (hello: Record<string, string>): Promise<{ type: string; code?: string }> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${DEMO_PORT}/api/signal`);
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', ...hello }));
    socket.onmessage = event => {
      resolve(JSON.parse(String(event.data)) as { type: string; code?: string });
      socket.close();
    };
    socket.onerror = () => reject(new Error('signaling socket failed'));
  });

test.describe('dev-rxdb-p2p 认证合同', () => {
  test('US-706 AC#6 清单写入口拒绝他人设备派生的 holderId', async ({ request }) => {
    const { supabaseUrl, supabaseAnonKey } = await configOf(request);
    const alice = await signUpWithDevice(request, 'alice');
    const bob = await signUpWithDevice(request, 'bob');
    const insert = async (holderId: string) =>
      request.post(`${supabaseUrl}/rest/v1/p2p_file_manifest`, {
        headers: { apikey: supabaseAnonKey, authorization: `Bearer ${alice.token}`, 'content-profile': 'p2p' },
        data: {
          id: crypto.randomUUID(),
          contentHash: 'e'.repeat(64),
          fileName: 'contract.bin',
          size: 1,
          chunkSize: 1,
          chunkHashes: ['f'.repeat(64)],
          holderId
        }
      });

    expect((await insert(await holderIdOf(alice.id, alice.deviceId))).status()).toBe(201);
    expect((await insert(await holderIdOf(bob.id, bob.deviceId))).status()).toBe(403);
  });

  test('US-704 AC#9 信令拒绝伪造的 token 与冒用他人的设备，通用拒绝不带细节', async ({ request }) => {
    const alice = await signUpWithDevice(request, 'alice');
    const bob = await signUpWithDevice(request, 'bob');

    await expect(helloReply({ accessToken: alice.token, deviceId: alice.deviceId, instanceId: 'a-1' })).resolves.toMatchObject({
      type: 'welcome'
    });
    await expect(helloReply({ accessToken: 'forged', deviceId: alice.deviceId, instanceId: 'm-1' })).resolves.toEqual({
      type: 'error',
      code: 'unauthorized',
      message: 'invalid access token or device'
    });
    await expect(helloReply({ accessToken: bob.token, deviceId: alice.deviceId, instanceId: 'm-2' })).resolves.toEqual({
      type: 'error',
      code: 'unauthorized',
      message: 'invalid access token or device'
    });
  });

  test('US-706 AC#2 服务器回退的文件接口要求认证', async ({ request }) => {
    const response = await request.get(`${ORIGIN}/api/files/${'a'.repeat(64)}`);

    expect(response.status()).toBe(401);
  });
});
