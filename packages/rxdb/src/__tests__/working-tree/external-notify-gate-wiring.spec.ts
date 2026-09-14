/**
 * @fileoverview T067 红测试：矩阵行 11 —— `EntityManager.notifyExternalUpdate()` 的写门禁。
 *
 * @remarks
 * `write-entry-matrix.spec.ts` 已经测过行 11 的**判定**：`notify_external_update` 打在版本化
 * 业务实体上、能力已启用时结论是 `reject`。这里测的是那条判定**有没有被接上**——在此之前
 * `notifyExternalUpdate()` 无条件派发事件，矩阵里的那一行在运行时一次都不会被求值。
 *
 * 为什么这一行必须有门禁，而不是像行 7 那样留给后续阶段：
 *
 * 1. **它是 raw 写的配套通知口。** 方法的全部用途就是「我刚绕过 ORM 改了库，请你更新缓存并广播」。
 *    5 步判定已经在 `rawQuery` 上把改版本化表的语句拦下了，唯独这条通知还在替一次并不存在的
 *    写发事件——下游 QueryCache 会照着 patch 改内存里的实体，于是工作树、业务表、内存三方各说各话。
 * 2. **拒绝必须发生在派发之前。** 事件一旦派发就有跨 tab 广播，撤不回来。所以门禁包着
 *    `dispatchEvent`，而不是派发完再补一句断言——与 {@link gateBulkWrite} 同一个形状，
 *    理由也同一条。
 * 3. **能力未启用时必须逐字节不变**（FR-046）。这里的「未启用」有三种形态，三种都得走老路：
 *    没装捕获运行时、本地适配器还没连上、压根没配本地适配器。后两种尤其要紧——
 *    `notifyExternalUpdate()` 今天在没连库的实例上也能调（它只派发事件），门禁若经
 *    `localAdapterSync` 去取域，就会给这些调用方凭空加一个「未连接」异常。
 * 4. **QueryCache 实体照常放行。** 这个方法本来就是给缓存回填用的，拦掉它等于把行 11 的
 *    结论从「保护版本化表」误读成「禁用这个方法」。
 */

import { describe, expect, it } from 'vitest';
import { EntityBase } from '../../entity/entity-base.js';
import { Entity } from '../../entity/entity.decorator.js';
import { EntityManager } from '../../entity/entity-manager.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { RxDBEvent } from '../../rxdb-events.js';
import type { RxDB } from '../../RxDB.js';
import type { WorkingTreeCaptureHook } from '../../working-tree/capture-interceptor.js';
import { gateExternalNotify } from '../../working-tree/external-notify-gate.js';
import type { VersionedDomain } from '../../working-tree/versioned-domain.js';
import { WorkingTreeWriteRejectedError, type WriteTargetClass } from '../../working-tree/write-entry-matrix.js';

