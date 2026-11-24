import { describe, expect, it } from 'vitest';

import { METRIC_NOTES, METRIC_TABS, filterActivityRows, metricValue } from './activity-metrics';

const rows = [
  { id: 'w1', appId: 'finder', title: 'Downloads', source: 'Built-in app' },
  { id: 'w2', appId: 'terminal', title: 'zsh', source: 'Web app' },
  { id: 'w3', appId: 'game', title: 'Snake', source: 'Bundled game' }
];

describe('filterActivityRows', () => {
  it('按标题、来源或应用 id 过滤', () => {
    expect(filterActivityRows(rows, 'down').map(row => row.id)).toEqual(['w1']);
    expect(filterActivityRows(rows, 'bundled').map(row => row.id)).toEqual(['w3']);
    expect(filterActivityRows(rows, 'terminal').map(row => row.id)).toEqual(['w2']);
  });

  it('查询为空时保留原列表', () => {
    expect(filterActivityRows(rows, '  ')).toBe(rows);
  });

  it('没有匹配项时返回空列表', () => {
    expect(filterActivityRows(rows, 'unknown')).toEqual([]);
  });
});

describe('metricValue', () => {
  it('同一行同一标签读数稳定，不同标签格式不同', () => {
    for (const tab of METRIC_TABS) expect(metricValue(tab, 'finder|w1')).toBe(metricValue(tab, 'finder|w1'));
    expect(metricValue('CPU', 'finder|w1')).toMatch(/^\d+\.\d%$/);
    expect(metricValue('Memory', 'finder|w1')).toMatch(/^\d+\.\d MB$/);
    expect(metricValue('Energy', 'finder|w1')).toMatch(/^\d+\.\d$/);
    expect(metricValue('Disk', 'finder|w1')).toMatch(/^\d+\.\d MB$/);
    expect(metricValue('Network', 'finder|w1')).toMatch(/^\d+\.\d KB\/s$/);
  });

  it('每个标签都有读数说明', () => {
    for (const tab of METRIC_TABS) expect(METRIC_NOTES[tab].length).toBeGreaterThan(0);
  });
});
