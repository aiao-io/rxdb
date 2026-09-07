/**
 * @fileoverview push 在飞登记处的测试替身
 */

import { PushInFlightRegistry } from '../../version/push-inflight.js';

/**
 * 一个空的、**真的**在飞登记处。
 *
 * @remarks
 * 有意不做 mock：`PushInFlightRegistry` 没有任何外部依赖，换成替身反而会把要验的东西验掉。
 *
 * 手搭 `as unknown as VersionManager` / `as unknown as RxDB` 的用例本来就没接 push 子系统，
 * 这里把这一项补齐，让 `pushRepository` 有地方认领、让 undo 有快照可读。
 *
 * 空登记处的快照是空 Map，于是 {@link buildLastPushedMap} 只剩 `RxDBSync` 水位线一个来源 ——
 * 与引入在飞认领之前逐字一致，这些用例继续只验自己那件事。认领**非空**时的行为不在这里验，
 * 由 `version/push-inflight.spec.ts` 与 `version/push-repository.spec.ts`「在飞认领」专门守着。
 */
export const emptyPushInFlight = (): PushInFlightRegistry => new PushInFlightRegistry();
