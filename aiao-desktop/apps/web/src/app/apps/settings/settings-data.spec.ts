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
});
