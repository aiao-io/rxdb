/* `@angular/common` 是部分编译的库，求值时就需要 JIT 编译器，所以编译器要先于它加载。 */
import '@angular/compiler';

import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DESKTOP_APP_MANIFESTS } from '../apps/app-manifests';
import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { configureServices } from '../testing/angular';
import { FakeDesktopData } from '../testing/fake-desktop-data';
import { DESKTOP_APPS, DesktopAppId } from './desktop-apps';
import { DockDragController, DockDragSource, DockDropTarget } from './dock-drag';
import { DockLayoutStore } from './dock-layout';
import { Toast } from './toast';

/** 事件发在这个假文档上；Node 的 `EventTarget` 就够用。 */
class FakeDocument extends EventTarget {
  readonly documentElement = { dataset: {}, style: { getPropertyValue: () => '', setProperty: () => undefined } };
  readonly location = { search: '', hash: '' };
}

interface Pointer {
  readonly x: number;
  readonly y: number;
  readonly button?: number;
  readonly pointerId?: number;
  readonly isPrimary?: boolean;
}

function pointerEvent(type: string, { x, y, button = 0, pointerId = 1, isPrimary = true }: Pointer): PointerEvent {
  const event = new Event(type, { bubbles: true, cancelable: true });
  return Object.assign(event, { clientX: x, clientY: y, button, pointerId, isPrimary }) as unknown as PointerEvent;
}

/** 发起拖动的那个元素（Launchpad 图标、Dock 图标……）：只用得到指针捕获。 */
function sourceElement() {
  return { setPointerCapture: vi.fn(), hasPointerCapture: vi.fn(() => true), releasePointerCapture: vi.fn() };
}

/** 按下事件的 `currentTarget` 是只读访问器，需要显式定义。 */
function pressEvent(pointer: Pointer, element = sourceElement()): PointerEvent {
  const event = pointerEvent('pointerdown', pointer);
  Object.defineProperty(event, 'currentTarget', { value: element });
  return event;
}

const DOCK_TOP = 800;

/** Dock 的接收范围是屏幕下方 y ≥ 800 的区域；槽位按 x 每 60 像素一格。 */
function createTarget(): DockDropTarget & { slotAt: ReturnType<typeof vi.fn> } {
  return {
    accepts: (_x, y) => y >= DOCK_TOP,
    slotAt: vi.fn((x: number) => Math.floor(x / 60))
  };
}

interface Rig {
  readonly document: FakeDocument;
  readonly drag: DockDragController;
  readonly store: DockLayoutStore;
  readonly target: ReturnType<typeof createTarget>;
}

/** 控制器、布局仓与它们依赖的服务；事件都发在传入的假文档上。 */
function configure(document: FakeDocument): void {
  configureServices([
    DockDragController,
    DockLayoutStore,
    Preferences,
    Toast,
    { provide: DOCUMENT, useValue: document },
    { provide: DesktopData, useValue: new FakeDesktopData() },
    { provide: DESKTOP_APPS, useValue: DESKTOP_APP_MANIFESTS }
  ]);
}

async function setup(): Promise<Rig> {
  const document = new FakeDocument();
  configure(document);
  await TestBed.inject(Preferences).ready;
  const drag = TestBed.inject(DockDragController);
  const target = createTarget();
  drag.attach(target);
  return { document, drag, store: TestBed.inject(DockLayoutStore), target };
}

const ids = (store: DockLayoutStore): string[] => store.items().map(item => (item.type === 'app' ? item.id : '|'));

