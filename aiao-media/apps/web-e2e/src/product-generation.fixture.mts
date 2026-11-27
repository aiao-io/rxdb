import { expect, type Page, type Route } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sealRelayAnswer } from './local-first.helpers';

/** Auth 使用真实本地服务；模型、积分与延迟任务交付使用受控 fixture。 */
export async function productGenerationFixture(
  page: Page,
  admin: SupabaseClient,
  png: Buffer,
  gate: Promise<void>,
  started: () => void
) {
  const model = { id: 'standard', name: '平台测试模型', credits: 3, protocol: 'openai' };
  const tasks = new Map<string, { id: string; token: string }>();
  let completed = false;
  void gate.then(() => {
    completed = true;
  });
  const view = () => ({
    status: completed ? 'received' : 'dispatched',
    upstreamStatus: completed ? 200 : null,
    updatedAt: new Date().toISOString()
  });
  await page.route('**/api/models', route => route.fulfill({ json: { models: [model] } }));
  await page.route('**/api/credits', async route => {
    const authorization = route.request().headers()['authorization'];
    expect(authorization).toMatch(/^Bearer /);
    const user = await admin.auth.getUser(authorization.slice(7));
    expect(user.error).toBeNull();
    expect(user.data.user).not.toBeNull();
    await route.fulfill({ json: { account: { balance: 100, reserved: 0, available: 100 }, entries: [] } });
  });
  const reply = async (route: Route) => {
    const request = route.request();
    const [, id, action = ''] = /\/api\/relay\/tasks\/([^/?]+)(\/\w+)?/.exec(new URL(request.url()).pathname) ?? [];
    const token = request.headers()['x-relay-task-token'];
    if (request.method() === 'PUT') {
      expect(request.headers()['x-provider-base']).toBeUndefined();
      expect(request.postDataJSON()).toMatchObject({ model: model.id, n: 1 });
      const authorization = request.headers()['authorization'];
      expect(authorization).toMatch(/^Bearer /);
      expect((await admin.auth.getUser(authorization.slice(7))).error).toBeNull();
      tasks.set(id, tasks.get(id) ?? { id, token });
      started();
      await route.fulfill({ status: 202, json: view() });
      return;
    }
    expect(request.headers()['authorization']).toBeUndefined();
    const task = tasks.get(id);
    if (!task || token !== task.token) {
      await route.fulfill({ status: 404 });
      return;
    }
    if (action === '/result') {
      expect(completed).toBe(true);
      await route.fulfill({
        contentType: 'application/octet-stream',
        body: await sealRelayAnswer(task, { data: [{ b64_json: png.toString('base64') }] })
      });
      return;
    }
    if (request.method() === 'DELETE') {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({ json: view() });
  };
  await page.route('**/api/relay/tasks/**', route =>
    reply(route).catch(error => {
      if (!page.isClosed()) throw error;
    })
  );
  return {
    get calls() {
      return tasks.size;
    }
  };
}
