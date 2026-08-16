/**
 * @fileoverview 强制前置套件：任何 conformance driver 在跑业务断言之前，必须先证明它的
 * 线上表示是**规范 JSON 文本**。
 *
 * @remarks
 * 三条判据缺一不可：
 *
 * 1. `typeof frame === 'string'` —— structured clone 能原样传 `Uint8Array`，JSON transport 不能。
 * 2. `JSON.parse` 不抛 —— 排除半截帧与非 JSON 原文。
 * 3. `JSON.stringify(JSON.parse(frame)) === frame` —— 规范往返。这一条同时杀掉
 *    `String(uint8Array)` 偷渡、`undefined` / `NaN` / `Infinity` 被 `JSON.stringify` 悄悄改写、
 *    以及跳与跳之间的键序漂移。前两条都拦不住这三类，只有逐字节比较能。
 *
 * 用 structured clone 的 driver 内部仍可传对象，但必须在探针边界序列化——任何有损跳都会被
 * 第三条照出来。
 *
 * @module @aiao/rxdb-devtools/testing/wire-hygiene.suite
 */

import { describe, expect, it } from 'vitest';

import { createDevToolsV2Message } from '../v2/wire.js';
import { DEVTOOLS_RELAY_SEGMENTS, createScenario } from './driver.js';
import type { DevToolsConformanceDriver, DevToolsWireFrame } from './driver.js';

/** 套件自身发流量时使用的 session 身份；固定值让失败输出可读。 */
const HYGIENE_SESSION_ID = '4b1d0f3a-2c6e-4a58-9f31-8d7c5e2b0a94';

/**
 * 判定一帧是否为规范 JSON 文本。
 *
 * @remarks
 * 导出给两个 plane suite 逐帧调用——它们不重复这里的 `describe`，只借这一个判据。
 *
 * @param frame - 待检查的原文。
 * @returns 三条判据全部满足时为 `true`。
 */
export function isCanonicalJsonFrame(frame: unknown): frame is DevToolsWireFrame {
  if (typeof frame !== 'string') return false;

  let parsed: unknown;
  try {
    parsed = JSON.parse(frame);
  } catch {
    return false;
  }
  return JSON.stringify(parsed) === frame;
}

/**
 * 断言一帧是规范 JSON 文本，失败时给出可读的原因。
 *
 * @param frame - 待检查的原文。
 * @throws Error 当帧不是字符串、不可解析或往返不等时。
 */
export function assertCanonicalJsonFrame(frame: unknown): asserts frame is DevToolsWireFrame {
  if (typeof frame !== 'string') {
    throw new Error(`wire hygiene: frame must be a JSON string, received ${typeof frame}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(frame);
  } catch {
    throw new Error(`wire hygiene: frame is not parseable JSON: ${frame.slice(0, 120)}`);
  }

  const reencoded = JSON.stringify(parsed);
  if (reencoded !== frame) {
    throw new Error(`wire hygiene: frame is not canonical JSON\n  sent: ${frame}\n  round-trip: ${String(reencoded)}`);
  }
}

/** 造一帧合法的 v2 原文，作为套件自身的流量源。 */
function hygieneFrame(sequence: number): DevToolsWireFrame {
  return JSON.stringify(
    createDevToolsV2Message('PING', null, {
      sessionId: HYGIENE_SESSION_ID,
      timestamp: 1_700_000_000_000 + sequence,
      sequence
    })
  );
}

/**
 * 跑 wire hygiene 套件。
 *
 * @remarks
 * **两个 plane suite 必须在顶部调用它，且不可跳过。** 一个连帧都传不干净的 driver，
 * 后面所有业务断言的绿都不可信。
 *
 * @param driver - 待验收的 driver。
 */
export function runDevToolsWireHygieneSuite(driver: DevToolsConformanceDriver): void {
  describe(`wire hygiene [${driver.name}]`, () => {
    it('MUST carry every frame across all four segments as canonical JSON text', async () => {
      const session = await driver.open(createScenario());
      await session.segment('panel').inject(hygieneFrame(1), 'panel-to-connector');
      await session.settle();

      const observed = DEVTOOLS_RELAY_SEGMENTS.flatMap(segment => [
        ...session.segment(segment).sent,
        ...session.segment(segment).received
      ]);

      expect(observed.length).toBeGreaterThan(0);
      for (const frame of observed) {
        expect(() => assertCanonicalJsonFrame(frame)).not.toThrow();
      }

      await session.dispose();
    });

    it('MUST keep frames canonical when every hop costs real time', async () => {
      // hopDelayMs > 0：投递靠 advanceTime 推进，而不是靠微任务。若 driver 只在 0 延迟下
      // 保真（例如同步传对象引用、只在异步路径上序列化），这条会把差异照出来。
      const session = await driver.open(createScenario({ hopDelayMs: 5 }));
      const injected = hygieneFrame(2);
      await session.segment('panel').inject(injected, 'panel-to-connector');
      await session.advanceTime(5 * DEVTOOLS_RELAY_SEGMENTS.length);

      // 只断言「注入的那帧原样到达」，不断言总数：装配了真实两端的 driver 这里还会有协商帧，
      // 而它们同样必须规范——把总数写死会让这条在真实 driver 上因为无关原因红。
      const delivered = session.segment('connector').received;
      expect(delivered).toContain(injected);
      for (const frame of delivered) {
        expect(() => assertCanonicalJsonFrame(frame)).not.toThrow();
      }

      await session.dispose();
    });

    it('MUST reject frames that survive parsing but not the canonical round-trip', () => {
      // 这条不验 driver，验判据本身：往返比较是承重的，不是装饰。若把它退化成
      // 「parse 不抛就算过」，下面三种全都会被放行。
      expect(isCanonicalJsonFrame('{"a":1,"a":2}')).toBe(false);
      expect(isCanonicalJsonFrame('{ "a": 1 }')).toBe(false);
      expect(isCanonicalJsonFrame('{"a":1.0}')).toBe(false);

      expect(isCanonicalJsonFrame(hygieneFrame(3))).toBe(true);
    });

    it('MUST reject non-string and unparseable frames', () => {
      expect(isCanonicalJsonFrame(new Uint8Array([1, 2, 3]))).toBe(false);
      expect(isCanonicalJsonFrame({ type: 'PING' })).toBe(false);
      expect(isCanonicalJsonFrame(undefined)).toBe(false);
      expect(isCanonicalJsonFrame('{"type":')).toBe(false);

      expect(() => assertCanonicalJsonFrame(42)).toThrow(/must be a JSON string/);
      expect(() => assertCanonicalJsonFrame('{"type":')).toThrow(/not parseable JSON/);
      expect(() => assertCanonicalJsonFrame('{ "a": 1 }')).toThrow(/not canonical JSON/);
    });
  });
}
