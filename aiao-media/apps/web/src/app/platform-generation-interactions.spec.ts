import type { CreditSnapshot, PlatformModel } from '@aiao-media/api-contracts';
import { TestBed } from '@angular/core/testing';
import { webcrypto } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalMediaStore } from '../local-data/index';
import { LocalImageMvp } from './local-image-mvp';
import { plainPrompt } from './prompts/prompt-state';
import * as relay from './relay-task-client';
import type { ProductAuthorization } from './supabase-auth';

const owner = '10000000-0000-4000-8000-000000000001';
const model: PlatformModel = { id: 'standard', name: '平台生图', credits: 3, protocol: 'openai' };
const snapshot = (available = 10): CreditSnapshot => ({
  account: { balance: available, reserved: 0, available },
  entries: []
});
const access: ProductAuthorization = {
  config: { url: 'https://account.example', anonKey: 'sb_publishable_fixture' },
  userId: owner,
  session: {
    access_token: 'fixture-platform-session',
    refresh_token: 'fixture-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: owner, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-11-13T00:00:00Z' }
  }
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {
    resolve = yes;
  });
  return { promise, resolve };
}
const originalInert = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'inert');
beforeAll(() =>
  Object.defineProperty(HTMLElement.prototype, 'inert', { value: false, writable: true, configurable: true })
);
afterAll(() => {
  if (originalInert) Object.defineProperty(HTMLElement.prototype, 'inert', originalInert);
  else Reflect.deleteProperty(HTMLElement.prototype, 'inert');
});
beforeEach(() => {
  vi.spyOn(LocalImageMvp.prototype, 'ngOnInit').mockImplementation(() => undefined);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('navigator', {
    userAgent: navigator.userAgent,
    locks: { request: vi.fn(async (_name, _options, callback) => callback({ mode: 'exclusive' })) }
  });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:platform-image');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(relay, 'deleteRelayTask').mockResolvedValue();
});
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});
function rig(signedIn = true) {
  const fixture = TestBed.createComponent(LocalImageMvp),
    component = fixture.componentInstance;
  const preferences = new Map<string, { payload: string; revision: number }>();
  const savePreferences = vi.fn(async (changes: Parameters<LocalMediaStore['savePreferences']>[0]) =>
    changes.map(change => {
      const revision = (preferences.get(change.key)?.revision ?? 0) + 1;
      preferences.set(change.key, { payload: change.payload, revision });
      return revision;
    })
  );
  const store = {
    preference: vi.fn(async (key: string) => preferences.get(key) ?? null),
    savePreferences,
    savePreference: vi.fn(
      async (key: string, payload: string, revision: number | null) =>
        (await savePreferences([{ key, payload, revision }]))[0]
    ),
    collection: vi.fn(async () =>
      JSON.parse(preferences.get('tasks-v1')?.payload ?? '[]').map((task: { id: string }) => ({
        sourceId: task.id,
        payload: JSON.stringify(task)
      }))
    ),
    saveResult: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined)
  };
  Object.assign(component, { store, profileId: owner });
  component.models.set([model]);
  component.modelId.set(model.id);
  component.localStatus.set('ready');
  component.editorReady.set(true);
  component.promptState.set(plainPrompt('测试图片'));
  component.view.set('studio');
  if (signedIn) {
    component.authStatus.set('signed-in');
    component.targetKind.set('platform');
    component.authUser.set({ id: owner, email: 'fixture@example.test' });
  }
  const credits = vi.spyOn(component.adminApi, 'credits').mockResolvedValue(snapshot());
  const authorize = vi.spyOn(component.adminApi, 'authorization').mockResolvedValue(access);
  const run = vi.spyOn(relay, 'runRelayTask').mockResolvedValue(new Blob(['verified-image'], { type: 'image/png' }));
  const element: HTMLElement = fixture.nativeElement;
  const render = () => {
    fixture.detectChanges();
    return element.textContent ?? '';
  };
  return { fixture, component, store, preferences, credits, authorize, run, element, render };
}

