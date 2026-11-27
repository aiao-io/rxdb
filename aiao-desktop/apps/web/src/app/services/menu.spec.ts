import { describe, expect, it } from 'vitest';

import { MenuEntry, isMenuCommand, section } from './menu';

describe('菜单条目', () => {
  it('isMenuCommand 只认带 id 的可点击项：分隔线、小标题与搜索框都不是', () => {
    const entries: MenuEntry[] = [{ id: 'new', label: 'New' }, '-', { head: 'Recent' }, { field: 'Search' }];
    expect(entries.map(isMenuCommand)).toEqual([true, false, false, false]);
  });

  it('section 把标题和条目组成菜单栏上的一个菜单', () => {
    const items: MenuEntry[] = [{ id: 'a', label: 'A' }, '-'];
    expect(section('File', items)).toEqual({ label: 'File', items });
  });
});
