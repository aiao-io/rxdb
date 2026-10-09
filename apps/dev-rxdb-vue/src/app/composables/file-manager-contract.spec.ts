import type { RxDB } from '@aiao/rxdb';
import { SortableFileLarge, SortableFileNode } from '@aiao/rxdb-test/entities';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, ref } from 'vue';
import { generateBatchFiles } from '../utils/file-utils';
import { useFileManagerLazyStore } from './useFileManagerLazyStore';
import { useFileManagerStore } from './useFileManagerStore';

const queries = vi.hoisted(() => ({ findAll: vi.fn() }));

// 实体类的静态 findAll 由运行时注入，这里挂上替身以便断言 store 发出的查询
vi.mock('@aiao/rxdb-test/entities', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-test/entities')>();
  Object.assign(actual.SortableFileLarge, { findAll: queries.findAll });
  return { ...actual };
});

interface FileSeed {
  name: string;
  type: 'file' | 'folder';
  extension?: string | null;
  size?: number | null;
  hasChildren?: boolean;
}

class LinkedFile {
  static nextId = 0;
  readonly id = `file-${LinkedFile.nextId++}`;
  readonly parent$ = {
    set: vi.fn((parent: LinkedFile | null) => {
      this.parentId = parent?.id ?? null;
    })
  };
  parentId: string | null = null;
  sortOrder?: string;
  type: 'file' | 'folder';
  hasChildren?: boolean | null;
  name: string;
  extension?: string | null;
  size?: number | null;

  constructor(seed: FileSeed) {
    this.name = seed.name;
    this.type = seed.type;
    this.extension = seed.extension;
    this.size = seed.size;
    this.hasChildren = seed.hasChildren;
  }
}

class UnlinkedFile {
  static nextId = 0;
  readonly id = `unlinked-${UnlinkedFile.nextId++}`;
  parentId: string | null = null;
  sortOrder?: string;
  type: 'file' | 'folder';
  hasChildren?: boolean | null;
  name: string;
  extension?: string | null;
  size?: number | null;

  constructor(seed: FileSeed) {
    this.name = seed.name;
    this.type = seed.type;
    this.extension = seed.extension;
    this.size = seed.size;
    this.hasChildren = seed.hasChildren;
  }
}

function forceFolderThenChild(): void {
  vi.spyOn(Math, 'random')
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(0.9)
    .mockReturnValueOnce(0.9)
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(0)
    .mockReturnValueOnce(0);
}

function createFile(name: string, type: 'file' | 'folder', sortOrder: string): SortableFileNode {
  return Object.assign(Object.create(SortableFileNode.prototype) as SortableFileNode, {
    extension: null,
    id: name,
    name,
    parentId: null,
    size: null,
    sortOrder,
    type
  });
}

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, value)
  };
}

/** 在组件作用域里创建懒加载 store（onMounted 订阅根节点），返回 store 与卸载函数。 */
const mountLazyStore = () => {
  const stores: Array<ReturnType<typeof useFileManagerLazyStore>> = [];
  const app = createApp({
    setup() {
      stores.push(useFileManagerLazyStore({} as RxDB));
      return () => null;
    }
  });
  app.mount(document.createElement('div'));
  const store = stores.at(0);
  if (!store) throw new Error('lazy store creation failed');
  return { store, unmount: () => app.unmount() };
};

