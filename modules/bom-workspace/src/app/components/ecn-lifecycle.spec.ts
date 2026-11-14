import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../bom-demo.service';
import { EcnPanel } from './ecn-panel';

const originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm');
const setup = async () => {
  const operation = () => vi.fn<(...args: unknown[]) => Promise<unknown>>();
  const service = {
    ready: signal(true),
    resetting: signal(false),
    dataEpoch: signal(0),
    ecns: signal(new Map()),
    itemNos: signal(
      new Map([
        ['old', 'OLD'],
        ['new', 'NEW']
      ])
    ),
    ecnImpact: operation().mockResolvedValue({ affectedItemIds: [], topItems: [] }),
    ecnDiff: operation().mockResolvedValue({ headers: [] }),
    demoCreateAndReleaseEcn: operation().mockResolvedValue({ ok: true, ecnId: 'ecn' }),
    cancelEcn: operation().mockResolvedValue({ ok: true }),
    demoCancelEffectiveEcn: operation().mockResolvedValue({ ok: false, error: new Error('已生效') })
  };
  TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
  const fixture = TestBed.createComponent(EcnPanel);
  await fixture.whenStable();
  fixture.componentInstance.selectedEcnId.set('ecn');
  await fixture.whenStable();
  Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: vi.fn(() => true) });
  return { panel: fixture.componentInstance, service, fixture };
};
afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
  if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm);
  else Reflect.deleteProperty(window, 'confirm');
});
const actions = [
  { name: '影响面', method: 'ecnImpact', run: (panel: EcnPanel) => panel.runEcnImpact(), query: true },
  { name: '差异', method: 'ecnDiff', run: (panel: EcnPanel) => panel.runEcnDiff(), query: true },
  {
    name: '发布',
    method: 'demoCreateAndReleaseEcn',
    run: (panel: EcnPanel) => panel.runCreateAndReleaseEcn(),
    query: false
  },
  { name: '取消所选', method: 'cancelEcn', run: (panel: EcnPanel) => panel.runCancelSelectedEcn(), query: false },
  {
    name: '保护已生效',
    method: 'demoCancelEffectiveEcn',
    run: (panel: EcnPanel) => panel.runCancelEffectiveEcn(),
    query: false
  }
] as const;
describe('变更单异步隔离与差异解释', () => {
  it.each(actions)('$name 拒绝后解除忙碌并保留可读原因', async ({ method, run, query }) => {
    const { panel, service } = await setup();
    service[method].mockRejectedValueOnce(new Error('连接中断'));
    await run(panel);
    expect(panel.busy()).toBe(false);
    expect(query ? panel.queryError() : panel.ecnActionResult()).toEqual(
      query ? expect.stringContaining('连接中断') : { ok: false, detail: expect.stringContaining('连接中断') }
    );
  });
  it.each(actions)('$name 重置后忽略迟到拒绝', async ({ method, run }) => {
    const { panel, service, fixture } = await setup();
    let reject!: (reason: Error) => void;
    service[method].mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      })
    );
    const work = run(panel);
    service.dataEpoch.update(value => value + 1);
    await fixture.whenStable();
    reject(new Error('旧请求'));
    await work;
    expect(panel.queryError()).toBe('');
    expect(panel.ecnActionResult()).toBeNull();
    expect(panel.busy()).toBe(false);
  });
  it.each(actions)('$name 重置后忽略迟到成功', async ({ method, run }) => {
    const { panel, service, fixture } = await setup();
    let resolve!: (value: unknown) => void;
    service[method].mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      })
    );
    const work = run(panel);
    service.dataEpoch.update(value => value + 1);
    await fixture.whenStable();
    resolve({ ok: true, ecnId: 'old', affectedItemIds: ['old'], topItems: [], headers: [] });
    await work;
    expect(panel.ecnActionResult()).toBeNull();
    expect(panel.impactLines()).toEqual([]);
    expect(panel.diffLoaded()).toBe(false);
  });
  it.each(actions)('$name 忙碌或未就绪时不发送请求', async ({ method, run }) => {
    const { panel, service } = await setup();
    panel.busy.set(true);
    await run(panel);
    panel.busy.set(false);
    service.ready.set(false);
    await run(panel);
    expect(service[method]).not.toHaveBeenCalled();
  });
  it('切换单据后迟到结果不覆盖当前选择，也不串接下一查询', async () => {
    const { panel, service, fixture } = await setup();
    let resolve!: (value: unknown) => void;
    service.ecnImpact.mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      })
    );
    const work = panel.inspectEcn('ecn');
    panel.selectedEcnId.set('other');
    await fixture.whenStable();
    resolve({ affectedItemIds: ['old'], topItems: [] });
    await work;
    expect(panel.selectedEcnId()).toBe('other');
    expect(panel.impactLines()).toEqual([]);
    expect(service.ecnDiff).not.toHaveBeenCalled();
  });
  it('影响查询失败时不继续查差异', async () => {
    const { panel, service } = await setup();
    service.ecnImpact.mockRejectedValueOnce(new Error('无权限'));
    await panel.inspectEcn('ecn');
    expect(service.ecnDiff).not.toHaveBeenCalled();
    expect(panel.queryError()).toContain('无权限');
  });
  it('删除、新增、改量和改版保留数量、物料及空值边界', async () => {
    const { panel, service } = await setup();
    service.ecnDiff.mockResolvedValueOnce({
      headers: [
        {
          entries: [
            { kind: 'added', lineNo: 10, before: null, after: { qty: '0.123456789123456789' } },
            { kind: 'removed', lineNo: 20, before: { qty: '2' }, after: null },
            { kind: 'qty_changed', lineNo: 30, before: { qty: '1' }, after: { qty: '3' } },
            {
              kind: 'child_changed',
              lineNo: 40,
              before: { qty: '1', childItemId: 'old' },
              after: { qty: '1', childItemId: 'new' }
            },
            { kind: 'child_changed', lineNo: 50, before: null, after: null },
            { kind: 'future_kind', lineNo: 60, before: null, after: null }
          ]
        }
      ]
    });
    await panel.runEcnDiff();
    const lines = panel.diffLines().join('\n');
    expect(lines).toContain('0.123456789123456789');
    expect(lines).toContain('删除（截止）');
    expect(lines).toContain('改量');
    expect(lines).toContain('OLD');
    expect(lines).toContain('NEW');
    expect(lines).toContain('future_kind');
    expect(panel.diffLoaded()).toBe(true);
  });
  it('取消被业务规则拒绝时不宣称成功或回读', async () => {
    const { panel, service } = await setup();
    service.cancelEcn.mockResolvedValueOnce({ ok: false, error: new Error('已生效禁止取消') });
    await panel.runCancelSelectedEcn();
    expect(panel.ecnActionResult()).toEqual({ ok: false, detail: expect.stringContaining('禁止取消') });
    expect(service.ecnImpact).not.toHaveBeenCalled();
  });
});
