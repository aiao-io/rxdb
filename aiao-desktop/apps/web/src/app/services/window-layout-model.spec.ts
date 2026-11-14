import { describe, expect, it, vi } from 'vitest';

import { DESKTOP_APP_MANIFESTS } from '../apps/app-manifests';
import { DesktopOpenOptions, RestoreOptions } from './desktop-apps';
import { WindowBox } from './desktop-window';
import type { FsNode } from './file-system';
import {
  STALE_LAYOUT_AFTER,
  TAB_ID_KEY,
  WINDOW_LAYOUT_PREFIX,
  WindowRecord,
  WindowSource,
  buildWindows,
  describeSkipped,
  fitBox,
  parseLayout,
  resolveOpenOptions,
  restoreOptionsOf,
  restoreSteps,
  staleLayoutRows,
  tabSessionId,
  windowLayoutKey
} from './window-layout-model';

const BOX: WindowBox = { left: 100, top: 80, width: 600, height: 400 };

const source = (overrides: Partial<WindowSource> = {}): WindowSource => ({
  appId: 'notes',
  name: 'Notes',
  layer: 1,
  box: BOX,
  minimized: false,
  zoomed: false,
  options: {},
  ...overrides
});

const record = (overrides: Partial<WindowRecord> = {}): WindowRecord => ({
  appId: 'notes',
  name: 'Notes',
  box: BOX,
  minimized: false,
  zoomed: false,
  options: {},
  ...overrides
});

/** 存进偏好的布局（版本、写入时间与窗口列表）。 */
const stored = (...windows: readonly unknown[]) => ({ version: 1, updatedAt: 1_700_000_000_000, windows });

const node = (path: readonly string[] | null, name = 'a.txt'): FsNode => ({
  name,
  path,
  kind: 'file',
  icon: 'f-txt',
  k: 'Plain Text',
  hidden: false
});

describe('键与会话标识', () => {
  it('布局的偏好键 = 固定前缀 + 标签页的会话标识', () => {
    expect(WINDOW_LAYOUT_PREFIX).toBe('windows:layout:');
    expect(windowLayoutKey('3f2a-77')).toBe('windows:layout:3f2a-77');
  });

  it('会话存储里已有合法的标识就原样沿用（刷新后不变），不再写入', () => {
    const storage = { getItem: vi.fn(() => 'b1a2c3d4-0000'), setItem: vi.fn() };
    expect(tabSessionId(storage, () => 'unused-id-0000')).toBe('b1a2c3d4-0000');
    expect(storage.getItem).toHaveBeenCalledWith(TAB_ID_KEY);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('新标签页没有标识：生成一个并写进会话存储，下一次读到同一个', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value)
    };
    const first = tabSessionId(storage, () => 'new-tab-0001');
    expect(first).toBe('new-tab-0001');
    expect(data.get(TAB_ID_KEY)).toBe('new-tab-0001');
    expect(tabSessionId(storage, () => 'another-0002')).toBe('new-tab-0001');
  });

  it.each(['', 'x', 'has space in it', 'a/b/c/d/e/f/g', 'ünï-cödé-ïd', 'a'.repeat(65)])(
    '存着的标识不合法（%j）：换成新生成的，不会把怪字符拼进偏好键',
    bad => {
      const storage = { getItem: () => bad, setItem: vi.fn() };
      expect(tabSessionId(storage, () => 'fresh-id-0003')).toBe('fresh-id-0003');
      expect(storage.setItem).toHaveBeenCalledWith(TAB_ID_KEY, 'fresh-id-0003');
    }
  );

  it('会话存储读写出错（站点数据被禁用、配额）：错误原样抛出，不退回任何共享的标识', () => {
    const blocked = new Error('The operation is insecure.');
    expect(() =>
      tabSessionId(
        {
          getItem: () => {
            throw blocked;
          },
          setItem: vi.fn()
        },
        () => 'never-used-0004'
      )
    ).toThrow(blocked);
    expect(() =>
      tabSessionId(
        {
          getItem: () => null,
          setItem: () => {
            throw blocked;
          }
        },
        () => 'never-used-0005'
      )
    ).toThrow(blocked);
  });
});

