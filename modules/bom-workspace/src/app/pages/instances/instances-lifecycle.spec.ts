import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../../bom-demo.service';
import { InstancesPage } from './instances.page';
const tree = { rootId: 'root', nodes: [], truncated: false };
const actions = [
  ['loadTree', 'instanceTree', tree],
  ['runTrace', 'traceInstance', { matches: [], truncated: false }],
  ['replace', 'replaceDemoInstance', undefined],
  ['reviseMaster', 'reviseDemoInstanceMaster', 'B 已发布'],
  ['deleteSource', 'deleteDemoInstanceSource', { ok: false, error: new Error('被引用') }]
] as const;
const setup = async (readState = Promise.resolve({ replacementDate: null as string | null, masterRevised: false })) => {
  const operation = () => vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(undefined);
  const service = {
    ready: signal(true),
    dataEpoch: signal(0),
    resetting: signal(false),
    instanceRoots: signal([{ id: 'root', itemNo: 'SC-100', serialNumber: 'SN-001' }]),
    firstInstanceId: 'root',
    protectedInstanceSourceId: 'source',
    instanceTree: operation().mockResolvedValue(tree),
    traceInstance: operation().mockResolvedValue({ matches: [], truncated: false }),
    replaceDemoInstance: operation(),
    reviseDemoInstanceMaster: operation().mockResolvedValue('B 已发布'),
    deleteDemoInstanceSource: operation().mockResolvedValue({ ok: false, error: new Error('被引用') }),
    readDemoInstanceState: vi.fn().mockReturnValue(readState)
  };
  Object.defineProperty(window, 'confirm', { configurable: true, value: vi.fn().mockReturnValue(true) });
  TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
  const fixture = TestBed.createComponent(InstancesPage);
  await fixture.whenStable();
  return { fixture, page: fixture.componentInstance, service };
};
afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
describe('实例查询与写入生命周期', () => {
  it.each(actions)('%s 成功后提交对应结果并解除忙碌状态', async (action, method) => {
    const { page, service } = await setup();
    await page[action]();
    expect(service[method]).toHaveBeenCalled();
    expect(page.busy()).toBe(false);
    expect(page.error()).toBe('');
  });
  it.each(actions)('%s 存储失败可见且不锁住页面', async (action, method) => {
    const { page, service } = await setup();
    service[method].mockRejectedValueOnce(new Error('存储失败'));
    await page[action]();
    expect(page.error()).toContain('存储失败');
    expect(page.busy()).toBe(false);
  });
  it.each(actions)('%s 在重置后忽略迟到的成功或失败', async (action, method, result) => {
    const { page, service, fixture } = await setup();
    let finish!: (value: unknown) => void;
    service[method].mockReturnValueOnce(
      new Promise(resolve => {
        finish = resolve;
      })
    );
    const work = page[action]();
    service.dataEpoch.update(value => value + 1);
    await fixture.whenStable();
    finish(result);
    await work;
    expect(page.tree()).toBeNull();
    expect(page.masterResult()).toBe('');
    expect(page.actionResult()).toBe('');
    let reject!: (error: Error) => void;
    service[method].mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    const late = page[action]();
    service.resetting.set(true);
    await fixture.whenStable();
    reject(new Error('迟到错误'));
    await late;
    expect(page.error()).toBe('');
  });
  it.each(actions)('%s 忙碌和未就绪时不接受重复请求', async (action, method) => {
    const { page, service } = await setup();
    page.busy.set(true);
    await page[action]();
    page.busy.set(false);
    service.ready.set(false);
    await page[action]();
    expect(service[method]).not.toHaveBeenCalled();
  });
  it('查询条件变动标记旧树和追溯过期，全历史忽略日期变化', async () => {
    const { page } = await setup();
    await page.loadTree();
    await page.runTrace();
    expect(page.treeStale()).toBe(false);
    expect(page.traceStale()).toBe(false);
    page.asOfDate.set('2026-12-01');
    expect(page.treeStale()).toBe(true);
    expect(page.traceStale()).toBe(true);
    page.history.set(true);
    await page.loadTree();
    await page.runTrace();
    page.asOfDate.set('2027-01-01');
    expect(page.treeStale()).toBe(false);
    expect(page.traceStale()).toBe(false);
    page.rootId.set('00000000-0000-0000-0000-000000000002');
    expect(page.treeStale()).toBe(true);
    page.traceKind.set('serial');
    expect(page.traceStale()).toBe(true);
    await page.runTrace();
    page.traceValue.set('another-serial');
    expect(page.traceStale()).toBe(true);
  });
  it('已完成换件和改版不能重复写，第二台整机不执行第一台的换件演示', async () => {
    const { page, service } = await setup();
    page.replaced.set(true);
    await page.replace();
    page.replaced.set(false);
    page.rootId.set('00000000-0000-0000-0000-000000000002');
    await page.replace();
    page.revised.set(true);
    await page.reviseMaster();
    expect(service.replaceDemoInstance).not.toHaveBeenCalled();
    expect(service.reviseDemoInstanceMaster).not.toHaveBeenCalled();
  });
  it('恢复状态失败有明确提示，恢复的已完成事实阻止重复写', async () => {
    const failure = Promise.reject(new Error('状态损坏'));
    void failure.catch(() => undefined);
    const { page } = await setup(failure);
    expect(page.error()).toContain('状态损坏');
    expect(page.stateLoading()).toBe(false);
  });
  it('恢复状态在重置后返回时不能覆盖新工作区', async () => {
    let finish!: (value: { replacementDate: string | null; masterRevised: boolean }) => void;
    const pending = new Promise<{ replacementDate: string | null; masterRevised: boolean }>(resolve => {
      finish = resolve;
    });
    const { page, service, fixture } = await setup(pending);
    service.ready.set(false);
    await fixture.whenStable();
    finish({ replacementDate: '2026-11-01', masterRevised: true });
    await fixture.whenStable();
    expect(page.replaced()).toBe(false);
    expect(page.revised()).toBe(false);
  });
});
