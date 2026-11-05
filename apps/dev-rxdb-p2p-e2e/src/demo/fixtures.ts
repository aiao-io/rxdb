/**
 * dev-rxdb-p2p 验收夹具：一个浏览器上下文就是一台设备。
 *
 * @remarks
 * 信令 WebSocket 一开始就经 `routeWebSocket` 代理一层：`cutServer()` 才能断开已经建立的信令连接
 * （`route` 只拦新请求），并拒绝之后的重连；同时拦掉 Worker 的 `/api/**` 与 Supabase 的全部请求。
 */
import {
  expect,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type WebSocketRoute
} from '@playwright/test';

/** demo 服务的端口（wrangler dev，构建产物）。 */
export const DEMO_PORT = 4382;

const PASSWORD = 'p2p-e2e-password';

/** 一台设备。 */
export interface Device {
  readonly context: BrowserContext;
  readonly page: Page;
  /** 设备名（登记时生成）。 */
  readonly name: string;
  /** 中断这台设备到服务器（Worker 与 Supabase）的全部路由，包括已建立的信令连接。 */
  cutServer(): Promise<void>;
}

/** 每个用例一个新账号。 */
export const newAccount = (label: string): string =>
  `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

/** 开一台设备并登录（首台注册），等到信令在线。 */
export const openDevice = async (browser: Browser, email: string, action: 'sign-up' | 'sign-in'): Promise<Device> => {
  const context = await browser.newContext();
  const signaling: WebSocketRoute[] = [];
  let cut = false;
  await context.routeWebSocket(/\/api\/signal$/, async socket => {
    if (cut) {
      await socket.close({ code: 4000, reason: 'server cut by the test' });
      return;
    }
    socket.connectToServer();
    signaling.push(socket);
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(PASSWORD);
  await page.getByTestId(`login-${action}`).click();
  await expect(page.getByTestId('signaling-state')).toHaveAttribute('data-state', 'online');
  await expect(page.getByTestId('current-device')).not.toHaveText(/登记设备中/);
  const name = ((await page.getByTestId('current-device').textContent()) ?? '').trim();
  const supabaseUrl = await page.evaluate(
    () => (globalThis as { __P2P_CONFIG__?: { supabaseUrl: string } }).__P2P_CONFIG__?.supabaseUrl ?? ''
  );
  const cutServer = async (): Promise<void> => {
    cut = true;
    await context.route('**/api/**', route => route.abort());
    await context.route(`${supabaseUrl}/**`, route => route.abort());
    for (const socket of signaling) await socket.close({ code: 4000, reason: 'server cut by the test' });
  };
  return { context, page, name, cutServer };
};

/** 本设备持有的文件行（有「移除本机副本」按钮）。 */
const ownRows = (device: Device): Locator =>
  device.page.getByTestId('file-row').filter({ has: device.page.getByTestId('file-revoke') });

/** 生成一个测试文件并共享，返回文件名与内容哈希。 */
export const generateFile = async (
  device: Device,
  sizeMiB: 1 | 16,
  options: { readonly upload?: boolean } = {}
): Promise<{ readonly fileName: string; readonly contentHash: string }> => {
  const shareOptions = device.page.getByTestId('share-options');
  if ((await shareOptions.getAttribute('open')) === null) await shareOptions.locator('summary').click();
  if (options.upload) await device.page.getByTestId('upload-toggle').check();
  const before = await ownRows(device).count();
  await device.page.getByTestId(`generate-${sizeMiB}`).click();
  await expect(ownRows(device)).toHaveCount(before + 1);
  const row = ownRows(device).first();
  return {
    fileName: (await row.getAttribute('data-file')) as string,
    contentHash: (await row.getAttribute('data-hash')) as string
  };
};

/** 某个文件的行。 */
export const fileRow = (device: Device, fileName: string): Locator =>
  device.page.locator(`[data-testid="file-row"][data-file="${fileName}"]`);

/** 某个文件的下载卡片。 */
export const transferOf = (device: Device, fileName: string): Locator =>
  device.page.getByTestId('transfer').filter({ hasText: fileName });

/** 与某台在线设备建立会话，等它就绪。 */
export const connectTo = async (device: Device, peer: Device): Promise<void> => {
  await device.page.locator(`[data-testid="peer-row"][data-peer="${peer.name}"]`).getByTestId('peer-connect').click();
  const connectionDetails = device.page.getByTestId('connection-details');
  if ((await connectionDetails.getAttribute('open')) === null) await connectionDetails.locator('summary').click();
  await expect(
    device.page.locator('[data-testid="session-row"][data-state="ready"]').filter({ hasText: peer.name })
  ).toBeVisible();
};

/** 本设备 OPFS 里某个文件的 SHA-256：直接读落盘的字节，不经应用代码。 */
export const storedDigest = (device: Device, contentHash: string): Promise<string> =>
  device.page.evaluate(async hash => {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle('p2p-files');
    const file = await (await directory.getFileHandle(hash)).getFile();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
    return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
  }, contentHash);
