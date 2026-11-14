import { expect, test } from '@playwright/test';
import type { ListTable } from '@visactor/vtable';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { workspaceRoot } from '@nx/devkit';
import path from 'node:path';
import os from 'node:os';
const p95 = (values: number[]) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1];
const evidence = async (name: string, result: unknown) => { await mkdir('test-output/evidence', { recursive: true }); await writeFile(`test-output/evidence/${name}.json`, JSON.stringify(result, null, 2)); };
async function source() { return JSON.parse(await readFile(path.join(workspaceRoot, 'apps/aiao-bom-2/public/data/windrose.json'), 'utf8')) as { id: string; title: string; vehicle: { url: string }; parts: { id: string; inBom: boolean }[]; structures: { catalog: Record<string, unknown>[] } }; }

test('50k 数据就绪到 20 列首屏可操作，20 次独立页面采样', async ({ page }) => {
  test.setTimeout(240000);
  const data = await source(); data.id = 'stress-first-50000'; data.vehicle.url = '';
  data.structures.catalog = Array.from({ length: 50000 }, (_, i) => ({ key: `first:${i}`, parentKey: i ? `first:${Math.floor((i - 1) / 8)}` : null, partId: data.parts[i % data.parts.length].id, compId: `ST-${i}`, kind: i ? 'part' : 'assembly', source: 'catalog', markets: ['EU'], quantity: '1', quantityState: 'confirmed', uom: 'pcs', sourceRef: `synthetic:${i}` }));
  await page.route('**/data/windrose.json', route => route.fulfill({ json: data }));
  await page.goto('/'); await expect(page.getByTestId('bom-grid')).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('button', { name: '列配置', exact: true }).click();
  for (const checkbox of await page.locator('.column-menu input[type=checkbox]:enabled').all()) await checkbox.check();
  await page.getByRole('button', { name: '列配置', exact: true }).click();
  const durations: number[] = [];
  for (let i = 0; i < 20; i++) {
    await page.reload(); const grid = page.getByTestId('bom-grid');
    await expect(grid).toHaveAttribute('aria-busy', 'false'); await expect(grid).toHaveAttribute('data-first-interactive-ms', /\d/);
    await expect(page.getByTestId('matched-count')).toHaveText('50,000');
    const columns = await grid.locator('canvas').first().evaluate(canvas => (canvas as HTMLCanvasElement & { __vtable__: ListTable }).__vtable__.colCount);
    expect(columns).toBe(21); durations.push(Number(await grid.getAttribute('data-first-interactive-ms')));
  }
  await evidence('first-interactive', { timestamp: new Date().toISOString(), browser: await page.evaluate(() => navigator.userAgent), cpu: os.cpus()[0]?.model, data: '50k balanced, normalized snapshot ready; includes index, persisted view and VTable mount', columns: 20, samples: durations, p95Ms: p95(durations), limitMs: 1000 });
  expect(p95(durations)).toBeLessThanOrEqual(1000);
});

test('真实模型反向拾取到表格绘制，20 次采样', async ({ page }) => {
  await page.goto('/?structure=cad&pn=1321315X9D01A');
  await expect(page.locator('.mapping-state')).toContainText('具体模型位置', { timeout: 90000 });
  const durations: number[] = [];
  for (let i = 0; i < 20; i++) {
    const grid = page.getByTestId('bom-grid'); const box = await grid.boundingBox(); if (!box) throw new Error('表格缺失');
    await page.mouse.click(box.x + 175, box.y + 58);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const previous = new URL(page.url()).searchParams.get('occurrence');
    const duration = await page.evaluate(() => new Promise<number>((resolve, reject) => {
      const tableCanvas = document.querySelector('[data-testid=bom-grid] canvas') as HTMLCanvasElement & { __vtable__: ListTable };
      const table = tableCanvas.__vtable__; const model = document.querySelector('[data-testid=model-viewport] canvas')!;
      const rect = model.getBoundingClientRect(); const started = performance.now();
      const timeout = setTimeout(() => { table.off('after_render', painted); reject(new Error('反向拾取未触发表格绘制')); }, 5000);
      const painted = () => { clearTimeout(timeout); table.off('after_render', painted); resolve(performance.now() - started); };
      table.on('after_render', painted);
      model.dispatchEvent(new PointerEvent('pointerdown', { clientX: rect.x + rect.width * .5, clientY: rect.y + rect.height * .5, bubbles: true }));
      model.dispatchEvent(new PointerEvent('pointerup', { clientX: rect.x + rect.width * .5, clientY: rect.y + rect.height * .5, bubbles: true }));
    }));
    durations.push(duration); expect(new URL(page.url()).searchParams.get('occurrence')).not.toBe(previous); await expect(page.locator('.mapping-state')).toContainText('具体模型位置');
  }
  await evidence('model-to-table', { timestamp: new Date().toISOString(), samples: durations, p95Ms: p95(durations), limitMs: 150, cameraAnimationIncluded: false });
  expect(p95(durations)).toBeLessThanOrEqual(150);
});

