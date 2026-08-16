import { describe, expect, it } from 'vitest';

import { createFakeClock } from '../../testing/fake-clock.js';
import {
  DEVTOOLS_MAX_INFLIGHT_REQUESTS,
  DEVTOOLS_MAX_INFLIGHT_TRANSFERS,
  DEVTOOLS_MAX_REQUEST_TOMBSTONES,
  DEVTOOLS_MAX_TRANSFER_TOMBSTONES,
  DEVTOOLS_REQUEST_TIMEOUT_MS
} from '../../v2/constants.js';
import { createSessionId } from '../../v2/ids.js';
import type { DevToolsSession } from '../../v2/session.js';
import { createDevToolsSession } from '../../v2/session.js';

const OTHER_SESSION_ID = 'b3d9e7c1-4a52-4e08-8f6b-1c0d5a2739e4';

function setup(): {
  clock: ReturnType<typeof createFakeClock>;
  timedOut: string[];
  session: DevToolsSession;
} {
  const clock = createFakeClock();
  const timedOut: string[] = [];
  const session = createDevToolsSession({
    sessionId: createSessionId(),
    clock,
    onRequestTimeout: requestId => timedOut.push(requestId)
  });
  return { clock, timedOut, session };
}

/** 登记并立即结算 `count` 条请求，把墓碑数推到指定水位。 */
function burnRequestBudget(session: DevToolsSession, count: number): void {
  for (let index = 0; index < count; index++) {
    const requestId = `req-${index}`;
    expect(session.registerRequest(requestId).outcome).toBe('registered');
    session.settleRequest(requestId);
  }
}