/** 按下、移动到 (x, y)、松手；中间的移动事件逐个派发。 */
function dragAlong(rig: Rig, appId: DesktopAppId, source: DockDragSource, path: readonly Pointer[], release = true) {
  const start = path[0];
  rig.drag.begin(pressEvent(start), appId, source);
  for (const step of path.slice(1)) rig.document.dispatchEvent(pointerEvent('pointermove', step));
  if (release) rig.document.dispatchEvent(pointerEvent('pointerup', path.at(-1) ?? start));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DockDragController 起拖与取消', () => {
  it('移动不到阈值不算拖动：没有拖动状态，松手不改动布局，也不吞掉随后的点击', async () => {
    const rig = await setup();
    rig.drag.begin(pressEvent({ x: 100, y: 100 }), 'reminders', 'launchpad');
    rig.document.dispatchEvent(pointerEvent('pointermove', { x: 102, y: 101 }));
    expect(rig.drag.state()).toBeNull();
    rig.document.dispatchEvent(pointerEvent('pointerup', { x: 102, y: 101 }));

    const click = new Event('click', { cancelable: true });
    rig.document.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(rig.store.pinned('reminders')).toBe(false);
  });

  it('超过阈值进入拖动状态，带着应用、来源与指针位置；用指针捕获接管后续事件', async () => {
    const rig = await setup();
    const element = sourceElement();
    rig.drag.begin(pressEvent({ x: 100, y: 100, pointerId: 7 }, element), 'reminders', 'launchpad');
    expect(element.setPointerCapture).toHaveBeenCalledExactlyOnceWith(7);
    rig.document.dispatchEvent(pointerEvent('pointermove', { x: 130, y: 120, pointerId: 7 }));
    expect(rig.drag.state()).toEqual({
      appId: 'reminders',
      source: 'launchpad',
      x: 130,
      y: 120,
      slot: null,
      removing: false
    });
    expect(rig.drag.active()).toBe(true);
  });

  it('只响应主键与主指针：右键或第二个指针不起拖', async () => {
    const rig = await setup();
    rig.drag.begin(pressEvent({ x: 0, y: 0, button: 2 }), 'reminders', 'launchpad');
    rig.drag.begin(pressEvent({ x: 0, y: 0, isPrimary: false }), 'reminders', 'launchpad');
    rig.document.dispatchEvent(pointerEvent('pointermove', { x: 50, y: 50 }));
    expect(rig.drag.state()).toBeNull();
  });

  it('另一个指针的事件被忽略', async () => {
    const rig = await setup();
    rig.drag.begin(pressEvent({ x: 0, y: 0, pointerId: 1 }), 'reminders', 'launchpad');
    rig.document.dispatchEvent(pointerEvent('pointermove', { x: 80, y: 80, pointerId: 2 }));
    expect(rig.drag.state()).toBeNull();
    rig.document.dispatchEvent(pointerEvent('pointerup', { x: 80, y: 900, pointerId: 2 }));
    rig.document.dispatchEvent(pointerEvent('pointermove', { x: 80, y: 80, pointerId: 1 }));
    expect(rig.drag.state()).not.toBeNull();
  });

  it('另一个指针已经在拖动时，再次起拖被忽略', async () => {
    const rig = await setup();
    rig.drag.begin(pressEvent({ x: 0, y: 0, pointerId: 1 }), 'reminders', 'launchpad');
    rig.drag.begin(pressEvent({ x: 0, y: 0, pointerId: 2 }), 'weather', 'launchpad');
    rig.document.dispatchEvent(pointerEvent('pointermove', { x: 50, y: 50, pointerId: 1 }));
    expect(rig.drag.state()?.appId).toBe('reminders');
  });

  it('同一个指针的新一次按下接替旧会话：上一次的松手没有送到（比如在窗口外松开）也不会卡死拖放', async () => {
    const rig = await setup();
    dragAlong(
      rig,
      'reminders',
      'launchpad',
      [
        { x: 0, y: 0 },
        { x: 200, y: 900 }
      ],
      false
    );
    expect(rig.drag.state()?.appId).toBe('reminders');

    rig.drag.begin(pressEvent({ x: 300, y: 300 }), 'weather', 'launchpad');
    expect(rig.drag.state()).toBeNull();
    rig.document.dispatchEvent(pointerEvent('pointermove', { x: 330, y: 330 }));
    expect(rig.drag.state()?.appId).toBe('weather');
  });

  it('服务销毁时摘掉文档上的监听', async () => {
    const rig = await setup();
    dragAlong(
      rig,
      'reminders',
      'launchpad',
      [
        { x: 0, y: 0 },
        { x: 200, y: 900 }
      ],
      false
    );
    TestBed.resetTestingModule();
    rig.document.dispatchEvent(pointerEvent('pointerup', { x: 200, y: 900 }));
    expect(rig.store.pinned('reminders')).toBe(false);
  });

  it('不能固定的应用（About This Mac）从外部来源不起拖，已固定的应用仍可拖（松手不重复添加）', async () => {
    const rig = await setup();
    rig.drag.begin(pressEvent({ x: 0, y: 0 }), 'about', 'launchpad');
    rig.document.dispatchEvent(pointerEvent('pointermove', { x: 50, y: 50 }));
    expect(rig.drag.state()).toBeNull();
    rig.drag.begin(pressEvent({ x: 0, y: 0 }), 'safari', 'launchpad');
    rig.document.dispatchEvent(pointerEvent('pointermove', { x: 50, y: 50 }));
    expect(rig.drag.state()?.appId).toBe('safari');
  });

  it('Esc 取消拖动：状态清空，松手不提交，但仍吞掉松手后的点击', async () => {
    const rig = await setup();
    dragAlong(
      rig,
      'reminders',
      'launchpad',
      [
        { x: 10, y: 10 },
        { x: 200, y: 900 }
      ],
      false
    );
    expect(rig.drag.state()?.slot).toBe(3);

    const escape = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
    rig.document.dispatchEvent(escape);
    expect(rig.drag.state()).toBeNull();

    rig.document.dispatchEvent(pointerEvent('pointermove', { x: 300, y: 900 }));
    expect(rig.drag.state()).toBeNull();
    rig.document.dispatchEvent(pointerEvent('pointerup', { x: 300, y: 900 }));
    expect(rig.store.pinned('reminders')).toBe(false);

    const click = new Event('click', { cancelable: true });
    rig.document.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
  });

  it('没在拖动时 Esc 不被拦截', async () => {
    const rig = await setup();
    rig.drag.begin(pressEvent({ x: 0, y: 0 }), 'reminders', 'launchpad');
    const escape = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Escape' });
    rig.document.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(false);
  });

  it('指针被系统取消（pointercancel）时放弃拖动，不提交', async () => {
    const rig = await setup();
    dragAlong(
      rig,
      'reminders',
      'launchpad',
      [
        { x: 10, y: 10 },
        { x: 200, y: 900 }
      ],
      false
    );
    rig.document.dispatchEvent(pointerEvent('pointercancel', { x: 200, y: 900 }));
    expect(rig.drag.state()).toBeNull();
    expect(rig.store.pinned('reminders')).toBe(false);
  });

  it('cancel() 放弃进行中的拖动，并摘掉监听', async () => {
    const rig = await setup();
    dragAlong(
      rig,
      'reminders',
      'launchpad',
      [
        { x: 10, y: 10 },
        { x: 200, y: 900 }
      ],
      false
    );
    rig.drag.cancel();
    expect(rig.drag.state()).toBeNull();
    rig.document.dispatchEvent(pointerEvent('pointerup', { x: 200, y: 900 }));
    expect(rig.store.pinned('reminders')).toBe(false);
  });

  it('Dock 还没挂上就开始拖动是编程错误，起拖时直接报错', () => {
    configure(new FakeDocument());
    const drag = TestBed.inject(DockDragController);
    expect(() => drag.begin(pressEvent({ x: 0, y: 0 }), 'reminders', 'launchpad')).toThrow(
      'Dock drop target is not attached'
    );
  });
});

