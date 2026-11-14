import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import * as platform from '../platform/local-backend';
import { LocalImageMvp } from './local-image-mvp';
import { plainPrompt } from './prompts/prompt-state';

function rig() {
  vi.spyOn(LocalImageMvp.prototype, 'ngOnInit').mockImplementation(() => undefined);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const confirm = vi.spyOn(platform, 'confirmAction');
  const fixture = TestBed.createComponent(LocalImageMvp);
  const component = fixture.componentInstance;
  component.view.set('library');
  component.promptState.set(plainPrompt('需要保留的正文'));
  return { fixture, component, confirm };
}

function pending() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>(done => (resolve = done));
  return { promise, resolve };
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

it('等待平台确认完成后才清空正文并进入创作页', async () => {
  const r = rig();
  const answer = pending();
  r.confirm.mockReturnValue(answer.promise);
  const operation = r.component.newImage();
  expect(r.confirm).toHaveBeenCalledOnce();
  expect(r.component.serialized().text).toBe('需要保留的正文');
  expect(r.component.view()).toBe('library');
  answer.resolve(true);
  await operation;
  expect(r.component.serialized().text).toBe('');
  expect(r.component.view()).toBe('studio');
});

it('取消平台确认保留正文与当前位置', async () => {
  const r = rig();
  r.confirm.mockResolvedValue(false);
  await r.component.newImage();
  expect(r.confirm).toHaveBeenCalledOnce();
  expect(r.component.serialized().text).toBe('需要保留的正文');
  expect(r.component.view()).toBe('library');
});

it('确认框尚未回答时不会重复打开或提前执行操作', async () => {
  const r = rig();
  const answer = pending();
  r.confirm.mockReturnValue(answer.promise);
  const operation = r.component.newImage();
  await r.component.newImage();
  expect(r.confirm).toHaveBeenCalledOnce();
  expect(r.component.serialized().text).toBe('需要保留的正文');
  answer.resolve(true);
  await operation;
  expect(r.component.serialized().text).toBe('');
});

it('原生确认桥接失败时显示错误并保留正文', async () => {
  const r = rig();
  r.confirm.mockImplementation(async () => {
    throw new Error('native dialog unavailable');
  });
  await r.component.newImage();
  expect(r.component.toast()).toContain('确认窗口未能打开');
  expect(r.component.serialized().text).toBe('需要保留的正文');
  expect(r.component.view()).toBe('library');
  r.confirm.mockResolvedValue(true);
  await r.component.newImage();
  expect(r.component.serialized().text).toBe('');
});

it.each(['account', 'workspace'] as const)('确认等待期间 %s 已变化时不执行旧操作', async change => {
  const r = rig();
  const answer = pending();
  r.confirm.mockReturnValue(answer.promise);
  const operation = r.component.newImage();
  expect(r.confirm).toHaveBeenCalledOnce();
  if (change === 'account') r.component.authUser.set({ id: 'another-account', email: null });
  else Object.assign(r.component, { profileId: 'another-workspace' });
  answer.resolve(true);
  await operation;
  expect(r.component.serialized().text).toBe('需要保留的正文');
  expect(r.component.view()).toBe('library');
});