describe('session resource budgets', () => {
  it('MUST accept only its own session id while open', () => {
    const { session } = setup();

    expect(session.accepts(session.sessionId)).toBe(true);
    expect(session.accepts(OTHER_SESSION_ID)).toBe(false);
    expect(session.accepts(null)).toBe(false);

    session.close();
    // 轮换后旧 session 的消息一律拒绝——包括本来合法的那一个 id。
    expect(session.accepts(session.sessionId)).toBe(false);
  });

  it('MUST reject a malformed identifier before touching any budget', () => {
    const { session } = setup();

    for (const requestId of ['', 'a'.repeat(129), 'has space', 'has/slash', 42, null]) {
      expect(session.registerRequest(requestId)).toEqual({
        outcome: 'rejected',
        error: { code: 'invalid_identifier', retryable: false }
      });
    }
    expect(session.inflightRequests).toBe(0);
    expect(session.requestTombstones).toBe(0);
  });

  it('MUST reject a request id that is in flight or already terminal', () => {
    const { session } = setup();
    expect(session.registerRequest('req-1').outcome).toBe('registered');

    // 在途重复。
    expect(session.registerRequest('req-1')).toEqual({
      outcome: 'rejected',
      error: { code: 'request_duplicate', retryable: false }
    });

    session.settleRequest('req-1');
    // 终态 ID 不复用：墓碑让迟到的响应无法误绑到一条新请求上。
    expect(session.registerRequest('req-1')).toEqual({
      outcome: 'rejected',
      error: { code: 'request_duplicate', retryable: false }
    });
    expect(session.inflightRequests).toBe(0);
  });

  it('MUST cap in-flight requests with a retryable rejection', () => {
    const { session } = setup();
    for (let index = 0; index < DEVTOOLS_MAX_INFLIGHT_REQUESTS; index++) {
      expect(session.registerRequest(`req-${index}`).outcome).toBe('registered');
    }

    expect(session.registerRequest('one-too-many')).toEqual({
      outcome: 'rejected',
      // 可等待：结算任意一条在途请求即可让出名额，所以 retryable 为 true。
      error: { code: 'request_limit_exceeded', retryable: true }
    });

    session.settleRequest('req-0');
    expect(session.registerRequest('one-too-many').outcome).toBe('registered');
  });

  it('MUST cap in-flight transfers separately from requests', () => {
    const { session } = setup();
    for (let index = 0; index < DEVTOOLS_MAX_INFLIGHT_TRANSFERS; index++) {
      expect(session.registerTransfer(`tx-${index}`).outcome).toBe('registered');
    }

    expect(session.registerTransfer('tx-extra')).toEqual({
      outcome: 'rejected',
      error: { code: 'transfer_limit_exceeded', retryable: true }
    });
    // 两种预算互不挪用。
    expect(session.registerRequest('req-1').outcome).toBe('registered');
    expect(session.inflightTransfers).toBe(DEVTOOLS_MAX_INFLIGHT_TRANSFERS);
  });

  it('MUST reject a duplicate transfer id in flight and after settlement', () => {
    const { session } = setup();
    expect(session.registerTransfer('tx-1').outcome).toBe('registered');
    expect(session.registerTransfer('tx-1')).toEqual({
      outcome: 'rejected',
      error: { code: 'transfer_duplicate', retryable: false }
    });

    session.settleTransfer('tx-1');
    expect(session.registerTransfer('tx-1')).toEqual({
      outcome: 'rejected',
      error: { code: 'transfer_duplicate', retryable: false }
    });
  });

  it('MUST bound the tombstone set instead of growing without limit', () => {
    // 「终态 ID 不复用」若用无界集合实现，长 session 的内存随请求数单调增长，
    // 而这条增长在功能测试里完全看不见。有界 + 耗尽报错才是可观测的实现。
    const { session } = setup();
    burnRequestBudget(session, DEVTOOLS_MAX_REQUEST_TOMBSTONES);

    expect(session.requestTombstones).toBe(DEVTOOLS_MAX_REQUEST_TOMBSTONES);
    expect(session.registerRequest('one-more')).toEqual({
      outcome: 'rejected',
      // 终态：驱逐会让被驱逐的 ID 重新可用，正好废掉墓碑存在的理由。
      // 唯一的出路是重新握手换一个新 session，所以 retryable 为 false。
      error: { code: 'session_budget_exhausted', retryable: false }
    });
  });

  it('MUST never evict a tombstone to make room', () => {
    const { session } = setup();
    burnRequestBudget(session, DEVTOOLS_MAX_REQUEST_TOMBSTONES);

    // 预算耗尽后再尝试若干次，最早的那个 ID 仍然不可复用。
    for (let index = 0; index < 8; index++) session.registerRequest(`filler-${index}`);
    expect(session.registerRequest('req-0')).toEqual({
      outcome: 'rejected',
      error: { code: 'request_duplicate', retryable: false }
    });
    expect(session.requestTombstones).toBe(DEVTOOLS_MAX_REQUEST_TOMBSTONES);
  });

  it('MUST bound transfer tombstones on their own budget', () => {
    const { session } = setup();
    for (let index = 0; index < DEVTOOLS_MAX_TRANSFER_TOMBSTONES; index++) {
      expect(session.registerTransfer(`tx-${index}`).outcome).toBe('registered');
      session.settleTransfer(`tx-${index}`);
    }

    expect(session.transferTombstones).toBe(DEVTOOLS_MAX_TRANSFER_TOMBSTONES);
    expect(session.registerTransfer('tx-extra')).toEqual({
      outcome: 'rejected',
      error: { code: 'session_budget_exhausted', retryable: false }
    });
    // request 预算不受牵连。
    expect(session.registerRequest('req-1').outcome).toBe('registered');
  });

  it('MUST answer the terminal budget code even when in-flight slots are free', () => {
    // 预算耗尽与在途已满是两个不同的答案，排空在途也换不回名额。
    const { session } = setup();
    burnRequestBudget(session, DEVTOOLS_MAX_REQUEST_TOMBSTONES);

    expect(session.inflightRequests).toBe(0);
    expect(session.registerRequest('after')).toEqual({
      outcome: 'rejected',
      error: { code: 'session_budget_exhausted', retryable: false }
    });
  });

  it('MUST still answer the waitable code while a tombstone slot remains for every live id', () => {
    // 在途已满，但把在途全部结算之后墓碑仍装得下：这时排空在途确实能推进，
    // 所以答案必须是可等待的那个。
    const { session } = setup();
    burnRequestBudget(session, DEVTOOLS_MAX_REQUEST_TOMBSTONES - DEVTOOLS_MAX_INFLIGHT_REQUESTS - 1);
    for (let index = 0; index < DEVTOOLS_MAX_INFLIGHT_REQUESTS; index++) {
      expect(session.registerRequest(`live-${index}`).outcome).toBe('registered');
    }

    expect(session.registerRequest('after')).toEqual({
      outcome: 'rejected',
      error: { code: 'request_limit_exceeded', retryable: true }
    });
  });

  it('MUST NOT admit more distinct ids than the declared tombstone budget', () => {
    // 在途 ID 迟早都要变成墓碑，准入时不给它们留位就等于把声明的 4096 悄悄放大到
    // 4096 + 32：4095 个墓碑之上仍能同时准入 32 条，全部结算后墓碑就是 4127。
    const { session } = setup();
    burnRequestBudget(session, DEVTOOLS_MAX_REQUEST_TOMBSTONES - 1);

    // 只剩最后一格，只能再进一条；在途名额空着也换不来第二条。
    expect(session.registerRequest('last').outcome).toBe('registered');
    expect(session.registerRequest('overflow')).toEqual({
      outcome: 'rejected',
      error: { code: 'session_budget_exhausted', retryable: false }
    });

    session.settleRequest('last');
    expect(session.requestTombstones).toBe(DEVTOOLS_MAX_REQUEST_TOMBSTONES);
    expect(session.inflightRequests).toBe(0);
  });

  it('MUST time a request out at 15 s and release its slot', () => {
    const { clock, timedOut, session } = setup();
    session.registerRequest('req-1');

    clock.advance(DEVTOOLS_REQUEST_TIMEOUT_MS - 1);
    expect(timedOut).toEqual([]);
    expect(session.inflightRequests).toBe(1);

    clock.advance(1);
    expect(timedOut).toEqual(['req-1']);
    // 超时是终态：名额释放、墓碑登记、计时器不再挂着。
    expect(session.inflightRequests).toBe(0);
    expect(session.requestTombstones).toBe(1);
    expect(clock.pendingTimers()).toBe(0);
  });

  it('MUST cancel the deadline when a request settles in time', () => {
    const { clock, timedOut, session } = setup();
    session.registerRequest('req-1');
    expect(session.settleRequest('req-1')).toBe(true);
    expect(clock.pendingTimers()).toBe(0);

    clock.advance(DEVTOOLS_REQUEST_TIMEOUT_MS * 2);
    expect(timedOut).toEqual([]);
  });

  it('MUST measure each deadline from its own registration', () => {
    const { clock, timedOut, session } = setup();
    session.registerRequest('early');
    clock.advance(10_000);
    session.registerRequest('late');

    clock.advance(5_000);
    expect(timedOut).toEqual(['early']);

    clock.advance(10_000);
    expect(timedOut).toEqual(['early', 'late']);
  });

  it('MUST NOT apply the request deadline to transfers', () => {
    // 流式传输有自己的 idle / 总时长两道闸；15 秒端到端时限在 1 GiB 上限下必然误杀。
    const { clock, session } = setup();
    session.registerTransfer('tx-1');

    clock.advance(DEVTOOLS_REQUEST_TIMEOUT_MS * 4);
    expect(session.inflightTransfers).toBe(1);
  });

  it('MUST release a never-started transfer without spending a tombstone', () => {
    // 登记之后立刻被传输表拒掉的 START 没有终结过任何东西：没建 sink，也没收过一个字节。
    // 给它记墓碑，等于每一次被拒都永久吃掉一格预算（墓碑有界且满了不驱逐），
    // 攒满上限后 session 只剩终态的 session_budget_exhausted。
    const { session } = setup();
    for (let index = 0; index < DEVTOOLS_MAX_TRANSFER_TOMBSTONES + 4; index++) {
      expect(session.registerTransfer('tx-1').outcome).toBe('registered');
      expect(session.releaseTransfer('tx-1')).toBe(true);
    }

    expect(session.transferTombstones).toBe(0);
    expect(session.inflightTransfers).toBe(0);
  });

  it('MUST report the release of an unknown transfer or a closed session as a no-op', () => {
    const { session } = setup();
    expect(session.releaseTransfer('never-registered')).toBe(false);

    session.registerTransfer('tx-1');
    session.close();
    expect(session.releaseTransfer('tx-1')).toBe(false);
  });

  it('MUST report settlement of an unknown or already terminal id as a no-op', () => {
    const { session } = setup();
    expect(session.settleRequest('never-registered')).toBe(false);
    expect(session.settleTransfer('never-registered')).toBe(false);

    session.registerRequest('req-1');
    expect(session.settleRequest('req-1')).toBe(true);
    expect(session.settleRequest('req-1')).toBe(false);
    // 重复结算不得重复登记墓碑，否则预算会被自己的重试耗尽。
    expect(session.requestTombstones).toBe(1);
  });

  it('MUST release every pending deadline on close', () => {
    const { clock, timedOut, session } = setup();
    session.registerRequest('req-1');
    session.registerRequest('req-2');
    session.registerTransfer('tx-1');

    session.close();

    expect(session.state).toBe('closed');
    expect(clock.pendingTimers()).toBe(0);
    expect(session.inflightRequests).toBe(0);
    expect(session.inflightTransfers).toBe(0);

    clock.advance(DEVTOOLS_REQUEST_TIMEOUT_MS * 2);
    // 关闭时对端已经知道结果，超时回调再来一次只会让 904c 发出无主的 ERROR 帧。
    expect(timedOut).toEqual([]);
  });

  it('MUST answer session_closed once closed, whatever the identifier looks like', () => {
    const { session } = setup();
    session.close();

    expect(session.registerRequest('req-1')).toEqual({
      outcome: 'rejected',
      error: { code: 'session_closed', retryable: false }
    });
    // 已关闭优先于标识符校验：关闭后连「这个 ID 长得对不对」都不该泄漏。
    expect(session.registerTransfer('not a valid id')).toEqual({
      outcome: 'rejected',
      error: { code: 'session_closed', retryable: false }
    });
    expect(session.settleRequest('req-1')).toBe(false);
  });

  it('MUST be idempotent on close', () => {
    const { session } = setup();
    session.registerRequest('req-1');
    session.close();
    expect(() => session.close()).not.toThrow();
    expect(session.state).toBe('closed');
  });
});
