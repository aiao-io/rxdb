import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '../../src/config';
import type { ChatProvider } from '../../src/gateway/providers/types';
import { bootstrapProviderRegistry, type ProviderFactory } from '../../src/gateway/registry/provider-registry';

interface StubOpts {
  modelIds?: string[];
  capabilities?: string[];
  /** false → 健康；string → 抛错；'hang' → 不 resolve（等 abort） */
  failHealth?: false | string | 'hang';
}

const stubChatProvider = (id: string, opts: StubOpts = {}): ChatProvider => ({
  id,
  modality: 'chat',
  modelIds: opts.modelIds ?? [`${id}-model`],
  capabilities: opts.capabilities ?? ['stream'],
  healthCheck: async (signal: AbortSignal): Promise<void> => {
    if (opts.failHealth === 'hang') {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('health probe timeout (1s)')));
      });
    }
    if (opts.failHealth) {
      throw new Error(opts.failHealth);
    }
  },
  complete: async () => ({ text: 'stub', finishReason: 'stop' }),
  stream: async function* () {
    yield { kind: 'text-delta', delta: 'stub' };
  }
});

const stubFactory = (provider: ChatProvider): ProviderFactory => ({
  id: provider.id,
  modality: provider.modality,
  build: () => provider
});

const stubConfig = (overrides: Partial<ProviderConfig> & Pick<ProviderConfig, 'id'>): ProviderConfig =>
  ({
    modality: 'chat',
    modelIds: [`${overrides.id}-model`],
    baseUrl: '',
    apiKey: '',
    capabilities: [],
    isDefault: false,
    ...overrides
  }) as ProviderConfig;

const captureFatal = (): { onFatal: (msg: string) => never; calls: string[] } => {
  const calls: string[] = [];
  const onFatal = (msg: string): never => {
    calls.push(msg);
    throw new Error(msg);
  };
  return { onFatal, calls };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bootstrapProviderRegistry — happy path', () => {
  it('registers healthy provider with explicit default', async () => {
    const p = stubChatProvider('a');
    const reg = await bootstrapProviderRegistry({
      configs: [stubConfig({ id: 'a', isDefault: true })],
      factories: [stubFactory(p)]
    });
    expect(reg.providers.size).toBe(1);
    expect(reg.providers.has('a')).toBe(true);
    expect(reg.defaultByModality.chat).toBe('a');
    expect(reg.skipped).toHaveLength(0);
  });

  it('skipped providers do not block others', async () => {
    const ok = stubChatProvider('ok');
    const bad = stubChatProvider('bad', { failHealth: 'upstream-down' });
    const reg = await bootstrapProviderRegistry({
      configs: [stubConfig({ id: 'ok' }), stubConfig({ id: 'bad' })],
      factories: [stubFactory(ok), stubFactory(bad)]
    });
    expect(reg.providers.has('ok')).toBe(true);
    expect(reg.providers.has('bad')).toBe(false);
    expect(reg.skipped).toContainEqual({ id: 'bad', reason: 'upstream-down' });
  });

  it('health probe aborts hanging provider via 1s timeout', async () => {
    const hung = stubChatProvider('hung', { failHealth: 'hang' });
    const reg = await bootstrapProviderRegistry({
      configs: [stubConfig({ id: 'hung' })],
      factories: [stubFactory(hung)]
    });
    expect(reg.providers.has('hung')).toBe(false);
    expect(reg.skipped[0]?.reason).toContain('health probe timeout');
  });
});

describe('bootstrapProviderRegistry — capability white-list (FR-002)', () => {
  it('fatal on non-whitelist capability', async () => {
    const p = stubChatProvider('a', { capabilities: ['fancy-magic'] });
    const fatal = captureFatal();
    await expect(
      bootstrapProviderRegistry({
        configs: [stubConfig({ id: 'a', capabilities: ['fancy-magic'] })],
        factories: [stubFactory(p)],
        onFatal: fatal.onFatal
      })
    ).rejects.toThrow();
    expect(fatal.calls[0]).toContain('non-whitelist capability');
  });

  it.each(['stream', 'reference_voice', 'timestamps'])('accepts white-list capability %s', async cap => {
    const p = stubChatProvider('a', { capabilities: [cap] });
    const reg = await bootstrapProviderRegistry({
      configs: [stubConfig({ id: 'a', capabilities: [cap] })],
      factories: [stubFactory(p)]
    });
    expect(reg.providers.has('a')).toBe(true);
  });

  it('accepts empty / undeclared capabilities (baseline)', async () => {
    const p = stubChatProvider('a', { capabilities: [] });
    const reg = await bootstrapProviderRegistry({
      configs: [stubConfig({ id: 'a', capabilities: [] })],
      factories: [stubFactory(p)]
    });
    expect(reg.providers.has('a')).toBe(true);
  });
});