describe('开窗参数的可序列化部分', () => {
  it('Finder：只记路径；选中项、force、尺寸是一次性的或属于应用内部状态，不记', () => {
    const options: DesktopOpenOptions = {
      path: ['Macintosh HD', 'Users', 'prasenjit', 'Documents'],
      select: 'a.txt',
      force: true,
      w: 500,
      h: 300
    };
    expect(restoreOptionsOf(options)).toEqual({ path: ['Macintosh HD', 'Users', 'prasenjit', 'Documents'] });
  });

  it('TextEdit / 预览：文件名与卷内路径（节点对象不能序列化，恢复时按路径重新取）', () => {
    const n = node(['Users', 'prasenjit', 'Desktop', 'a.txt']);
    expect(restoreOptionsOf({ file: 'a.txt', node: n })).toEqual({
      file: 'a.txt',
      nodePath: ['Users', 'prasenjit', 'Desktop', 'a.txt']
    });
  });

  it('file 本身是节点时取它的名字；节点不在磁盘上（路径为空）就不记路径', () => {
    expect(restoreOptionsOf({ file: node(null, 'virtual.txt') })).toEqual({ file: 'virtual.txt' });
    expect(restoreOptionsOf({ file: 'x.md', node: node(null) })).toEqual({ file: 'x.md' });
  });

  it('设置的分区与 Safari 的网址照记；什么都没有就是空对象', () => {
    expect(restoreOptionsOf({ section: 'dock' })).toEqual({ section: 'dock' });
    expect(restoreOptionsOf({ url: 'https://example.com/' })).toEqual({ url: 'https://example.com/' });
    expect(restoreOptionsOf({})).toEqual({});
  });

  it('恢复开窗参数：没有节点路径时原样；有就按路径取回节点，文件已经不在了返回 null', () => {
    const options: RestoreOptions = { file: 'a.txt', nodePath: ['Users', 'a.txt'] };
    const found = node(['Users', 'a.txt']);
    const nodeAt = vi.fn((path: readonly string[]) => (path.join('/') === 'Users/a.txt' ? found : null));

    expect(resolveOpenOptions({ path: ['Trash'] }, nodeAt)).toEqual({ path: ['Trash'] });
    expect(nodeAt).not.toHaveBeenCalled();
    expect(resolveOpenOptions(options, nodeAt)).toEqual({ file: 'a.txt', node: found });
    expect(resolveOpenOptions({ file: 'gone.txt', nodePath: ['Users', 'gone.txt'] }, nodeAt)).toBeNull();
  });
});

describe('收集布局', () => {
  it('按层叠从后到前排列，记录应用、名称、几何、最小化与缩放状态和开窗参数', () => {
    const records = buildWindows([
      source({ appId: 'calculator', name: 'Calculator', layer: 14, zoomed: true }),
      source({ appId: 'finder', name: 'Finder', layer: 11, options: { path: ['Trash'] } }),
      source({ appId: 'notes', layer: 12, minimized: true })
    ]);
    expect(records.map(item => item.appId)).toEqual(['finder', 'notes', 'calculator']);
    expect(records[0]).toEqual({
      appId: 'finder',
      name: 'Finder',
      box: BOX,
      minimized: false,
      zoomed: false,
      options: { path: ['Trash'] }
    });
    expect(records[1]?.minimized).toBe(true);
    expect(records[2]?.zoomed).toBe(true);
  });

  it('层级相同的窗口保持传入的先后；没有窗口就是空列表', () => {
    const records = buildWindows([source({ appId: 'music', layer: 3 }), source({ appId: 'mail', layer: 3 })]);
    expect(records.map(item => item.appId)).toEqual(['music', 'mail']);
    expect(buildWindows([])).toEqual([]);
  });

  it('收集结果是纯数据：能 JSON 往返，读回来与原来一致', () => {
    const records = buildWindows([
      source({ layer: 2, options: { path: ['Macintosh HD'], nodePath: ['a'] } }),
      source({ appId: 'finder', name: 'Finder', layer: 5, minimized: true })
    ]);
    const layout = { version: 1, updatedAt: 5, windows: JSON.parse(JSON.stringify(records)) };
    expect(parseLayout(layout, DESKTOP_APP_MANIFESTS)).toEqual({ windows: records, skipped: [], unreadable: false });
  });
});

