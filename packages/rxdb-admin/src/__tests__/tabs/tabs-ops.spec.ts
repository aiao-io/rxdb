import { describe, expect, it } from 'vitest';
import {
  EMPTY_TABS,
  MAX_VISIT_HISTORY,
  closeAll,
  closeLeft,
  closeOthers,
  closeRight,
  closeTab,
  openTab,
  recordVisit,
  reorderTab,
  retitleTabs,
  tabKeyOf,
  togglePin,
  type TabItem,
  type TabsState
} from '../../tabs/tabs-ops.js';

const tab = (key: string, pinned = false): TabItem => ({ key, url: key, title: key.slice(1) || 'home', pinned });
const open = (state: TabsState, key: string, options = { maxCount: 0, visitHistory: true }) =>
  openTab(state, tab(key), options);
const build = (...keys: string[]): TabsState => keys.reduce((state, key) => open(state, key), EMPTY_TABS);
const keysOf = (state: TabsState) => state.tabs.map(item => item.key);

describe('tabKeyOf', () => {
  it('去掉查询串、哈希与末尾斜杠', () => {
    expect(tabKeyOf('/entities/assets/Asset?x=1#top')).toBe('/entities/assets/Asset');
    expect(tabKeyOf('/search/')).toBe('/search');
    expect(tabKeyOf('/')).toBe('/');
    expect(tabKeyOf('')).toBe('/');
    expect(tabKeyOf('?q=1')).toBe('/');
  });
});

describe('recordVisit', () => {
  it('最近访问在前、去重、限长', () => {
    expect(recordVisit(['/a', '/b'], '/b')).toEqual(['/b', '/a']);
    const long = Array.from({ length: MAX_VISIT_HISTORY + 10 }, (_, i) => `/p${i}`);
    expect(recordVisit(long, '/new')).toHaveLength(MAX_VISIT_HISTORY);
    expect(recordVisit(long, '/new')[0]).toBe('/new');
  });
});

describe('openTab', () => {
  it('追加新页签并激活，同时记录访问历史', () => {
    const state = build('/a', '/b');
    expect(keysOf(state)).toEqual(['/a', '/b']);
    expect(state.activeKey).toBe('/b');
    expect(state.history).toEqual(['/b', '/a']);
  });

  it('已存在的页签只更新标题与地址并激活，不重复添加', () => {
    const state = openTab(
      build('/a', '/b'),
      { ...tab('/a'), title: '新标题', url: '/a?x=1' },
      { maxCount: 0, visitHistory: true }
    );
    expect(keysOf(state)).toEqual(['/a', '/b']);
    expect(state.tabs[0]).toMatchObject({ title: '新标题', url: '/a?x=1' });
    expect(state.activeKey).toBe('/a');
  });

  it('新页签排在固定页签之后', () => {
    const pinned = togglePin(build('/a', '/b'), '/b');
    expect(keysOf(open(pinned, '/c'))).toEqual(['/b', '/a', '/c']);
  });

  it('关闭访问历史时不记录', () => {
    const state = openTab(EMPTY_TABS, tab('/a'), { maxCount: 0, visitHistory: false });
    expect(state.history).toEqual([]);
  });

  it('超出上限时淘汰最早的非固定、非当前页签', () => {
    const options = { maxCount: 3, visitHistory: true };
    let state = openTab(EMPTY_TABS, tab('/a'), options);
    state = openTab(state, tab('/b'), options);
    state = openTab(state, tab('/c'), options);
    state = openTab(state, tab('/d'), options);
    expect(keysOf(state)).toEqual(['/b', '/c', '/d']);
  });

  it('上限内全是固定页签时不淘汰', () => {
    const options = { maxCount: 1, visitHistory: true };
    let state = openTab(EMPTY_TABS, { ...tab('/a'), pinned: true }, options);
    state = openTab(state, tab('/b'), options);
    expect(keysOf(state)).toEqual(['/a', '/b']);
  });
});

