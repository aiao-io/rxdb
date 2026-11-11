import { mockChatAgent } from '@trigger.dev/sdk/ai/test';

import type { LanguageModelV4Prompt, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { simulateReadableStream, type UIMessage, type UIMessageChunk } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it } from 'vitest';
import { sampleShop } from '../shared/model-ops/fixtures';
import type { ModelToolOutput } from '../shared/model-ops/tool-output';
import { modelDesignerAgent } from './chat';
import type { AgentClientData } from './client-data';
import { languageModelKey } from './models';

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined }
};

function stream(chunks: LanguageModelV4StreamPart[]) {
  return { stream: simulateReadableStream({ chunks }) };
}

function toolStep(toolName: string, input: unknown) {
  return stream([
    { type: 'tool-call', toolCallId: `call-${toolName}`, toolName, input: JSON.stringify(input) },
    { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage }
  ]);
}

function textStep(text: string) {
  return stream([
    { type: 'text-start', id: 'text' },
    { type: 'text-delta', id: 'text', delta: text },
    { type: 'text-end', id: 'text' },
    { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage }
  ]);
}

function userMessage(id: string, text: string): UIMessage {
  return { id, role: 'user', parts: [{ type: 'text', text }] };
}

function outputs(chunks: UIMessageChunk[]): ModelToolOutput[] {
  return chunks.flatMap(chunk => (chunk.type === 'tool-output-available' ? [chunk.output as ModelToolOutput] : []));
}

function text(chunks: UIMessageChunk[]): string {
  return chunks.flatMap(chunk => (chunk.type === 'text-delta' ? [chunk.delta] : [])).join('');
}

type PromptPart = Exclude<LanguageModelV4Prompt[number]['content'], string>[number];

function partText(part: PromptPart): string {
  if ('text' in part) return part.text;
  if (part.type === 'tool-result' && part.output.type === 'text') return part.output.value;
  return JSON.stringify(part);
}

function promptTexts(prompt: LanguageModelV4Prompt): string[] {
  return prompt.map(message =>
    typeof message.content === 'string' ? message.content : message.content.map(partText).join('')
  );
}

const harnesses: { close(): Promise<void> }[] = [];

function start(model: MockLanguageModelV4, clientData: AgentClientData | undefined, continuation = false) {
  const harness = mockChatAgent(modelDesignerAgent, {
    chatId: 'md-user-1-session-1',
    clientData,
    continuation,
    setupLocals: ({ set }) => set(languageModelKey, model)
  });
  harnesses.push(harness);
  return harness;
}

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map(harness => harness.close()));
});