describe('平台生图交互', () => {
  it('平台账号尚未配置时在创作页显示错误，不静默丢失登录点击', async () => {
    const r = rig(false);
    await r.component.openGenerationAccount();
    expect(r.component.error()).toContain('平台账号服务尚未启用');
    expect(r.run).not.toHaveBeenCalled();
  });
  it('模型目录后发请求先完成时保留最新目录', async () => {
    const r = rig(),
      old = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(Response.json({ models: [{ ...model, id: 'latest' }] }));
    const loading = r.component.refreshModels();
    await r.component.refreshModels();
    old.resolve(Response.json({ models: [model] }));
    await loading;
    expect(r.component.modelId()).toBe('latest');
  });
  it('查余额期间账号变化时不使用前一账号余额接单', async () => {
    const r = rig(),
      old = deferred<CreditSnapshot>();
    r.credits.mockReturnValueOnce(old.promise);
    const generating = r.component.generate();
    r.component.authUser.set({ id: 'another-user', email: null });
    r.authorize.mockResolvedValue({ ...access, userId: 'another-user' });
    old.resolve(snapshot());
    await generating;
    expect(r.run).not.toHaveBeenCalled();
    expect(r.component.error()).toContain('账号已变化');
  });

  it('创作和设置显示平台模型与额度，不再渲染供应商、Key 或直连表单', () => {
    const r = rig();
    expect(r.render()).toContain('3 积分 / 张');
    expect(r.element.querySelector('#selected-model')).not.toBeNull();
    expect(r.element.querySelector('#provider-key, #provider-base, #provider-mode, #key-prompt-input')).toBeNull();
    r.component.view.set('providers');
    expect(r.render()).toContain('平台生图与积分');
    expect(r.element.querySelector('#provider-name, #provider-model, #provider-key')).toBeNull();
    expect(r.render()).not.toContain('浏览器直连');
  });
  it('未登录点击生成只打开平台账号入口，不写任务、不访问模型', async () => {
    const r = rig(false),
      login = vi.spyOn(r.component, 'openGenerationAccount').mockResolvedValue();
    r.render();
    r.component.editorReady.set(true);
    r.render();
    const button = r.element.querySelector<HTMLButtonElement>('.generate-button')!;
    expect(button.textContent).toContain('登录后生成');
    button.click();
    await vi.waitFor(() => expect(login).toHaveBeenCalledOnce());
    expect(r.run).not.toHaveBeenCalled();
    expect(r.store.savePreferences).not.toHaveBeenCalled();
  });
  it('余额不足时显示所需额度，不写任务或调用模型', async () => {
    const r = rig();
    r.credits.mockResolvedValue(snapshot(2));
    await r.component.generate();
    expect(r.component.error()).toContain('当前 2，本次需要 3');
    expect(r.run).not.toHaveBeenCalled();
    expect(r.preferences.has('tasks-v1')).toBe(false);
  });
  it('积分不可读或授权用户变化时保留输入，不发送生成', async () => {
    const r = rig();
    r.credits.mockRejectedValueOnce(new Error('账本不可读'));
    await r.component.generate();
    expect(r.run).not.toHaveBeenCalled();
    expect(r.component.error()).toContain('账本不可读');
    r.authorize.mockResolvedValue({ ...access, userId: 'another-user' });
    await r.component.generate();
    expect(r.run).not.toHaveBeenCalled();
    expect(r.component.error()).toContain('账号已变化');
    expect(r.component.serialized().text).toBe('测试图片');
  });
  it('任务与协议令牌先原子落盘，接单只用平台会话，保存后才删除服务端结果', async () => {
    const r = rig();
    r.run.mockImplementation(async options => {
      const task = JSON.parse(r.preferences.get('tasks-v1')!.payload)[0];
      expect(task).toMatchObject({
        id: options.id,
        channel: 'platform',
        status: 'processing',
        request: { modelId: 'standard' }
      });
      const ticket = JSON.parse(r.preferences.get('relay-tasks-v1')!.payload)[options.id];
      expect(ticket).toEqual({ token: options.ticket.token, accepted: false, protocol: 'openai' });
      expect(options.dispatch).toEqual({
        modelId: 'standard',
        accessToken: 'fixture-platform-session',
        prompt: '测试图片'
      });
      expect(relay.deleteRelayTask).not.toHaveBeenCalled();
      await options.accepted();
      return new Blob(['image'], { type: 'image/png' });
    });
    await r.component.generate();
    expect(r.store.saveResult).toHaveBeenCalledOnce();
    expect(r.component.saved()).toBe(true);
    await vi.waitFor(() => expect(relay.deleteRelayTask).toHaveBeenCalledOnce());
    expect(r.preferences.get('tasks-v1')?.payload).not.toContain('fixture-platform-session');
  });
  it('本机任务无法落盘时不接单，另一标签页持锁时也不接单', async () => {
    const r = rig();
    r.store.savePreferences.mockRejectedValueOnce(new Error('disk full'));
    await r.component.generate();
    expect(r.run).not.toHaveBeenCalled();
    expect(r.component.error()).toContain('disk full');
    vi.mocked(navigator.locks.request).mockImplementation(async (_name, _options, callback) => callback!(null));
    await r.component.generate();
    expect(r.run).not.toHaveBeenCalled();
    expect(r.component.error()).toContain('另一标签页');
  });
  it('确认暂不可用时仍为处理中，原令牌保留并可在刷新后续接', async () => {
    const r = rig();
    r.run.mockRejectedValue(new relay.RelayContinuationFailure('结算暂不可确认'));
    await r.component.generate();
    expect(r.component.job()?.status).toBe('processing');
    expect(r.component.uncertain()).toBe(false);
    expect(r.component.error()).toContain('结算暂不可确认');
    expect(relay.deleteRelayTask).not.toHaveBeenCalled();
    expect(r.preferences.get('relay-tasks-v1')?.payload).toContain('protocol');
  });
  it('图片保存失败保留服务端原图，重试保存成功后才删除', async () => {
    const r = rig();
    r.store.saveResult.mockRejectedValueOnce(new Error('disk full'));
    await r.component.generate();
    expect(r.component.resultUrl()).toBe('blob:platform-image');
    expect(r.component.saved()).toBe(false);
    expect(relay.deleteRelayTask).not.toHaveBeenCalled();
    expect(r.component.canGenerate()).toBe(false);
    await r.component.saveResult();
    await vi.waitFor(() => expect(relay.deleteRelayTask).toHaveBeenCalledOnce());
    expect(r.component.saved()).toBe(true);
  });
  it('刷新恢复已扣费但未保存的原图，只续接原任务而不重新接单', async () => {
    const r = rig();
    r.store.saveResult.mockRejectedValueOnce(new Error('disk full'));
    await r.component.generate();
    const savedPreferences = r.preferences;
    const next = rig();
    for (const [key, value] of savedPreferences) next.preferences.set(key, value);
    await (next.component as unknown as { readTasks(): Promise<void> }).readTasks();
    await vi.waitFor(() => expect(next.component.saved()).toBe(true));
    expect(next.run.mock.calls.at(-1)?.[0].dispatch).toBeNull();
  });
  it('账号切换后丢弃前一账号迟到的积分余额', async () => {
    const r = rig(),
      old = deferred<CreditSnapshot>();
    r.credits.mockReturnValueOnce(old.promise);
    const loading = r.component.refreshCredits();
    r.component.authUser.set({ id: 'another-user', email: null });
    r.credits.mockResolvedValue(snapshot(2));
    await r.component.refreshCredits();
    old.resolve(snapshot(99));
    await loading;
    expect(r.component.creditAccount()?.available).toBe(2);
  });
  it('公开目录中的私密字段被拒绝且不显示在界面，旧本机记录保持原样', async () => {
    const r = rig();
    r.preferences.set('providers-v1', { payload: 'legacy-provider-record', revision: 4 });
    r.preferences.set('provider-keys-v1', { payload: 'legacy-private-key', revision: 3 });
    vi.mocked(fetch).mockResolvedValue(Response.json({ models: [{ ...model, secret: 'private-provider-key' }] }));
    await r.component.refreshModels();
    expect(r.component.models()).toEqual([]);
    expect(r.render()).not.toContain('private-provider-key');
    expect(r.preferences.get('provider-keys-v1')?.payload).toBe('legacy-private-key');
    expect(r.preferences.get('providers-v1')?.revision).toBe(4);
  });
});
