import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { MenuEntry } from './menu';
import { PopoverService } from './popover';

const items: MenuEntry[] = [{ id: 'a', label: 'A' }];

class Panel {}

function setup(): PopoverService {
  configureServices([PopoverService]);
  return TestBed.inject(PopoverService);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PopoverService', () => {
  it('openMenu 打开一个菜单弹出层，成为当前唯一打开的弹出层', () => {
    const popover = setup();
    expect(popover.isOpen()).toBe(false);
    popover.openMenu(items, { x: 10, y: 20 }, 'wide');

    expect(popover.isOpen()).toBe(true);
    expect(popover.entries()).toHaveLength(1);
    expect(popover.active()).toBe(popover.entries()[0]);
    expect(popover.active()?.content).toEqual({ kind: 'menu', items, cls: 'wide' });
    expect(popover.active()?.options).toEqual({ x: 10, y: 20 });
    expect(popover.active()?.leaving()).toBe(false);
  });

  it('openComponent 打开面板组件，输入参数默认为空', () => {
    const popover = setup();
    popover.openComponent(Panel, { x: 1, y: 2 });
    expect(popover.active()?.content).toEqual({ kind: 'component', component: Panel, inputs: {} });
    popover.openComponent(Panel, { x: 1, y: 2 }, { title: 'hi' });
    expect(popover.active()?.content).toEqual({ kind: 'component', component: Panel, inputs: { title: 'hi' } });
  });

  it('同一时刻只有一个：打开新的会立刻关掉旧的，并通知旧的 onClose', () => {
    const popover = setup();
    const closed = vi.fn();
    popover.openMenu(items, { x: 0, y: 0, onClose: closed });
    const first = popover.active();
    popover.openMenu(items, { x: 5, y: 5 });

    expect(closed).toHaveBeenCalledTimes(1);
    expect(popover.entries()).toHaveLength(1);
    expect(popover.active()).not.toBe(first);
    expect(popover.active()?.id).toBeGreaterThan(first?.id ?? 0);
  });

  it('close 先让弹出层淡出，110ms 后才移除；onClose 立即触发', () => {
    const popover = setup();
    const closed = vi.fn();
    popover.openMenu(items, { x: 0, y: 0, onClose: closed });
    const entry = popover.active();

    popover.close();
    expect(popover.isOpen()).toBe(false);
    expect(entry?.leaving()).toBe(true);
    expect(closed).toHaveBeenCalledTimes(1);
    expect(popover.entries()).toEqual([entry]);

    vi.advanceTimersByTime(110);
    expect(popover.entries()).toEqual([]);
  });

  it('close(true) 立刻移除，不播放淡出', () => {
    const popover = setup();
    popover.openMenu(items, { x: 0, y: 0 });
    popover.close(true);
    expect(popover.entries()).toEqual([]);
    expect(popover.isOpen()).toBe(false);
  });

  it('没有打开的弹出层时 close 什么也不做', () => {
    const popover = setup();
    popover.close();
    popover.close(true);
    expect(popover.entries()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('contextMenu 阻止浏览器自带菜单，菜单贴着指针右下方 1px 打开', () => {
    const popover = setup();
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 100,
      clientY: 50
    } as unknown as MouseEvent;
    popover.contextMenu(event, items);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(popover.active()?.options).toEqual({ x: 101, y: 51, origin: 'top left' });
    expect(popover.active()?.content).toMatchObject({ kind: 'menu', items });
  });

  it('menuUnder 把菜单挂在锚点元素正下方 4px', () => {
    const popover = setup();
    const anchor = { getBoundingClientRect: () => ({ left: 30, bottom: 80 }) } as unknown as Element;
    popover.menuUnder(anchor, items);
    expect(popover.active()?.options).toEqual({ x: 30, y: 84, origin: 'top left' });
  });
});

describe('PopoverService 关闭原因（ADESK-US-108）', () => {
  it('onClose 带着关闭原因，没有指明时是 dismiss', () => {
    const popover = setup();
    const closed = vi.fn();
    popover.openMenu(items, { x: 0, y: 0, onClose: closed });
    popover.close();
    expect(closed).toHaveBeenLastCalledWith('dismiss');

    popover.openMenu(items, { x: 0, y: 0, onClose: closed });
    popover.close(false, 'escape');
    expect(closed).toHaveBeenLastCalledWith('escape');

    popover.openMenu(items, { x: 0, y: 0, onClose: closed });
    popover.close(true, 'command');
    expect(closed).toHaveBeenLastCalledWith('command');
    vi.advanceTimersByTime(110);
    expect(popover.entries()).toEqual([]);
  });

  it('被新的弹出层顶掉时，旧的收到 replaced：它不该把焦点抢回来', () => {
    const popover = setup();
    const closed = vi.fn();
    popover.openMenu(items, { x: 0, y: 0, onClose: closed });
    popover.openMenu(items, { x: 5, y: 5 });
    expect(closed).toHaveBeenCalledExactlyOnceWith('replaced');
  });

  it('菜单的无障碍名称与左右切换回调随选项一起保存', () => {
    const popover = setup();
    const step = vi.fn();
    popover.openMenu(items, { x: 0, y: 0, label: 'File', step });
    expect(popover.active()?.options.label).toBe('File');
    popover.active()?.options.step?.(1);
    expect(step).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('contextMenu 可以带菜单名称', () => {
    const popover = setup();
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 1,
      clientY: 2
    } as unknown as MouseEvent;
    popover.contextMenu(event, items, 'Finder');
    expect(popover.active()?.options).toEqual({ x: 2, y: 3, origin: 'top left', label: 'Finder' });
  });

  it('menuUnder 由键盘触发时：焦点交给第一项，Esc / Tab / 执行命令后焦点回到锚点；鼠标点开的不动焦点', () => {
    const popover = setup();
    const focus = vi.fn();
    const anchor = {
      getBoundingClientRect: () => ({ left: 30, bottom: 80 }),
      focus
    } as unknown as HTMLElement;
    popover.menuUnder(anchor, items, { keyboard: true, label: 'Sort By' });
    const options = popover.active()?.options;
    expect(options).toMatchObject({ x: 30, y: 84, origin: 'top left', focus: true, label: 'Sort By' });

    for (const reason of ['escape', 'tab', 'command'] as const) {
      focus.mockClear();
      options?.onClose?.(reason);
      expect(focus, reason).toHaveBeenCalledTimes(1);
    }
    for (const reason of ['dismiss', 'outside', 'replaced'] as const) {
      focus.mockClear();
      options?.onClose?.(reason);
      expect(focus, reason).not.toHaveBeenCalled();
    }

    popover.menuUnder(anchor, items, { keyboard: false });
    expect(popover.active()?.options.focus).toBeUndefined();
    expect(popover.active()?.options.onClose).toBeUndefined();
  });
});
