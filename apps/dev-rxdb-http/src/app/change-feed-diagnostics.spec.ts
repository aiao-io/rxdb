import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  changeFeedStats,
  clearChangeFeedStats,
  onChangeFeedStats,
  recordChangeFeedNotification,
  recordChangeFeedUnavailable
} from './change-feed-diagnostics';

/** 造一条通知报告。字段集与 `HttpChangeFeedNotificationReport` 一致。 */
const notification = (suppressed: boolean): Parameters<typeof recordChangeFeedNotification>[0] => ({
  url: 'http://127.0.0.1:4301/v1/changes',
  entity: 'Recipe',
  namespace: 'default',
  clientId: 'client-a',
  suppressed
});

// 模块级状态：每条用例之间必须清干净，否则计数会串台
beforeEach(() => clearChangeFeedStats());

describe('计数（AC#24）', () => {
  it('起点是四个零', () => {
    expect(changeFeedStats()).toEqual({ received: 0, suppressed: 0, unavailable: 0, lastUnavailableMessage: '' });
  });

  it('被抑制的通知照样计入 received——它确实收到了', () => {
    recordChangeFeedNotification(notification(true));
    expect(changeFeedStats().received).toBe(1);
  });

  it('suppressed 只数被抑制的那些', () => {
    recordChangeFeedNotification(notification(true));
    recordChangeFeedNotification(notification(false));
    recordChangeFeedNotification(notification(false));
    expect(changeFeedStats()).toMatchObject({ received: 3, suppressed: 1 });
  });

  it('不可用与通知分开数——「一条没收到」有两种成因，合成一个数就分不出来了', () => {
    recordChangeFeedNotification(notification(false));
    recordChangeFeedUnavailable({ url: 'u', reason: 'connection-error', message: '连不上', attempt: 1 });
    expect(changeFeedStats()).toMatchObject({ received: 1, unavailable: 1, lastUnavailableMessage: '连不上' });
  });

  it('后一条不可用覆盖前一条的文案', () => {
    recordChangeFeedUnavailable({ url: 'u', reason: 'connection-error', message: '第一次', attempt: 1 });
    recordChangeFeedUnavailable({ url: 'u', reason: 'malformed-message', message: '第二次', attempt: 2 });
    expect(changeFeedStats()).toMatchObject({ unavailable: 2, lastUnavailableMessage: '第二次' });
  });

  it('清零把文案一并清掉——留着一句旧故障说明比不留更误导', () => {
    recordChangeFeedUnavailable({ url: 'u', reason: 'connection-error', message: '连不上', attempt: 1 });
    clearChangeFeedStats();
    expect(changeFeedStats()).toEqual({ received: 0, suppressed: 0, unavailable: 0, lastUnavailableMessage: '' });
  });
});

describe('订阅', () => {
  it('每次记账都推一次当前值', () => {
    const seen = vi.fn();
    const off = onChangeFeedStats(seen);
    recordChangeFeedNotification(notification(false));
    off();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ received: 1, suppressed: 0 });
  });

  it('退订之后不再收到', () => {
    const seen = vi.fn();
    onChangeFeedStats(seen)();
    recordChangeFeedNotification(notification(false));
    expect(seen).not.toHaveBeenCalled();
  });

  it('两个订阅者都收到同一次记账', () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = onChangeFeedStats(first);
    const offSecond = onChangeFeedStats(second);
    recordChangeFeedNotification(notification(true));
    offFirst();
    offSecond();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('清零也是一次推送——面板上的数得跟着回到零', () => {
    recordChangeFeedNotification(notification(false));
    const seen = vi.fn();
    const off = onChangeFeedStats(seen);
    clearChangeFeedStats();
    off();
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ received: 0 });
  });
});