describe('file manager contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
    LinkedFile.nextId = 0;
    UnlinkedFile.nextId = 0;
    queries.findAll.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fails loudly when a generated child cannot link its required parent relation', () => {
    forceFolderThenChild();

    expect(() => generateBatchFiles(2, UnlinkedFile)).toThrow('parent$');
  });

  it('links generated children through the entity parent relation', () => {
    forceFolderThenChild();

    const files = generateBatchFiles(2, LinkedFile);

    expect(files[1].parent$.set).toHaveBeenCalledWith(files[0]);
    expect(files[1].parentId).toBe(files[0].id);
  });

  it('does not write sortOrder on generated files, leaving the key to the engine', () => {
    const files = generateBatchFiles(20, LinkedFile);

    expect(files).toHaveLength(20);
    for (const file of files) {
      expect(file.sortOrder).toBeUndefined();
    }
  });

  it('建树顺序 = 查询顺序', () => {
    // 查询给出的顺序与 sortOrder 字典序、文件夹优先都不同：手动模式不得再排序
    const files = [
      createFile('later-folder', 'folder', 'b'),
      createFile('first-file', 'file', 'a'),
      createFile('another-folder', 'folder', 'c')
    ];

    const store = useFileManagerStore(ref(files), {} as RxDB);

    expect(store.sortMode.value).toBe('manual');
    expect(store.treeNodes.value.map(node => node.file.name)).toEqual(['later-folder', 'first-file', 'another-folder']);
  });

  it('查询不传 orderBy', () => {
    const findAll = queries.findAll.mockReturnValue(of([]));
    const folder = createFile('folder', 'folder', 'a');
    Object.assign(folder, { hasChildren: true });
    findAll.mockReturnValueOnce(of([folder as unknown as SortableFileLarge]));
    const { store, unmount } = mountLazyStore();

    store.toggleExpand(folder.id);
    store.expandAll();

    // 根查询、子节点查询、展开全部
    expect(findAll).toHaveBeenCalledTimes(3);
    for (const [query] of findAll.mock.calls) {
      expect(query).not.toHaveProperty('orderBy');
    }
    unmount();
  });

  it('建树顺序 = 查询顺序：懒加载 store 不再文件夹优先预排序', () => {
    // 键的字典序（folder < file）与查询顺序（file、folder）相反，也与文件夹优先相反
    const file = createFile('x-file', 'file', 'b');
    const folder = createFile('y-folder', 'folder', 'a');
    queries.findAll.mockReturnValue(of([file, folder] as unknown as SortableFileLarge[]));
    const { store, unmount } = mountLazyStore();

    expect(store.treeNodes.value.map(node => node.file.name)).toEqual(['x-file', 'y-folder']);
    unmount();
  });

  it('空白名称的行不展示，但仍在 siblingIds 的完整组里（根组与子组）', async () => {
    const folder = Object.assign(createFile('p', 'folder', 'a1'), { hasChildren: true });
    const hiddenChild = Object.assign(createFile('hc', 'file', 'a1'), { name: '   ', parentId: 'p' });
    const children = [
      Object.assign(createFile('c1', 'file', 'a0'), { parentId: 'p' }),
      hiddenChild,
      Object.assign(createFile('c2', 'file', 'a2'), { parentId: 'p' })
    ];
    const roots = [
      createFile('a', 'file', 'a0'),
      folder,
      Object.assign(createFile('h', 'file', 'a2'), { name: '   ' })
    ];
    queries.findAll
      .mockReturnValueOnce(of(roots as unknown as SortableFileLarge[]))
      .mockReturnValueOnce(of(children as unknown as SortableFileLarge[]));
    const { store, unmount } = mountLazyStore();

    await store.toggleExpand('p');

    expect(store.treeNodes.value.map(node => node.file.name)).toEqual(['a', 'p', 'c1', 'c2']);
    expect(store.siblingIds(null)).toEqual(['a', 'p', 'h']);
    expect(store.siblingIds('p')).toEqual(['c1', 'hc', 'c2']);
    unmount();
  });

  it('展开全部：空白名称的行同样留在完整组里', () => {
    const all = [createFile('a', 'file', 'a0'), Object.assign(createFile('h', 'file', 'a1'), { name: '' })];
    queries.findAll.mockReturnValueOnce(of([])).mockReturnValueOnce(of(all as unknown as SortableFileLarge[]));
    const { store, unmount } = mountLazyStore();

    store.expandAll();

    expect(store.treeNodes.value.map(node => node.file.name)).toEqual(['a']);
    expect(store.siblingIds(null)).toEqual(['a', 'h']);
    unmount();
  });
});
