import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CHANGE_FEED_BADGE_LABELS,
  changeFeedBadge,
  changeFeedStats,
  clearChangeFeedStats,
  onChangeFeedStats,
  recordChangeFeedNotification,
  recordChangeFeedOpen,
  recordChangeFeedStart,
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

/** 造一条不可用报告。字段集与 `HttpChangeFeedUnavailableReport` 一致。 */
const unavailable = (
  reason: Parameters<typeof recordChangeFeedUnavailable>[0]['reason'],
  message: string
): Parameters<typeof recordChangeFeedUnavailable>[0] => ({ url: 'u', reason, message, attempt: 1 });

/** 顶栏徽标此刻显示的字：与模板同一条算法（`changeFeedBadge` + 文案表）。 */
const badgeText = (enabled = true): string =>
  CHANGE_FEED_BADGE_LABELS[changeFeedBadge(enabled, changeFeedStats().connection)];

// 模块级状态：每条用例之间必须清干净，否则计数会串台。连接状况不随清零走（它不是日志），
// 所以先按一次「重新开启」把它也放回起点
beforeEach(() => {
  recordChangeFeedStart();
  clearChangeFeedStats();
});

describe('计数（AC#24）', () => {
  it('起点是四个零，连接状况停在连接中', () => {
    expect(changeFeedStats()).toEqual({
      received: 0,
      suppressed: 0,
      unavailable: 0,
      lastUnavailableMessage: '',
      connection: 'connecting'
    });
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
    expect(changeFeedStats()).toMatchObject({ received: 0, suppressed: 0, unavailable: 0, lastUnavailableMessage: '' });
  });
});

/**
 * 顶栏徽标的四态（RV-01a1bb52dedb）。
 *
 * @remarks
 * 徽标从前只读启用意图（`changeFeedEnabled`），连不上、断线退避期间照样显示「已接通」。
 * 现在它由两样东西拼出来：意图决定「已关闭」，其余三态只认适配器报来的事实——
 * `onOpen` 报接通，`onUnavailable` 报故障。故障计数只是计数，**不参与**判定：
 * 判成「报过故障就是断开」的话，重连成功之后徽标会一直停在断开上。
 */
describe('连接状况（RV-01a1bb52dedb）', () => {
  it('起点：开着显示连接中，关着显示已关闭', () => {
    expect(badgeText()).toBe('连接中');
    expect(badgeText(false)).toBe('已关闭');
  });

  it('首次连接就失败：连接中 → 重连中，故障说明可见，不会冒出「已接通」', () => {
    recordChangeFeedUnavailable(unavailable('connection-error', '连不上 4399'));

    expect(badgeText()).toBe('重连中');
    expect(changeFeedStats()).toMatchObject({ unavailable: 1, lastUnavailableMessage: '连不上 4399' });
  });

  it('接通后掉线再恢复：已接通 → 重连中 → 已接通；故障计数留着，但不再判成断开', () => {
    recordChangeFeedOpen();
    expect(badgeText()).toBe('已接通');

    recordChangeFeedUnavailable(unavailable('connection-error', '断了'));
    expect(badgeText()).toBe('重连中');

    recordChangeFeedOpen();
    expect(badgeText()).toBe('已接通');
    // 最近一次故障说明照样留着：它记的是已经发生过的事，恢复不等于没发生过
    expect(changeFeedStats()).toMatchObject({ unavailable: 1, lastUnavailableMessage: '断了' });
  });

  it('读不懂的消息不是断线：仍是已接通，但故障照记', () => {
    recordChangeFeedOpen();

    recordChangeFeedUnavailable(unavailable('malformed-message', '载荷读不懂'));

    expect(badgeText()).toBe('已接通');
    expect(changeFeedStats()).toMatchObject({ unavailable: 1, lastUnavailableMessage: '载荷读不懂' });
  });

  it('关掉通道就是已关闭，不管最后一个连接事实是什么', () => {
    recordChangeFeedOpen();
    expect(badgeText(false)).toBe('已关闭');

    recordChangeFeedUnavailable(unavailable('connection-error', '断了'));
    expect(badgeText(false)).toBe('已关闭');
  });

  it('重新开启从连接中重新等，不沿用上一条连接的事实', () => {
    recordChangeFeedOpen();
    recordChangeFeedStart();
    expect(badgeText()).toBe('连接中');

    recordChangeFeedUnavailable(unavailable('connection-error', '断了'));
    recordChangeFeedStart();
    expect(badgeText()).toBe('连接中');
  });

  it('清零不动连接状况——它是此刻的事实，不是一条日志', () => {
    recordChangeFeedOpen();
    recordChangeFeedUnavailable(unavailable('malformed-message', '载荷读不懂'));

    clearChangeFeedStats();

    expect(changeFeedStats()).toEqual({
      received: 0,
      suppressed: 0,
      unavailable: 0,
      lastUnavailableMessage: '',
      connection: 'open'
    });
    expect(badgeText()).toBe('已接通');
  });

  it('连接状况的变化同样推给订阅者——面板靠它翻徽标', () => {
    const seen = vi.fn();
    const off = onChangeFeedStats(seen);
    recordChangeFeedOpen();
    off();
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ connection: 'open' });
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
