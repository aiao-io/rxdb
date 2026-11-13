import type { CreditEntry } from '@aiao-media/api-contracts';
import { expect, type BrowserContext, type Page, type Request } from '@playwright/test';
import { sealRelayAnswer } from './local-first.helpers.ts';

export const platformAuthUrl = 'https://generation-auth.example.test';
export const platformUserId = '10000000-0000-4000-8000-000000000099';
export const platformModel = { id: 'standard', name: '平台测试模型', credits: 3, protocol: 'openai' };
const user = {
  id: platformUserId,
  email: 'creator@example.test',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-11-13T00:00:00Z'
};
const accounts = new WeakMap<BrowserContext, PlatformFixture>();
interface PlatformFixture {
  balance: number;
  reserved: number;
  entries: CreditEntry[];
  token: string;
  expiresAt: number;
}
export async function setupPlatform(
  context: BrowserContext,
  options: { signedIn?: boolean; balance?: number; protocol?: 'openai' | 'minimax' } = {}
) {
  const existing = accounts.get(context);
  const exp = existing?.expiresAt ?? Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp, aud: 'authenticated', role: 'authenticated' })}.c2lnbmF0dXJl`;
  const session = {
    access_token: token,
    refresh_token: 'fixture-platform-refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user
  };
  const state: PlatformFixture = existing ?? {
    balance: options.balance ?? 1000, reserved: 0, entries: [], token, expiresAt: exp
  };
  state.balance = options.balance ?? state.balance;
  accounts.set(context, state);
  await context.addInitScript(
    ({ session, url, signedIn }) => {
      const config = { url, anonKey: 'sb_publishable_generation_fixture' };
      Object.defineProperty(globalThis, '__AIAO_SUPABASE_CONFIG__', {
        configurable: true, get: () => config, set: () => undefined
      });
      if (!signedIn || localStorage.getItem('platform-fixture-seeded')) return;
      localStorage.setItem(`aiao-media-supabase-session-v1:${encodeURIComponent(url)}`, JSON.stringify(session));
      localStorage.setItem('platform-fixture-seeded', '1');
    },
    { session, url: platformAuthUrl, signedIn: options.signedIn !== false }
  );
  await context.route(`${platformAuthUrl}/auth/v1/**`, route =>
    route.fulfill({ json: route.request().url().endsWith('/user') ? user : session })
  );
  await context.route(`${platformAuthUrl}/rest/v1/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/media_workspaces')) return route.fulfill({ json: [] });
    if (path.endsWith('/media_sync_capabilities'))
      return route.fulfill({ json: { protocol: 1, rls: true, metadataOnly: true } });
    throw new Error(`未授权的同步请求：${path}`);
  });
  await context.route('**/api/models', route =>
    route.fulfill({ json: { models: [{ ...platformModel, protocol: options.protocol ?? 'openai' }] } })
  );
  await context.route('**/api/credits', route => {
    expect(route.request().headers()['authorization']).toBe(`Bearer ${token}`);
    return route.fulfill({
      json: {
        account: { balance: state.balance, reserved: state.reserved, available: state.balance - state.reserved },
        entries: state.entries
      }
    });
  });
  return state;
}

interface ModelAnswer {
  json?: unknown;
  status?: number;
  failure?: string;
}
interface FixtureTask {
  id: string;
  token: string;
  status: 'dispatched' | 'received' | 'rejected' | 'needs_review';
  upstreamStatus: number | null;
  answer: unknown;
  credit: 'reserved' | 'charged' | 'released';
  done: Promise<void>;
}
export async function taskFixture(
  target: Page | BrowserContext,
  produce: (request: Request) => ModelAnswer | Promise<ModelAnswer>
) {
  const context = 'context' in target ? target.context() : target;
  const account = accounts.get(context);
  if (!account) throw new Error('先调用 setupPlatform');
  const tasks = new Map<string, FixtureTask>();
  const abandoned = new Set<string>();
  let calls = 0;
  const view = (task: FixtureTask) => ({
    status: task.status,
    upstreamStatus: task.upstreamStatus,
    updatedAt: new Date().toISOString()
  });
  await target.route('**/api/relay/tasks/**', async route => {
    const page = route.request().frame().page();
    try {
    const request = route.request();
    const [, id, action = ''] = /\/api\/relay\/tasks\/([^/?]+)(\/\w+)?/.exec(new URL(request.url()).pathname) ?? [];
    const token = request.headers()['x-relay-task-token'];
    let task = tasks.get(id);
    if (request.method() === 'PUT') {
      expect(request.headers()['authorization']).toBe(`Bearer ${account.token}`);
      expect(request.headers()['x-provider-base']).toBeUndefined();
      expect(request.postDataJSON()).toMatchObject({ model: platformModel.id, n: 1 });
      if (abandoned.has(id)) return route.fulfill({ status: 409 });
      if (task) return route.fulfill({ json: view(task) });
      if (account.balance - account.reserved < platformModel.credits) return route.fulfill({ status: 402 });
      calls++;
      account.reserved += platformModel.credits;
      task = {
        id,
        token,
        status: 'dispatched',
        upstreamStatus: null,
        answer: null,
        credit: 'reserved',
        done: Promise.resolve()
      };
      tasks.set(id, task);
      const active = task;
      active.done = Promise.resolve().then(async () => {
        const answer = await produce(request);
        active.upstreamStatus = answer.failure ? null : (answer.status ?? 200);
        active.status =
          answer.failure || (answer.status ?? 200) >= 500 ? 'needs_review'
          : (answer.status ?? 200) >= 400 ? 'rejected'
          : 'received';
        active.answer = answer.json;
        if (active.status !== 'received') {
          account.reserved -= platformModel.credits;
          active.credit = 'released';
        }
      });
      return route.fulfill({ status: 202, json: view(active) });
    }
    expect(request.headers()['authorization']).toBeUndefined();
    if (action === '/abandon' && !task) {
      abandoned.add(id);
      return route.fulfill({ status: 404 });
    }
    if (!task || token !== task.token) return route.fulfill({ status: 404 });
    if (action === '/result')
      return route.fulfill({ body: await sealRelayAnswer(task, task.answer), contentType: 'application/octet-stream' });
    if (action === '/confirm' || action === '/discard') {
      if (task.credit === 'reserved') {
        account.reserved -= platformModel.credits;
        task.credit = action === '/confirm' ? 'charged' : 'released';
        if (task.credit === 'charged') {
          account.balance -= platformModel.credits;
          account.entries.unshift({
            id: account.entries.length + 1,
            user_id: platformUserId,
            actor_id: platformUserId,
            request_id: id,
            source: 'generation',
            delta: -platformModel.credits,
            balance_after: account.balance,
            reason: '平台生成',
            created_at: new Date().toISOString()
          });
        }
      }
      return route.fulfill({ json: view(task) });
    }
    if (request.method() === 'DELETE') {
      tasks.delete(id);
      return route.fulfill({ status: 204 });
    }
    if (task.status === 'dispatched') await Promise.race([task.done, new Promise(resolve => setTimeout(resolve, 100))]);
    return route.fulfill({ json: view(task) });
    } catch (error) {
      if (!page.isClosed()) throw error;
    }
  });
  return {
    tasks,
    abandoned,
    get calls() {
      return calls;
    },
    account
  };
}

export async function platformAccount(page: Page) {
  await page.goto('/providers');
  await expect(page.getByRole('heading', { name: '平台生图与积分', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '我的账号', exact: true })).toBeVisible();
}
