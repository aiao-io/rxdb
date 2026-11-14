import { workspaceRoot } from '@nx/devkit';
import { expect, test } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { showAllColumns } from './helpers/columns';

const percentile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];

test('50k 发生项、20 列与真实整车同时工作', async ({ page }, info) => {
  test.setTimeout(180000);
  const source = JSON.parse(
    await readFile(path.join(workspaceRoot, 'apps/aiao-bom-2/public/data/windrose.json'), 'utf8')
  ) as {
    id: string;
    title: string;
    parts: Array<{ id: string; inBom: boolean }>;
    structures: { catalog: Array<Record<string, unknown>>; cad: Array<Record<string, unknown>> };
  };
  const mainParts = new Set(source.parts.filter(part => part.inBom).map(part => part.id));
  const candidates = source.structures.cad
    .filter(node => typeof node['nodeIndex'] === 'number' && mainParts.has(String(node['partId'])))
    .slice(0, 20);
  if (candidates.length !== 20) throw new Error('真实映射样本缺失');
  source.id = 'stress-model-50000';
  source.title = '50,000 发生项与 EU 参考模型 · 合成验收';
  source.structures.catalog = Array.from({ length: 50000 }, (_, index) => ({
    ...candidates[index % 20],
    source: 'catalog',
    key: `linked:${index}`,
    parentKey: index ? `linked:${Math.floor((index - 1) / 8)}` : null,
    label: `联动验收 ${String(index).padStart(5, '0')}`,
    kind: index ? 'part' : 'assembly',
    quantity: '1',
    quantityState: 'confirmed',
    sourceRef: `synthetic-linked:${index}`
  }));
  await page.route('**/data/windrose.json', route => route.fulfill({ json: source }));
  let vehicleRequests = 0;
  const errors: string[] = [];
  page.on('request', request => {
    if (request.url().endsWith('/models/eu-x9d13.glb')) vehicleRequests++;
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByTestId('matched-count')).toHaveText('50,000');
  await expect(page.locator('.mapping-state')).toContainText('具体模型位置', { timeout: 90000 });
  await showAllColumns(page);
  const switches: number[] = [];
  const searches: number[] = [];
  const selections: number[] = [];
  for (let index = 0; index < 20; index++) {
    const start = performance.now();
    await page.getByRole('button', { name: index % 2 ? '结构树' : '平铺', exact: true }).click();
    await page.evaluate(
      () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    );
    switches.push(performance.now() - start);
  }
  await page.getByRole('button', { name: '平铺', exact: true }).click();
  const backgroundsBeforeSelection = await page
    .locator('.canvas-host')
    .evaluate(host => Number((host as HTMLElement).dataset['backgroundRenders']));
  for (let index = 0; index < 20; index++) {
    const label = `联动验收 ${49980 + index}`;
    const start = performance.now();
    await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill(label);
    await expect(page.getByTestId('bom-grid')).toHaveAttribute('data-rendered-query', label);
    await expect(page.getByTestId('bom-grid')).toHaveAttribute('data-row-count', '1');
    searches.push(Math.max(0, performance.now() - start - 180));
    const box = await page.getByTestId('bom-grid').boundingBox();
    if (!box) throw new Error('表格未绘制');
    const selecting = performance.now();
    await page.mouse.click(box.x + 170, box.y + 57);
    await expect(page.getByTestId('selected-summary')).toContainText(label);
    await page.evaluate(
      () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    );
    selections.push(performance.now() - selecting);
  }
  await page.getByRole('textbox', { name: '搜索 BOM', exact: true }).fill('');
  await expect(page.getByTestId('matched-count')).toHaveText('50,000');
  await expect(page.getByTestId('bom-grid')).toHaveAttribute('data-rendered-query', '');
  const box = await page.getByTestId('bom-grid').boundingBox();
  if (!box) throw new Error('表格未绘制');
  await page.mouse.move(box.x + 200, box.y + 120);
  const frames = page.evaluate(
    () =>
      new Promise<number[]>(resolve => {
        const values: number[] = [];
        let previous = performance.now();
        const until = previous + 1200;
        const tick = (time: number) => {
          values.push(time - previous);
          previous = time;
          if (time < until) requestAnimationFrame(tick);
          else resolve(values.slice(1));
        };
        requestAnimationFrame(tick);
      })
  );
  for (let index = 0; index < 20; index++) await page.mouse.wheel(0, 700);
  const times = await frames;
  const render = await page
    .getByTestId('model-viewport')
    .locator('.canvas-host')
    .evaluate(host => ({
      renderMs: Number((host as HTMLElement).dataset['renderMs']),
      drawCalls: Number((host as HTMLElement).dataset['drawCalls']),
      triangles: Number((host as HTMLElement).dataset['triangles']),
      backgroundRenders: Number((host as HTMLElement).dataset['backgroundRenders']),
      backgroundDrawCalls: Number((host as HTMLElement).dataset['backgroundDrawCalls']),
      backgroundTriangles: Number((host as HTMLElement).dataset['backgroundTriangles'])
    }));
  const gpu = await page
    .getByTestId('model-viewport')
    .locator('canvas')
    .evaluate(canvas => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl2')!;
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer:
          extension ?
            (gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) as string)
          : (gl.getParameter(gl.RENDERER) as string),
        multiDraw: Boolean(gl.getExtension('WEBGL_multi_draw'))
      };
    });
  const report = {
    render,
    gpu,
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()),
    timestamp: new Date().toISOString(),
    build: 'production',
    os: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model,
    memoryGiB: os.totalmem() / 1073741824,
    viewport: page.viewportSize(),
    browser: await page.evaluate(() => navigator.userAgent),
    occurrences: 50000,
    columns: 20,
    samples: 20,
    shape: 'balanced, twenty reused CAD positions, synthetic relationships',
    model: 'EU X9D13C, 8,791 source nodes',
    modelRequests: vehicleRequests,
    debounceMs: 180,
    modeSwitchMs: { p50: percentile(switches, 0.5), p95: percentile(switches, 0.95) },
    searchAfterDebounceMs: { p50: percentile(searches, 0.5), p95: percentile(searches, 0.95) },
    tableToReadyModelMs: { p50: percentile(selections, 0.5), p95: percentile(selections, 0.95) },
    frames: {
      samples: times.length,
      averageFps: 1000 / (times.reduce((a, b) => a + b, 0) / times.length),
      p95Ms: percentile(times, 0.95)
    },
    raw: { switches, searches, selections }
  };
  await mkdir('test-output/evidence', { recursive: true });
  await writeFile('test-output/evidence/50k-model-performance.json', JSON.stringify(report, null, 2));
  await info.attach('50k-model-performance.json', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json'
  });
  expect(report.modeSwitchMs.p95).toBeLessThanOrEqual(150);
  expect(report.searchAfterDebounceMs.p95).toBeLessThanOrEqual(300);
  expect(report.tableToReadyModelMs.p95).toBeLessThanOrEqual(150);
  expect(report.frames.averageFps).toBeGreaterThanOrEqual(50);
  expect(report.frames.p95Ms).toBeLessThanOrEqual(32);
  expect(render.backgroundRenders).toBe(backgroundsBeforeSelection);
  expect(vehicleRequests).toBe(1);
  expect(errors).toEqual([]);
});
