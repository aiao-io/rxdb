import { FileNode, MenuLarge } from '@aiao/rxdb-test/entities';
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useFileManagerStore } from './useFileManagerStore.js';
import { useTreeMenuVirtualStore } from './useTreeMenuVirtualStore.js';

const ROOT_ID = '00000000-0000-4000-8000-000000000001';
const NESTED_ID = '00000000-0000-4000-8000-000000000002';
const TARGET_ID = '00000000-0000-4000-8000-000000000003';

const createFileNode = (data: Partial<FileNode>): FileNode => Object.assign({} as FileNode, data);
const createMenu = (data: Partial<MenuLarge>): MenuLarge => Object.assign({} as MenuLarge, data);

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
    const store = useFileManagerStore(files);

    store.setSearchKeyword('target');

    expect(store.treeNodes.value.map(node => node.file.id)).toEqual([ROOT_ID, NESTED_ID, TARGET_ID]);
    expect(store.expandedIds.value.size).toBe(0);

    store.clearSearch();

    expect(store.treeNodes.value.map(node => node.file.id)).toEqual([ROOT_ID]);
  });

  it('shows every collapsed ancestor of a matching virtual menu without changing expansion state', () => {
    const menus = ref([
      createMenu({ id: ROOT_ID, title: 'Root', parentId: null, sortOrder: 'a' }),
      createMenu({ id: NESTED_ID, title: 'Nested', parentId: ROOT_ID, sortOrder: 'a' }),
      createMenu({ id: TARGET_ID, title: 'Target Menu', parentId: NESTED_ID, sortOrder: 'a' })
    ]);
    const store = useTreeMenuVirtualStore(menus);

    store.setSearchKeyword('target');

    expect(store.treeNodes.value.map(node => node.menu.id)).toEqual([ROOT_ID, NESTED_ID, TARGET_ID]);
    expect(store.expandedIds.value.size).toBe(0);

    store.setSearchKeyword('');

    expect(store.treeNodes.value.map(node => node.menu.id)).toEqual([ROOT_ID]);
  });
});