describe('closeTab', () => {
  it('关闭非当前页签：其余不变，不要求跳转', () => {
    const result = closeTab(build('/a', '/b', '/c'), '/a');
    expect(keysOf(result.state)).toEqual(['/b', '/c']);
    expect(result.state.activeKey).toBe('/c');
    expect(result.next).toBeUndefined();
    expect(result.state.history).toEqual(['/c', '/b']);
  });

  it('关闭当前页签：跳到最近访问的页签', () => {
    let state = build('/a', '/b', '/c');
    state = open(state, '/a');
    state = open(state, '/c');
    const result = closeTab(state, '/c');
    expect(result.next).toBe('/a');
    expect(keysOf(result.state)).toEqual(['/a', '/b']);
  });

  it('没有访问历史时取右邻，再取左邻', () => {
    const noHistory = (...keys: string[]) =>
      keys.reduce((state, key) => openTab(state, tab(key), { maxCount: 0, visitHistory: false }), EMPTY_TABS);
    const withActive = (state: TabsState, key: string): TabsState => ({ ...state, activeKey: key });
    expect(closeTab(withActive(noHistory('/a', '/b', '/c'), '/b'), '/b').next).toBe('/c');
    expect(closeTab(withActive(noHistory('/a', '/b', '/c'), '/c'), '/c').next).toBe('/b');
  });

  it('只剩最后一个页签时关闭它，next 为 null 交给调用方', () => {
    const result = closeTab(build('/a'), '/a');
    expect(result.state.tabs).toEqual([]);
    expect(result.next).toBeNull();
  });

  it('固定页签与不存在的页签不可关闭', () => {
    const pinned = togglePin(build('/a', '/b'), '/a');
    expect(closeTab(pinned, '/a').state).toBe(pinned);
    expect(closeTab(pinned, '/missing').state).toBe(pinned);
  });
});

describe('批量关闭', () => {
  const pinnedA = togglePin(build('/a', '/b', '/c', '/d'), '/a');

  it('closeOthers 保留固定页签与指定页签，并把指定页签作为跳转目标', () => {
    const keepingActive = closeOthers({ ...pinnedA, activeKey: '/c' }, '/c');
    expect(keysOf(keepingActive.state)).toEqual(['/a', '/c']);
    expect(keepingActive.next).toBeUndefined();
    const closingActive = closeOthers({ ...pinnedA, activeKey: '/b' }, '/c');
    expect(closingActive.next).toBe('/c');
  });

  it('closeLeft / closeRight 只关闭一侧的非固定页签', () => {
    expect(keysOf(closeLeft(pinnedA, '/c').state)).toEqual(['/a', '/c', '/d']);
    expect(keysOf(closeRight(pinnedA, '/b').state)).toEqual(['/a', '/b']);
    expect(closeLeft(pinnedA, '/missing').state).toBe(pinnedA);
    expect(closeRight(pinnedA, '/missing').state).toBe(pinnedA);
  });

  it('closeAll 保留固定页签；当前页签被关闭时回到第一个固定页签', () => {
    const result = closeAll(pinnedA);
    expect(keysOf(result.state)).toEqual(['/a']);
    expect(result.next).toBe('/a');
  });

  it('closeAll 没有固定页签时 next 为 null', () => {
    const result = closeAll(build('/a', '/b'));
    expect(result.state.tabs).toEqual([]);
    expect(result.next).toBeNull();
  });
});

describe('togglePin / reorderTab', () => {
  it('固定后集中到最前，取消固定回到非固定区', () => {
    const pinned = togglePin(build('/a', '/b', '/c'), '/c');
    expect(keysOf(pinned)).toEqual(['/c', '/a', '/b']);
    expect(pinned.tabs[0].pinned).toBe(true);
    expect(keysOf(togglePin(pinned, '/c'))).toEqual(['/c', '/a', '/b']);
    expect(togglePin(pinned, '/missing')).toBe(pinned);
  });

  it('重排被限制在所属分组内', () => {
    const state = togglePin(build('/a', '/b', '/c', '/d'), '/a');
    expect(keysOf(reorderTab(state, '/d', 1))).toEqual(['/a', '/d', '/b', '/c']);
    expect(keysOf(reorderTab(state, '/d', 0))).toEqual(['/a', '/d', '/b', '/c']);
    expect(keysOf(reorderTab(state, '/b', 99))).toEqual(['/a', '/c', '/d', '/b']);
    expect(reorderTab(state, '/a', 3)).toBe(state);
  });

  it('位置不变或页签不存在时返回原对象', () => {
    const state = build('/a', '/b');
    expect(reorderTab(state, '/a', 0)).toBe(state);
    expect(reorderTab(state, '/missing', 0)).toBe(state);
  });
});

describe('retitleTabs', () => {
  it('按解析函数更新标题，未解析的保持原样', () => {
    const state = build('/a', '/b');
    const next = retitleTabs(state, url => (url === '/a' ? '资产' : undefined));
    expect(next.tabs.map(item => item.title)).toEqual(['资产', 'b']);
  });

  it('没有变化时返回原对象', () => {
    const state = build('/a');
    expect(retitleTabs(state, () => undefined)).toBe(state);
    expect(retitleTabs(state, () => 'a')).toBe(state);
  });
});
