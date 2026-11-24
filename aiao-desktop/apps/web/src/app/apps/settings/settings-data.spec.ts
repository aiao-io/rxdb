import { describe, expect, it } from 'vitest';

import { filterSettingsGroups, SETTINGS_GROUPS } from './settings-data';

describe('filterSettingsGroups', () => {
  it('按分区名称筛选并保留原分组顺序', () => {
    const groups = filterSettingsGroups(SETTINGS_GROUPS, 'network');
    expect(groups.flat().map(section => section.id)).toEqual(['network']);
  });

  it('查询为空时保留原分组', () => {
    expect(filterSettingsGroups(SETTINGS_GROUPS, '  ')).toBe(SETTINGS_GROUPS);
  });

  it('没有匹配项时返回空分组列表', () => {
    expect(filterSettingsGroups(SETTINGS_GROUPS, 'missing')).toEqual([]);
  });

  it('按设置项标签匹配分区（minimize → Desktop & Dock）', () => {
    expect(
      filterSettingsGroups(SETTINGS_GROUPS, 'minimize')
        .flat()
        .map(section => section.id)
    ).toEqual(['dock']);
  });

  it('标签匹配不区分大小写', () => {
    expect(
      filterSettingsGroups(SETTINGS_GROUPS, 'MINIMIZE')
        .flat()
        .map(section => section.id)
    ).toEqual(['dock']);
  });

  it('按别名匹配（dnd → Notifications）', () => {
    expect(
      filterSettingsGroups(SETTINGS_GROUPS, 'dnd')
        .flat()
        .map(section => section.id)
    ).toEqual(['notifications']);
  });

  it('一个查询可以同时命中多个分区的标签，都保留并按原顺序排列', () => {
    const ids = filterSettingsGroups(SETTINGS_GROUPS, 'colour')
      .flat()
      .map(section => section.id);
    expect(ids).toEqual(['appearance', 'displays']);
  });

  it('每个分区都声明了非空搜索标签', () => {
    for (const section of SETTINGS_GROUPS.flat()) {
      expect(section.searchTerms.length, section.id).toBeGreaterThan(0);
    }
  });
});
