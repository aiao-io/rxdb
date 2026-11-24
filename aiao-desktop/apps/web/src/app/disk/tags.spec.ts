import { describe, expect, it } from 'vitest';

import { DiskPath } from './disk-path';
import { FsNode } from './disk-tree';
import { TAG_COLORS, migrateTags, parseTagsMap, tagsKeyOf, tagsOf, withTags } from './tags';

const node = (path: DiskPath | null): FsNode => ({
  name: 'x',
  path,
  kind: 'file',
  icon: 'f-txt',
  k: 'Document',
  hidden: false
});

describe('parseTagsMap', () => {
  it('接受颜色数组并去重，拒绝非法形状', () => {
    expect(parseTagsMap({ 'Users/a': ['red', 'blue', 'red'] })).toEqual({ 'Users/a': ['red', 'blue'] });
    expect(parseTagsMap({})).toEqual({});
    expect(parseTagsMap(['red'])).toBeNull();
    expect(parseTagsMap(null)).toBeNull();
    expect(parseTagsMap({ 'Users/a': 'red' })).toBeNull();
    expect(parseTagsMap({ 'Users/a': ['pink'] })).toBeNull();
    expect(parseTagsMap({ '': ['red'] })).toBeNull();
  });
});

describe('withTags 与 tagsOf', () => {
  it('设置覆盖、空数组清除；tagsOf 按节点路径取', () => {
    const map = withTags({}, ['Users', 'a'], ['red']);
    expect(tagsOf(map, node(['Users', 'a']))).toEqual(['red']);
    expect(tagsOf(map, node(null))).toEqual([]);
    expect(tagsOf(map, node(['Users', 'b']))).toEqual([]);
    const cleared = withTags(map, ['Users', 'a'], []);
    expect(tagsOf(cleared, node(['Users', 'a']))).toEqual([]);
  });
});

describe('migrateTags', () => {
  it('改名/移动把条目与全部后代的键迁到新路径', () => {
    const tagged = withTags(withTags(withTags({}, ['a'], ['red']), ['a', 'b'], ['blue']), ['a', 'b', 'c.txt'], [
      'green'
    ]);
    const migrated = migrateTags(withTags(tagged, ['other'], ['gray']), ['a'], ['x', 'y']);
    expect(migrated).toEqual({
      'x/y': ['red'],
      'x/y/b': ['blue'],
      'x/y/b/c.txt': ['green'],
      other: ['gray']
    });
  });

  it('键没碰到时原样返回；同名不动', () => {
    const map = withTags({}, ['a'], ['red']);
    expect(migrateTags(map, ['b'], ['c'])).toBe(map);
    expect(migrateTags(map, ['a'], ['a'])).toBe(map);
  });
});

describe('tagsKeyOf 与颜色表', () => {
  it('路径字符串与七种 Finder 颜色', () => {
    expect(tagsKeyOf(['Users', 'a', 'x.txt'])).toBe('Users/a/x.txt');
    expect(TAG_COLORS).toEqual(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray']);
  });
});
