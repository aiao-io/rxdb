import { describe, expect, it } from 'vitest';

import { DESKTOP_APP_MANIFESTS } from '../apps/app-manifests';
import { DesktopAppId, DesktopAppManifest, DesktopAppManifests } from './desktop-apps';
import {
  DockLayout,
  canUnpin,
  defaultLayout,
  dividerIndex,
  dockSlots,
  isPinnable,
  isPinned,
  move,
  pin,
  pinnedApps,
  repairLayout,
  sameLayout,
  slotIndexAt,
  temporaryApps,
  unpin
} from './dock-layout-model';

const manifests: DesktopAppManifests = DESKTOP_APP_MANIFESTS;

/** 硬编码时期的 Dock：分隔线之前的应用区。 */
const DEFAULT_APPS: readonly DesktopAppId[] = [
  'finder',
  'launchpad',
  'safari',
  'mail',
  'messages',
  'maps',
  'photos',
  'notes',
  'calendar',
  'music',
  'terminal',
  'vscode',
  'calculator',
  'settings'
];

/** 在真实清单上覆盖几个字段，构造边界场景（比如把设置也变成不可移除）。 */
function manifestsWith(overrides: Partial<Record<DesktopAppId, Partial<DesktopAppManifest>>>): DesktopAppManifests {
  return Object.fromEntries(
    Object.entries(DESKTOP_APP_MANIFESTS).map(([id, app]) => [id, { ...app, ...overrides[id as DesktopAppId] }])
  ) as unknown as DesktopAppManifests;
}

const app = (id: string) => ({ type: 'app', id });
const divider = { type: 'divider' };
const layoutOf = (...items: readonly unknown[]) => ({ version: 1, items });

/** 把布局压成便于断言的 id 序列，分隔线记为 `|`。 */
const ids = (layout: DockLayout): string[] => layout.items.map(item => (item.type === 'app' ? item.id : '|'));

describe('defaultLayout 由清单的 defaultPinned 生成', () => {
  it('入口与顺序和硬编码时期逐项一致：应用区、一条分隔线、废纸篓', () => {
    expect(ids(defaultLayout(manifests))).toEqual([...DEFAULT_APPS, '|', 'trash']);
  });

  it('带版本号，且恰好一条分隔线', () => {
    const layout = defaultLayout(manifests);
    expect(layout.version).toBe(1);
    expect(layout.items.filter(item => item.type === 'divider')).toHaveLength(1);
    expect(dividerIndex(layout)).toBe(DEFAULT_APPS.length);
  });

  it('清单改了 dockOrder，默认布局跟着变（顺序来自清单，不是写死的数组）', () => {
    const swapped = manifestsWith({ safari: { dockOrder: 35 }, mail: { dockOrder: 25 } });
    expect(ids(defaultLayout(swapped)).slice(0, 4)).toEqual(['finder', 'launchpad', 'mail', 'safari']);
  });

  it('没有区域内的尾部项时，分隔线仍在末尾', () => {
    const noTrash = manifestsWith({ trash: { defaultPinned: false, dockOrder: undefined } });
    const layout = defaultLayout(noTrash);
    expect(ids(layout).at(-1)).toBe('|');
    expect(dividerIndex(layout)).toBe(layout.items.length - 1);
  });
});

