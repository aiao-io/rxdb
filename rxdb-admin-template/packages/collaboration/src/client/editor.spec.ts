import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readOnlyRecords } from './editor.js';
import { useTranslation } from './translate.js';
beforeEach(() => {
  vi.stubGlobal('document', new Window().document);
});
afterEach(() => {
  useTranslation(undefined);
  vi.unstubAllGlobals();
});
describe('只读记录表', () => {
  const records = { a: { entity: 'Asset' as const, fields: { name: '工作站', status: null, purchasePrice: 120 } } };
  const cells = () => [...readOnlyRecords(records).querySelectorAll('td')].map(cell => cell.textContent);

  it('翻译实体、字段名与空值标记，用户录入的数据原样显示', () => {
    useTranslation(key => `<${key.replace('collaboration.', '')}>`);
    expect(cells()).toEqual(['<资产>', '工作站', '<名称>：工作站；<状态>：<空>；<购入价>：120']);
  });

  it('没有翻译函数时直接显示中文原文', () => {
    expect(cells()).toEqual(['资产', '工作站', '名称：工作站；状态：空；购入价：120']);
  });
});
