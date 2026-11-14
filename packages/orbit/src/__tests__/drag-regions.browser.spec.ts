import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectDragRegions, trackDragRegions } from '../window-codec.js';
import type { OrbitDragRegion } from '../window.js';

const resources: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of resources.splice(0).reverse()) cleanup();
});

function titleBar(html = '<button style="width:40px;height:24px">b</button><span>title</span>') {
  const root = document.createElement('div');
  root.innerHTML = `<header data-orbit-drag-region style="display:flex;align-items:center;gap:8px;height:36px;margin:0;padding-left:72px">${html}</header>`;
  document.body.append(root);
  resources.push(() => root.remove());
  return root;
}

describe('拖动区跟踪（窗口协议与桌面能力协议共用，直接在页面里运行）', () => {
  it('收集拖动区：整条标题栏减去其中可交互元素的挖空，看不见的拖动区忽略', () => {
    const root = titleBar(
      '<button style="width:40px;height:24px">b</button><input style="width:30px" /><span data-orbit-no-drag>x</span>'
    );
    root.insertAdjacentHTML('beforeend', '<div data-orbit-drag-region style="display:none"></div>');
    const regions = collectDragRegions(root);
    expect(regions).toHaveLength(1);
    const [region] = regions as [OrbitDragRegion];
    expect(region.height).toBe(36);
    expect(region.holes).toHaveLength(3);
    for (const hole of region.holes) {
      expect(hole.x).toBeGreaterThanOrEqual(region.x + 72);
      expect(hole.width).toBeGreaterThan(0);
    }
  });

  it('跟踪拖动区：布局变化后重新上报，形状没变不重复上报，停止时清空', async () => {
    const root = titleBar();
    const reports: OrbitDragRegion[][] = [];
    const stop = trackDragRegions(regions => reports.push(regions), root);
    resources.push(stop);
    await vi.waitFor(() => expect(reports).toHaveLength(1));
    expect(reports[0]).toEqual(collectDragRegions(root));
    root.querySelector<HTMLElement>('button')!.style.width = '120px';
    await vi.waitFor(() => expect(reports).toHaveLength(2));
    expect(reports[1]![0]!.holes[0]!.width).toBe(120);
    window.dispatchEvent(new Event('resize'));
    await new Promise(resolve => setTimeout(resolve, 80));
    expect(reports).toHaveLength(2);
    stop();
    expect(reports.at(-1)).toEqual([]);
  });

  it('没有浏览器窗口的文档里跟踪拖动区显式失败', () => {
    const detached = document.implementation.createHTMLDocument('detached');
    expect(() => trackDragRegions(() => undefined, detached)).toThrow(expect.objectContaining({ code: 'UNSUPPORTED' }));
  });
});
