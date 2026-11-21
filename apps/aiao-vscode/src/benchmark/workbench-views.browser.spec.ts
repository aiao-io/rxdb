import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { WorkbenchLayout, WorkbenchViewLayout } from '../workbench/workbench-view-state.js';

interface Snapshot {
  readonly sidebar: readonly string[];
  readonly groups: readonly (readonly string[])[];
  readonly state: WorkbenchViewLayout;
  readonly original: boolean;
}

let browser: Browser;
let page: Page;
let directory: string;
let url: string;
let closeServer: () => Promise<void>;
const errors: string[] = [];
const app = resolve(import.meta.dirname, '../..');

const source = `
import { createWorkbenchLayout } from './src/workbench/workbench-layout.ts';
import { createWorkbenchDockview } from './src/workbench/workbench-dockview.ts';
const root = createWorkbenchLayout(document.body, location.origin + '/');
const dock = createWorkbenchDockview(root, { onSelectEditor() {}, onCloseEditor() {}, onSelectTool() {} });
dock.resetLayout();
const container = root.querySelector('[data-slot="files"]');
dock.views.addContainer({ id: 'explorer', element: container });
const originals = new Map();
for (const [id, title] of [['workspace', '工作区'], ['open-editors', '打开的编辑器']]) {
  const header = document.createElement('div');
  header.textContent = title;
  header.style.padding = '0 12px';
  const element = document.createElement('div');
  element.className = 'wb-view-body wb-tree';
  element.innerHTML = '<input aria-label="' + id + '" value="未提交内容">';
  dock.views.addView({ id, title, header, element, containerId: 'explorer', size: 240 });
  originals.set(id, element);
}
globalThis.viewProbe = (action, payload) => {
  if (action === 'serialize') return dock.serializeLayout();
  if (action === 'restore') return dock.applyLayout(payload);
  if (action === 'hide') return dock.views.setVisible(payload, false);
  if (action === 'reset') return dock.views.reset();
  if (action === 'toggle') return dock.toggleTools();
  if (action === 'snapshot') return {
    sidebar: dock.views.getContainerApi('explorer').panels.map(panel => panel.id),
    groups: dock.api.groups.filter(group => group.id !== 'sidebar').map(group => group.panels.map(panel => panel.id)),
    state: dock.views.serialize(),
    original: [...originals].every(([id, body]) => dock.views.getView(id).element === body)
  };
  throw new Error('Unknown action: ' + action);
};
`;

function probe<T>(action: string, payload?: unknown): Promise<T> {
  return page.evaluate(
    ({ action, payload }) => {
      const target = globalThis as unknown as { viewProbe(action: string, payload?: unknown): T };
      return target.viewProbe(action, payload);
    },
    { action, payload }
  );
}

const snapshot = (): Promise<Snapshot> => probe('snapshot');
const heading = (id: string): Locator => page.locator(`.wb-view-heading[data-view-header="${id}"]`);
const tab = (id: string): Locator => page.locator(`.wb-dock-tab[data-panel="${id}"]`);

async function bounds(locator: Locator) {
  const value = await locator.boundingBox();
  if (!value) throw new Error('拖放目标不可见');
  return value;
}

async function drag(source: Locator, target: Locator, x = 0.5, y = 0.5): Promise<void> {
  const from = await bounds(source);
  const to = await bounds(target);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 6, { steps: 4 });
  await page.mouse.move(to.x + to.width * x, to.y + to.height * y, { steps: 24 });
  await page.mouse.move(to.x + to.width * x + 1, to.y + to.height * y, { steps: 2 });
  await page.mouse.up();
}

