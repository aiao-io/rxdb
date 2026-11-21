import { describe, expect, it } from 'vitest';
import { isTreeFolder, resolveTreeMove, treePathBase, treePathParent } from './workbench-tree-drag.js';

describe('workbench tree drag path helpers', () => {
  it('splits parents and base names with the root as empty string', () => {
    expect(treePathParent('src/main.ts')).toBe('src');
    expect(treePathParent('src/lib/util.ts')).toBe('src/lib');
    expect(treePathParent('main.ts')).toBe('');
    expect(treePathBase('src/main.ts')).toBe('main.ts');
    expect(treePathBase('main.ts')).toBe('main.ts');
  });

  it('detects folders by any descendant file', () => {
    const files = ['src/main.ts', 'src/lib/util.ts', 'readme.md'];
    expect(isTreeFolder(files, 'src')).toBe(true);
    expect(isTreeFolder(files, 'src/lib')).toBe(true);
    expect(isTreeFolder(files, 'readme.md')).toBe(false);
    expect(isTreeFolder(files, 'missing')).toBe(false);
  });
});

describe('resolveTreeMove', () => {
  const files = ['a.txt', 'src/main.ts', 'src/lib/util.ts', 'docs/guide.md'];

  it('moves a file into a folder row', () => {
    expect(resolveTreeMove(files, 'a.txt', 'src')).toEqual({ kind: 'move', destination: 'src/a.txt' });
  });

  it('moves onto a file row into that file parent directory', () => {
    expect(resolveTreeMove(files, 'a.txt', 'docs/guide.md')).toEqual({ kind: 'move', destination: 'docs/a.txt' });
  });

  it('moves a folder into a sibling folder', () => {
    expect(resolveTreeMove(files, 'src', 'docs')).toEqual({ kind: 'move', destination: 'docs/src' });
  });

  it('moves a grandchild folder up to its grandparent', () => {
    expect(resolveTreeMove(['a/b/c/x.ts', 'a/keep.ts'], 'a/b/c', 'a')).toEqual({
      kind: 'move',
      destination: 'a/c'
    });
  });

  it('moves to the root when dropped on empty tree space', () => {
    expect(resolveTreeMove(files, 'src/main.ts', null)).toEqual({ kind: 'move', destination: 'main.ts' });
    expect(resolveTreeMove(files, 'src', null)).toEqual({ kind: 'noop' });
  });

  it('rejects dropping a row onto itself', () => {
    expect(resolveTreeMove(files, 'a.txt', 'a.txt')).toEqual({ kind: 'reject' });
    expect(resolveTreeMove(files, 'src', 'src')).toEqual({ kind: 'reject' });
  });

  it('rejects dropping a folder onto its own descendant rows', () => {
    expect(resolveTreeMove(files, 'src', 'src/main.ts')).toEqual({ kind: 'reject' });
    expect(resolveTreeMove(files, 'src', 'src/lib')).toEqual({ kind: 'reject' });
  });

  it('does nothing when the target directory is the current parent', () => {
    expect(resolveTreeMove(['x/a.ts', 'x/b.ts'], 'x/a.ts', 'x/b.ts')).toEqual({ kind: 'noop' });
    expect(resolveTreeMove(files, 'src/lib', 'src')).toEqual({ kind: 'noop' });
    expect(resolveTreeMove(files, 'a.txt', null)).toEqual({ kind: 'noop' });
  });

  it('rejects when the destination path already exists', () => {
    expect(resolveTreeMove(files, 'a.txt', 'docs')).toEqual({ kind: 'move', destination: 'docs/a.txt' });
    expect(resolveTreeMove(['x.txt', 'docs/x.txt'], 'x.txt', 'docs')).toEqual({ kind: 'reject' });
  });

  it('rejects folder moves that would collide with existing files', () => {
    expect(resolveTreeMove(['a/one.ts', 'lib/a/two.ts'], 'a', 'lib')).toEqual({ kind: 'reject' });
  });

  it('rejects dropping a folder into a file row inside itself', () => {
    expect(resolveTreeMove(['a/one.ts'], 'a', 'a/one.ts')).toEqual({ kind: 'reject' });
  });
});
