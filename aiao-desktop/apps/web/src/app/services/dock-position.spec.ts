import { describe, expect, it } from 'vitest';

import { DESKTOP_APP_MANIFESTS } from '../apps/app-manifests';
import { DesktopAppManifests } from './desktop-apps';
import {
  DockDisplayItem,
  DockSlotItem,
  defaultLayout,
  dockAxisOrigin,
  dockAxisPoint,
  dockIconCenter,
  dockSlots,
  insertMinimizedTiles,
  nearDockEdge,
  withinDock
} from './dock-layout-model';

const manifests: DesktopAppManifests = DESKTOP_APP_MANIFESTS;

/** 底部 Dock 的未旋转测量框：宽 600 是主轴长度，高 72（58 + 14）是面板厚度。 */
const PANEL = { left: 400, top: 900, width: 600, height: 72 };
/** 同一个面板以贴屏边为轴旋转 ±90° 后的实时包围盒（左/右 Dock 传给主轴换算函数的框）：贴住左缘、厚 72、主轴 600。 */
const ROTATED = { left: 0, top: 636, width: 72, height: 600 };

/** 默认布局加一条分隔线与废纸篓，压缩成类型序列。 */
const baseSlots = (): DockSlotItem[] => dockSlots(defaultLayout(manifests), []);

const ids = (slots: readonly DockDisplayItem[]): string[] =>
  slots.map(item =>
    item.type === 'divider' ? '|'
    : item.type === 'window' ? `win:${item.windowId}`
    : item.id
  );

describe('insertMinimizedTiles 把最小化窗口 tile 插在分隔线与废纸篓之间', () => {
  it('最近的窗口（order 大）靠分隔线，尾部区仍在最后', () => {
    const slots = insertMinimizedTiles(baseSlots(), [
      { appId: 'terminal', windowId: 'w3', title: 'zsh', order: 3 },
      { appId: 'notes', windowId: 'w9', title: 'Untitled', order: 9 }
    ]);
    expect(ids(slots)).toEqual([...ids(baseSlots()).slice(0, -1), 'win:w9', 'win:w3', 'trash']);
    const tile = slots.find(item => item.type === 'window');
    expect(tile).toMatchObject({ type: 'window', appId: 'notes', windowId: 'w9', title: 'Untitled' });
  });

  it('没有最小化窗口时返回一份等价的拷贝，不改动传入的格子', () => {
    const base = baseSlots();
    const slots = insertMinimizedTiles(base, []);
    expect(slots).not.toBe(base);
    expect(ids(slots)).toEqual(ids(base));
  });

  it('没有分隔线时 tile 排在末尾（调用方保证有分隔线，这里只是兜底）', () => {
    const bare: DockSlotItem[] = [
      { type: 'app', id: 'finder', temporary: false },
      { type: 'app', id: 'trash', temporary: false }
    ];
    const slots = insertMinimizedTiles(bare, [{ appId: 'notes', windowId: 'w1', title: 'x', order: 1 }]);
    expect(ids(slots)).toEqual(['finder', 'trash', 'win:w1']);
  });
});

describe('dockIconCenter 给出最小化动画终点', () => {
  it('底部 Dock：图标行在面板底部往上 9px，x 就是主轴坐标', () => {
    expect(dockIconCenter(PANEL, 100, 58, 'bottom')).toEqual({ x: 500, y: 934 });
  });

  it('左/右 Dock：以贴屏边为旋转轴，图标中心落在贴屏边的图标行上', () => {
    expect(dockIconCenter(PANEL, 100, 58, 'left')).toEqual({ x: 402, y: 1000 });
    expect(dockIconCenter(PANEL, 100, 58, 'right')).toEqual({ x: 398, y: 1400 });
  });
});

describe('dockAxisPoint / dockAxisOrigin 把屏幕坐标换算到布局主轴', () => {
  it('底部 Dock 用屏幕 x', () => {
    expect(dockAxisPoint(PANEL, 460, 950, 'bottom')).toBe(60);
    expect(dockAxisOrigin(PANEL, 500, 'bottom')).toBe(450);
  });

  it('左/右 Dock 的实时框已包含旋转：包围盒的高是主轴长度，用屏幕 y 换算', () => {
    expect(dockAxisPoint(ROTATED, 700, 686, 'left')).toBe(50);
    expect(dockAxisPoint(ROTATED, 700, 686, 'right')).toBe(550);
    expect(dockAxisOrigin(ROTATED, 500, 'left')).toBe(50);
    expect(dockAxisOrigin(ROTATED, 500, 'right')).toBe(50);
  });
});

describe('nearDockEdge 判断指针是否贴住 Dock 所在的屏幕边', () => {
  it('底部：贴近下边缘 4 像素内', () => {
    expect(nearDockEdge(700, 899, 1400, 900, 'bottom')).toBe(true);
    expect(nearDockEdge(700, 890, 1400, 900, 'bottom')).toBe(false);
  });

  it('左侧与右侧：贴近左/右边缘', () => {
    expect(nearDockEdge(2, 400, 1400, 900, 'left')).toBe(true);
    expect(nearDockEdge(10, 400, 1400, 900, 'left')).toBe(false);
    expect(nearDockEdge(1399, 400, 1400, 900, 'right')).toBe(true);
    expect(nearDockEdge(1390, 400, 1400, 900, 'right')).toBe(false);
  });
});

describe('withinDock 判断指针是否在面板接收范围内', () => {
  it('底部：水平在主轴范围内、垂直在面板上下 8px 内', () => {
    expect(withinDock(PANEL, 700, 940, 'bottom')).toBe(true);
    expect(withinDock(PANEL, 700, 800, 'bottom')).toBe(false);
    expect(withinDock(PANEL, 1200, 940, 'bottom')).toBe(false);
  });

  it('左/右：垂直在主轴范围内、水平在面板厚度内', () => {
    expect(withinDock(ROTATED, 60, 936, 'left')).toBe(true);
    expect(withinDock(ROTATED, 800, 936, 'left')).toBe(false);
    expect(withinDock(ROTATED, 60, 200, 'left')).toBe(false);
    expect(withinDock(ROTATED, 600, 936, 'right')).toBe(false);
  });
});
