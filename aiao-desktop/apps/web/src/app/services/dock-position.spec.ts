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
/** 左 Dock 的未旋转测量框（1440 宽视口：盒左缘距左屏边半个厚度 36）与它绕左缘中点转 +90° 后的实时包围盒。 */
const LEFT_UNROTATED = { left: 36, top: 600, width: 600, height: 72 };
const ROTATED = { left: 0, top: 636, width: 72, height: 600 };
/** 右 Dock 的未旋转测量框（盒右缘距右屏边半个厚度）与它绕右缘中点转 -90° 后的实时包围盒。 */
const RIGHT_UNROTATED = { left: 804, top: 600, width: 600, height: 72 };
const ROTATED_RIGHT = { left: 1368, top: 636, width: 72, height: 600 };

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

  it('左 Dock：绕左缘中点转 +90°，图标中心落在距左屏边 9px 的图标行上', () => {
    expect(dockIconCenter(LEFT_UNROTATED, 100, 58, 'left')).toEqual({ x: 38, y: 736 });
  });

  it('右 Dock：绕右缘中点转 -90°，图标中心落在距右屏边 9px 的图标行上', () => {
    expect(dockIconCenter(RIGHT_UNROTATED, 100, 58, 'right')).toEqual({ x: 1402, y: 1136 });
  });
});

describe('dockAxisPoint / dockAxisOrigin 把屏幕坐标换算到布局主轴', () => {
  it('底部 Dock：屏幕 x 与内容起点都是绝对坐标（两两成对，任一换法都会整体偏移）', () => {
    expect(dockAxisPoint(PANEL, 460, 950, 'bottom')).toBe(460);
    expect(dockAxisOrigin(PANEL, 500, 'bottom')).toBe(450);
  });

  it('左/右 Dock 的实时框已包含旋转：包围盒的高是主轴长度，用屏幕 y 换算（相对包围盒）', () => {
    expect(dockAxisPoint(ROTATED, 700, 686, 'left')).toBe(50);
    expect(dockAxisPoint(ROTATED_RIGHT, 700, 686, 'right')).toBe(550);
    expect(dockAxisOrigin(ROTATED, 500, 'left')).toBe(50);
    expect(dockAxisOrigin(ROTATED_RIGHT, 500, 'right')).toBe(50);
  });

  it('指针-图标闭环：指针放在任一图标的静止中心，axisPoint 还原出主轴坐标（三位置）', () => {
    const pairs = [
      [PANEL, PANEL, 'bottom'],
      [LEFT_UNROTATED, ROTATED, 'left'],
      [RIGHT_UNROTATED, ROTATED_RIGHT, 'right']
    ] as const;
    for (const [unrotated, rotated, position] of pairs) {
      for (const laidCenter of [38, 100, 200, 520]) {
        const center = dockIconCenter(unrotated, laidCenter, 58, position);
        /* 底部是绝对坐标：期望 = laidCenter + 面板左缘；左/右是相对包围盒的坐标：期望 = laidCenter。 */
        expect(dockAxisPoint(rotated, center.x, center.y, position)).toBe(
          position === 'bottom' ? laidCenter + unrotated.left : laidCenter
        );
      }
    }
  });

  it('内容原点闭环：axisPoint(内容起点的屏幕位置) 恒等于 axisOrigin（三位置）', () => {
    const pairs = [
      [PANEL, PANEL, 'bottom'],
      [LEFT_UNROTATED, ROTATED, 'left'],
      [RIGHT_UNROTATED, ROTATED_RIGHT, 'right']
    ] as const;
    for (const [, rotated, position] of pairs) {
      const origin = dockAxisOrigin(rotated, 500, position);
      /* 内容在主轴居中：底部起点在左缘 + (宽 - total)/2；左/右起点在顶缘 + (高 - total)/2（右 Dock 布局 0 端在屏幕下方，从底缘倒推）。 */
      const screen =
        position === 'bottom' ? { x: rotated.left + (rotated.width - 500) / 2, y: 950 }
        : position === 'left' ? { x: 700, y: rotated.top + (rotated.height - 500) / 2 }
        : { x: 700, y: rotated.top + rotated.height - (rotated.height - 500) / 2 };
      expect(dockAxisPoint(rotated, screen.x, screen.y, position)).toBe(origin);
    }
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
    expect(withinDock(ROTATED_RIGHT, 600, 936, 'right')).toBe(false);
    expect(withinDock(ROTATED_RIGHT, 1400, 936, 'right')).toBe(true);
  });
});
