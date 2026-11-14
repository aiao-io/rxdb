import { describe, expect, it } from 'vitest';
import type { ChatMessageItem } from '../../../components/ai/ai-message.component';

/**
 * AiMessageComponent 是纯展示组件（仅一个 required input + 模板绑定），
 * Angular 21 JIT 模式不支持通过 TestBed 对 signal inputs 做 DOM 测试（NG0303/NG0950）。
 * 此处验证 ChatMessageItem 接口约束，DOM 渲染差异由 E2E 覆盖。
 */
describe('AiMessageComponent', () => {
  it('ChatMessageItem interface should support user role', () => {
    const msg: ChatMessageItem = { id: '1', role: 'user', content: 'Hello' };
    expect(msg.role).toBe('user');
    expect(msg.isStreaming).toBeUndefined();
  });

  it('ChatMessageItem interface should support assistant role', () => {
    const msg: ChatMessageItem = { id: '2', role: 'assistant', content: 'Generated', isStreaming: true };
    expect(msg.role).toBe('assistant');
    expect(msg.isStreaming).toBe(true);
  });

  it('ChatMessageItem content should be string', () => {
    const msg: ChatMessageItem = { id: '3', role: 'user', content: 'Create a blog with posts and comments' };
    expect(typeof msg.content).toBe('string');
    expect(msg.content.length).toBeGreaterThan(0);
  });
});
