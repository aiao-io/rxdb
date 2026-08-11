/**
 * @fileoverview RRE-009：真实 `@aiao/rxdb` Entity / Repository 集成夹具 + 浏览器提交时序门禁
 *
 * 本包原有的 spec 用自写静态 class + `Subject` 冒充 Repository，`EntityManager` 与
 * `Repository` 被整体 mock 掉。99.42% statements 覆盖率下，这几件事在测试里**根本表达不出来**：
 *
 * - 真实 Entity 实例当游标（`FindByCursorOptions.after` 的公开类型就是 `InstanceType<T>`）；
 * - 真实 `findByCursor` 的默认 limit、活查询边界与跨页重锚；
 * - React 的 layout / passive 提交边界（旧订阅在 passive cleanup 之前还活着）；
 * - StrictMode 的双次挂载对真实订阅的影响。
 *
 * 这里用真实 `RxDB` + 真实 `@Entity` + 真实 wa-sqlite（纯内存 VFS）建立集成层，
 * 只跑在 `nx test-browser rxdb-react`（`VITEST_BROWSER=true`）里。
 *
 * **关于时序探针为什么还留着可控源**：真实 repository 的 emit 是异步 I/O，
 * 落不进「commit 之后、passive effect 之前」这一帧内的窗口 —— 而 RRE-004 要断言的正是那个窗口。
 * 因此时序探针用可同步发射的外部 store（finding 原文要求的「外部 store 同步发射」），
 * 但**它搬运的实体是真实 repository 查出来的真实实例**，不是自造的假对象。
 *
 * 实体定义**故意写在 spec 内**：`package.json` 的 `files` 会发布 `src`，
 * 只排除 `*.spec.*`，独立的夹具文件会被打进发布产物。
 */

import {
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  ENTITY_STATIC_TYPES,
  Entity,
  EntityBase,
  PropertyType,
  RxDB,
  SyncType,
  type EntityType,
  type UUID
} from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { StrictMode, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Observable, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useCount, useFind, useFindByCursor, useGet } from '../hooks.js';
import { RxDBProvider } from '../rxdb-react.js';
import { useInfiniteScroll } from '../useInfiniteScroll.js';

interface NoteLike {
  id: UUID;
  title: string;
  sort: number;
  done: boolean;
  dueAt: Date;
  save(): Promise<NoteLike>;
  remove(): Promise<NoteLike>;
}

// `EntityType` 的实例形参必须显式填成 `NoteLike`：缺省是 `object`，而 `InstanceType<>`
// 在交叉类型上取的是**最后一条**构造签名，写成 `(new … => NoteLike) & EntityType` 时
// hooks 推出来的元素类型会塌回 `object`，用例里所有字段访问都报 TS2339。
type NoteType = EntityType<object, NoteLike> & (new (init?: Partial<NoteLike>) => NoteLike);

/**
 * 每套夹具一个**全新的实体类**。
 *
 * 核心把 `EntityManager` 挂在实体原型上，同一个类注册进第二个 `RxDB` 之后再 `new`
 * 会直接抛 `Entity 'Note' is registered with multiple RxDB instances`。
 * 元数据里的 `namespace:name` 保持一致，跨夹具的 schema 才是同一张表。
 */
const defineNote = (): NoteType => {
  @Entity({
    namespace: 'rre_it',
    name: 'Note',
    tableName: 'rre_it_note',
    // 变更日志必须开着：活查询是靠 sqlite 变更表触发 ENTITY_LOCAL_* 事件驱动的，
    // `log: false` 会让所有「写入后自动推送」的断言静默失效（表现为查询永远停在初值）
    log: true,
    properties: [
      { name: 'title', type: PropertyType.string, required: true },
      { name: 'sort', type: PropertyType.integer, required: true },
      { name: 'done', type: PropertyType.boolean, default: false },
      { name: 'dueAt', type: PropertyType.date, nullable: true }
    ]
  })
  class Note extends EntityBase {
    title!: string;
    sort!: number;
    done!: boolean;
    dueAt!: Date;
  }
  return Note as unknown as NoteType;
};

