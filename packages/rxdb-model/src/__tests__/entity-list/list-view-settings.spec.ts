// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListViewSettingsController } from '../../entity-list/list-view-settings.js';

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

function toggle(panel: HTMLElement, newState: 'open' | 'closed'): void {
  panel.dispatchEvent(Object.assign(new Event('toggle'), { newState }));
}

describe('列表配置弹层与字段拖拽', () => {
  let root: HTMLElement;
  let panel: HTMLElement;
  let trigger: HTMLButtonElement;
  let controller: ListViewSettingsController;
  let ids: string[];
  const reordered = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1024);
    vi.stubGlobal('innerHeight', 768);
    ids = ['id', 'title', 'completed'];
    root = document.createElement('div');
    root.innerHTML = `<button type="button">字段配置</button><div popover="auto" data-list-view-popover>
      <div data-list-view-fields>${ids.map(id => `<div data-list-view-field><button type="button" data-list-view-drag="${id}">${id}</button></div>`).join('')}</div>
    </div>`;
    document.body.append(root);
    panel = root.querySelector('[popover]')!;
    trigger = root.querySelector('button')!;
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect(950, 40, 50, 32));
    Object.defineProperty(panel, 'offsetWidth', { value: 320 });
    vi.spyOn(root.querySelector<HTMLElement>('[data-list-view-fields]')!, 'getBoundingClientRect').mockReturnValue(
      rect(0, 100, 320, 120)
    );
    reordered.mockReset();
    controller = new ListViewSettingsController(root, { fields: () => ids, onReorder: reordered });
  });

  afterEach(() => {
    controller.dispose();
    root.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('右侧弹层夹回视口，窗口尺寸变化后继续完整显示', () => {
    toggle(panel, 'open');
    expect(panel.style.position).toBe('fixed');
    expect(panel.style.left).toBe('696px');
    expect(panel.style.top).toBe('76px');
    vi.stubGlobal('innerWidth', 375);
    window.dispatchEvent(new Event('resize'));
    expect(panel.style.left).toBe('47px');
  });

  it('底部空间不足时向上弹出，并限制高度以便内部滚动', () => {
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect(900, 700, 50, 32));
    toggle(panel, 'open');
    expect(panel.style.bottom).toBe('72px');
    expect(parseFloat(panel.style.maxHeight)).toBeLessThanOrEqual(460.8);
  });

  it('滚动时重定位，关闭和销毁后不再处理定位事件', () => {
    toggle(panel, 'open');
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect(100, 100, 50, 32));
    window.dispatchEvent(new Event('scroll'));
    expect(panel.style.left).toBe('100px');
    toggle(panel, 'closed');
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(rect(200, 100, 50, 32));
    window.dispatchEvent(new Event('resize'));
    expect(panel.style.left).toBe('100px');
    controller.dispose();
    toggle(panel, 'open');
    expect(panel.style.left).toBe('100px');
  });

  it('指针拖拽可跨多行重排，松手后清除拖拽提示', () => {
    const handle = root.querySelector<HTMLElement>('[data-list-view-drag="id"]')!;
    handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientY: 120 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientY: 200 }));
    expect(root.querySelectorAll('[data-drop-target="true"]')).toHaveLength(1);
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: 200 }));
    expect(reordered).toHaveBeenCalledWith(['title', 'completed', 'id']);
    expect(root.querySelectorAll('[data-drop-target="true"]')).toHaveLength(0);
  });

  it('触摸拖拽取消、Escape 或字段序列变化时不提交重排', () => {
    const handle = root.querySelector<HTMLElement>('[data-list-view-drag="id"]')!;
    const start = () =>
      handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'touch' }));
    start();
    window.dispatchEvent(new PointerEvent('pointercancel'));
    start();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    start();
    ids = ['title', 'id', 'completed'];
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: 200 }));
    expect(reordered).not.toHaveBeenCalled();
  });

  it('拖拽手柄支持方向键调整，点击普通字段不启动拖拽', () => {
    const handle = root.querySelector<HTMLElement>('[data-list-view-drag="title"]')!;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(reordered).toHaveBeenCalledWith(['title', 'id', 'completed']);
    reordered.mockClear();
    panel.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientY: 200 }));
    expect(reordered).not.toHaveBeenCalled();
  });
});
