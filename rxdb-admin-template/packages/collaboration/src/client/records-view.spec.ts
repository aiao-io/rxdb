import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Records } from '../model.js';
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
/** 每个实体一张表：实体标题（含条数）、表头与各行单元格的文字。 */
function tables(records: Records) {
  return [...readOnlyRecords(records, assetSchema).querySelectorAll<HTMLElement>('[data-entity]')].map(group => ({
    entity: group.dataset['entity'],
    heading: group.querySelector('h3')?.textContent,
    head: [...group.querySelectorAll('th')].map(cell => cell.textContent),
    rows: [...group.querySelectorAll('tbody tr')].map(row => [...row.children].map(cell => cell.textContent))
  }));
}

describe('只读记录表', () => {
  const records = { a: { entity: 'Asset' as const, fields: { name: '工作站', status: null, purchasePrice: 120 } } };

  it('按实体分组、字段成列：翻译实体与字段标签，空值显示「—」，用户录入的数据原样显示', () => {
    useTranslation(key => `<${key.replace('collaboration.', '')}>`);
    expect(tables(records)).toEqual([
      {
        entity: 'Asset',
        heading: '<资产>1',
        head: ['<名称>', '<状态>', '<购入价>'],
        rows: [['工作站', '—', '120']]
      }
    ]);
  });

  it('没有翻译函数时直接显示中文原文', () => {
    expect(tables(records)).toEqual([
      { entity: 'Asset', heading: '资产1', head: ['名称', '状态', '购入价'], rows: [['工作站', '—', '120']] }
    ]);
  });

  it('只显示日期的日期字段按日期显示：记录里存的是 ISO 时刻文本（落库形态），表格只取日期部分', () => {
    const dated = {
      e: { entity: 'AssetEvent' as const, fields: { summary: '安装系统', happenedAt: '2026-11-16T00:00:00.000Z' } }
    };
    expect(tables(dated)).toEqual([
      { entity: 'AssetEvent', heading: '维护记录1', head: ['事项', '日期'], rows: [['安装系统', '2026-11-16']] }
    ]);
  });

  it('实体按清单顺序排列；记录名称取实体的标题字段，没有标题取值时用记录标识（完整标识在悬停提示里）', () => {
    const view = tables({
      x: { entity: 'Asset', fields: { status: '在用' } },
      y: { entity: 'AssetCategory', fields: { name: '电脑' } }
    });
    expect(view.map(table => table.entity)).toEqual(['AssetCategory', 'Asset']);
    expect(view.map(table => table.rows[0][0])).toEqual(['电脑', 'x']);
  });

  it('单值关联显示目标记录的名称；同一份记录里找不到目标时显示标识', () => {
    const view = tables({
      cat: { entity: 'AssetCategory', fields: { name: '电脑' } },
      pc: { entity: 'Asset', fields: { name: '工作站', categoryId: 'cat' } },
      lost: { entity: 'Asset', fields: { name: '旧机', categoryId: 'gone' } }
    });
    const assets = view.find(table => table.entity === 'Asset')!;
    expect(assets.head).toEqual(['名称', '分类']);
    expect(assets.rows).toEqual([
      ['工作站', '电脑'],
      ['旧机', 'gone']
    ]);
  });

  it('没有任何记录时显示「暂无记录」', () => {
    const empty = readOnlyRecords({}, assetSchema);
    expect(empty.textContent).toBe('暂无记录');
    expect(empty.dataset['empty']).toBe('true');
  });
});