describe('读取与修复保存的布局', () => {
  it('没存过：没有窗口，也没有任何需要提示的东西', () => {
    expect(parseLayout(undefined, DESKTOP_APP_MANIFESTS)).toEqual({ windows: [], skipped: [], unreadable: false });
  });

  it('空布局（用户关光了所有窗口）是有效的：没有窗口，不报错', () => {
    expect(parseLayout(stored(), DESKTOP_APP_MANIFESTS)).toEqual({ windows: [], skipped: [], unreadable: false });
  });

  it('清单里已下线的应用被跳过并记下保存时的名字，其余窗口保持原来的层叠顺序', () => {
    const result = parseLayout(
      stored(record(), { ...record({ appId: 'finder' }), appId: 'podcasts-pro', name: 'Podcasts Pro' }, record()),
      DESKTOP_APP_MANIFESTS
    );
    expect(result.windows.map(item => item.appId)).toEqual(['notes', 'notes']);
    expect(result.skipped).toEqual([{ name: 'Podcasts Pro', reason: 'retired' }]);
    expect(result.unreadable).toBe(false);
  });

  it('没有名字的下线应用用 appId 代替；系统入口（Launchpad）不是窗口，同样当作不可恢复', () => {
    const noName = { appId: 'ghost', box: BOX, minimized: false, zoomed: false, options: {} };
    const result = parseLayout(
      stored(noName, record({ appId: 'launchpad', name: 'Launchpad' })),
      DESKTOP_APP_MANIFESTS
    );
    expect(result.windows).toEqual([]);
    expect(result.skipped).toEqual([
      { name: 'ghost', reason: 'retired' },
      { name: 'Launchpad', reason: 'retired' }
    ]);
  });

  it('原型链上的名字（toString）不是应用', () => {
    const result = parseLayout(stored({ ...record(), appId: 'toString' }), DESKTOP_APP_MANIFESTS);
    expect(result.windows).toEqual([]);
    expect(result.skipped).toHaveLength(1);
  });

  it('记录的名字以当前清单为准（应用改过名，提示与标题都用新的）', () => {
    const result = parseLayout(stored(record({ name: 'Old Notes Name' })), DESKTOP_APP_MANIFESTS);
    expect(result.windows[0]?.name).toBe('Notes');
  });

  it.each<[string, unknown]>([
    ['不是对象', 42],
    ['null', null],
    ['缺 appId', { box: BOX, minimized: false, zoomed: false, options: {} }],
    ['appId 不是字符串', { ...record(), appId: 7 }],
    ['几何缺字段', { ...record(), box: { left: 1, top: 1, width: 10 } }],
    ['几何不是有限数', { ...record(), box: { ...BOX, left: Number.POSITIVE_INFINITY } }],
    ['几何是字符串', { ...record(), box: { ...BOX, top: '80' } }],
    ['宽度不是正数', { ...record(), box: { ...BOX, width: 0 } }],
    ['高度是负数', { ...record(), box: { ...BOX, height: -5 } }],
    ['minimized 不是布尔', { ...record(), minimized: 'yes' }],
    ['zoomed 缺失', { appId: 'notes', box: BOX, minimized: false, options: {} }],
    ['options 不是对象', { ...record(), options: 'x' }],
    ['options.path 不是字符串数组', { ...record(), options: { path: [1, 2] } }],
    ['options.url 不是字符串', { ...record(), options: { url: 5 } }],
    ['options.nodePath 不是数组', { ...record(), options: { nodePath: 'a/b' } }]
  ])('形状不对的窗口记录（%s）被跳过并提示，其余窗口照常恢复', (_label, bad) => {
    const result = parseLayout(stored(record({ appId: 'calculator', name: 'Calculator' }), bad), DESKTOP_APP_MANIFESTS);
    expect(result.windows.map(item => item.appId)).toEqual(['calculator']);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toBe('unreadable');
  });

  it('形状不对但认得出是哪个应用时，提示里用应用的名字；认不出就没有名字', () => {
    const named = parseLayout(stored({ ...record(), box: 'nope' }), DESKTOP_APP_MANIFESTS);
    expect(named.skipped).toEqual([{ name: 'Notes', reason: 'unreadable' }]);
    const anonymous = parseLayout(stored(42, { appId: 7 }), DESKTOP_APP_MANIFESTS);
    expect(anonymous.skipped).toEqual([
      { name: null, reason: 'unreadable' },
      { name: null, reason: 'unreadable' }
    ]);
  });

  it.each<[string, unknown]>([
    ['不是对象', 'broken'],
    ['是数组', []],
    ['版本不是 1', { version: 2, updatedAt: 1, windows: [] }],
    ['没有版本', { updatedAt: 1, windows: [] }],
    ['windows 不是数组', { version: 1, updatedAt: 1, windows: {} }],
    ['updatedAt 不是数', { version: 1, updatedAt: 'now', windows: [] }]
  ])('整体无法识别（%s）：不恢复任何窗口，标记为不可读', (_label, raw) => {
    expect(parseLayout(raw, DESKTOP_APP_MANIFESTS)).toEqual({ windows: [], skipped: [], unreadable: true });
  });

  it('只保留认得的开窗参数字段，多余的丢掉；合法的字符串、路径原样保留', () => {
    const options = {
      path: ['Macintosh HD', 'Applications'],
      section: 'dock',
      url: 'https://example.com/',
      file: 'a.txt',
      nodePath: ['Users', 'a.txt'],
      select: 'x',
      force: true,
      extra: { deep: 1 }
    };
    const result = parseLayout(stored({ ...record(), options }), DESKTOP_APP_MANIFESTS);
    expect(result.windows[0]?.options).toEqual({
      path: ['Macintosh HD', 'Applications'],
      section: 'dock',
      url: 'https://example.com/',
      file: 'a.txt',
      nodePath: ['Users', 'a.txt']
    });
  });

  it('空路径是合法的开窗参数（Finder 停在最顶层），不会被当成缺失', () => {
    const result = parseLayout(
      stored({ ...record({ appId: 'finder' }), options: { path: [] } }),
      DESKTOP_APP_MANIFESTS
    );
    expect(result.windows[0]?.options).toEqual({ path: [] });
  });
});

