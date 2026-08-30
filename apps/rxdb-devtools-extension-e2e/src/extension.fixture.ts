import { workspaceRoot } from '@nx/devkit';
import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { join } from 'node:path';

/** 由 `tools/prepare.mjs` 打好 variance 的扩展副本。 */
const EXTENSION_PATH = join(workspaceRoot, 'dist/apps/rxdb-devtools-extension-e2e/extension');

/** fixture 页面 origin；与 `playwright.config.ts` 的 webServer 一致。 */
export const FIXTURE_ORIGIN = 'http://localhost:8210';

export interface ExtensionFixtures {
  /** 加载了 unpacked 扩展的持久化上下文。 */
  context: BrowserContext;
  /** 扩展 id，从真实 service worker 的 URL 上取。 */
  extensionId: string;
  /** 扩展的 MV3 service worker，可在其中求值以观察 background 行为。 */
  serviceWorker: Worker;
}

/**
 * 打开面板页并补上 `chrome.devtools.*`。
 *
 * @remarks
 * **这是本套件唯一的 variance，必须写在故事里**：Playwright（以及任何 CDP 客户端）
 * 都打不开 DevTools 自己的面板宿主，`chrome.devtools` 只在那个宿主里存在。所以面板
 * 被当作普通扩展页打开，只补出宿主 API 的那几项——`tabId`、`eval('location.href')`
 * 与导航事件。
 *
 * 补的是**宿主**，不是被测物：Port 是真的 `chrome.runtime.connect`，background 是真的
 * service worker，bridge 是真的 `chrome.scripting` 注入，页面消息是真的
 * `window.postMessage`。AC#36 / #41 缺的正是这四段的真实投递，而不是 DevTools 宿主本身。
 *
 * @param context - 已加载扩展的上下文。
 * @param extensionId - 扩展 id。
 * @param inspectedUrl - 被检查页面的 URL；面板据此求 host permission pattern。
 * @param tabId - 被检查页面的 tabId。
 * @returns 已就绪的面板页。
 */
export async function openPanel(
  context: BrowserContext,
  extensionId: string,
  inspectedUrl: string,
  tabId: number
): Promise<Page> {
  const panel = await context.newPage();
  await panel.addInitScript(
    ({ url, id }: { url: string; id: number }) => {
      // onNavigated **不能**桩成 no-op：页面刷新会带走 `chrome.scripting` 注入的 bridge，
      // 面板正是靠这个事件复核权限并重新注入（`notifyNavigation` → `refresh` → `activateTab`）。
      // 空实现会让「刷新后永久失联」变成测试自己造出来的假象。
      const navigated = new Set<(url: string) => void>();
      (globalThis as unknown as { __emitNavigated: (url: string) => void }).__emitNavigated = target =>
        navigated.forEach(listener => listener(target));
      (globalThis as unknown as { chrome: Record<string, unknown> }).chrome = Object.assign(
        (globalThis as unknown as { chrome?: Record<string, unknown> }).chrome ?? {},
        {
          devtools: {
            network: {
              onNavigated: {
                addListener: (listener: (url: string) => void) => navigated.add(listener),
                removeListener: (listener: (url: string) => void) => navigated.delete(listener)
              }
            },
            panels: { create: () => undefined },
            inspectedWindow: {
              tabId: id,
              reload: () => undefined,
              eval: (code: string, callback: (result: unknown, info?: unknown) => void) => {
                callback(code === 'location.href' ? url : undefined, undefined);
              }
            }
          }
        }
      );
    },
    { url: inspectedUrl, id: tabId }
  );
  await panel.goto(`chrome-extension://${extensionId}/panel.html`);
  return panel;
}

export const test = base.extend<ExtensionFixtures>({
  // Playwright 靠解构模式推断 fixture 依赖，第一个参数必须是解构而不能是普通标识符，
  // 空依赖只能写成空解构——这条 lint 规则和那条框架约束在此处不可兼得。
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    // 扩展只能在持久化上下文里加载；`--headless=new` 的 Chromium 支持扩展，
    // 因此本套件不需要有头模式，本机与 CI 走同一条路径。
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION_PATH}`, `--load-extension=${EXTENSION_PATH}`]
    });
    await use(context);
    await context.close();
  },
  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(worker);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  }
});

export { expect } from '@playwright/test';
