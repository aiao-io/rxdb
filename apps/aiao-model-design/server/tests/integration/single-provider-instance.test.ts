import { beforeAll, describe, expect, it, vi } from 'vitest';
import { bootTestServer, buildAnthropicClient, buildOpenAiClient, type TestServer } from '../fixtures/test-server';

let ts: TestServer;

beforeAll(async () => {
  ts = await bootTestServer();
});

/**
 * FR-052：网关只把 dashboard 兼容路径映射到与 OpenAI / Anthropic 路径相同的内核
 * （同一 provider 实例）。任何路径触发的 chat 调用都必须指向 ProviderRegistry 中
 * 唯一登记的 provider 对象。
 *
 * 验证方式：把 spy 装在 `mockEcho` 实例的 `stream`/`complete` 方法上，分别通过
 * OpenAI v1 与 Anthropic v1 入口发请求；若多入口共享实例，spy 应累计计数。
 */
describe('Single provider instance — three entries (FR-052)', () => {
  it('OpenAI stream + Anthropic stream both invoke the SAME provider.stream instance', async () => {
    const streamSpy = vi.spyOn(ts.mockEcho, 'stream');
    const openai = buildOpenAiClient(ts);
    const anthropic = buildAnthropicClient(ts);

    const drainOpenAi = async () => {
      const s = await openai.chat.completions.create({
        model: 'mock-echo-1',
        messages: [{ role: 'user', content: 'a' }],
        stream: true
      });
      let acc = '';
      for await (const c of s) {
        const d = c.choices?.[0]?.delta?.content;
        if (d) acc += d;
      }
      return acc;
    };

    const drainAnthropic = async () => {
      const s = await anthropic.messages.stream({
        model: 'mock-echo-1',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'b' }]
      });
      let acc = '';
      for await (const evt of s) {
        if (evt.type === 'content_block_delta' && evt.delta.type === 'text_delta') {
          acc += evt.delta.text;
        }
      }
      return acc;
    };

    const before = streamSpy.mock.calls.length;
    const [o, a] = await Promise.all([drainOpenAi(), drainAnthropic()]);
    const after = streamSpy.mock.calls.length;

    expect(o).toBe('a');
    expect(a).toBe('b');
    expect(after - before).toBe(2);
    streamSpy.mockRestore();
  });

  it('OpenAI non-stream + Anthropic non-stream both invoke SAME provider.complete', async () => {
    const completeSpy = vi.spyOn(ts.mockEcho, 'complete');
    const openai = buildOpenAiClient(ts);
    const anthropic = buildAnthropicClient(ts);

    const o = await openai.chat.completions.create({
      model: 'mock-echo-1',
      messages: [{ role: 'user', content: 'open' }]
    });
    const a = await anthropic.messages.create({
      model: 'mock-echo-1',
      max_tokens: 100,
      messages: [{ role: 'user', content: 'anth' }]
    });

    expect(o.choices[0].message.content).toBe('open');
    expect((a.content[0] as { text: string }).text).toBe('anth');
    expect(completeSpy).toHaveBeenCalledTimes(2);
    completeSpy.mockRestore();
  });

  it('Models registry exposes single entry per modelId regardless of entry', async () => {
    const openai = buildOpenAiClient(ts);
    const list = await openai.models.list();
    const mockEntries = list.data.filter(m => m.id === 'mock-echo-1');
    expect(mockEntries).toHaveLength(1);
    // owned_by 应当是真实 provider id（FR-056 R8）
    expect(mockEntries[0].owned_by).toBe('mock-echo');
  });
});