describe('恢复顺序', () => {
  const stack = [
    record({ appId: 'finder', name: 'Finder' }),
    record({ appId: 'notes', minimized: true }),
    record({ appId: 'music', name: 'Music' }),
    record({ appId: 'calculator', name: 'Calculator' })
  ];

  it('先前台窗口（最上面一个没最小化的），再按层叠从上到下恢复其余可见窗口，最小化的最后', () => {
    const steps = restoreSteps(stack);
    expect(steps.map(step => step.record.appId)).toEqual(['calculator', 'music', 'finder', 'notes']);
    expect(steps.map(step => step.foreground)).toEqual([true, false, false, false]);
  });

  it('每一步带着原来的层叠位置（0 是最底层），所以先恢复谁都不会改变最终的叠放', () => {
    const layers = Object.fromEntries(restoreSteps(stack).map(step => [step.record.appId, step.layer]));
    expect(layers).toEqual({ finder: 0, notes: 1, music: 2, calculator: 3 });
  });

  it('前台窗口在中间时也是它先恢复；全部最小化时没有前台窗口', () => {
    const buried = [record({ appId: 'finder' }), record({ appId: 'notes', minimized: true })];
    expect(restoreSteps(buried).map(step => step.foreground)).toEqual([true, false]);
    const hidden = [record({ minimized: true }), record({ appId: 'finder', minimized: true })];
    expect(restoreSteps(hidden).map(step => step.record.appId)).toEqual(['finder', 'notes']);
    expect(restoreSteps(hidden).some(step => step.foreground)).toBe(false);
    expect(restoreSteps([])).toEqual([]);
  });
});

describe('几何修正', () => {
  const viewport = { width: 1440, height: 900 };
  const min = { width: 380, height: 240 };

  it('已经在屏幕内的窗口原样不动', () => {
    expect(fitBox(BOX, viewport, 25, min)).toEqual(BOX);
  });

  it('拖到右边缘后视口变小：左边缘拉回到至少留 120px 可见（与 keepOnScreen 一致）', () => {
    expect(fitBox({ ...BOX, left: 1300 }, { width: 800, height: 600 }, 25, min).left).toBe(680);
    expect(fitBox({ ...BOX, left: 700 }, { width: 800, height: 600 }, 25, min).left).toBe(680);
    expect(fitBox({ ...BOX, left: 300 }, { width: 800, height: 600 }, 25, min).left).toBe(300);
  });

  it('极窄的视口也至少留 10px：左边缘不会被推到负数', () => {
    expect(fitBox(BOX, { width: 100, height: 600 }, 25, min).left).toBe(10);
  });

  it('上沿不能进菜单栏，下沿拉回到至少留 40px 可见', () => {
    expect(fitBox({ ...BOX, top: -50 }, viewport, 25, min).top).toBe(25);
    expect(fitBox({ ...BOX, top: 880 }, viewport, 25, min).top).toBe(860);
    expect(fitBox({ ...BOX, top: 880 }, { width: 1440, height: 20 }, 25, min).top).toBe(25);
  });

  it('尺寸不会小于应用的最小尺寸；比视口大的窗口不缩小（缩放把手仍够得到）', () => {
    expect(fitBox({ ...BOX, width: 10, height: 10 }, viewport, 25, min)).toMatchObject({ width: 380, height: 240 });
    expect(fitBox({ ...BOX, width: 3000, height: 2000 }, viewport, 25, min)).toMatchObject({
      width: 3000,
      height: 2000
    });
  });
});

