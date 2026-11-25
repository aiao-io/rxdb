import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { AdminPlatformConfigComponent } from './admin-platform-config';
import { ProductRequestError } from './product-client';

afterEach(() => TestBed.resetTestingModule());

async function render(admin: (path: string, method?: string) => Promise<unknown>) {
  const fixture = TestBed.createComponent(AdminPlatformConfigComponent);
  fixture.componentRef.setInput('client', { admin });
  fixture.autoDetectChanges();
  const root: HTMLElement = fixture.nativeElement;
  const button = (label: string) => {
    const found = Array.from(root.querySelectorAll('button')).find(item => item.textContent?.trim() === label);
    expect(found, label).toBeDefined();
    return found!;
  };
  await fixture.whenStable();
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(root.querySelector('textarea')).not.toBeNull();
  });
  const enter = (name: string, value: string) => {
    const field = root.querySelector<HTMLTextAreaElement>(`textarea[name="${name}"]`)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  };
  return { fixture, root, button, enter };
}

it('按模型和媒体能力核对整份替换，取消保留输入，确认才提交预览的修订', async () => {
  const capability = { providerInstanceId: 'demo', providerRevision: 1, modelId: 'voice', operation: 'text-to-speech' };
  const catalog = { revision: 7, models: [{ id: 'keep' }, { id: 'remove' }], capabilities: [capability] };
  const admin = vi.fn(async (_path: string, method?: string) => (method === 'PUT' ? { revision: 8 } : catalog));
  const { fixture, root, button, enter } = await render(admin);
  const models = [{ id: 'keep', apiKey: 'private-test-key' }, { id: 'add' }];
  enter('modelsJson', JSON.stringify(models));
  enter('capabilitiesJson', '[]');
  button('预览变更').click();
  await fixture.whenStable();
  const preview = root.querySelector('[aria-label="目录变更预览"]')!;
  expect(preview.textContent).toMatch(/新增[^]*add/);
  expect(preview.textContent).toMatch(/保留[^]*keep/);
  expect(preview.textContent).toMatch(/移除[^]*remove/);
  expect(preview.textContent).toContain('voice');
  expect(preview.textContent).not.toContain('private-test-key');
  button('返回编辑').click();
  await fixture.whenStable();
  expect(admin).toHaveBeenCalledTimes(1);
  expect(root.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe(JSON.stringify(models));
  button('预览变更').click();
  await fixture.whenStable();
  button('确认保存并启用').click();
  await fixture.whenStable();
  expect(admin).toHaveBeenCalledWith('platform-config', 'PUT', {
    revision: 7,
    requestId: expect.any(String),
    models,
    capabilities: []
  });
});

it.each([
  ['{}', '[]', '两份配置都必须是 JSON 数组'],
  ['{', '[]', '请输入合法的 JSON 数组'],
  ['[null]', '[]', '平台配置目录无效'],
  ['[{}]', '[]', '每个图片模型都需要填写 id'],
  ['[{"id":"same"},{"id":"same"}]', '[]', '重复'],
  ['[]', '[{}]', '每项媒体能力都需要填写']
])('无效输入不能进入保存步骤 %s %s', async (models, capabilities, reason) => {
  const admin = vi.fn(async () => ({ revision: 0, models: [], capabilities: [] }));
  const { fixture, root, button, enter } = await render(admin);
  enter('modelsJson', models);
  enter('capabilitiesJson', capabilities);
  button('预览变更').click();
  await fixture.whenStable();
  expect(root.querySelector('[role="alert"]')?.textContent).toContain(reason);
  expect(root.querySelector('[aria-label="目录变更预览"]')).toBeNull();
  expect(admin).toHaveBeenCalledTimes(1);
});

it('版本冲突后保留输入并重新读取，在新目录上重新核对移除项', async () => {
  let revision = 1;
  const admin = vi.fn(async (_path: string, method?: string) => {
    if (method === 'PUT') {
      revision = 2;
      throw new ProductRequestError(409, '版本冲突');
    }
    return { revision, models: revision === 1 ? [] : [{ id: 'other-admin-model' }], capabilities: [] };
  });
  const { root, fixture, button, enter } = await render(admin);
  enter('modelsJson', '[]');
  enter('capabilitiesJson', '[]');
  button('预览变更').click();
  await fixture.whenStable();
  button('确认保存并启用').click();
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('配置版本已变化');
  });
  expect(button('预览变更').disabled).toBe(true);
  button('重新读取').click();
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(button('预览变更').disabled).toBe(false);
  });
  button('预览变更').click();
  await fixture.whenStable();
  expect(root.querySelector('[aria-label="目录变更预览"]')?.textContent).toMatch(/移除[^]*other-admin-model/);
});

it('保存回执成功但重新读取失败时提示重新读取，避免重复提交', async () => {
  const admin = vi
    .fn()
    .mockResolvedValueOnce({ revision: 0, models: [], capabilities: [] })
    .mockResolvedValueOnce({ revision: 1 })
    .mockRejectedValueOnce(new Error('目录读取失败'));
  const { root, fixture, button, enter } = await render(admin);
  enter('modelsJson', '[]');
  enter('capabilitiesJson', '[]');
  button('预览变更').click();
  await fixture.whenStable();
  button('确认保存并启用').click();
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(root.querySelector('[role="status"]')?.textContent).toContain('已保存，但目录刷新失败');
  });
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('目录读取失败');
  expect(button('预览变更').disabled).toBe(true);
  expect(admin).toHaveBeenCalledTimes(3);
});

it('首次读取的目录缺少修订号时阻止预览，重新读取成功后可以核对', async () => {
  const admin = vi
    .fn()
    .mockResolvedValueOnce({ models: [], capabilities: [] })
    .mockResolvedValueOnce({ revision: 3, models: [{ id: 'current' }], capabilities: [] });
  const { root, fixture, button, enter } = await render(admin);
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('平台配置回执无效');
  expect(button('预览变更').disabled).toBe(true);
  button('重新读取').click();
  await vi.waitFor(() => {
    fixture.detectChanges();
    expect(button('预览变更').disabled).toBe(false);
  });
  enter('modelsJson', '[]');
  enter('capabilitiesJson', '[]');
  button('预览变更').click();
  await fixture.whenStable();
  expect(root.querySelector('[aria-label="目录变更预览"]')?.textContent).toMatch(/移除[^]*current/);
});