describe('DockDragController 拖入 Dock（Launchpad 与 Finder 来源）', () => {
  it('在 Dock 范围内显示插入槽位，松手固定到该槽位，状态清空', async () => {
    const rig = await setup();
    dragAlong(
      rig,
      'reminders',
      'launchpad',
      [
        { x: 10, y: 10 },
        { x: 200, y: 900 }
      ],
      false
    );
    expect(rig.drag.state()).toMatchObject({ slot: 3, removing: false });
    expect(rig.target.slotAt).toHaveBeenLastCalledWith(200, 'reminders');

    rig.document.dispatchEvent(pointerEvent('pointerup', { x: 200, y: 900 }));
    expect(ids(rig.store).slice(0, 5)).toEqual(['finder', 'launchpad', 'safari', 'reminders', 'mail']);
    expect(rig.drag.state()).toBeNull();
  });

  it('松手时按松手的位置重新计算槽位（最后一次移动之后指针又动了）', async () => {
    const rig = await setup();
    dragAlong(
      rig,
      'reminders',
      'launchpad',
      [
        { x: 10, y: 10 },
        { x: 200, y: 900 }
      ],
      false
    );
    rig.document.dispatchEvent(pointerEvent('pointerup', { x: 70, y: 900 }));
    expect(ids(rig.store).slice(0, 3)).toEqual(['finder', 'reminders', 'launchpad']);
  });

  it('在 Dock 范围外松手什么都不做，应用没有固定', async () => {
    const rig = await setup();
    dragAlong(rig, 'reminders', 'launchpad', [
      { x: 10, y: 10 },
      { x: 200, y: 400 }
    ]);
    expect(rig.store.pinned('reminders')).toBe(false);
    expect(rig.drag.state()).toBeNull();
  });

  it('拖动过程中离开 Dock 范围，插入槽位随即消失', async () => {
    const rig = await setup();
    dragAlong(
      rig,
      'reminders',
      'launchpad',
      [
        { x: 10, y: 10 },
        { x: 200, y: 900 }
      ],
      false
    );
    expect(rig.drag.state()?.slot).toBe(3);
    rig.document.dispatchEvent(pointerEvent('pointermove', { x: 200, y: 300 }));
    expect(rig.drag.state()?.slot).toBeNull();
  });

  it('已固定的应用再拖入：不显示插入位置，松手不重复添加也不挪动', async () => {
    const rig = await setup();
    const before = ids(rig.store);
    dragAlong(
      rig,
      'safari',
      'finder',
      [
        { x: 10, y: 10 },
        { x: 400, y: 900 }
      ],
      false
    );
    expect(rig.drag.state()?.slot).toBeNull();
    rig.document.dispatchEvent(pointerEvent('pointerup', { x: 400, y: 900 }));
    expect(ids(rig.store)).toEqual(before);
  });

  it('只把应用 id 与槽位交给布局：Finder 来源与 Launchpad 来源结果相同', async () => {
    const viaLaunchpad = await setup();
    dragAlong(viaLaunchpad, 'reminders', 'launchpad', [
      { x: 0, y: 0 },
      { x: 130, y: 900 }
    ]);
    const viaFinder = await setup();
    viaFinder.drag.beginFromFinder(pressEvent({ x: 0, y: 0 }), 'reminders');
    viaFinder.document.dispatchEvent(pointerEvent('pointermove', { x: 130, y: 900 }));
    viaFinder.document.dispatchEvent(pointerEvent('pointerup', { x: 130, y: 900 }));
    expect(ids(viaFinder.store)).toEqual(ids(viaLaunchpad.store));
  });

  it('beginFromLaunchpad 与 beginFromDock 是带来源的起拖入口', async () => {
    const rig = await setup();
    rig.drag.beginFromLaunchpad(pressEvent({ x: 0, y: 0 }), 'reminders');
    rig.document.dispatchEvent(pointerEvent('pointermove', { x: 50, y: 50 }));
    expect(rig.drag.state()?.source).toBe('launchpad');
    rig.drag.cancel();

    rig.drag.beginFromDock(pressEvent({ x: 0, y: 0 }), 'safari');
    rig.document.dispatchEvent(pointerEvent('pointermove', { x: 50, y: 50 }));
    expect(rig.drag.state()?.source).toBe('dock');
  });

  it('拖动结束后的第一次点击被吞掉（别让图标被“点击”启动），之后的点击不受影响', async () => {
    const rig = await setup();
    dragAlong(rig, 'reminders', 'launchpad', [
      { x: 10, y: 10 },
      { x: 200, y: 900 }
    ]);

    const swallowed = new Event('click', { cancelable: true });
    rig.document.dispatchEvent(swallowed);
    expect(swallowed.defaultPrevented).toBe(true);

    const later = new Event('click', { cancelable: true });
    rig.document.dispatchEvent(later);
    expect(later.defaultPrevented).toBe(false);
  });

  it('没有点击跟着松手时（指针在窗口外松手），吞点击的监听下一轮自动摘掉', async () => {
    const rig = await setup();
    dragAlong(rig, 'reminders', 'launchpad', [
      { x: 10, y: 10 },
      { x: 200, y: 400 }
    ]);
    vi.runAllTimers();
    const click = new Event('click', { cancelable: true });
    rig.document.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });
});