interface GLState { active: boolean; allocated: number; released: number; resourcesAtLoss: number }
interface GLWindow { __bomGL: GLState[] }
test('真实模型开关 20 次释放 WebGL 上下文与驱动资源', async ({ page }) => {
  test.setTimeout(600000);
  await page.addInitScript(() => {
    const states: GLState[] = []; (window as unknown as GLWindow).__bomGL = states;
    const contexts = new WeakMap<object, GLState>(); const objects = new WeakSet<object>();
    const getContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: function(this: HTMLCanvasElement, ...args: unknown[]) {
      const context: unknown = Reflect.apply(getContext, this, args);
      if (!context || typeof context !== 'object' || !('getExtension' in context) || contexts.has(context)) return context;
      const state = { active: true, allocated: 0, released: 0, resourcesAtLoss: 0 }; contexts.set(context, state); states.push(state);
      this.addEventListener('webglcontextlost', () => { state.resourcesAtLoss = state.allocated - state.released; state.active = false; });
      return context;
    } });
    for (const constructor of [WebGLRenderingContext, WebGL2RenderingContext]) for (const kind of ['Buffer', 'Texture', 'Program', 'Shader', 'Framebuffer', 'Renderbuffer', 'VertexArray']) {
      for (const mode of ['create', 'delete']) {
        const key = `${mode}${kind}`; const original: unknown = Reflect.get(constructor.prototype, key); if (typeof original !== 'function') continue;
        Object.defineProperty(constructor.prototype, key, { configurable: true, value: function(this: object, ...args: unknown[]) {
          const result: unknown = Reflect.apply(original, this, args); const state = contexts.get(this);
          if (mode === 'create' && result && typeof result === 'object') { objects.add(result); if (state) state.allocated++; }
          if (mode === 'delete' && args[0] && typeof args[0] === 'object' && objects.delete(args[0]) && state) state.released++;
          return result;
        } });
      }
    }
  });
  await page.goto('/?structure=cad&pn=1321315X9D01A');
  const samples: GLState[][] = [];
  for (let i = 0; i < 20; i++) {
    await expect(page.locator('.mapping-state')).toContainText('具体模型位置', { timeout: 90000 });
    await expect(page.locator('.model-overlay')).toHaveCount(0);
    await page.getByRole('button', { name: '关闭模型与详情', exact: true }).click();
    await expect(page.getByTestId('model-viewport')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as unknown as GLWindow).__bomGL.filter(state => state.active).length)).toBe(0);
    const states = await page.evaluate(() => (window as unknown as GLWindow).__bomGL);
    expect(states).toHaveLength(i + 1); expect(states.every(state => state.allocated > 0)).toBe(true);
    samples.push(states);
    if (i < 19) await page.getByRole('button', { name: '打开详情面板', exact: true }).click();
  }
  await evidence('gpu-lifecycle', { timestamp: new Date().toISOString(), samples, cycles: 20, activeContextsAfterClose: 0, note: 'Real GLB, real WebGL driver calls; context loss releases remaining driver allocations.' });
});

test('100k 发生项与 50 层结构可进入分支、定位末项和取消迟到数据', async ({ page }) => {
  test.setTimeout(120000); const data = await source(); data.id = 'stress-100000-depth50'; data.vehicle.url = '';
  const parts = data.parts.filter(part => part.inBom);
  data.structures.catalog = Array.from({ length: 100000 }, (_, i) => ({ key: `depth:${i}`, parentKey: i ? `depth:${Math.min(i - 1, 49)}` : null, partId: parts[i % parts.length].id, label: `DEPTH-${String(i).padStart(6, '0')}`, compId: `DEPTH-${i}`, kind: i < 50 ? 'assembly' : 'part', source: 'catalog', markets: ['EU'], quantity: '1', quantityState: 'confirmed', uom: 'pcs', sourceRef: `synthetic:${i}` }));
  await page.route('**/data/windrose.json', route => route.fulfill({ json: data }));
  await page.goto('/?scope=depth%3A49&view=flat&occurrence=depth%3A99999');
  await expect(page.getByTestId('selected-summary')).toContainText('DEPTH-099999');
  await expect(page.getByTestId('matched-count')).toHaveText('99,951');
  await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill('DEPTH-099999');
  await expect(page.getByTestId('matched-count')).toHaveText('1');
  await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill('');
  await expect(page.getByTestId('matched-count')).toHaveText('99,951');
  await page.getByRole('button', { name: '规模测试', exact: true }).first().click();
  await page.locator('dialog').getByRole('button', { name: '加载测试数据', exact: true }).click();
  await page.locator('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.locator('.notice')).toContainText('取消');
  await expect(page.getByTestId('matched-count')).toHaveText('99,951');
  await evidence('deep-100k', { timestamp: new Date().toISOString(), occurrences: 100000, depth: 50, branch: 'depth:49', last: 'depth:99999', queryCancellation: true });
});
