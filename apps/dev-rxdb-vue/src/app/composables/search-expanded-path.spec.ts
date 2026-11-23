import type { RxDB } from '@aiao/rxdb';
import { SortableFileNode, SortableMenuLarge, SortableMenuSimple } from '@aiao/rxdb-test/entities';
import { describe, expect, it, vi } from 'vitest';

const zhT = vi.hoisted(() => {
  const names: Record<string, string> = {
    'page.tree.writeOp.create': '新建',
    'page.tree.writeOp.rename': '重命名',
    'page.tree.writeOp.batchAdd': '批量添加',
    'page.tree.writeOp.delete': '删除',
    'page.tree.writeOp.deleteAll': '删除全部',
    'page.tree.writeOp.cascadeDelete': '级联删除',
    'page.tree.writeOp.deletePromote': '删除并提升子节点',
    'page.tree.writeOp.drag': '拖放'
  };
  return (key: string, params?: Record<string, unknown>): string => {
    if (key === 'page.tree.writeFailed') return `${params?.operation ?? ''}失败：${params?.message ?? ''}`;
    return names[key] ?? key;
  };
});

vi.mock('@aiao/rxdb-i18n-vue', () => ({
  useI18n: () => ({ t: zhT, locale: { value: 'zh-Hans' } }),
  useI18nOptional: () => ({ t: zhT, locale: { value: 'zh-Hans' } })
}));

import { ref } from 'vue';
import { useFileManagerStore } from './useFileManagerStore.js';
import { useTreeMenuStore } from './useTreeMenuStore.js';
import { useTreeMenuVirtualStore } from './useTreeMenuVirtualStore.js';

const ROOT_ID = '00000000-0000-4000-8000-000000000001';
const NESTED_ID = '00000000-0000-4000-8000-000000000002';
const TARGET_ID = '00000000-0000-4000-8000-000000000003';

const createFileNode = (data: Partial<SortableFileNode>): SortableFileNode =>
  Object.assign({} as SortableFileNode, data);
const createMenu = (data: Partial<SortableMenuLarge>): SortableMenuLarge =>
  Object.assign({} as SortableMenuLarge, data);

describe('collapsed search paths', () => {
  it('shows every collapsed ancestor of a matching file without changing expansion state', () => {
    const files = ref([
      createFileNode({
        id: ROOT_ID,
        name: 'Root',
        extension: null,
        type: 'folder',
        parentId: null,
        sortOrder: 'a',
        size: null
      }),
      createFileNode({
        id: NESTED_ID,
        name: 'Nested',
        extension: null,
        type: 'folder',
        parentId: ROOT_ID,
        sortOrder: 'a',
        size: null
      }),
      createFileNode({
        id: TARGET_ID,
        name: 'target',
        extension: '.txt',
        type: 'file',
        parentId: NESTED_ID,
        sortOrder: 'a',
        size: 1
      })
    ]);
    const store = useFileManagerStore(files, {} as RxDB);

    store.setSearchKeyword('target');

    expect(store.treeNodes.value.map(node => node.file.id)).toEqual([ROOT_ID, NESTED_ID, TARGET_ID]);
    expect(store.expandedIds.value.size).toBe(0);

    store.clearSearch();

    expect(store.treeNodes.value.map(node => node.file.id)).toEqual([ROOT_ID]);
  });

  it('库里的扩展名不带点：完整文件名与 .扩展名都命中，搜索路径上的祖先画成展开（与 Angular / React 同口径）', () => {
    const files = ref([
      createFileNode({ id: ROOT_ID, name: 'Docs', extension: null, type: 'folder', parentId: null, sortOrder: 'a' }),
      createFileNode({
        id: TARGET_ID,
        name: 'notes',
        extension: 'txt',
        type: 'file',
        parentId: ROOT_ID,
        sortOrder: 'a'
      })
    ]);
    const store = useFileManagerStore(files, {} as RxDB);

    store.setSearchKeyword('notes.txt');
    expect(store.treeNodes.value.map(node => [node.file.id, node.isExpanded])).toEqual([
      [ROOT_ID, true],
      [TARGET_ID, false]
    ]);

    store.setSearchKeyword('.txt');
    expect(store.treeNodes.value.map(node => node.file.id)).toEqual([ROOT_ID, TARGET_ID]);
    expect(store.expandedIds.value.size).toBe(0);
  });

  it('两种菜单树搜索时同样把命中项的祖先画成展开，展开集合不变', () => {
    const rows: Partial<SortableMenuLarge>[] = [
      { id: ROOT_ID, title: 'Root', parentId: null, sortOrder: 'a' },
      { id: NESTED_ID, title: 'Nested', parentId: ROOT_ID, sortOrder: 'a' },
      { id: TARGET_ID, title: 'Target Menu', parentId: NESTED_ID, sortOrder: 'a' }
    ];
    const simple = useTreeMenuStore(ref(rows.map(row => Object.assign({} as SortableMenuSimple, row))), {} as RxDB);
    const virtual = useTreeMenuVirtualStore(ref(rows.map(row => createMenu(row))), {} as RxDB);

    simple.setSearchKeyword('target');
    virtual.setSearchKeyword('target');

    const expected = [
      [ROOT_ID, true],
      [NESTED_ID, true],
      [TARGET_ID, false]
    ];
    expect(simple.treeNodes.value.map(node => [node.menu.id, node.isExpanded])).toEqual(expected);
    expect(virtual.treeNodes.value.map(node => [node.menu.id, node.isExpanded])).toEqual(expected);
    expect(simple.expandedIds.value.size).toBe(0);
    expect(virtual.expandedIds.value.size).toBe(0);
  });

  it('shows every collapsed ancestor of a matching virtual menu without changing expansion state', () => {
    const menus = ref([
      createMenu({ id: ROOT_ID, title: 'Root', parentId: null, sortOrder: 'a' }),
      createMenu({ id: NESTED_ID, title: 'Nested', parentId: ROOT_ID, sortOrder: 'a' }),
      createMenu({ id: TARGET_ID, title: 'Target Menu', parentId: NESTED_ID, sortOrder: 'a' })
    ]);
    const store = useTreeMenuVirtualStore(menus, {} as RxDB);

    store.setSearchKeyword('target');

    expect(store.treeNodes.value.map(node => node.menu.id)).toEqual([ROOT_ID, NESTED_ID, TARGET_ID]);
    expect(store.expandedIds.value.size).toBe(0);

    store.setSearchKeyword('');

    expect(store.treeNodes.value.map(node => node.menu.id)).toEqual([ROOT_ID]);
  });
});