describe('modelDesignerAgent', () => {
  it('一轮里依次调用建实体、连接、校验工具，草稿在步骤之间推进', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        toolStep('add_entities', {
          entities: [
            { name: 'Invoice', displayName: '发票', properties: [{ name: 'number', type: 'string', required: true }] }
          ]
        }),
        toolStep('link_entities', {
          links: [{ from: 'Invoice', to: 'Order', kind: 'MANY_TO_ONE', onDelete: 'CASCADE' }]
        }),
        toolStep('validate_model', {}),
        textStep('已为订单加上发票。')
      ]
    });
    const turn = await start(model, { model: sampleShop(), edits: [] }).sendMessage(userMessage('u1', '给订单加发票'));

    const [added, linked, validated] = outputs(turn.chunks);
    expect(added).toMatchObject({ ok: true, summary: '已新增 1 个实体：Invoice（1 个属性）' });
    expect(linked).toMatchObject({ ok: true, summary: '已连接 Invoice.order ⇄ Order.invoices（MANY_TO_ONE）' });
    expect(linked.ok && linked.ops.map(op => op.op)).toEqual(['addRelation', 'addRelation']);
    expect(validated).toEqual({ ok: true, ops: [], summary: '模型校验通过，没有问题' });
    expect(text(turn.chunks)).toBe('已为订单加上发票。');

    const [first, , , last] = model.doStreamCalls.map(call => promptTexts(call.prompt));
    expect(first[0]).toMatch(/^你是 RxDB 模型设计器里的数据建模智能体/);
    expect(first.at(-2)).toMatch(/^<model_state>\nCustomer「客户」/);
    expect(first.at(-1)).toBe('给订单加发票');
    expect(last.join('\n')).toContain('模型校验通过，没有问题');
    expect(last.join('\n')).not.toMatch(/"ops"/);
  });

  it('工具失败时模型收到原因，草稿不变', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        toolStep('add_entities', { entities: [{ name: 'invoice', properties: [] }] }),
        textStep('名称不合规，已修正。')
      ]
    });
    const turn = await start(model, { model: sampleShop(), edits: [] }).sendMessage(userMessage('u1', '加发票'));
    expect(outputs(turn.chunks)).toEqual([{ ok: false, errors: ['实体名 invoice 必须是大写字母开头的 PascalCase'] }]);
    expect(promptTexts(model.doStreamCalls[1].prompt).at(-1)).toMatch(/^失败，草稿未改变：\n- 实体名 invoice/);
  });

  it('用户修改随回读块注入，之前各轮的消息不变', async () => {
    const model = new MockLanguageModelV4({ doStream: [textStep('好的。'), textStep('收到。')] });
    const clientData: AgentClientData = { model: sampleShop(), edits: [] };
    const harness = start(model, clientData);
    await harness.sendMessage(userMessage('u1', '先看看'));
    const renamed = sampleShop();
    renamed.entities[1].name = 'PurchaseOrder';
    clientData.model = renamed;
    clientData.edits = ['实体 Order 改名为 PurchaseOrder'];
    await harness.sendMessage(userMessage('u2', '继续'));

    const [first, second] = model.doStreamCalls.map(call => promptTexts(call.prompt));
    const withoutState = (texts: string[]) => texts.filter(item => !item.startsWith('<model_state>'));
    expect(withoutState(second).slice(0, withoutState(first).length)).toEqual(withoutState(first));
    expect(second.at(-2)).toMatch(/PurchaseOrder[\s\S]*<since_your_last_turn>\n- 实体 Order 改名为 PurchaseOrder/);
    expect(first.at(-2)).not.toContain('since_your_last_turn');
  });

  it('续跑的 run 没有内存状态，草稿按本轮快照重建', async () => {
    const renamed = sampleShop();
    renamed.entities[1].name = 'PurchaseOrder';
    const model = new MockLanguageModelV4({
      doStream: [toolStep('update_entity', { entity: 'PurchaseOrder', displayName: '采购单' }), textStep('改好了。')]
    });
    const turn = await start(model, { model: renamed, edits: [] }, true).sendMessage(userMessage('u3', '改显示名'));
    expect(outputs(turn.chunks)).toEqual([
      {
        ok: true,
        summary: '已修改实体 PurchaseOrder',
        ops: [{ op: 'updateEntity', entityId: 'e-order', changes: { displayName: '采购单' } }]
      }
    ]);
  });

  it('提问工具让本轮以待回答的工具调用结束', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        toolStep('ask_user', {
          question: '订单与商品怎么关联？',
          options: [
            { id: 'direct', label: '直接多对多' },
            { id: 'item', label: '经订单明细' }
          ]
        })
      ]
    });
    const turn = await start(model, { model: sampleShop(), edits: [] }).sendMessage(userMessage('u1', '加商品'));
    expect(turn.chunks.filter(chunk => chunk.type === 'tool-input-available')).toEqual([
      expect.objectContaining({
        toolName: 'ask_user',
        input: expect.objectContaining({ question: '订单与商品怎么关联？' })
      })
    ]);
    expect(outputs(turn.chunks)).toEqual([]);
    expect(model.doStreamCalls).toHaveLength(1);
  });
});
