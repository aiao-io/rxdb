import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/gateway/core/errors';
import { normalizeAnthropicRequest } from '../../src/routes/gateway/anthropic/request-normalizer';

describe('normalizeAnthropicRequest — system field', () => {
  it('passes through when no system field', () => {
    const r = normalizeAnthropicRequest({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hi' }]
    });
    expect(r.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('injects top-level system: string as messages[0]', () => {
    const r = normalizeAnthropicRequest({
      model: 'deepseek-chat',
      system: 'You are a coding assistant.',
      messages: [{ role: 'user', content: 'help' }]
    });
    expect(r.messages).toEqual([
      { role: 'system', content: 'You are a coding assistant.' },
      { role: 'user', content: 'help' }
    ]);
  });

  it('concatenates system: TextBlock[]', () => {
    const r = normalizeAnthropicRequest({
      model: 'deepseek-chat',
      system: [
        { type: 'text', text: 'You are a' },
        { type: 'text', text: ' helpful AI.' }
      ],
      messages: [{ role: 'user', content: 'q' }]
    });
    expect(r.messages[0]).toEqual({
      role: 'system',
      content: 'You are a helpful AI.'
    });
  });

  it('rejects system part with cache_control', () => {
    expect(() =>
      normalizeAnthropicRequest({
        model: 'deepseek-chat',
        system: [{ type: 'text', text: 's', cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: 'q' }]
      })
    ).toThrow(ValidationError);
  });
});

describe('normalizeAnthropicRequest — messages content', () => {
  it('passes string content unchanged', () => {
    const r = normalizeAnthropicRequest({
      model: 'deepseek-chat',
      messages: [
        { role: 'user', content: 'q1' },
        { role: 'assistant', content: 'a1' },
        { role: 'user', content: 'q2' }
      ]
    });
    expect(r.messages.map(m => ({ role: m.role, content: m.content }))).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' }
    ]);
  });

  it('keeps only text blocks from ContentBlock[]', () => {
    const r = normalizeAnthropicRequest({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'part1 ' },
            { type: 'text', text: 'part2' }
          ]
        }
      ]
    });
    expect(r.messages[0].content).toBe('part1 part2');
  });

  it('silently ignores unknown content block types (FR-055 SDK 演进兼容)', () => {
    const r = normalizeAnthropicRequest({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hello' },
            { type: 'future_unknown', payload: 'ignored' }
          ]
        }
      ]
    });
    expect(r.messages[0].content).toBe('hello');
  });

  it('throws ValidationError on image content block', () => {
    expect(() =>
      normalizeAnthropicRequest({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: [{ type: 'image', source: { type: 'base64', data: 'xxx' } }]
          }
        ]
      })
    ).toThrow(ValidationError);
  });

  it('throws ValidationError on tool_use content block', () => {
    expect(() =>
      normalizeAnthropicRequest({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }]
          }
        ]
      })
    ).toThrow(ValidationError);
  });

  it('throws ValidationError on tool_result content block', () => {
    expect(() =>
      normalizeAnthropicRequest({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'x', content: 'r' }]
          }
        ]
      })
    ).toThrow(ValidationError);
  });
});

describe('normalizeAnthropicRequest — primitives pass-through', () => {
  it('maps temperature / top_p / max_tokens / stop_sequences', () => {
    const r = normalizeAnthropicRequest({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'q' }],
      temperature: 0.5,
      top_p: 0.9,
      max_tokens: 100,
      stop_sequences: ['END'],
      stream: true
    });
    expect(r.temperature).toBe(0.5);
    expect(r.topP).toBe(0.9);
    expect(r.maxTokens).toBe(100);
    expect(r.stop).toEqual(['END']);
    expect(r.stream).toBe(true);
  });

  it('stream defaults to false', () => {
    const r = normalizeAnthropicRequest({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'q' }]
    });
    expect(r.stream).toBe(false);
  });
});