/** 版本化业务实体：门禁要拦的对象。 */
@Entity({
  name: 'NotifyGateNote',
  tableName: 'notify_gate_notes',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class NotifyGateNote extends EntityBase {
  title!: string;
}

/** QueryCache 实体：这个方法本来的服务对象，必须照常放行。 */
@Entity({
  name: 'NotifyGateCache',
  tableName: 'notify_gate_caches',
  properties: [{ name: 'label', type: PropertyType.string }],
  sync: { type: SyncType.QueryCache, local: { adapter: 'l' }, remote: { adapter: 'r' } }
})
class NotifyGateCache extends EntityBase {
  label!: string;
}

/** 只按实体名分类的域替身；这个文件不测分类本身，只测分类有没有被问到。 */
const domainStub = (): VersionedDomain => ({
  versionedTables: new Set(['notify_gate_notes']),
  untrackedFieldsOf: () => new Set(),
  classifyEntity: entityName => (entityName === 'NotifyGateCache' ? 'untracked' : 'tracked'),
  isUntrackedField: () => false,
  createTransactionGuard: () => ({ record: () => undefined })
});

/** 只实现门禁够得着的那两个成员的钩子替身。 */
const hookStub = (): WorkingTreeCaptureHook => {
  const domain = domainStub();
  return {
    domain,
    targetClassOf: (entityName, namespace) =>
      namespace === 'rxdb' ? 'system' : domain.classifyEntity(entityName) === 'untracked' ? 'query_cache' : 'versioned',
    bindMountTarget: () => undefined,
    interceptTransaction: (_host, next, fun, transactionLog) => next(fun, transactionLog),
    interceptMergeChanges: (host, next, actions, localChanges, disableTriggers) =>
      next(host, actions, localChanges, disableTriggers),
    interceptSwitchBranch: (_host, next, options) => next(options),
    interceptBulkWrite: (_host, next) => next()
  };
};

/**
 * 造一个只够 `notifyExternalUpdate()` 跑起来的 `RxDB` 替身。
 *
 * @param hook - 这个库当前生效的捕获钩子；`undefined` 表示能力未启用
 * @returns 实体管理器与它派发出去的事件清单
 *
 * @remarks
 * `EntityManager` 的构造函数只调 `rxdb.repository()` 两次，`notifyExternalUpdate()` 只用
 * `rxdb.dispatchEvent()`——用真 `RxDB` 就得先备好适配器、建表、连接，而那一串与本文件要钉的
 * 行为无关，还会把「未连接时不该抛」这条断言变成不可能构造的场景。
 */
const managerWith = (hook: WorkingTreeCaptureHook | undefined): { manager: EntityManager; events: RxDBEvent[] } => {
  const events: RxDBEvent[] = [];
  const stub = {
    repository: () => stub,
    workingTreeCaptureHook: hook,
    dispatchEvent: (event: RxDBEvent) => void events.push(event)
  };
  return { manager: new EntityManager(stub as unknown as RxDB), events };
};

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

/**
 * 固定的 uuid 形状 id。
 *
 * @remarks
 * `EntityBase.id` 是 `PropertyType.uuid`，签名上就要求 uuid 形状的模板字面量，`'note-1'`
 * 这种可读假 id 连编译都过不去。这几条用例喂的是 stub 而不是真库，所以钉死成固定值——
 * 随机 uuid 在这里买不到任何东西，却会让失败信息每次都不一样。
 */
const NOTE_ID = '11111111-1111-4111-8111-111111111111';

/** QueryCache 侧的固定 id；与 {@link NOTE_ID} 区分开，免得断言看串行。 */
const CACHE_ID = '22222222-2222-4222-8222-222222222222';

describe('行 11 接线 —— EntityManager.notifyExternalUpdate()', () => {
  it('启用能力的库上对版本化实体抛错，事件一条都没派发', () => {
    const { manager, events } = managerWith(hookStub());
    expect(() => manager.notifyExternalUpdate(NotifyGateNote, NOTE_ID, { title: '外部改的' })).toThrow(
      WorkingTreeWriteRejectedError
    );
    expect(events, '拒绝之前事件已经派发出去了').toHaveLength(0);
  });

  it('启用能力的库上对 QueryCache 实体照常派发', () => {
    const { manager, events } = managerWith(hookStub());
    manager.notifyExternalUpdate(NotifyGateCache, CACHE_ID, { label: '回填' });
    expect(events).toHaveLength(1);
  });

  it('没装捕获运行时的库上照常派发', () => {
    const { manager, events } = managerWith(undefined);
    manager.notifyExternalUpdate(NotifyGateNote, NOTE_ID, { title: '外部改的' });
    expect(events).toHaveLength(1);
  });

  it('本地适配器未连接 / 未配置时照常派发，不抛「未连接」', () => {
    // 取钩子的那条路必须容忍「没有本地适配器」，否则这个方法会在从未连库的实例上开始抛错。
    const events: RxDBEvent[] = [];
    const stub = {
      repository: () => stub,
      get workingTreeCaptureHook(): WorkingTreeCaptureHook | undefined {
        return undefined;
      },
      dispatchEvent: (event: RxDBEvent) => void events.push(event)
    };
    const manager = new EntityManager(stub as unknown as RxDB);
    expect(() => manager.notifyExternalUpdate(NotifyGateNote, NOTE_ID, { title: '外部改的' })).not.toThrow();
    expect(events).toHaveLength(1);
  });
});