describe('bootstrapProviderRegistry — isDefault (FR-003)', () => {
  it('fatal on multiple isDefault in same modality', async () => {
    const a = stubChatProvider('a');
    const b = stubChatProvider('b');
    const fatal = captureFatal();
    await expect(
      bootstrapProviderRegistry({
        configs: [stubConfig({ id: 'a', isDefault: true }), stubConfig({ id: 'b', isDefault: true })],
        factories: [stubFactory(a), stubFactory(b)],
        onFatal: fatal.onFatal
      })
    ).rejects.toThrow();
    expect(fatal.calls[0]).toContain('multiple providers declare isDefault');
  });

  it('falls back to first enabled when no isDefault declared (FR-003 修订)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const a = stubChatProvider('a');
    const b = stubChatProvider('b');
    const reg = await bootstrapProviderRegistry({
      configs: [stubConfig({ id: 'a' }), stubConfig({ id: 'b' })],
      factories: [stubFactory(a), stubFactory(b)]
    });
    expect(reg.defaultByModality.chat).toBe('a');
    expect(
      warnSpy.mock.calls.some(c =>
        String(c[0]).includes('no explicit default for modality=chat, falling back to first enabled provider=a')
      )
    ).toBe(true);
  });

  it('declared default that was skipped falls back to first enabled', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const a = stubChatProvider('a', { failHealth: 'down' });
    const b = stubChatProvider('b');
    const reg = await bootstrapProviderRegistry({
      configs: [stubConfig({ id: 'a', isDefault: true }), stubConfig({ id: 'b' })],
      factories: [stubFactory(a), stubFactory(b)]
    });
    expect(reg.providers.has('a')).toBe(false);
    expect(reg.defaultByModality.chat).toBe('b');
  });
});

describe('bootstrapProviderRegistry — factory plumbing', () => {
  it('fatal when factory missing for declared provider', async () => {
    const fatal = captureFatal();
    await expect(
      bootstrapProviderRegistry({
        configs: [stubConfig({ id: 'phantom' })],
        factories: [],
        onFatal: fatal.onFatal
      })
    ).rejects.toThrow();
    expect(fatal.calls[0]).toContain('no registered factory');
  });

  it('fatal when factory modality mismatches config', async () => {
    const p = stubChatProvider('a');
    const wrong: ProviderFactory = {
      id: 'a',
      modality: 'tts',
      build: () => p
    };
    const fatal = captureFatal();
    await expect(
      bootstrapProviderRegistry({
        configs: [stubConfig({ id: 'a', modality: 'chat' })],
        factories: [wrong],
        onFatal: fatal.onFatal
      })
    ).rejects.toThrow();
    expect(fatal.calls[0]).toContain('mismatches');
  });

  it('fatal on duplicate factory id', async () => {
    const a = stubChatProvider('a');
    const fatal = captureFatal();
    await expect(
      bootstrapProviderRegistry({
        configs: [stubConfig({ id: 'a' })],
        factories: [stubFactory(a), stubFactory(a)],
        onFatal: fatal.onFatal
      })
    ).rejects.toThrow();
    expect(fatal.calls[0]).toContain('duplicate provider factory id');
  });
});

describe('bootstrapProviderRegistry — startup log format', () => {
  it('emits enabled / skipped log lines per FR-004', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ok = stubChatProvider('ok');
    const bad = stubChatProvider('bad', { failHealth: 'upstream-down' });
    await bootstrapProviderRegistry({
      configs: [stubConfig({ id: 'ok', isDefault: true }), stubConfig({ id: 'bad' })],
      factories: [stubFactory(ok), stubFactory(bad)]
    });
    expect(logSpy.mock.calls.some(c => String(c[0]).includes('provider=ok modality=chat status=enabled'))).toBe(true);
    expect(
      warnSpy.mock.calls.some(c =>
        String(c[0]).includes('provider=bad modality=chat status=skipped reason="upstream-down"')
      )
    ).toBe(true);
  });
});
