import { describe, expect, it } from 'vitest';

import { FsNode } from '../../disk/disk-tree';
import {
  DEFAULT_VIEW_SETTINGS,
  FINDER_TAG_COLORS,
  FinderViewSettings,
  defaultSortDirection,
  isFinderViewSettings,
  sortNodes,
  viewSettingsKey
} from './finder-model';

const node = (name: string, init: Partial<FsNode> = {}): FsNode => ({
  name,
  path: ['dir', name],
  kind: 'file',
  icon: 'f-doc',
  k: 'Document',
  hidden: false,
  ...init
});

describe('defaultSortDirection 每种排序的默认方向', () => {
  it('名称、种类升序；日期、大小降序（与 macOS 一致）', () => {
    expect(defaultSortDirection('name')).toBe('asc');
    expect(defaultSortDirection('kind')).toBe('asc');
    expect(defaultSortDirection('date')).toBe('desc');
    expect(defaultSortDirection('size')).toBe('desc');
  });
});

describe('sortNodes 排序与方向', () => {
  const files = [
    node('b.md', { date: new Date(2026, 0, 2), bytes: 10 }),
    node('a.md', { date: new Date(2026, 0, 3), bytes: 200 }),
    node('c.md', { date: new Date(2026, 0, 1), bytes: 30 })
  ];

  it('名称升序、降序', () => {
    expect(sortNodes([...files], 'name').map(item => item.name)).toEqual(['a.md', 'b.md', 'c.md']);
    expect(sortNodes([...files], 'name', 'desc').map(item => item.name)).toEqual(['c.md', 'b.md', 'a.md']);
  });

  it('日期与大小按升序排，降序把顺序反过来', () => {
    expect(sortNodes([...files], 'date').map(item => item.name)).toEqual(['c.md', 'b.md', 'a.md']);
    expect(sortNodes([...files], 'date', 'desc').map(item => item.name)).toEqual(['a.md', 'b.md', 'c.md']);
    expect(sortNodes([...files], 'size').map(item => item.name)).toEqual(['b.md', 'c.md', 'a.md']);
    expect(sortNodes([...files], 'size', 'desc').map(item => item.name)).toEqual(['a.md', 'c.md', 'b.md']);
  });

  it('文件夹恒在文件前面，方向只在同类里生效', () => {
    const mixed = [node('z.txt'), node('m', { kind: 'folder', children: [] })];
    expect(sortNodes([...mixed], 'name', 'desc')[0].name).toBe('m');
  });
});

describe('isFinderViewSettings 视图设置的类型守卫', () => {
  it('完整设置通过；缺字段、类型不符或未知枚举都不通过', () => {
    expect(isFinderViewSettings({ ...DEFAULT_VIEW_SETTINGS })).toBe(true);
    expect(isFinderViewSettings({ ...DEFAULT_VIEW_SETTINGS, view: 'mosaic' })).toBe(false);
    expect(isFinderViewSettings({ ...DEFAULT_VIEW_SETTINGS, sort: 'color' })).toBe(false);
    expect(isFinderViewSettings({ ...DEFAULT_VIEW_SETTINGS, direction: 'up' })).toBe(false);
    expect(isFinderViewSettings({ view: 'icon' })).toBe(false);
    expect(isFinderViewSettings(null)).toBe(false);
    expect(isFinderViewSettings('icon')).toBe(false);
  });
});

describe('viewSettingsKey 目录视图设置键', () => {
  it('按 Finder 路径拼出偏好键', () => {
    expect(viewSettingsKey(['Macintosh HD', 'Users', 'stevejobs'])).toBe('finder:view:Macintosh HD/Users/stevejobs');
  });
});

describe('FINDER_TAG_COLORS 七种标签颜色', () => {
  it('与 macOS 的默认标签一致', () => {
    expect(FINDER_TAG_COLORS).toEqual(['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray']);
  });
});

describe('DEFAULT_VIEW_SETTINGS 目录默认设置', () => {
  it('默认图标视图、按名称升序', () => {
    const defaults: FinderViewSettings = DEFAULT_VIEW_SETTINGS;
    expect(defaults.view).toBe('icon');
    expect(defaults.sort).toBe('name');
    expect(defaults.direction).toBe('asc');
  });
});
