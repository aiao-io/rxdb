/**
 * POOL-US-102 AC#1 信令 hello 限流：短窗口覆盖（signal-hello 3 次/分钟）下，
 * 超限的新建连接被拒，其它账号不受影响。独立配置运行（playwright.demo.limits.chrome.mts）。
 */
import { expect, test, type Page } from '@playwright/test';
import { newAccount, openDevice } from './fixtures.ts';

/** 以登录身份开一条信令连接并握手，返回欢迎或拒绝。 */
const helloOnce = (page: Page): Promise<'welcome' | 'rejected'> =>
  page.evaluate(async () => {
    let token: string | null = null;
    let deviceId: string | null = null;
    for (const key of Object.keys(localStorage)) {
      let candidate: { access_token?: unknown } | null = null;
      try {
        candidate = JSON.parse(localStorage.getItem(key) ?? 'null') as { access_token?: unknown } | null;
      } catch {
        // 跳过非 JSON 的值
      }
      if (candidate && typeof candidate.access_token === 'string') token = candidate.access_token;
    }
    if (!token) throw new Error('no supabase session in localStorage');
    const payload = token.split('.')[1]!;
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    const userId = JSON.parse(atob(padded.replaceAll('-', '+').replaceAll('_', '/')))['sub'] as string;
    deviceId = localStorage.getItem(`dev-rxdb-p2p:device:${userId}`);
    if (!deviceId) throw new Error('no device registered in localStorage');

    const outcome = await new Promise<'welcome' | 'rejected'>((resolve, reject) => {
      const socket = new WebSocket(`ws://${location.host}/api/signal`);
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error('signaling handshake timed out'));
      }, 10_000);
      socket.onopen = () =>
        socket.send(
          JSON.stringify({
            type: 'hello',
            accessToken: token,
            deviceId,
            instanceId: crypto.randomUUID()
          })
        );
      socket.onmessage = event => {
        clearTimeout(timer);
        const message = JSON.parse(String(event.data)) as { type: string };
        socket.close();
        resolve(message.type === 'welcome' ? 'welcome' : 'rejected');
      };
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error('signaling socket error'));
      };
    });
    return outcome;
  }, undefined);

test.describe('信令限流（短窗口覆盖）', () => {
  test('AC#1 同一账号超频 hello 被拒，其它账号不受影响', async ({ browser }) => {
    const flooder = await openDevice(browser, newAccount('hello-flood'), 'sign-up');
    const bystander = await openDevice(browser, newAccount('hello-calm'), 'sign-up');

    // 覆盖策略 3 次/分钟：启动时已用 1 次，手动再连 2 次是上限内的，第 3 次被拒
    expect(await helloOnce(flooder.page)).toBe('welcome');
    expect(await helloOnce(flooder.page)).toBe('welcome');
    expect(await helloOnce(flooder.page)).toBe('rejected');

    // 其它账号不受影响
    expect(await helloOnce(bystander.page)).toBe('welcome');
  });
});
