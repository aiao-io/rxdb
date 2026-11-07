import { describe, expect, it } from 'vitest';
import type { ProviderConfig } from '../../src/config';
import type { ChatProvider } from '../../src/gateway/providers/types';
import { bootstrapModelRegistry } from '../../src/gateway/registry/model-registry';

const stubChatProvider = (id: string, modelIds: string[]): ChatProvider => ({
  id,
  modality: 'chat',
  modelIds,
  capabilities: ['stream'],
  healthCheck: async () => undefined,
  complete: async () => ({ text: 'stub', finishReason: 'stop' }),
  stream: async function* () {
    yield { kind: 'text-delta', delta: 'stub' };
  }
});

const stubConfig = (id: string, modality: 'chat', modelIds: string[]): ProviderConfig => ({
  id,
  modality,
  modelIds,
  baseUrl: '',
  apiKey: '',
  capabilities: [],
  isDefault: false
});

const captureFatal = (): { onFatal: (msg: string) => never; calls: string[] } => {
  const calls: string[] = [];
  const onFatal = (msg: string): never => {
    calls.push(msg);
    throw new Error(msg);
  };
  return { onFatal, calls };
};

describe('bootstrapModelRegistry', () => {
  it('registers all model ids from enabled providers', () => {
    const providers = new Map([
      ['deepseek', stubChatProvider('deepseek', ['deepseek-chat'])],
      ['mock', stubChatProvider('mock', ['mock-1'])]
    ]);
    const reg = bootstrapModelRegistry({
      providers,
      configs: [stubConfig('deepseek', 'chat', ['deepseek-chat']), stubConfig('mock', 'chat', ['mock-1'])]
    });
    expect(reg.byId.size).toBe(2);
    expect(reg.byId.get('deepseek-chat')?.providerId).toBe('deepseek');
    expect(reg.byModality.get('chat')?.length).toBe(2);
  });

  it('skipped provider model ids do not enter registry', () => {
    const providers = new Map([['deepseek', stubChatProvider('deepseek', ['deepseek-chat'])]]);
    const reg = bootstrapModelRegistry({
      providers,
      configs: [stubConfig('deepseek', 'chat', ['deepseek-chat']), stubConfig('skipped', 'chat', ['skipped-model'])]
    });
    expect(reg.byId.size).toBe(1);
    expect(reg.byId.has('skipped-model')).toBe(false);
  });

  it('single provider can register multiple model ids', () => {
    const providers = new Map([['deepseek', stubChatProvider('deepseek', ['deepseek-chat', 'deepseek-coder'])]]);
    const reg = bootstrapModelRegistry({
      providers,
      configs: [stubConfig('deepseek', 'chat', ['deepseek-chat', 'deepseek-coder'])]
    });
    expect(reg.byId.size).toBe(2);
    expect(reg.byModality.get('chat')?.length).toBe(2);
  });

  it('same-modality same-model-id conflict triggers fatal', () => {
    const providers = new Map([
      ['a', stubChatProvider('a', ['shared'])],
      ['b', stubChatProvider('b', ['shared'])]
    ]);
    const fatal = captureFatal();
    expect(() =>
      bootstrapModelRegistry({
        providers,
        configs: [stubConfig('a', 'chat', ['shared']), stubConfig('b', 'chat', ['shared'])],
        onFatal: fatal.onFatal
      })
    ).toThrow();
    expect(fatal.calls[0]).toContain('model id conflict');
  });

  it('records registeredAt timestamp as unix seconds', () => {
    const providers = new Map([['deepseek', stubChatProvider('deepseek', ['deepseek-chat'])]]);
    const before = Math.floor(Date.now() / 1000);
    const reg = bootstrapModelRegistry({
      providers,
      configs: [stubConfig('deepseek', 'chat', ['deepseek-chat'])]
    });
    const entry = reg.byId.get('deepseek-chat')!;
    expect(entry.registeredAt).toBeGreaterThanOrEqual(before);
    expect(entry.registeredAt).toBeLessThan(before + 5);
  });
});
