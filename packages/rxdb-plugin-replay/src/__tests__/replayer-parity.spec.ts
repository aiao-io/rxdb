/**
 * @fileoverview `replayerParityCases` 自测（contracts/replayer-component.md §4）。
 *
 * @remarks
 * 用一个照契约写的参考「组件」跑全部用例，确认它们都能通过；再给每条用例一个故意写错的变体，确认用例真的能抓到错——
 * 三端组件测试只是这份用例的翻译，用例本身失灵三端会一起假绿。
 */

import { describe, expect, it } from 'vitest';
import type { ReplayerHandle, ReplayerOptions } from '../replayer/mount-replayer.js';
import {
  MountReplayerSpy,
  replayerParityCases,
  type ReplayerParityDriver,
  type ReplayerParityInputs
} from '../testing/index.js';

/** 参考实现可故意弄错的地方。 */
type Defect =
  | 'host-outside'
  | 'remount-on-session'
  | 'drop-initial-time'
  | 'swallow-time'
  | 'copy-restore-event'
  | 'seek-twice'
  | 'leak-on-unmount';

interface FakeNode {
  readonly id: string;
}

/** 照契约写的最小「组件」：宿主是容器里的一个节点，输入变化走 `update()`，命令转给句柄，卸载调 `destroy()`。 */
const referenceDriver = (spy: MountReplayerSpy, defect?: Defect): ReplayerParityDriver => {
  const inside: FakeNode = { id: 'inside' };
  const outside: FakeNode = { id: 'outside' };
  const container = { contains: (node: unknown) => node === inside };
  let handle: ReplayerHandle | undefined;
  let mountOptions: ReplayerOptions | undefined;

  const mountWith = (options: ReplayerOptions) => {
    mountOptions = options;
    const host = (defect === 'host-outside' ? outside : inside) as unknown as HTMLElement;
    handle = spy.mountReplayer(host, options);
  };

  return {
    async mount(inputs, outputs) {
      mountWith({
        replay: inputs.replay,
        sessionId: inputs.sessionId,
        initialTime: inputs.initialTime,
        onTimeChange: timeMs => {
          if (defect !== 'swallow-time') outputs.timeChange(timeMs);
        },
        onCommitRestore: event => outputs.commitRestore(defect === 'copy-restore-event' ? { ...event } : event)
      });
    },
    async setInputs(inputs: Partial<ReplayerParityInputs>) {
      if (defect === 'remount-on-session' && inputs.sessionId !== undefined && mountOptions) {
        mountWith({ ...mountOptions, sessionId: inputs.sessionId });
        return;
      }
      if (defect === 'drop-initial-time' && inputs.initialTime !== undefined) return;
      handle?.update(inputs);
    },
    play: () => handle?.play(),
    pause: () => handle?.pause(),
    seek: timeMs => {
      handle?.seek(timeMs);
      if (defect === 'seek-twice') handle?.seek(timeMs);
    },
    async unmount() {
      if (defect !== 'leak-on-unmount') handle?.destroy();
      handle = undefined;
    },
    container: () => container as unknown as Element
  };
};

const caseNamed = (prefix: string) => {
  const found = replayerParityCases.find(testCase => testCase.name.startsWith(prefix));
  if (!found) throw new Error(`没有以 ${prefix} 开头的用例`);
  return found;
};

describe('replayerParityCases', () => {
  it('覆盖契约 §4 的 7 条', () => {
    expect(replayerParityCases.map(testCase => testCase.name.split('.')[0])).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7'
    ]);
  });

  it.each(replayerParityCases.map(testCase => [testCase.name, testCase] as const))(
    '照契约的实现通过：%s',
    async (_, testCase) => {
      const spy = new MountReplayerSpy();
      await testCase.run(referenceDriver(spy), spy);
    }
  );

  it.each([
    ['1.', 'host-outside', 'host must be inside the component'],
    ['2.', 'remount-on-session', 'mountReplayer must be called exactly once'],
    ['3.', 'drop-initial-time', 'changing initialTime'],
    ['4.', 'swallow-time', 'time change output'],
    ['5.', 'copy-restore-event', 'same event'],
    ['6.', 'seek-twice', 'commands'],
    ['7.', 'leak-on-unmount', 'unmounting']
  ] as const)('用例 %s 抓得到 %s', async (prefix, defect, message) => {
    const spy = new MountReplayerSpy();
    await expect(caseNamed(prefix).run(referenceDriver(spy, defect), spy)).rejects.toThrow(message);
  });

  it('MountReplayerSpy.reset() 清空挂载与调用记录', async () => {
    const spy = new MountReplayerSpy();
    await caseNamed('6.').run(referenceDriver(spy), spy);
    spy.reset();
    expect(spy.mounts).toEqual([]);
    expect(spy.calls).toEqual([]);
  });
});
