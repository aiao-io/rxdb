import { describe, expect, it } from 'vitest';
import { RedoStack } from '../../version/redo-stack.js';
import type { HistoryItem } from '../../version/VersionManager.interface.js';

const createItem = (fingerprint: string, entity: string): HistoryItem =>
  ({
    transactionId: null,
    changeId: 1,
    fingerprint,
    count: 1,
    createdAt: new Date(),
    description: fingerprint,
    namespace: 'public',
    entity,
    type: 'UPDATE',
    reverted: false,
    redoInvalidated: false
  }) as unknown as HistoryItem;

describe('RedoStack', () => {
  /**
   * RXD-063：作用域 redo 先按 scope 筛出本作用域的项并应用，但栈操作若按「数量」从栈顶截取，
   * 删掉的是栈头那些**未被 redo**的项，而真正已 redo 的项仍留在栈里可以重复执行。
   * 栈 API 必须按稳定身份（fingerprint）移除已应用项。
   */
  it('按身份移除已应用项，不动栈中其他作用域的项', () => {
    const a1 = createItem('a1', 'Alpha');
    const b1 = createItem('b1', 'Beta');
    const a2 = createItem('a2', 'Alpha');
    const stack = new RedoStack();
    // 交错栈：A / B / A，被 redo 的 B 不在栈顶
    stack.push([a1, b1, a2]);

    const removed = stack.remove([b1]);

    expect(removed).toEqual([b1]);
    // 未被 redo 的 A 项必须原样留下，且保持原顺序
    expect(stack.value.map(item => item.fingerprint)).toEqual(['a1', 'a2']);
  });

  it('移除多项时按身份匹配，忽略不在栈中的项', () => {
    const a1 = createItem('a1', 'Alpha');
    const b1 = createItem('b1', 'Beta');
    const stack = new RedoStack();
    stack.push([a1, b1]);

    const removed = stack.remove([b1, createItem('ghost', 'Gamma')]);

    expect(removed.map(item => item.fingerprint)).toEqual(['b1']);
    expect(stack.value.map(item => item.fingerprint)).toEqual(['a1']);
  });
});
