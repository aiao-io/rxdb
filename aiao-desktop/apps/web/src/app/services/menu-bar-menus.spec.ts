import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { configureServices } from '../testing/angular';
import { section } from './menu';
import { MenuBarMenus } from './menu-bar-menus';

function setup(): MenuBarMenus {
  configureServices([MenuBarMenus]);
  return TestBed.inject(MenuBarMenus);
}

describe('MenuBarMenus', () => {
  it('没有登记菜单时为空', () => {
    const menus = setup();
    expect(menus.sections()).toEqual([]);
    expect(menus.entries()).toEqual([]);
  });

  it('登记后按菜单栏当前展示的内容给出菜单项，并在来源变化时更新', () => {
    const menus = setup();
    const source = signal([section('Finder', [{ id: 'n', label: 'New Finder Window', key: '⌘N' }])]);
    menus.set(source);

    expect(menus.sections()).toHaveLength(1);
    expect(menus.entries()).toEqual([{ id: 'n', label: 'New Finder Window', key: '⌘N' }]);

    source.set([
      section('Apple', [{ id: 'lock', label: 'Lock Screen', key: '⌃⌘Q' }]),
      section('Finder', [{ id: 'n', label: 'New Finder Window', key: '⌘N' }])
    ]);
    expect(menus.entries().map(entry => (typeof entry === 'object' && 'id' in entry ? entry.id : null))).toEqual([
      'lock',
      'n'
    ]);
  });
});