describe('Paneview 与 Dockview 双向拖放（Chromium）', () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'aiao-workbench-views-'));
    await build({
      stdin: { contents: source, resolveDir: app },
      outfile: join(directory, 'probe.js'),
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022'
    });
    const server = createServer(async (request, response) => {
      if (request.url === '/') {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(
          '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;}</style><script type="module" src="/probe.js"></script>'
        );
      } else if (request.url === '/probe.js') {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(await readFile(join(directory, 'probe.js')));
      } else if (request.url === '/styles/dockview.css') {
        response.setHeader('Content-Type', 'text/css');
        response.end(await readFile(join(app, 'public/browser-workbench-assets/styles/dockview.css')));
      } else response.writeHead(404).end();
    });
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    closeServer = () => new Promise<void>((done, reject) => server.close(error => (error ? reject(error) : done())));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('缺少测试服务地址');
    url = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(5000);
  });

  beforeEach(async () => {
    errors.length = 0;
    await page.goto(url);
    await heading('workspace').waitFor({ state: 'visible' });
  });

  afterEach(() => expect(errors).toEqual([]));
  afterAll(async () => {
    await browser?.close();
    await closeServer?.();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it('拖分隔线调高，折叠后恢复展开高度', async () => {
    const before = (await snapshot()).state.views['workspace']!.size;
    const second = await bounds(heading('open-editors'));
    await page.mouse.move(second.x + second.width / 2, second.y - 1);
    await page.mouse.down();
    await page.mouse.move(second.x + second.width / 2, second.y + 90, { steps: 16 });
    await page.mouse.up();
    await expect.poll(async () => (await snapshot()).state.views['workspace']!.size).toBeGreaterThan(before + 60);
    const expanded = (await snapshot()).state.views['workspace']!.size;
    await heading('workspace').click();
    await expect.poll(async () => (await snapshot()).state.views['workspace']!.expanded).toBe(false);
    await heading('workspace').click();
    await expect.poll(async () => (await snapshot()).state.views['workspace']!.size).toBe(expanded);
  });

  it('标题排序、拖进终端标签、放回侧栏，正文和输入保持原实例', async () => {
    await page.getByRole('textbox', { name: 'workspace', exact: true }).fill('拖动前的草稿');
    await drag(heading('open-editors'), heading('workspace'), 0.5, 0.1);
    await expect.poll(async () => (await snapshot()).sidebar).toEqual(['open-editors', 'workspace']);
    await drag(heading('workspace'), tab('terminal'), 0.2);
    await expect.poll(async () => (await snapshot()).state.views['workspace']!.detached).toBe(true);
    const group = (await snapshot()).groups.find(group => group.includes('workspace'))!;
    expect(group.indexOf('workspace')).toBeLessThan(group.indexOf('terminal'));
    expect(await page.getByRole('textbox', { name: 'workspace', exact: true }).inputValue()).toBe('拖动前的草稿');
    const saved = await probe<WorkbenchLayout>('serialize');
    await probe('reset');
    expect(await probe('restore', saved)).toBe(true);
    await tab('workspace').click();
    await drag(tab('workspace'), heading('open-editors'), 0.5, 0.1);
    await expect.poll(async () => (await snapshot()).sidebar).toEqual(['workspace', 'open-editors']);
    expect((await snapshot()).original).toBe(true);
    expect(await page.getByRole('textbox', { name: 'workspace', exact: true }).inputValue()).toBe('拖动前的草稿');
  });

  it('内容边缘落点创建相邻分组，最后一个视图移出后还能放回空侧栏', async () => {
    await probe('hide', 'open-editors');
    await drag(heading('workspace'), page.locator('[data-log="problems"]'), 0.95, 0.5);
    await expect.poll(async () => (await snapshot()).state.views['workspace']!.detached).toBe(true);
    expect((await snapshot()).groups.find(group => group.includes('workspace'))).toEqual(['workspace']);
    expect((await snapshot()).sidebar).toEqual([]);
    await drag(tab('workspace'), page.locator('[data-view-container="explorer"]'), 0.5, 0.3);
    await expect.poll(async () => (await snapshot()).sidebar).toEqual(['workspace']);
  });

  it('取消拖动保持顺序和归属，标题键盘操作仍能折叠', async () => {
    const from = await bounds(heading('workspace'));
    await page.mouse.move(from.x + 100, from.y + 14);
    await page.mouse.down();
    await page.mouse.move(from.x + 400, from.y + 100, { steps: 16 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    expect((await snapshot()).sidebar).toEqual(['workspace', 'open-editors']);
    expect((await snapshot()).state.views['workspace']!.detached).toBe(false);
    await heading('workspace').focus();
    await page.keyboard.press('ArrowLeft');
    await expect.poll(async () => (await snapshot()).state.views['workspace']!.expanded).toBe(false);
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await snapshot()).state.views['workspace']!.expanded).toBe(true);
  });

  it('触摸指针可以在侧栏和底部标签间双向拖动', async () => {
    const desktop = page;
    page = await browser.newPage({ viewport: { width: 1200, height: 900 }, hasTouch: true });
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(url);
      await heading('workspace').waitFor({ state: 'visible' });
      const cdp = await page.context().newCDPSession(page);
      const touchDrag = async (source: Locator, target: Locator): Promise<void> => {
        const from = await bounds(source);
        const to = await bounds(target);
        const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        for (let index = 1; index <= 16; index++) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
              {
                x: start.x + ((to.x + to.width * 0.1 - start.x) * index) / 16,
                y: start.y + ((to.y + to.height * 0.5 - start.y) * index) / 16
              }
            ]
          });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      await touchDrag(heading('workspace'), tab('terminal'));
      await expect.poll(async () => (await snapshot()).state.views['workspace']!.detached).toBe(true);
      await touchDrag(tab('workspace'), heading('open-editors'));
      await expect.poll(async () => (await snapshot()).sidebar).toEqual(['workspace', 'open-editors']);
    } finally {
      await page.context().close();
      page = desktop;
    }
  });
});
