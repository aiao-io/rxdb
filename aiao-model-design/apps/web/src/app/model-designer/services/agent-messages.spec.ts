import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { pendingQuestion, toChatItems, unappliedToolOutputs } from './agent-messages';

const ops = [{ op: 'removeEntity', entityId: 'e-1' }];

const conversation: UIMessage[] = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: '建订单模型' }] },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      {
        type: 'tool-add_entities',
        toolCallId: 'c1',
        state: 'output-available',
        input: {},
        output: { ok: true, ops, summary: '已新增 1 个实体：Order（2 个属性）' }
      },
      {
        type: 'tool-link_entities',
        toolCallId: 'c2',
        state: 'output-available',
        input: {},
        output: { ok: false, errors: ['实体 Item 不存在'] }
      },
      { type: 'tool-validate_model', toolCallId: 'c3', state: 'input-available', input: {} },
      { type: 'tool-remove_entities', toolCallId: 'c4', state: 'output-error', input: {}, errorText: 'boom' },
      { type: 'text', text: '已建好。' },
      { type: 'text', text: '请审阅。' }
    ]
  }
];

describe('toChatItems', () => {
  it('合并正文并把工具调用写成卡片', () => {
    expect(toChatItems(conversation, 'ready')).toEqual([
      { id: 'u1', role: 'user', content: '建订单模型', isStreaming: false, tools: [] },
      {
        id: 'a1',
        role: 'assistant',
        content: '已建好。\n\n请审阅。',
        isStreaming: false,
        tools: [
          { id: 'c1', name: 'add_entities', state: 'done', summary: '已新增 1 个实体：Order（2 个属性）' },
          { id: 'c2', name: 'link_entities', state: 'failed', summary: '实体 Item 不存在' },
          { id: 'c3', name: 'validate_model', state: 'running', summary: '' },
          { id: 'c4', name: 'remove_entities', state: 'failed', summary: 'boom' }
        ]
      }
    ]);
  });

  it('只有最后一条助手消息在生成中时标为流式', () => {
    expect(toChatItems(conversation, 'streaming').map(item => item.isStreaming)).toEqual([false, true]);
    const waiting = toChatItems([conversation[0]], 'submitted');
    expect(waiting.at(-1)).toMatchObject({ role: 'assistant', content: '', isStreaming: true });
  });

  it('提问工具写成问题与选项，回答后带上所选项', () => {
    const asking: UIMessage = {
      id: 'a2',
      role: 'assistant',
      parts: [
        {
          type: 'tool-ask_user',
          toolCallId: 'q1',
          state: 'input-available',
          input: {
            question: '怎么关联？',
            options: [
              { id: 'a', label: '直接' },
              { id: 'b', label: '经明细' }
            ]
          }
        }
      ]
    };
    expect(toChatItems([asking], 'ready')[0].question).toEqual({
      toolCallId: 'q1',
      question: '怎么关联？',
      options: [
        { id: 'a', label: '直接' },
        { id: 'b', label: '经明细' }
      ],
      answer: undefined
    });
    expect(pendingQuestion([asking])).toBe('q1');
    const answered: UIMessage = {
      ...asking,
      parts: [{ ...asking.parts[0], state: 'output-available', output: { optionId: 'b', label: '经明细' } } as never]
    };
    expect(toChatItems([answered], 'ready')[0].question?.answer).toBe('经明细');
    expect(pendingQuestion([answered])).toBeUndefined();
  });
});

describe('unappliedToolOutputs', () => {
  it('按顺序返回带操作且尚未写入的工具输出', () => {
    expect(unappliedToolOutputs(conversation, new Set())).toEqual([{ toolCallId: 'c1', ops }]);
    expect(unappliedToolOutputs(conversation, new Set(['c1']))).toEqual([]);
  });
});
