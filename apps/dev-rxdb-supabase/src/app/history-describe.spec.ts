import type { HistoryItem, RxDBChange } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { describeChange, describeHistoryItem, pageOfHistoryItem } from './history-describe';

const change = (type: RxDBChange['type'], entity: string) => ({ type, entity }) as RxDBChange;
const item = (...changes: RxDBChange[]) => ({ changes }) as HistoryItem;

describe('describeChange / describeHistoryItem', () => {
  it('一条变更说成「操作 + 实体的中文叫法」', () => {
    expect(describeChange(change('INSERT', 'DemoCustomer'))).toBe('新建客户');
    expect(describeHistoryItem(item(change('DELETE', 'CatalogItem')))).toBe('删除商品');
  });

  it('一个事务列出前三条，多出来的写条数', () => {
    expect(describeHistoryItem(item(change('INSERT', 'DemoIdCard'), change('INSERT', 'DemoCustomer')))).toBe(
      '一次写入：新建证件、新建客户'
    );
    expect(
      describeHistoryItem(
        item(
          change('DELETE', 'DemoCustomer'),
          change('DELETE', 'DemoOrder'),
          change('DELETE', 'DemoOrderItem'),
          change('DELETE', 'DemoIdCard')
        )
      )
    ).toBe('一次写入：删除客户、删除订单、删除订单项 等 4 条');
  });

  it('没登记的实体原样用实体名', () => {
    expect(describeChange(change('UPDATE', 'RxDBBranch'))).toBe('修改RxDBBranch');
  });
});

describe('pageOfHistoryItem', () => {
  it('按第一条变更的实体归到页面', () => {
    expect(pageOfHistoryItem(item(change('INSERT', 'Todo')))).toBe('Todo');
    expect(pageOfHistoryItem(item(change('INSERT', 'DemoCategory_DemoOrderItem')))).toBe('订单');
    expect(pageOfHistoryItem(item(change('UPDATE', 'CatalogItem')))).toBe('商品目录');
  });
});