describe('DockDragController 拖动 Dock 里的固定图标', () => {
  it('拖起的图标在拖动中让位（lifted），外部来源拖动时没有让位的图标；dropSlot 随槽位变化', async () => {
    const rig = await setup();
    expect(rig.drag.lifted()).toBeNull();
    expect(rig.drag.dropSlot()).toBeNull();

    dragAlong(
      rig,
      'music',
      'dock',
      [
        { x: 600, y: 850 },
        { x: 130, y: 850 }
      ],
      false
    );
    expect(rig.drag.lifted()).toBe('music');
    expect(rig.drag.dropSlot()).toBe(2);
    rig.drag.cancel();
    expect(rig.drag.lifted()).toBeNull();

    dragAlong(
      rig,
      'reminders',
      'launchpad',
      [
        { x: 10, y: 10 },
        { x: 200, y: 900 }
      ],
      false
    );
    expect(rig.drag.lifted()).toBeNull();
    expect(rig.drag.dropSlot()).toBe(3);
  });

  it('在 Dock 内移动：松手后按槽位调整顺序，应用仍固定', async () => {
    const rig = await setup();
    dragAlong(
      rig,
      'music',
      'dock',
      [
        { x: 600, y: 850 },
        { x: 130, y: 850 }
      ],
      false
    );
    expect(rig.drag.state()).toMatchObject({ source: 'dock', slot: 2, removing: false });
    rig.document.dispatchEvent(pointerEvent('pointerup', { x: 130, y: 850 }));
    expect(ids(rig.store).slice(0, 4)).toEqual(['finder', 'launchpad', 'music', 'safari']);
    expect(rig.store.pinned('music')).toBe(true);
  });

  it('拖出 Dock 范围：显示“移除”，松手取消固定', async () => {
    const rig = await setup();
    dragAlong(
      rig,
      'calculator',
      'dock',
      [
        { x: 600, y: 850 },
        { x: 600, y: 300 }
      ],
      false
    );
    expect(rig.drag.state()).toMatchObject({ slot: null, removing: true });
    rig.document.dispatchEvent(pointerEvent('pointerup', { x: 600, y: 300 }));
    expect(rig.store.pinned('calculator')).toBe(false);
  });

  it.each(['finder', 'launchpad'] as const)('%s 不可移除：拖出 Dock 不显示“移除”，松手后仍固定', async id => {
    const rig = await setup();
    dragAlong(
      rig,
      id,
      'dock',
      [
        { x: 60, y: 850 },
        { x: 60, y: 300 }
      ],
      false
    );
    expect(rig.drag.state()).toMatchObject({ slot: null, removing: false });
    rig.document.dispatchEvent(pointerEvent('pointerup', { x: 60, y: 300 }));
    expect(rig.store.pinned(id)).toBe(true);
  });

  it('拖到原来的位置松手：顺序不变', async () => {
    const rig = await setup();
    const before = ids(rig.store);
    dragAlong(rig, 'safari', 'dock', [
      { x: 150, y: 850 },
      { x: 150, y: 850 },
      { x: 140, y: 851 },
      { x: 130, y: 850 }
    ]);
    expect(ids(rig.store)).toEqual(before);
  });
});
