/**
 * @fileoverview `EntityManager.notifyExternalUpdate()` 与捕获钩子转交门 2 的**接线**。
 *
 * @remarks
 * 判定本身不在核心：`gateExternalNotify` 的语义（哪一类目标在行 11 上是放是拒）随
 * `@aiao/rxdb-plugin-working-tree` 走，那边的 `__tests__/working-tree/external-notify-gate-wiring.spec.ts`
 * 钉的就是它。本文件钉的是核心这一半——**判定有没有被接上**，以及接上的方式对不对：
 *
 * 1. **拒绝必须发生在派发之前。** 事件一旦派发就有跨 tab 广播，撤不回来。所以门包着
 *    `dispatchEvent`，而不是派发完再补一句断言。这里用「钩子当场抛」来反证：抛了之后
 *    事件清单必须仍是空的。写成先派发再检查的实现，这条会红。
 * 2. **核心交出去的只有实体身份。** 归类要问域，而域是捕获的（见 `WorkingTreeCaptureHook`
 *    的 `gateExternalNotify` 注释）。所以这里连「版本化实体」「QueryCache 实体」都不分——
 *    只断言核心把 `name` / `namespace` 原样交了出去。核心自己先筛一遍的那天，插件侧的
 *    矩阵就有一部分永远求值不到，而不会有任何编译错误。
 * 3. **能力未启用时逐字节不变**（FR-046）。「未启用」的形态是「钩子取不到」，这里有两种：
 *    没装捕获运行时、以及本地适配器还没连上 / 压根没配。后者尤其要紧——
 *    `notifyExternalUpdate()` 今天在从未连库的实例上也能调（它只派发事件），取钩子那条路
 *    若经 `localAdapterSync` 去拿域，就会给这些调用方凭空加一个「未连接」异常。
 *
 * 用 stub 而不是真 `RxDB`：`EntityManager` 的构造函数只调 `rxdb.repository()`，
 * `notifyExternalUpdate()` 只用 `rxdb.dispatchEvent()` 与 `rxdb.workingTreeCaptureHook`。
 * 真库要先备适配器、建表、连接，那一串与本文件要钉的行为无关，还会把第 3 条里
 * 「未连接时不该抛」变成不可能构造的场景。
 */

import { describe, expect, it } from 'vitest';
import type { WorkingTreeCaptureHook } from '../../capture/capture-interceptor.js';
import { EntityBase } from '../../entity/entity-base.js';
import { EntityManager } from '../../entity/entity-manager.js';
import { Entity } from '../../entity/entity.decorator.js';
import { PropertyType, SyncType } from '../../entity/metadata-options.interface.js';
import type { RxDBEvent } from '../../rxdb-events.js';
import type { RxDB } from '../../RxDB.js';

/** 业务实体：钩子在场时，它的身份必须被原样交到转交门上。 */
@Entity({
  name: 'NotifyGateNote',
  tableName: 'notify_gate_notes',
  properties: [{ name: 'title', type: PropertyType.string }]
})
class NotifyGateNote extends EntityBase {
  title!: string;
}

/** QueryCache 实体：核心不因为 `sync.type` 自己先筛一遍，它同样要经过转交门。 */
@Entity({
  name: 'NotifyGateCache',
  tableName: 'notify_gate_caches',
  properties: [{ name: 'label', type: PropertyType.string }],
  sync: { type: SyncType.QueryCache, local: { adapter: 'l' }, remote: { adapter: 'r' } }
})
class NotifyGateCache extends EntityBase {
  label!: string;
}

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

/** 转交门收到的一次调用；**不含 `notify`**——那个回调的证据是「事件有没有出现」。 */
interface HandoffCall {
  readonly entityName: string;
  readonly namespace: string | undefined;
}

/** 插件侧拒绝的替身。核心认不得插件的错误类，这里只需要一个可辨认的身份。 */
class GateRejected extends Error {}

/**
 * 造一个只够 `notifyExternalUpdate()` 跑起来的 `RxDB` 替身。
 *
 * @param verdict - 转交门的结论：`pass` 调用通知体，`reject` 当场抛
 * @returns 实体管理器、派发出去的事件清单，以及转交门收到的调用清单
 *
 * @remarks
 * 结论由参数给定而**不**按实体去判——归类是插件的事。替身若自己按 `sync.type` 编一个结论，
 * 本文件断的就是替身而不是「核心有没有把身份交出去」。
 */
const managerWith = (
  verdict: 'pass' | 'reject' | 'no-hook'
): { manager: EntityManager; events: RxDBEvent[]; handoffs: HandoffCall[] } => {
  const events: RxDBEvent[] = [];
  const handoffs: HandoffCall[] = [];
  const hook: WorkingTreeCaptureHook | undefined =
    verdict === 'no-hook' ? undefined : (
      ({
        gateExternalNotify: <T>(entityName: string, namespace: string | undefined, notify: () => T): T => {
          handoffs.push({ entityName, namespace });
          if (verdict === 'reject') throw new GateRejected('rejected by capture runtime');
          return notify();
        }
      } as unknown as WorkingTreeCaptureHook)
    );
  const stub = {
    repository: () => stub,
    workingTreeCaptureHook: hook,
    dispatchEvent: (event: RxDBEvent) => void events.push(event)
  };
  return { manager: new EntityManager(stub as unknown as RxDB), events, handoffs };
};

describe('notifyExternalUpdate() 经转交门 2 出去（写入口语义矩阵行 11）', () => {
  it('钩子在场时拿到实体名与命名空间，且通知体由它决定调不调', () => {
    const { manager, events, handoffs } = managerWith('pass');

    manager.notifyExternalUpdate(NotifyGateNote, NOTE_ID, { title: '外部改的' });

    expect(handoffs).toEqual([{ entityName: 'NotifyGateNote', namespace: 'public' }]);
    expect(events).toHaveLength(1);
  });

  it('转交门拒绝时事件一条都没派发', () => {
    const { manager, events } = managerWith('reject');

    expect(() => manager.notifyExternalUpdate(NotifyGateNote, NOTE_ID, { title: '外部改的' })).toThrow(GateRejected);
    // 拒绝发生在派发之后的话，这一行是 1——而已经广播出去的事件撤不回来。
    expect(events).toHaveLength(0);
  });

  it('QueryCache 实体同样经过转交门，核心不按 sync.type 自己先筛一遍', () => {
    const { manager, events, handoffs } = managerWith('pass');

    manager.notifyExternalUpdate(NotifyGateCache, CACHE_ID, { label: '回填' });

    // 核心若在这里提前放行，插件矩阵的 query_cache 那一格就永远求值不到——
    // 结论碰巧一致，于是任何一次规则变更都不会在这一侧显形。
    expect(handoffs).toEqual([{ entityName: 'NotifyGateCache', namespace: 'public' }]);
    expect(events).toHaveLength(1);
  });

  it('没装捕获运行时的库上照常派发，转交门一次都没被问（FR-046）', () => {
    const { manager, events, handoffs } = managerWith('no-hook');

    manager.notifyExternalUpdate(NotifyGateNote, NOTE_ID, { title: '外部改的' });

    expect(events).toHaveLength(1);
    expect(handoffs).toEqual([]);
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
