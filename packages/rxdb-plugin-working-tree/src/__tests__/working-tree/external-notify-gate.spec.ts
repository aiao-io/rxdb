/**
 * @fileoverview T067 红测试：写入口语义矩阵行 11 的门禁 —— {@link gateExternalNotify}。
 *
 * @remarks
 * `write-entry-matrix.spec.ts` 已经测过行 11 的**判定**：`notify_external_update` 打在版本化
 * 业务实体上、能力已启用时结论是 `reject`。这里测的是那条判定被包成门之后的形状。
 *
 * 为什么这一行必须有门禁，而不是像行 7 那样留给后续阶段：
 *
 * 1. **它是 raw 写的配套通知口。** 方法的全部用途就是「我刚绕过 ORM 改了库，请你更新缓存并广播」。
 *    4 步判定已经在 `rawQuery` 上把改版本化表的语句拦下了，唯独这条通知还在替一次并不存在的
 *    写发事件——下游 QueryCache 会照着 patch 改内存里的实体，于是工作树、业务表、内存三方各说各话。
 * 2. **拒绝必须发生在派发之前。** 门禁拿到的是**还没被调用的**通知体，「先判定」因此在类型上
 *    就是唯一写法——与 {@link gateBulkWrite} 同一个形状，理由也同一条。
 * 3. **能力未启用时必须逐字节不变**（FR-046）：这里表现为版本化实体也照样放行。
 * 4. **QueryCache 实体照常放行。** 这个方法本来就是给缓存回填用的，拦掉它等于把行 11 的
 *    结论从「保护版本化表」误读成「禁用这个方法」。
 *
 * **接线在核心那一半**：`packages/rxdb/src/__tests__/entity/notify-external-update-gate.spec.ts`
 * 钉的是 `EntityManager.notifyExternalUpdate()` 有没有把实体身份交到转交门上、拒绝时事件
 * 一条都没派发、以及没装运行时的库上逐字不变。那些断言要运行期的 `EntityManager` 构造器，
 * 而核心对它**只转类型不转值**（`index.ts` 自陈「转出类只会让人以为可以自己 new 一个」），
 * 这个包在包外拿不到。两半合起来才是完整的行 11：这边是判定，那边是判定有没有被接上。
 */

import { describe, expect, it } from 'vitest';
import { gateExternalNotify } from '../../working-tree/external-notify-gate.js';
import { WorkingTreeWriteRejectedError, type WriteTargetClass } from '../../working-tree/write-entry-matrix.js';

describe('行 11 门禁 —— gateExternalNotify', () => {
  const request = (targetClass: WriteTargetClass, capabilityEnabled = true) => ({
    entityName: 'NotifyGateNote',
    targetClass,
    capabilityEnabled
  });

  it('版本化业务实体上拒绝，且通知体一次都没被调用', () => {
    let ran = 0;
    expect(() => gateExternalNotify(request('versioned'), () => void (ran += 1))).toThrow(
      WorkingTreeWriteRejectedError
    );
    expect(ran, '拒绝发生在派发之后').toBe(0);
  });

  it('拒绝信息点名实体与修法', () => {
    expect(() => gateExternalNotify(request('versioned'), () => undefined)).toThrow(/NotifyGateNote/);
  });

  it('QueryCache 实体放行', () => {
    let ran = 0;
    gateExternalNotify(request('query_cache'), () => void (ran += 1));
    expect(ran).toBe(1);
  });

  it('系统实体放行', () => {
    let ran = 0;
    gateExternalNotify(request('system'), () => void (ran += 1));
    expect(ran).toBe(1);
  });

  it('能力未启用时连版本化实体也放行', () => {
    let ran = 0;
    gateExternalNotify(request('versioned', false), () => void (ran += 1));
    expect(ran).toBe(1);
  });
});
