import type { RxDB } from '@aiao/rxdb';
import { MenuLarge, MenuSimple } from '@aiao/rxdb-test/entities';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { createApp, ref } from 'vue';
import { buildTreeMenuNodes } from '../utils/tree-menu';
import { useTreeMenuLazyStore } from './useTreeMenuLazyStore';
import { useTreeMenuStore } from './useTreeMenuStore';
import { useTreeMenuVirtualStore } from './useTreeMenuVirtualStore';

const ROOT_ID = '00000000-0000-4000-8000-000000000001';
const NESTED_ID = '00000000-0000-4000-8000-000000000002';
const TARGET_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_ID = '00000000-0000-4000-8000-000000000004';

interface TestMenu {
  id: string;
  parentId: string | null;
  sortOrder: string;
  title: string;
}

const menus: TestMenu[] = [
  { id: ROOT_ID, parentId: null, sortOrder: 'a', title: 'Root' },
  { id: NESTED_ID, parentId: ROOT_ID, sortOrder: 'a', title: 'Nested' },
  { id: TARGET_ID, parentId: NESTED_ID, sortOrder: 'a', title: 'Target Menu' },
  { id: OTHER_ID, parentId: ROOT_ID, sortOrder: 'b', title: 'Other' }
];

const asMenuSimple = (menu: TestMenu): MenuSimple => Object.assign({} as MenuSimple, menu);
const asMenuLarge = (menu: TestMenu): MenuLarge => Object.assign({ hasChildren: false } as MenuLarge, menu);

describe('tree menu contracts', () => {
  it('returns a match and every ancestor without unrelated branches', () => {
    const nodes = buildTreeMenuNodes(menus, new Set(), 'target');

    expect(nodes.map(node => node.menu.id)).toEqual([ROOT_ID, NESTED_ID, TARGET_ID]);
    expect(nodes.map(node => node.level)).toEqual([0, 1, 2]);
  });

  it('keeps simple and virtual stores on the same search contract', () => {
    const simple = useTreeMenuStore(ref(menus.map(asMenuSimple)));
    const virtual = useTreeMenuVirtualStore(ref(menus.map(asMenuLarge)));

    simple.setSearchKeyword('target');
    virtual.setSearchKeyword('target');

    expect(simple.treeNodes.value.map(node => node.menu.id)).toEqual([ROOT_ID, NESTED_ID, TARGET_ID]);
    expect(virtual.treeNodes.value.map(node => node.menu.id)).toEqual([ROOT_ID, NESTED_ID, TARGET_ID]);
  });

  it('searches the complete repository in the lazy store, including unloaded descendants', () => {
    const dataSource = {
      observeAllMenus: () => of(menus.map(asMenuLarge)),
      observeChildMenus: () => of([]),
      observeRootMenus: () => of([])
    };
    const stores: Array<ReturnType<typeof useTreeMenuLazyStore>> = [];
    const app = createApp({
      setup() {
        stores.push(useTreeMenuLazyStore({} as RxDB, dataSource));
        return () => null;
      }
    });
    app.mount(document.createElement('div'));
    const store = stores.at(0);
    if (!store) throw new Error('lazy store creation failed');

    store.setSearchKeyword('target');

    expect(store.treeNodes.value.map(node => node.menu.id)).toEqual([ROOT_ID, NESTED_ID, TARGET_ID]);
    app.unmount();
  });
});
