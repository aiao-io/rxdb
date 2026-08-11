import { FileNode } from '@aiao/rxdb-test/entities';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { getSortComparator, SortMode } from '../utils/file-sorters';
import { generateBatchFiles } from '../utils/file-utils';
import { useFileManagerStore } from './useFileManagerStore';

interface FileSeed {
  name: string;
  type: 'file' | 'folder';
  sortOrder: string | null;
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
  sortOrder: string | null;
  type: 'file' | 'folder';
  hasChildren?: boolean | null;
  name: string;
  extension?: string | null;
  size?: number | null;

  constructor(seed: FileSeed) {
    this.name = seed.name;
    this.type = seed.type;
    this.sortOrder = seed.sortOrder;
    this.extension = seed.extension;
    this.size = seed.size;
    this.hasChildren = seed.hasChildren;
  }
}

class UnlinkedFile {
  static nextId = 0;
  readonly id = `unlinked-${UnlinkedFile.nextId++}`;
  parentId: string | null = null;
  sortOrder: string | null;
  type: 'file' | 'folder';
  hasChildren?: boolean | null;
  name: string;
  extension?: string | null;
  size?: number | null;

  constructor(seed: FileSeed) {
    this.name = seed.name;
    this.type = seed.type;
    this.sortOrder = seed.sortOrder;
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

function createFile(name: string, type: 'file' | 'folder', sortOrder: string): FileNode {
  return Object.assign(Object.create(FileNode.prototype) as FileNode, {
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

describe('file manager contracts', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorage());
    LinkedFile.nextId = 0;
    UnlinkedFile.nextId = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fails loudly when a generated child cannot link its required parent relation', () => {
    forceFolderThenChild();

    expect(() => generateBatchFiles(2, UnlinkedFile, [])).toThrow('parent$');
  });

  it('links generated children through the entity parent relation', () => {
    forceFolderThenChild();

    const files = generateBatchFiles(2, LinkedFile, []);

    expect(files[1].parent$.set).toHaveBeenCalledWith(files[0]);
    expect(files[1].parentId).toBe(files[0].id);
  });

  it('uses the shared manual comparator for the persisted manual mode', () => {
    const files = [createFile('first-file', 'file', 'a'), createFile('later-folder', 'folder', 'b')];
    const expected = [...files].sort(getSortComparator(SortMode.Manual));

    const store = useFileManagerStore(ref(files));

    expect(store.treeNodes.value.map(node => node.file)).toEqual(expected);
  });
});
