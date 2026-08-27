/**
 * @fileoverview RDT-013 / RDT-009 / RDT-017：与 `@aiao/rxdb` 的真实契约。
 *
 * @remarks
 * 其余 spec 全部跑在手写夹具上 —— 夹具是照着连接器**现在的用法**写的，
 * 于是「连接器要的形状」和「RxDB 真实提供的形状」之间的偏差永远测不出来：
 * 上游把 `addEventListener` 改成泛型、把 `EntityMetadata.encryptedPropertyMap`
 * 换成别的容器，夹具照跑不误，真正的信号只会以三端 demo 里的 `as any` 形式出现。
 *
 * 本文件用**真实的 `RxDB` 实例**调用 `init()`，一处断言都不加。
 * 它守两件事：
 *
 * 1. 类型层：`init(rxdb, getEntityMetadata)` 必须零断言编译通过（RDT-013）；
 * 2. 值层：订阅的事件清单必须对 `RxDBEventMap` 穷尽表态（RDT-009）。
 *
 * `new RxDB()` 只做纯内存的构造（见 `RxDB.ts` 构造函数），**不调用 `init()`**，
 * 因此不需要任何存储适配器，也不会碰 OPFS / IDB。
 */
import type { EntityMetadata, EntityType, RxDBEvent } from '@aiao/rxdb';
import { getEntityMetadata, RxDB, RxDBBranch, SyncType } from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RXDB_EVENT_SUBSCRIPTIONS } from '../connector-events.js';
import type { DevToolsEntityMetadata, DevToolsRxDB, GetEntityMetadataFn } from '../connector.js';
import { DevToolsConnector, RXDB_EVENT_TYPES } from '../connector.js';

function createRxDB(): RxDB {
  return new RxDB({
    dbName: 'devtools-contract',
    entities: [RxDBBranch],
    sync: { type: SyncType.None, local: { adapter: 'memory' } }
  });
}

describe('rxdb contract', () => {
  let connector: DevToolsConnector;

  beforeEach(() => {
    vi.spyOn(window, 'postMessage').mockImplementation(() => undefined);
    connector = new DevToolsConnector();
  });

  afterEach(() => {
    connector.disconnect();
    vi.restoreAllMocks();
  });

  describe('type contract', () => {
    it('MUST accept a real RxDB instance and getEntityMetadata without any assertion', () => {
      const rxdb = createRxDB();

      // 这一行就是断言本身：它一旦编译不过，三端 demo 就得重新长回 `as any`。
      // 运行时不抛 = 连接器没有依赖任何 RxDB 上不存在的成员。
      expect(() => connector.init(rxdb, getEntityMetadata)).not.toThrow();
    });

    it('MUST keep the real RxDB assignable to DevToolsRxDB and EntityMetadata to DevToolsEntityMetadata', () => {
      // 纯编译期断言：赋值方向必须是「真实类型 → devtools 类型」。
      // 反向不成立是刻意的，devtools 的形状比上游宽（见 DevToolsEntityMetadata 的 @remarks）。
      const rxdb: DevToolsRxDB = createRxDB();
      const metadata: DevToolsEntityMetadata = getEntityMetadata(RxDBBranch);
      const widened: DevToolsEntityMetadata = {} as EntityMetadata;
      const readMetadata: GetEntityMetadataFn = getEntityMetadata;

      expect(rxdb.version).toBe(createRxDB().version);
      expect(metadata.name).toBe('RxDBBranch');
      expect(widened).toBeDefined();
      expect(readMetadata(RxDBBranch)?.name).toBe('RxDBBranch');
    });

    it('MUST read encrypted property names off the real EntityMetadata shape', () => {
      // 连接器只取 keys() 当加密字段名单。上游若把 encryptedPropertyMap 换成
      // 非 Map 容器，这条先红 —— 而不是等到面板把密文当明文播出去。
      const metadata: DevToolsEntityMetadata = getEntityMetadata(RxDBBranch);
      const names = [...(metadata.encryptedPropertyMap?.keys() ?? [])];

      expect(Array.isArray(names)).toBe(true);
    });
  });

  describe('event subscription exhaustiveness', () => {
    it('MUST subscribe every RxDBEventMap key', () => {
      const rxdb = createRxDB();
      const addEventListener = vi.spyOn(rxdb, 'addEventListener');

      connector.init(rxdb, getEntityMetadata);

      const subscribed = new Set(addEventListener.mock.calls.map(([type]) => type));

      expect([...subscribed].sort()).toEqual([...RXDB_EVENT_TYPES].sort());
    });

    // US-023 AC#31：穷尽性断言对「新事件被填成 false」是绿的 —— 清单里有键就算表过态。
    // 远端失效是 QueryCache 诊断的关键一环，必须显式钉成转发。
    it('MUST forward REMOTE_ENTITY_INVALIDATED', () => {
      expect(RXDB_EVENT_SUBSCRIPTIONS.REMOTE_ENTITY_INVALIDATED).toBe(true);
      expect(RXDB_EVENT_TYPES).toContain('REMOTE_ENTITY_INVALIDATED');
    });

    it('MUST NOT subscribe an event name that RxDB does not dispatch', () => {
      // SYNC_START 这类拼错的事件名不会报错，只会静默订阅一个永不触发的键
      // ——本仓的两条边界用例就曾这样对着零事件跑绿。反向核对：清单里的每个名字
      // 都必须能在真实实例上完成一次「派发 → 收到」闭环。
      const rxdb = createRxDB();
      const received: string[] = [];
      for (const type of RXDB_EVENT_TYPES) rxdb.addEventListener(type, event => received.push(event.type));

      for (const type of RXDB_EVENT_TYPES) {
        // 本条测的是**事件名**，不是 payload 形状：`entities: []` 只是为了让
        // RxDB 内部那个读 `event.entities` 的 QueryManager 监听器能走完。
        rxdb.dispatchEvent({ type, entities: [] } as unknown as RxDBEvent);
      }

      expect(received).toEqual([...RXDB_EVENT_TYPES]);
    });

    it('MUST detach every listener it attached on disconnect', () => {
      const rxdb = createRxDB();
      const removeEventListener = vi.spyOn(rxdb, 'removeEventListener');

      connector.init(rxdb, getEntityMetadata);
      connector.disconnect();

      expect(removeEventListener.mock.calls.map(([type]) => type).sort()).toEqual([...RXDB_EVENT_TYPES].sort());
    });
  });

  describe('entity collection', () => {
    it('MUST resolve registered entities through the real metadata reader', () => {
      const rxdb = createRxDB();
      const entities: EntityType[] = [...rxdb.config.entities];

      connector.init(rxdb, getEntityMetadata);

      expect(entities.map(entity => getEntityMetadata(entity).name)).toContain('RxDBBranch');
    });
  });
});