/**
 * 每个用例一套全新的 dbName。
 *
 * 长度必须掐死：真正送进 `open_v2()` 的是 `${rxdb.config.dbName}.sqlite`，上限 **56 字符**
 * （SQLite 的 `nPathname + 8 > mxPathname` 检查，wa-sqlite 的 `mxPathname = 64`），
 * 而 `config.dbName` 会被核心追加 `@<schema 版本>` 后缀。见 SQLWA-FRESH-01。
 */
const nextDbName = (): string => `rre_${crypto.randomUUID().slice(0, 8)}`;

/**
 * 等到实体变更事件安静下来。
 *
 * SQLite 的变更是经 update-hook 批量回流的：`save()` resolve 时事件还没派发完。
 * 这段延迟落在「订阅之后」时，`findByCursor` 的增量合并会把种子数据并进首页，
 * 页容量随之膨胀（核心已在 `FindByCursorOptions.limit` 的注释里写明增量场景不保页容量）。
 * 因此**种数据和挂 hook 之间必须先静默**，否则分页断言测的是竞态而不是分页。
 */
const settle = (rxdb: RxDB): Promise<void> =>
  new Promise(resolve => {
    const events = [ENTITY_LOCAL_CREATE_EVENT, ENTITY_LOCAL_UPDATE_EVENT, ENTITY_LOCAL_REMOVE_EVENT] as const;
    let timer = 0;
    const finish = () => {
      for (const event of events) rxdb.removeEventListener(event, bump);
      resolve();
    };
    const bump = () => {
      clearTimeout(timer);
      timer = window.setTimeout(finish, 80);
    };
    for (const event of events) rxdb.addEventListener(event, bump);
    bump();
  });

interface Harness {
  Note: NoteType;
  adapter: RxDBAdapterWaSqlite;
  rxdb: RxDB;
  /** 种一批真实记录并落盘，返回按 `sort` 升序的实体。 */
  seed(titles: readonly string[]): Promise<NoteLike[]>;
}

/** 建一套真实 RxDB：wa-sqlite 走纯内存 VFS，实体经真实 Repository 落盘。 */
const createHarness = async (): Promise<Harness> => {
  const Note = defineNote();
  const rxdb = new RxDB({
    dbName: nextDbName(),
    context: { userId: 'rre-009' },
    entities: [Note],
    sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
  });

  rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'MemoryAsyncVFS' }));
  const adapter = (await rxdb.connect('wa-sqlite')) as RxDBAdapterWaSqlite;

  const seed = async (titles: readonly string[]): Promise<NoteLike[]> => {
    const created: NoteLike[] = [];
    for (const [index, title] of titles.entries()) {
      const note = new Note({
        title,
        sort: index,
        done: index % 2 === 1,
        dueAt: new Date(Date.UTC(2026, 7, 6, 0, 0, index))
      });
      created.push(await note.save());
    }
    await settle(rxdb);
    return created;
  };

  return { Note, adapter, rxdb, seed };
};

const ALL: { combinator: 'and'; rules: [] } = { combinator: 'and', rules: [] };
const BY_SORT = [
  { field: 'sort', sort: 'asc' as const },
  { field: 'id', sort: 'asc' as const }
];

/** `useInfiniteScroll` 读 context 里的 RxDB，必须套 Provider。 */
const providerFor =
  (rxdb: RxDB) =>
  ({ children }: { children?: ReactNode }) => <RxDBProvider db={rxdb}>{children}</RxDBProvider>;

const titlesOf = (notes: readonly { title: string }[]): string[] => notes.map(note => note.title);