describe('repairLayout 修复损坏或过期的偏好', () => {
  it('有效的布局原样保留', () => {
    const saved = defaultLayout(manifests);
    expect(repairLayout(JSON.parse(JSON.stringify(saved)), manifests)).toEqual(saved);
    expect(sameLayout(saved, repairLayout(saved, manifests))).toBe(true);
  });

  it('用户调整过的顺序与取消固定的可移除项都保留，不会被默认布局补回', () => {
    const raw = layoutOf(app('finder'), app('notes'), app('launchpad'), app('safari'), divider, app('trash'));
    expect(ids(repairLayout(raw, manifests))).toEqual(['finder', 'notes', 'launchpad', 'safari', '|', 'trash']);
  });

  it('未知 appId 被丢弃，其余用户顺序保留', () => {
    const raw = layoutOf(
      app('finder'),
      app('launchpad'),
      app('ghost'),
      app('notes'),
      app('retired-app'),
      app('safari'),
      divider,
      app('trash')
    );
    expect(ids(repairLayout(raw, manifests))).toEqual(['finder', 'launchpad', 'notes', 'safari', '|', 'trash']);
  });

  it('重复项只保留第一次出现的位置', () => {
    const raw = layoutOf(
      app('finder'),
      app('launchpad'),
      app('safari'),
      app('mail'),
      app('safari'),
      app('finder'),
      divider,
      app('trash'),
      app('trash')
    );
    expect(ids(repairLayout(raw, manifests))).toEqual(['finder', 'launchpad', 'safari', 'mail', '|', 'trash']);
  });

  it('非法形状的项被丢弃：不是对象、缺 id、id 不是字符串、类型未知', () => {
    const raw = layoutOf(
      app('finder'),
      null,
      42,
      'safari',
      { type: 'app' },
      { type: 'app', id: 7 },
      { type: 'folder', id: 'mail' },
      app('launchpad'),
      app('notes'),
      divider,
      app('trash')
    );
    expect(ids(repairLayout(raw, manifests))).toEqual(['finder', 'launchpad', 'notes', '|', 'trash']);
  });

  it('原型链上的名字不是应用 id', () => {
    const raw = layoutOf(app('toString'), app('__proto__'), app('constructor'), app('notes'));
    expect(ids(repairLayout(raw, manifests))).toEqual(['finder', 'launchpad', 'notes', '|', 'trash']);
  });

  it('不可移除的固定项被删掉后补回到默认的相对位置', () => {
    const raw = layoutOf(app('safari'), app('mail'), divider);
    expect(ids(repairLayout(raw, manifests))).toEqual(['finder', 'launchpad', 'safari', 'mail', '|', 'trash']);
  });

  it('补回的位置紧跟默认顺序里前一个仍在布局中的项；前面一个都没有时放在区域开头', () => {
    const noLaunchpad = layoutOf(app('finder'), app('safari'), app('mail'), divider, app('trash'));
    expect(ids(repairLayout(noLaunchpad, manifests)).slice(0, 4)).toEqual(['finder', 'launchpad', 'safari', 'mail']);

    const noFinder = layoutOf(app('launchpad'), app('safari'), divider, app('trash'));
    expect(ids(repairLayout(noFinder, manifests)).slice(0, 3)).toEqual(['finder', 'launchpad', 'safari']);

    /* 设置也不可移除：它默认排在计算器之后，计算器被取消固定时，补回的位置跟在仍在布局里的 VS Code 之后。 */
    const strict = manifestsWith({ settings: { dockRemovable: false } });
    const raw = layoutOf(app('finder'), app('launchpad'), app('terminal'), app('vscode'), divider, app('trash'));
    expect(ids(repairLayout(raw, strict))).toEqual([
      'finder',
      'launchpad',
      'terminal',
      'vscode',
      'settings',
      '|',
      'trash'
    ]);
  });

  it('保证恰好一条分隔线：缺了补上，多了只留一条', () => {
    const none = layoutOf(app('finder'), app('launchpad'), app('safari'), app('trash'));
    expect(ids(repairLayout(none, manifests))).toEqual(['finder', 'launchpad', 'safari', '|', 'trash']);

    const many = layoutOf(app('finder'), divider, app('launchpad'), divider, app('safari'), divider, app('trash'));
    expect(ids(repairLayout(many, manifests))).toEqual(['finder', 'launchpad', 'safari', '|', 'trash']);
  });

  it('尾部区的项总在分隔线之后，应用区的项总在分隔线之前', () => {
    const raw = layoutOf(app('trash'), app('finder'), divider, app('launchpad'), app('safari'));
    expect(ids(repairLayout(raw, manifests))).toEqual(['finder', 'launchpad', 'safari', '|', 'trash']);
  });

  it('没有 .app 身份、也不在默认 Dock 里的应用（About This Mac）不能固定，被丢弃', () => {
    const raw = layoutOf(app('finder'), app('about'), app('launchpad'), divider, app('trash'));
    expect(ids(repairLayout(raw, manifests))).toEqual(['finder', 'launchpad', '|', 'trash']);
  });

  it.each([
    ['没有存过', undefined],
    ['null', null],
    ['字符串', 'dock'],
    ['数组', [app('finder')]],
    ['版本号不认识', { version: 2, items: [app('finder')] }],
    ['缺版本号', { items: [app('finder')] }],
    ['items 不是数组', { version: 1, items: 'finder' }]
  ])('整体无法识别（%s）时回到默认布局', (_name, raw) => {
    expect(repairLayout(raw, manifests)).toEqual(defaultLayout(manifests));
  });

  it('修复是幂等的，且修复结果总是有效布局', () => {
    const raw = layoutOf(app('x'), app('safari'), app('safari'), divider, divider, app('trash'), app('mail'));
    const once = repairLayout(raw, manifests);
    expect(repairLayout(once, manifests)).toEqual(once);
    expect(once.items.filter(item => item.type === 'divider')).toHaveLength(1);
  });

  it('sameLayout 区分修复前后：有修复才不同', () => {
    const saved = defaultLayout(manifests);
    expect(sameLayout(saved, saved)).toBe(true);
    expect(sameLayout(layoutOf(app('ghost')), saved)).toBe(false);
    expect(sameLayout(undefined, saved)).toBe(false);
  });
});