describe('提示文字', () => {
  it('没有被跳过的窗口就不提示', () => {
    expect(describeSkipped([])).toBeNull();
  });

  it('一个窗口：说明是哪个、为什么', () => {
    expect(describeSkipped([{ name: 'Podcasts Pro', reason: 'retired' }])).toBe(
      'Couldn’t restore a window: “Podcasts Pro” is no longer available.'
    );
    expect(describeSkipped([{ name: 'Notes', reason: 'unreadable' }])).toBe(
      'Couldn’t restore a window: “Notes” had unreadable settings.'
    );
    expect(describeSkipped([{ name: null, reason: 'unreadable' }])).toBe(
      'Couldn’t restore a window: a window had unreadable settings.'
    );
    expect(describeSkipped([{ name: 'a.txt', reason: 'file-missing' }])).toBe(
      'Couldn’t restore a window: “a.txt” no longer exists.'
    );
  });

  it('多个窗口：给出数量和每个的原因', () => {
    expect(
      describeSkipped([
        { name: 'Podcasts Pro', reason: 'retired' },
        { name: 'a.txt', reason: 'file-missing' }
      ])
    ).toBe('Couldn’t restore 2 windows: “Podcasts Pro” is no longer available; “a.txt” no longer exists.');
  });
});

describe('清理遗留的布局行', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 1_800_000_000_000;
  const row = (key: string, value: unknown) => ({ key, value });
  const layoutAt = (age: number) => ({ version: 1, updatedAt: now - age, windows: [] });
  const own = `${WINDOW_LAYOUT_PREFIX}mine-0001`;

  it('阈值是 30 天：关了很久的标签页遗留的布局才会被清掉', () => {
    expect(STALE_LAYOUT_AFTER).toBe(30 * DAY);
  });

  it('清掉超过阈值的其他标签页的布局行；没过期的、本标签页自己的都留着', () => {
    const rows = [
      row(`${WINDOW_LAYOUT_PREFIX}old-0001`, layoutAt(STALE_LAYOUT_AFTER + 1)),
      row(`${WINDOW_LAYOUT_PREFIX}old-0002`, layoutAt(90 * DAY)),
      row(`${WINDOW_LAYOUT_PREFIX}recent-1`, layoutAt(2 * DAY)),
      row(own, layoutAt(400 * DAY))
    ];
    expect(staleLayoutRows(rows, own, now, STALE_LAYOUT_AFTER).map(item => item.key)).toEqual([
      `${WINDOW_LAYOUT_PREFIX}old-0001`,
      `${WINDOW_LAYOUT_PREFIX}old-0002`
    ]);
  });

  it('刚好到阈值还不算过期（严格大于才清）', () => {
    const rows = [row(`${WINDOW_LAYOUT_PREFIX}edge-001`, layoutAt(STALE_LAYOUT_AFTER))];
    expect(staleLayoutRows(rows, own, now, STALE_LAYOUT_AFTER)).toEqual([]);
  });

  it('不是布局前缀的偏好（系统设置、Dock 布局、种子标记）无论多旧都不碰', () => {
    const rows = [
      row('dock:layout', layoutAt(500 * DAY)),
      row('system:settings', layoutAt(500 * DAY)),
      row('seed:disk', layoutAt(500 * DAY)),
      row('windows:layoutX', layoutAt(500 * DAY))
    ];
    expect(staleLayoutRows(rows, own, now, STALE_LAYOUT_AFTER)).toEqual([]);
  });

  it('读不懂的行（更高的版本、损坏的值）不删：它可能属于另一个更新版本的标签页', () => {
    const rows = [
      row(`${WINDOW_LAYOUT_PREFIX}future-01`, { version: 2, updatedAt: now - 500 * DAY, windows: [] }),
      row(`${WINDOW_LAYOUT_PREFIX}broken-01`, 'not a layout'),
      row(`${WINDOW_LAYOUT_PREFIX}nodate-01`, { version: 1, windows: [] }),
      row(`${WINDOW_LAYOUT_PREFIX}null-0001`, null)
    ];
    expect(staleLayoutRows(rows, own, now, STALE_LAYOUT_AFTER)).toEqual([]);
  });

  it('时钟回拨造成的“未来”时间不算过期', () => {
    const rows = [row(`${WINDOW_LAYOUT_PREFIX}future-02`, layoutAt(-5 * DAY))];
    expect(staleLayoutRows(rows, own, now, STALE_LAYOUT_AFTER)).toEqual([]);
  });
});
