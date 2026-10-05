/**
 * @fileoverview Angular `ReplayerComponent`（`ao-replayer`）跑三端共用的 parity 用例（contracts/replayer-component.md §4）。
 *
 * @remarks
 * `mountReplayer` 打桩成 `MountReplayerSpy`：这里只验证组件把输入 / 输出 / 命令 / 卸载接到核心视图上，回放本身由核心的浏览器测试覆盖。
 */

import { MountReplayerSpy, replayerParityCases, type ReplayerParityDriver } from '@aiao/rxdb-plugin-replay/testing';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplayerComponent } from '../replayer.component.js';

const spy = vi.hoisted(() => ({ current: undefined as MountReplayerSpy | undefined }));
vi.mock('@aiao/rxdb-plugin-replay', () => ({
  mountReplayer: (...args: Parameters<MountReplayerSpy['mountReplayer']>) => spy.current?.mountReplayer(...args)
}));

const createDriver = (): ReplayerParityDriver => {
  let fixture: ComponentFixture<ReplayerComponent> | undefined;
  const mounted = (): ComponentFixture<ReplayerComponent> => {
    if (!fixture) throw new Error('not mounted');
    return fixture;
  };

  return {
    async mount(inputs, outputs) {
      fixture = TestBed.createComponent(ReplayerComponent);
      fixture.componentRef.setInput('replay', inputs.replay);
      fixture.componentRef.setInput('sessionId', inputs.sessionId);
      fixture.componentRef.setInput('initialTime', inputs.initialTime);
      fixture.componentInstance.aoTimeChange.subscribe(outputs.timeChange);
      fixture.componentInstance.aoCommitRestore.subscribe(outputs.commitRestore);
      await fixture.whenStable();
    },
    async setInputs(inputs) {
      const current = mounted();
      for (const [name, value] of Object.entries(inputs)) current.componentRef.setInput(name, value);
      await current.whenStable();
    },
    play: () => mounted().componentInstance.play(),
    pause: () => mounted().componentInstance.pause(),
    seek: timeMs => mounted().componentInstance.seek(timeMs),
    async unmount() {
      mounted().destroy();
    },
    container: () => mounted().nativeElement as Element
  };
};

beforeEach(() => {
  spy.current = new MountReplayerSpy();
});

describe('ReplayerComponent（Angular）parity', () => {
  it.each(replayerParityCases.map(testCase => [testCase.name, testCase] as const))('%s', async (_, testCase) => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    await testCase.run(createDriver(), current);
  });
});

describe('ReplayerComponent（Angular）', () => {
  it('换 replay 实例 → update({ replay })；同一轮改两项合成一次 update', async () => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    const next = { next: true };
    const fixture = TestBed.createComponent(ReplayerComponent);
    fixture.componentRef.setInput('replay', {});
    fixture.componentRef.setInput('sessionId', 's1');
    await fixture.whenStable();
    fixture.componentRef.setInput('replay', next);
    await fixture.whenStable();
    fixture.componentRef.setInput('sessionId', 's2');
    fixture.componentRef.setInput('initialTime', 9);
    await fixture.whenStable();
    expect(current.argsOf('update')).toEqual([[{ replay: next }], [{ sessionId: 's2', initialTime: 9 }]]);
    expect(current.mounts).toHaveLength(1);
  });

  it('宿主是 ao-replayer 里的一个 div', async () => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    const fixture = TestBed.createComponent(ReplayerComponent);
    fixture.componentRef.setInput('replay', {});
    fixture.componentRef.setInput('sessionId', 's1');
    await fixture.whenStable();
    const host = current.mounts[0]?.host;
    expect(host?.tagName).toBe('DIV');
    expect(host?.parentElement).toBe(fixture.nativeElement);
  });
});

// RV-070 同根因：`afterNextRender` 与 React 的 passive effect 同一时序——都要等首帧渲染
// 完才跑，而 `viewChild` 模板引用在渲染阶段就已经赋值，父组件能在 `afterNextRender`
// 触发前就拿到这个实例调 `seek()`。TSDoc 第 109 行一直写着「加载完成前调用会记下目标
// 时刻」，实现却是裸的 `this.#handle?.seek(timeMs)`——文档与实现早已分岔。
describe('ReplayerComponent（Angular）加载前命令的公开契约（RV-070 回归）', () => {
  it('创建后、渲染完成前调用 seek 仍在句柄建立后送达核心', async () => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    const fixture = TestBed.createComponent(ReplayerComponent);
    fixture.componentRef.setInput('replay', {});
    fixture.componentRef.setInput('sessionId', 's1');
    // `afterNextRender` 要等这一帧渲染完才跑；这里特意抢在它前面调用
    fixture.componentInstance.seek(500);
    await fixture.whenStable();
    expect(current.mounts).toHaveLength(1);
    expect(current.argsOf('seek')).toEqual([[500]]);
  });

  it('销毁时仍只 destroy 一次，不受挂载前 seek 记忆影响', async () => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    const fixture = TestBed.createComponent(ReplayerComponent);
    fixture.componentRef.setInput('replay', {});
    fixture.componentRef.setInput('sessionId', 's1');
    fixture.componentInstance.seek(500);
    await fixture.whenStable();
    expect(current.argsOf('destroy')).toHaveLength(0);
    fixture.destroy();
    expect(current.argsOf('destroy')).toHaveLength(1);
  });

  it('两个独立实例各自的挂载前 seek 意图互不影响', async () => {
    const current = spy.current;
    if (!current) throw new Error('spy missing');
    const first = TestBed.createComponent(ReplayerComponent);
    first.componentRef.setInput('replay', {});
    first.componentRef.setInput('sessionId', 'session-first');
    first.componentInstance.seek(100);

    const second = TestBed.createComponent(ReplayerComponent);
    second.componentRef.setInput('replay', {});
    second.componentRef.setInput('sessionId', 'session-second');
    second.componentInstance.seek(900);

    await first.whenStable();
    await second.whenStable();

    expect(current.mounts).toHaveLength(2);
    expect(current.argsOf('seek')).toEqual([[100], [900]]);
    expect(current.mounts[0]?.options.sessionId).toBe('session-first');
    expect(current.mounts[1]?.options.sessionId).toBe('session-second');
  });
});
