import { describe, expect, it } from 'vitest';
import {
  buildExplorerRows,
  compareExplorerNames,
  explorerActiveAncestor,
  explorerCreationParent,
  explorerDecorations,
  explorerInsertion,
  explorerNameError,
  explorerRowGeometry,
  type ExplorerRow
} from './workbench-explorer-model.js';

const keys = (rows: readonly ExplorerRow[]): string[] => rows.map(row => row.key);

describe('资源管理器树模型', () => {
  it('名称比较与 VS Code 一致：忽略大小写、数字按数值、点开头排在字母前', () => {
    const names = ['README.md', 'package.json', '.gitignore', 'b10.ts', 'b9.ts', 'Alpha.ts', 'alpha2.ts'];
    expect(names.toSorted(compareExplorerNames)).toEqual([
      '.gitignore',
      'Alpha.ts',
      'alpha2.ts',
      'b9.ts',
      'b10.ts',
      'package.json',
      'README.md'
    ]);
  });

  it('文件夹排在文件之前，各自按名称排序', () => {
    const rows = buildExplorerRows(
      ['README.md', 'src/main.tsx', 'package.json', 'src/Counter.tsx', 'docs/guide.md', '.gitignore'],
      { collapsed: new Set(), compact: false }
    );
    expect(keys(rows)).toEqual([
      'docs',
      'docs/guide.md',
      'src',
      'src/Counter.tsx',
      'src/main.tsx',
      '.gitignore',
      'package.json',
      'README.md'
    ]);
  });

  it('子级层级从 1 起算，折叠的文件夹隐藏其后代', () => {
    const rows = buildExplorerRows(['src/a/b.ts', 'src/a/c.ts', 'src/d.ts', 'e.ts'], {
      collapsed: new Set(['src/a']),
      compact: false
    });
    expect(rows.map(row => [row.key, row.level, row.kind, row.expanded])).toEqual([
      ['src', 1, 'folder', true],
      ['src/a', 2, 'folder', false],
      ['src/d.ts', 2, 'file', undefined],
      ['e.ts', 1, 'file', undefined]
    ]);
  });

  it('紧凑文件夹：只含一个子文件夹的链合并成一行，以最深的目录为键', () => {
    const rows = buildExplorerRows(['.github/workflows/ci.yml', 'docs/guide/intro.md', 'docs/guide/more.md', 'x.ts'], {
      collapsed: new Set(),
      compact: true
    });
    expect(rows.map(row => [row.key, row.level, row.segments])).toEqual([
      ['.github/workflows', 1, ['.github', 'workflows']],
      ['.github/workflows/ci.yml', 2, ['ci.yml']],
      ['docs/guide', 1, ['docs', 'guide']],
      ['docs/guide/intro.md', 2, ['intro.md']],
      ['docs/guide/more.md', 2, ['more.md']],
      ['x.ts', 1, ['x.ts']]
    ]);
    expect(rows[0]?.segmentPaths).toEqual(['.github', '.github/workflows']);
    expect(rows[1]?.ancestors).toEqual(['.github/workflows']);
  });

  it('紧凑链在某层同时含文件时在该层断开', () => {
    const rows = buildExplorerRows(['a/b/c.ts', 'a/readme.md'], { collapsed: new Set(), compact: true });
    expect(rows.map(row => [row.key, row.level, row.segments])).toEqual([
      ['a', 1, ['a']],
      ['a/b', 2, ['b']],
      ['a/b/c.ts', 3, ['c.ts']],
      ['a/readme.md', 2, ['readme.md']]
    ]);
    expect(rows[2]?.ancestors).toEqual(['a', 'a/b']);
  });

  it('紧凑链的展开状态跟随最深目录', () => {
    const rows = buildExplorerRows(['a/b/c/d.ts'], { collapsed: new Set(['a/b/c']), compact: true });
    expect(rows.map(row => [row.key, row.expanded])).toEqual([['a/b/c', false]]);
  });

  it('关闭紧凑时每级目录独占一行', () => {
    const rows = buildExplorerRows(['a/b/c.ts'], { collapsed: new Set(), compact: false });
    expect(keys(rows)).toEqual(['a', 'a/b', 'a/b/c.ts']);
  });

  it('几何：缩进每级 8px，文件图标与折叠箭头同起点，文件名与目录名对齐，参考线每级 8px', () => {
    expect(explorerRowGeometry(1)).toEqual({ indent: 8, labelLeft: 30, guides: [] });
    expect(explorerRowGeometry(3)).toEqual({ indent: 24, labelLeft: 46, guides: [16, 24] });
  });

  it('激活缩进参考线属于焦点行所在的目录：展开的目录取自身，否则取父目录', () => {
    const rows = buildExplorerRows(['src/a/b.ts', 'src/c.ts'], { collapsed: new Set(), compact: false });
    expect(explorerActiveAncestor(rows, 'src/a')).toBe('src/a');
    expect(explorerActiveAncestor(rows, 'src/a/b.ts')).toBe('src/a');
    expect(explorerActiveAncestor(rows, 'src/c.ts')).toBe('src');
    expect(explorerActiveAncestor(rows, null)).toBeNull();
    const collapsed = buildExplorerRows(['src/a/b.ts'], { collapsed: new Set(['src/a']), compact: false });
    expect(explorerActiveAncestor(collapsed, 'src/a')).toBe('src');
  });

  it('Git 装饰：暂存字母优先，未跟踪显示 U，空白列忽略', () => {
    const { files } = explorerDecorations([
      { path: 'a.ts', index: 'M', worktree: ' ' },
      { path: 'b.ts', index: ' ', worktree: 'M' },
      { path: 'c.ts', index: '?', worktree: '?' },
      { path: 'd.ts', index: 'A', worktree: 'M' },
      { path: 'e.ts', index: 'R', worktree: ' ' },
      { path: 'f.ts', index: ' ', worktree: 'D' }
    ]);
    expect(Object.fromEntries(files)).toEqual({
      'a.ts': 'M',
      'b.ts': 'M',
      'c.ts': 'U',
      'd.ts': 'A',
      'e.ts': 'R',
      'f.ts': 'D'
    });
  });

  it('Git 装饰向上传播到含更改的文件夹：取最显著状态，已删除不传播', () => {
    const { folders } = explorerDecorations([
      { path: 'src/a/x.ts', index: ' ', worktree: '?' },
      { path: 'src/a/y.ts', index: ' ', worktree: 'M' },
      { path: 'docs/z.md', index: ' ', worktree: '?' },
      { path: 'gone/deleted.md', index: ' ', worktree: 'D' }
    ]);
    expect(Object.fromEntries(folders)).toEqual({ src: 'M', 'src/a': 'M', docs: 'U' });
  });

  it('新建位置：选中文件夹则建在其中，选中文件建在其父目录，无选中建在根', () => {
    const rows = buildExplorerRows(['src/a.ts', 'docs/b.md', 'c.ts'], { collapsed: new Set(), compact: true });
    expect(explorerCreationParent(rows, 'src')).toBe('src');
    expect(explorerCreationParent(rows, 'src/a.ts')).toBe('src');
    expect(explorerCreationParent(rows, 'c.ts')).toBe('');
    expect(explorerCreationParent(rows, null)).toBe('');
    expect(explorerCreationParent(rows, 'missing')).toBe('');
  });

  it('输入行插入点：新文件在该目录文件组之首，新文件夹在文件夹组之首，层级为目录下一级', () => {
    const rows = buildExplorerRows(['src/lib/x.ts', 'src/a.ts', 'docs/b.md', 'c.ts'], {
      collapsed: new Set(),
      compact: false
    });
    expect(keys(rows)).toEqual(['docs', 'docs/b.md', 'src', 'src/lib', 'src/lib/x.ts', 'src/a.ts', 'c.ts']);
    expect(explorerInsertion(rows, '', 'folder')).toEqual({ index: 0, level: 1 });
    expect(explorerInsertion(rows, '', 'file')).toEqual({ index: 6, level: 1 });
    expect(explorerInsertion(rows, 'src', 'folder')).toEqual({ index: 3, level: 2 });
    expect(explorerInsertion(rows, 'src', 'file')).toEqual({ index: 5, level: 2 });
    expect(explorerInsertion(rows, 'docs', 'file')).toEqual({ index: 1, level: 2 });
    expect(explorerInsertion(rows, 'docs', 'folder')).toEqual({ index: 1, level: 2 });
  });

  it('命名校验：空名、斜杠开头、非法字符与同名冲突', () => {
    const files = ['src/a.ts', 'src/lib/x.ts', 'readme.md'];
    expect(explorerNameError(files, 'src', '')).toEqual({ kind: 'empty' });
    expect(explorerNameError(files, 'src', '   ')).toEqual({ kind: 'empty' });
    expect(explorerNameError(files, '', '/abs.ts')).toEqual({ kind: 'slash' });
    expect(explorerNameError(files, '', 'a\\b.ts')).toEqual({ kind: 'invalid', name: 'a\\b.ts' });
    expect(explorerNameError(files, '', '..')).toEqual({ kind: 'invalid', name: '..' });
    expect(explorerNameError(files, 'src', 'a.ts')).toEqual({ kind: 'exists', name: 'a.ts' });
    expect(explorerNameError(files, 'src', 'lib')).toEqual({ kind: 'exists', name: 'lib' });
    expect(explorerNameError(files, 'src', 'b.ts')).toBeNull();
    expect(explorerNameError(files, '', 'src/new/deep.ts')).toBeNull();
  });

  it('命名校验：把文件当目录用、重命名为自身不算冲突', () => {
    const files = ['src/a.ts', 'readme.md'];
    expect(explorerNameError(files, '', 'readme.md/child.ts')).toEqual({ kind: 'exists', name: 'readme.md/child.ts' });
    expect(explorerNameError(files, 'src', 'a.ts', 'src/a.ts')).toBeNull();
    expect(explorerNameError(files, 'src', 'readme.md')).toBeNull();
  });
});