describe('RRE-009 真实 Entity / Repository 集成', () => {
  const opened: Harness[] = [];

  const open = async (): Promise<Harness> => {
    const harness = await createHarness();
    opened.push(harness);
    return harness;
  };

  afterEach(async () => {
    cleanup();
    for (const harness of opened.splice(0)) {
      await harness.rxdb.disconnectAll();
      harness.rxdb.entityManager.cleanAllCache();
      harness.adapter.cleanAllCache();
    }
  });

  // ------------------------------------------------ 夹具本身的门禁：真实契约

  describe('真实 Repository 的资源语义', () => {
    it('useFind 拿到的是真实实体实例，Date 字段往返 SQLite 后仍是 Date', async () => {
      const { Note, rxdb, seed } = await open();
      const seeded = await seed(['甲', '乙', '丙']);

      const { result } = renderHook(() => useFind(Note, { where: ALL, orderBy: BY_SORT }), {
        wrapper: providerFor(rxdb)
      });

      expect(result.current.isLoading).toBe(true);
      expect(result.current.hasValue).toBe(false);

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(titlesOf(result.current.value)).toEqual(['甲', '乙', '丙']);
      expect(result.current.isEmpty).toBe(false);
      expect(result.current.error).toBeUndefined();
      // 假夹具里 value 是自造对象；真实路径必须还原成 Entity 实例，否则 `.save()` 之类的
      // 实例方法在消费端不可用
      expect(result.current.value[0]).toBeInstanceOf(Note);
      expect(result.current.value[0].dueAt).toBeInstanceOf(Date);
      expect(result.current.value[0].dueAt.toISOString()).toBe(seeded[0].dueAt.toISOString());
    });

    it('查询是活的：hook 挂载之后新写入的记录会自己推过来，无需 rerender', async () => {
      const { Note, rxdb, seed } = await open();
      await seed(['甲', '乙']);

      const { result } = renderHook(() => useFind(Note, { where: ALL, orderBy: BY_SORT }), {
        wrapper: providerFor(rxdb)
      });
      await waitFor(() => expect(result.current.value).toHaveLength(2));

      await act(async () => {
        await new Note({ title: '丁', sort: 9, done: false, dueAt: new Date() }).save();
      });

      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['甲', '乙', '丁']));
      expect(result.current.isLoading).toBe(false);
    });

    it('useCount 走真实计数，并随写入更新', async () => {
      const { Note, rxdb, seed } = await open();
      await seed(['甲', '乙']);

      const { result } = renderHook(() => useCount(Note, { where: ALL }), { wrapper: providerFor(rxdb) });
      await waitFor(() => expect(result.current.value).toBe(2));

      await act(async () => {
        await new Note({ title: '丙', sort: 5, done: false, dueAt: new Date() }).save();
      });
      await waitFor(() => expect(result.current.value).toBe(3));
    });

    it('useGet 用真实主键取回实体；主键不存在时进入错误态而不是空值态', async () => {
      const { Note, rxdb, seed } = await open();
      const [first] = await seed(['甲', '乙']);

      const { result, rerender } = renderHook(({ id }: { id: UUID }) => useGet(Note, id), {
        initialProps: { id: first.id },
        wrapper: providerFor(rxdb)
      });
      await waitFor(() => expect(result.current.value?.title).toBe('甲'));

      rerender({ id: crypto.randomUUID() as UUID });
      await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
      // 只有 EntityType / method 变化才算 identityChanged；仅 options 变化时旧值被刻意保留
      // （stale-while-revalidate）。消费端要靠 hasValue 而不是 value 判定有没有数据。
      expect(result.current.hasValue).toBe(false);
      expect(result.current.value?.title).toBe('甲');
    });

    it('where 变化时 render 期同步复位：不会先闪一帧「新条件 + 旧数据 + 已加载完成」', async () => {
      const { Note, rxdb, seed } = await open();
      await seed(['甲', '乙', '丙', '丁']);

      const { result, rerender } = renderHook(
        ({ done }: { done: boolean }) =>
          useFind(Note, { where: { combinator: 'and', rules: [{ field: 'done', operator: '=', value: done }] } }),
        { initialProps: { done: false }, wrapper: providerFor(rxdb) }
      );
      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['甲', '丙']));

      rerender({ done: true });
      // 提交后的第一帧：仍是旧数据，但必须已被标成 loading —— 否则 UI 会宣称
      // 「done=true 下共 2 条」而那 2 条是 done=false 的
      expect(result.current.isLoading).toBe(true);
      expect(result.current.hasValue).toBe(false);

      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['乙', '丁']));
    });
  });

  // ------------------------------------------------ RRE-002：真实 cursor entity

  // RRE-002 已修：游标在算 key 之前按 `orderBy` 字段投影成确定快照
  // （`@aiao/utils` 的 `createQueryOptionsKey`），不再整包丢给只认 plain object 的
  // `createStableKey`。以下用例锁的是修复后的正向契约。
  describe('RRE-002 真实 Entity 当游标', () => {
    it('useFindByCursor 传真实实体做 after，直接查出游标之后的数据', async () => {
      const { Note, rxdb, seed } = await open();
      const [first] = await seed(['甲', '乙', '丙']);

      const { result } = renderHook(
        () => useFindByCursor(Note, { where: ALL, orderBy: BY_SORT, after: first, limit: 2 }),
        { wrapper: providerFor(rxdb) }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(titlesOf(result.current.value)).toEqual(['乙', '丙']);
    });

    it('useInfiniteScroll 带初始 after 时从该条继续往下滚', async () => {
      const { Note, rxdb, seed } = await open();
      const [first] = await seed(['甲', '乙', '丙']);

      const { result } = renderHook(
        () => useInfiniteScroll(Note, { where: ALL, orderBy: BY_SORT, after: first, limit: 2 }),
        { wrapper: providerFor(rxdb) }
      );

      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['乙', '丙']));
    });

    it('实体与其 plain 快照算出同一个 key：两种写法拿到同一份结果', async () => {
      const { Note, rxdb, seed } = await open();
      const [first] = await seed(['甲', '乙', '丙', '丁']);

      // 真实游标的**内容**（string / number / boolean / Date）全都可序列化 ——
      // 早先卡住的只是 `Object.getPrototypeOf(value) !== Object.prototype`。
      // 因此修法不是放开宿主对象兜底（那正是 createStableKey 注释里写明要防的
      // WeakMap/DOM 节点静默等价），而是让 key 理解游标语义。
      const cursor = { ...first } as unknown as NoteLike;

      const { result } = renderHook(
        () => useFindByCursor(Note, { where: ALL, orderBy: BY_SORT, after: cursor, limit: 2 }),
        { wrapper: providerFor(rxdb) }
      );

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(titlesOf(result.current.value)).toEqual(['乙', '丙']);
    });

    it('同 identity 的新实例不触发重订阅，换一条游标才重查', async () => {
      const { Note, rxdb, seed } = await open();
      const [first, second] = await seed(['甲', '乙', '丙', '丁']);
      // 同一条记录的另一个实例：`orderBy` 字段取值一致 ⇒ 同一个游标身份
      const sameCursor = new Note({ ...first });

      const { result, rerender } = renderHook(
        ({ cursor }: { cursor: NoteLike }) =>
          useFindByCursor(Note, { where: ALL, orderBy: BY_SORT, after: cursor, limit: 2 }),
        { wrapper: providerFor(rxdb), initialProps: { cursor: first } }
      );
      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['乙', '丙']));

      rerender({ cursor: sameCursor });
      expect(result.current.isLoading).toBe(false);
      expect(titlesOf(result.current.value)).toEqual(['乙', '丙']);

      rerender({ cursor: second });
      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['丙', '丁']));
    });
  });

  // ------------------------------------------------ 真实 findByCursor / useInfiniteScroll

  describe('useInfiniteScroll 在真实游标查询上的行为', () => {
    it('翻页拼接的是真实实体，顺序按 orderBy 而不是加载顺序', async () => {
      const { Note, rxdb, seed } = await open();
      await seed(['甲', '乙', '丙', '丁', '戊']);

      const { result } = renderHook(() => useInfiniteScroll(Note, { where: ALL, orderBy: BY_SORT, limit: 2 }), {
        wrapper: providerFor(rxdb)
      });
      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['甲', '乙']));
      expect(result.current.hasMore).toBe(true);

      act(() => result.current.loadMore());
      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['甲', '乙', '丙', '丁']));

      act(() => result.current.loadMore());
      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['甲', '乙', '丙', '丁', '戊']));
      // 末页没装满 → 真实结算出没有下一页
      await waitFor(() => expect(result.current.hasMore).toBe(false));
    });

    it('不传 limit 时用真实默认页容量结算 hasMore，而不是永远宣称还有下一页', async () => {
      const { Note, rxdb, seed } = await open();
      await seed(['甲', '乙', '丙']);

      const { result } = renderHook(() => useInfiniteScroll(Note, { where: ALL, orderBy: BY_SORT }), {
        wrapper: providerFor(rxdb)
      });

      await waitFor(() => expect(result.current.value).toHaveLength(3));
      await waitFor(() => expect(result.current.hasMore).toBe(false));
      expect(result.current.isEmpty).toBe(false);
    });

    /** 载入两页真实数据：`[甲,乙]` 与 after-乙 的 `[丙,丁]`。 */
    const renderTwoPages = async (harness: Harness) => {
      const { Note, rxdb } = harness;
      const { result } = renderHook(() => useInfiniteScroll(Note, { where: ALL, orderBy: BY_SORT, limit: 2 }), {
        wrapper: providerFor(rxdb)
      });
      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['甲', '乙']));
      act(() => result.current.loadMore());
      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['甲', '乙', '丙', '丁']));
      return result;
    };

    it('RRE-005 回归：边界条目被改到末尾时第二页重锚，不重复也不丢', async () => {
      const harness = await open();
      const [, second] = await harness.seed(['甲', '乙', '丙', '丁']);
      const result = await renderTwoPages(harness);

      // 把边界条目「乙」排到最后：首页的活查询补进「丙」，尾条目从「乙」移到「丙」。
      // 第二页仍锚在「乙」上就会把「丙」再发一遍、并且漏掉排到末尾的「乙」
      //（不重锚时的真实结果是 ['甲','丙','丙','丁']）。
      await act(async () => {
        second.sort = 99;
        await second.save();
        await settle(harness.rxdb);
      });

      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['甲', '丙', '丁', '乙']));
    });

    it('头插的新记录并进首页，跨页拼接既不丢也不重', async () => {
      const harness = await open();
      await harness.seed(['甲', '乙', '丙', '丁']);
      const result = await renderTwoPages(harness);

      // 头插不移动尾边界（首页从 ['甲','乙'] 变成 ['头','甲','乙']），因此这条**不**覆盖重锚：
      // 首页容量涨到 3 是核心写明的行为 —— 增量合并不保 limit，见 FindByCursorOptions.limit。
      await act(async () => {
        await new harness.Note({ title: '头', sort: -1, done: false, dueAt: new Date() }).save();
        await settle(harness.rxdb);
      });

      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['头', '甲', '乙', '丙', '丁']));
    });
  });

  // ------------------------------------------------ 浏览器提交时序

  describe('React 提交时序', () => {
    /**
     * 时序探针：可同步发射的外部 store，搬运的是真实 repository 查出来的真实实体。
     *
     * 真实 repository 的 emit 是异步 I/O，落不进「commit 之后、passive effect 之前」
     * 这一帧内的窗口，而 RRE-004 要断言的正是那个窗口。
     */
    interface ProbeOptions {
      seq: number;
    }

    const streams = new Map<number, Subject<NoteLike[]>>();
    let subscribeCount = 0;
    let unsubscribeCount = 0;

    class Probe {
      static [ENTITY_STATIC_TYPES]: {
        idType: string;
        getOptions: ProbeOptions;
        findOneOptions: ProbeOptions;
        findOneOrFailOptions: ProbeOptions;
        findOptions: ProbeOptions;
        findByCursorOptions: ProbeOptions;
        findAllOptions: ProbeOptions;
        countOptions: ProbeOptions;
        findTreeOptions: ProbeOptions;
        findNeighborsOptions: ProbeOptions;
        findPathsOptions: ProbeOptions;
      } = {
        idType: '',
        getOptions: { seq: 0 },
        findOneOptions: { seq: 0 },
        findOneOrFailOptions: { seq: 0 },
        findOptions: { seq: 0 },
        findByCursorOptions: { seq: 0 },
        findAllOptions: { seq: 0 },
        countOptions: { seq: 0 },
        findTreeOptions: { seq: 0 },
        findNeighborsOptions: { seq: 0 },
        findPathsOptions: { seq: 0 }
      };

      static find(options: ProbeOptions): Observable<NoteLike[]> {
        const subject = new Subject<NoteLike[]>();
        streams.set(options.seq, subject);
        return new Observable<NoteLike[]>(subscriber => {
          subscribeCount += 1;
          const inner = subject.subscribe(subscriber);
          return () => {
            unsubscribeCount += 1;
            inner.unsubscribe();
          };
        });
      }
    }

    const ProbeEntity = Probe as unknown as EntityType;

    // 必须在 beforeEach 复位：外层 afterEach 的 RTL `cleanup()` 会卸载上一条用例遗留的组件，
    // 那次退订记在**清零之后**，放在 afterEach 清零会让下一条用例多算一次 unsubscribe。
    beforeEach(() => {
      streams.clear();
      subscribeCount = 0;
      unsubscribeCount = 0;
    });

    /** 在消费者的 layout effect 里让**上一个** seq 的流发射 —— 即 passive cleanup 之前。 */
    const useProbeWithLayoutEmit = (seq: number, payload: NoteLike[]) => {
      const resource = useFind(ProbeEntity as never, { seq } as never);
      const previousRef = useRef(seq);
      useLayoutEffect(() => {
        const previous = previousRef.current;
        previousRef.current = seq;
        if (previous !== seq) streams.get(previous)?.next(payload);
      }, [seq, payload]);
      return resource;
    };

    it('旧订阅在 passive cleanup 之前不能把新查询写成「已加载完成」', async () => {
      const { Note, rxdb, seed } = await open();
      const stale = await seed(['旧甲', '旧乙']);
      void Note;
      void rxdb;

      const { result, rerender } = renderHook(({ seq }: { seq: number }) => useProbeWithLayoutEmit(seq, stale), {
        initialProps: { seq: 1 }
      });
      expect(result.current.isLoading).toBe(true);

      rerender({ seq: 2 });

      expect(result.current.value).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.hasValue).toBe(false);

      // seq=2 的流尚未发射；当前状态只能保持 loading，不能借用旧流宣称成功。
      expect(streams.get(2)).toBeDefined();
    });

    it('护栏：passive cleanup 之后旧流再发射会被丢弃', async () => {
      const stale = await (await open()).seed(['旧甲']);

      const { result, rerender } = renderHook(
        ({ seq }: { seq: number }) => useFind(ProbeEntity as never, { seq } as never),
        {
          initialProps: { seq: 1 }
        }
      );
      rerender({ seq: 2 });

      act(() => streams.get(1)?.next(stale as never));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.hasValue).toBe(false);
    });

    it('StrictMode 双次挂载不留悬挂订阅，最终值仍来自真实数据', async () => {
      const fresh = await (await open()).seed(['甲', '乙']);

      // 这里不能用 `renderHook`：它内部只跑同步 `act`，StrictMode 的
      // mount → cleanup → mount 要到异步 act 冲干净才结算，同步路径下只看得到一次挂载
      // （现象：render 跑两次而 effect 只跑一次），断言会假绿。
      let latest: ReturnType<typeof useFind> | undefined;
      const Consumer = () => {
        latest = useFind(ProbeEntity as never, { seq: 7 } as never) as never;
        return null;
      };
      const container = document.createElement('div');
      document.body.appendChild(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(
          <StrictMode>
            <Consumer />
          </StrictMode>
        );
      });

      // 第一次挂载的订阅必须已经退掉，只留下第二次的
      expect(subscribeCount).toBe(2);
      expect(unsubscribeCount).toBe(1);

      act(() => streams.get(7)?.next(fresh as never));
      expect(titlesOf(latest!.value as never)).toEqual(['甲', '乙']);
      expect(latest!.isLoading).toBe(false);

      // 卸载后不留悬挂订阅
      await act(async () => root.unmount());
      expect(unsubscribeCount).toBe(subscribeCount);
      container.remove();
    });
  });

  // ------------------------------------------------ RRE-003：非稳定 options factory

  describe('RRE-003 options factory 的幂等性', () => {
    it('稳定 factory 正常工作（对照组）', async () => {
      const { Note, rxdb, seed } = await open();
      await seed(['甲', '乙']);

      const { result, rerender } = renderHook(() => useFind(Note, () => ({ where: ALL, orderBy: BY_SORT })), {
        wrapper: providerFor(rxdb)
      });

      await waitFor(() => expect(titlesOf(result.current.value)).toEqual(['甲', '乙']));
      for (let index = 0; index < 10; index += 1) rerender();
      expect(titlesOf(result.current.value)).toEqual(['甲', '乙']);
    });

    it('factory 每次返回新值时拒绝订阅并给出可操作诊断', async () => {
      const { Note, rxdb, seed } = await open();
      await seed(['甲', '乙']);

      let seq = 0;
      const { rerender } = renderHook(
        ({ unstable }: { unstable: boolean }) =>
          useFind(Note, () => ({ where: ALL, orderBy: BY_SORT, offset: unstable ? seq++ : 0 })),
        { initialProps: { unstable: false }, wrapper: providerFor(rxdb) }
      );

      expect(() => rerender({ unstable: true })).toThrow(
        new TypeError('RxDB query options factory must return a stable value during one render')
      );
    });
  });
});