describe('pin 固定', () => {
  const base = defaultLayout(manifests);

  it('固定到指定槽位：该位置原来的项及之后的项后移', () => {
    const next = pin(base, 'reminders', 2, manifests);
    expect(ids(next).slice(0, 5)).toEqual(['finder', 'launchpad', 'reminders', 'safari', 'mail']);
    expect(isPinned(next, 'reminders')).toBe(true);
  });

  it('不给槽位时固定到应用区末尾，也就是分隔线之前', () => {
    const next = pin(base, 'reminders', undefined, manifests);
    expect(ids(next).slice(-4)).toEqual(['settings', 'reminders', '|', 'trash']);
  });

  it('槽位被夹在应用区内：不能放到分隔线之后，也不能是负数', () => {
    expect(ids(pin(base, 'reminders', 99, manifests)).slice(-4)).toEqual(['settings', 'reminders', '|', 'trash']);
    expect(ids(pin(base, 'reminders', -5, manifests))[0]).toBe('reminders');
  });

  it('已固定的不重复添加，也不挪动：返回原布局', () => {
    expect(pin(base, 'safari', 0, manifests)).toBe(base);
    expect(pin(base, 'trash', 0, manifests)).toBe(base);
  });

  it('不能固定的应用被拒绝（没有 .app 身份的 About This Mac）', () => {
    expect(isPinnable(manifests, 'about')).toBe(false);
    expect(pin(base, 'about', 0, manifests)).toBe(base);
  });

  it('应用区的应用与尾部区的应用各回各的区域', () => {
    const custom = manifestsWith({ calculator: { dockZone: 'trailing' } });
    const layout = unpin(base, 'calculator', custom);
    expect(ids(layout)).not.toContain('calculator');
    const next = pin(layout, 'calculator', 0, custom);
    expect(ids(next).slice(-3)).toEqual(['|', 'calculator', 'trash']);
  });

  it('不改动传入的布局（不可变）', () => {
    const before = JSON.stringify(base);
    pin(base, 'reminders', 3, manifests);
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe('unpin 取消固定', () => {
  const base = defaultLayout(manifests);

  it('可移除的固定项被取消固定，其余顺序不变', () => {
    const next = unpin(base, 'calculator', manifests);
    expect(ids(next)).toEqual(ids(base).filter(id => id !== 'calculator'));
    expect(isPinned(next, 'calculator')).toBe(false);
  });

  it.each(['finder', 'launchpad', 'trash'] as const)('%s 是 dockRemovable: false 的固定项，拒绝取消固定', id => {
    expect(canUnpin(base, id, manifests)).toBe(false);
    expect(unpin(base, id, manifests)).toBe(base);
  });

  it('本来就没有固定的应用什么都不做', () => {
    expect(canUnpin(base, 'reminders', manifests)).toBe(false);
    expect(unpin(base, 'reminders', manifests)).toBe(base);
  });

  it('canUnpin 对可移除的固定项为真', () => {
    expect(canUnpin(base, 'safari', manifests)).toBe(true);
  });
});

describe('move 调整顺序', () => {
  const base = defaultLayout(manifests);

  it('槽位是取出该应用之后的位置：向前移', () => {
    const next = move(base, 'music', 2, manifests);
    expect(ids(next).slice(0, 4)).toEqual(['finder', 'launchpad', 'music', 'safari']);
  });

  it('向后移：槽位按取出之后的数组数', () => {
    const next = move(base, 'safari', 5, manifests);
    expect(ids(next).slice(0, 7)).toEqual(['finder', 'launchpad', 'mail', 'messages', 'maps', 'safari', 'photos']);
  });

  it('不能越过分隔线：最大槽位是应用区末尾', () => {
    const next = move(base, 'safari', 99, manifests);
    expect(ids(next).slice(-4)).toEqual(['settings', 'safari', '|', 'trash']);
    expect(dividerIndex(next)).toBe(dividerIndex(base));
  });

  it('落在原位置时返回原布局', () => {
    expect(move(base, 'safari', 2, manifests)).toBe(base);
  });

  it('没有固定的应用不能调整', () => {
    expect(move(base, 'reminders', 0, manifests)).toBe(base);
  });

  it('不可移除的固定项也能调整顺序（只是不能取消固定）', () => {
    const next = move(base, 'launchpad', 3, manifests);
    expect(ids(next).slice(0, 4)).toEqual(['finder', 'safari', 'mail', 'launchpad']);
  });

  it('保持每个应用恰好出现一次', () => {
    const next = move(base, 'notes', 0, manifests);
    expect([...ids(next)].sort()).toEqual([...ids(base)].sort());
  });
});

describe('temporaryApps 与 dockSlots 把运行态叠在固定布局之上', () => {
  const base = defaultLayout(manifests);

  it('运行中未固定的应用按运行顺序成为临时项；已固定的不重复；系统入口不会是临时项', () => {
    expect(temporaryApps(base, ['finder', 'reminders', 'safari', 'weather'], manifests)).toEqual([
      'reminders',
      'weather'
    ]);
  });

  it('没有 .app 身份的窗口（About This Mac）不产生临时图标', () => {
    expect(temporaryApps(base, ['about', 'reminders'], manifests)).toEqual(['reminders']);
  });

  it('临时项接在最后一个固定应用之后、分隔线之前，固定项的顺序不受运行态影响', () => {
    const slots = dockSlots(base, ['reminders', 'weather']);
    const keys = slots.map(slot => (slot.type === 'divider' ? '|' : `${slot.id}${slot.temporary ? '*' : ''}`));
    expect(keys).toEqual([...DEFAULT_APPS, 'reminders*', 'weather*', '|', 'trash']);
  });

  it('没有临时项时与布局一致', () => {
    const slots = dockSlots(base, []);
    expect(slots).toHaveLength(base.items.length);
    expect(slots.every(slot => slot.type === 'divider' || slot.temporary === false)).toBe(true);
  });

  it('pinnedApps 列出全部固定应用（不含分隔线）', () => {
    expect(pinnedApps(base)).toEqual([...DEFAULT_APPS, 'trash']);
  });
});

describe('slotIndexAt 指针 x 到插入槽位', () => {
  const centers = [30, 90, 150];

  it('在第一个中心左边是 0，在两个中心之间落在后一个之前，在最后一个右边是末尾', () => {
    expect(slotIndexAt(centers, 0)).toBe(0);
    expect(slotIndexAt(centers, 60)).toBe(1);
    expect(slotIndexAt(centers, 120)).toBe(2);
    expect(slotIndexAt(centers, 500)).toBe(3);
  });

  it('恰好在某个中心上时落在它之前', () => {
    expect(slotIndexAt(centers, 90)).toBe(1);
  });

  it('没有槽位时是 0', () => {
    expect(slotIndexAt([], 40)).toBe(0);
  });
});
