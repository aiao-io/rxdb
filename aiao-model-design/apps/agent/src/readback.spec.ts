import { sampleShop } from '@aiao-model-design/model-ops/testing';
import type { ModelMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { requireClientData } from './client-data';
import { injectBeforeLastUser, readbackBlock } from './readback';

describe('readbackBlock', () => {
  it('没有用户修改时只给模型状态', () => {
    expect(readbackBlock({ model: { entities: [] }, edits: [] })).toBe(
      '<model_state>\n（空模型，还没有实体）\n</model_state>'
    );
  });

  it('有用户修改时附上逐行说明', () => {
    const block = readbackBlock({ model: sampleShop(), edits: ['实体 Order 改名为 PurchaseOrder'] });
    expect(block).toMatch(
      /^<model_state>\nCustomer「客户」[\s\S]*<\/model_state>\n<since_your_last_turn>\n- 实体 Order 改名为 PurchaseOrder\n<\/since_your_last_turn>$/
    );
  });
});

describe('injectBeforeLastUser', () => {
  const history: ModelMessage[] = [
    { role: 'user', content: '建一个订单模型' },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'ask_user', input: {} }] },
    {
      role: 'tool',
      content: [{ type: 'tool-result', toolCallId: 't1', toolName: 'ask_user', output: { type: 'text', value: 'a' } }]
    }
  ];

  it('插在最新用户消息之前，前面的消息原样保留', () => {
    const messages: ModelMessage[] = [...history, { role: 'user', content: '再加上发票' }];
    const injected = injectBeforeLastUser(messages, 'STATE');
    expect(injected.slice(0, 3)).toEqual(history);
    expect(injected.slice(3)).toEqual([
      { role: 'user', content: 'STATE' },
      { role: 'user', content: '再加上发票' }
    ]);
  });

  it('续轮没有新用户消息时插在原请求之前，不拆开工具调用与结果', () => {
    expect(injectBeforeLastUser(history, 'STATE')).toEqual([{ role: 'user', content: 'STATE' }, ...history]);
  });

  it('没有用户消息时不注入', () => {
    expect(injectBeforeLastUser([], 'STATE')).toEqual([]);
  });
});

describe('requireClientData', () => {
  it('缺少快照时中止本轮', () => {
    expect(() => requireClientData(undefined)).toThrow(/缺少模型快照/);
    expect(requireClientData({ model: { entities: [] }, edits: [] })).toEqual({ model: { entities: [] }, edits: [] });
  });
});
