import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assetLabels, assetSchema } from '../schema.testing.js';
import { useLabels } from './labels.js';
import { readOnlyRecords } from './records-view.js';
import { useTranslation } from './translate.js';
beforeEach(() => {
  vi.stubGlobal('document', new Window().document);
  useLabels(assetLabels);
});
afterEach(() => {
  useTranslation(undefined);
  useLabels(undefined);
  vi.unstubAllGlobals();
});
describe('只读记录表', () => {
  const records = { a: { entity: 'Asset' as const, fields: { name: '工作站', status: null, purchasePrice: 120 } } };
  const cells = () => [...readOnlyRecords(records, assetSchema).querySelectorAll('td')].map(cell => cell.textContent);

  it('翻译实体、字段名与空值标记，用户录入的数据原样显示', () => {
    useTranslation(key => `<${key.replace('collaboration.', '')}>`);
    expect(cells()).toEqual(['<资产>', '工作站', '<名称>：工作站；<状态>：<空>；<购入价>：120']);
  });

  it('没有翻译函数时直接显示中文原文', () => {
    expect(cells()).toEqual(['资产', '工作站', '名称：工作站；状态：空；购入价：120']);
  });

  it('只显示日期的日期字段按日期显示：记录里存的是 ISO 时刻文本（落库形态），表格只取日期部分', () => {
    const dated = {
      e: { entity: 'AssetEvent' as const, fields: { summary: '安装系统', happenedAt: '2026-11-16T00:00:00.000Z' } }
    };
    expect([...readOnlyRecords(dated, assetSchema).querySelectorAll('td')].map(cell => cell.textContent)).toEqual([
      '维护记录',
      '安装系统',
      '事项：安装系统；日期：2026-11-16'
    ]);
  });

  it('记录名称取实体的标题字段，没有标题取值时用记录标识', () => {
    const rows = readOnlyRecords(
      { x: { entity: 'Asset', fields: { status: '在用' } }, y: { entity: 'AssetCategory', fields: { name: '电脑' } } },
      assetSchema
    );
    expect([...rows.querySelectorAll('tbody tr')].map(row => row.children[1]?.textContent)).toEqual(['x', '电脑']);
  });
});
