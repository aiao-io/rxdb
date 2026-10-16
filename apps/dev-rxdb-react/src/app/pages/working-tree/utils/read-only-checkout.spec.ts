import { cloneEntityClasses, Entity, EntityBase, PropertyType, RxDBBranch, type EntityType } from '@aiao/rxdb';
import type { WorktreeTarget, WorktreeView } from '@aiao/rxdb-plugin-working-tree';
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  READ_ONLY_REJECTION_TEXT,
  readOnlyCatalog,
  readOnlyTargetLabel,
  ReadOnlyViewerSession,
  type ReadOnlyViewerState
} from './read-only-checkout';

/**
 * @fileoverview 只读检出位查看器的目录、标签、拒绝文案与会话（US-313，Angular / Vue 端同名 spec 的移植）。
 */

@Entity({ name: 'ReadOnlyTodo', displayName: '待办', properties: [{ name: 'title', type: PropertyType.string }] })
class ReadOnlyTodo extends EntityBase {
  title!: string;
}

@Entity({
  name: 'ReadOnlyFile',
  namespace: 'storage',
  log: false,
  properties: [{ name: 'path', type: PropertyType.string }]
})
class ReadOnlyFile extends EntityBase {
  path!: string;
}

const main: readonly EntityType[] = [ReadOnlyTodo, ReadOnlyFile, RxDBBranch];
// 快照实例的实体全是 `log: false` 的克隆；核心系统实体两个实例共用同一个类
const snapshot: readonly EntityType[] = [
  ...cloneEntityClasses([ReadOnlyTodo, ReadOnlyFile], { log: false }),
  RxDBBranch
];

describe('readOnlyCatalog', () => {
  it('只列复制进快照的实体：与主实例共用的类（核心系统实体）不列', () => {
    expect(readOnlyCatalog(snapshot, main).map(entry => entry.key)).toEqual([
      'public:ReadOnlyTodo',
      'storage:ReadOnlyFile'
    ]);
  });

  it('按主实例上同名实体的 log 标「不随版本」：快照里的克隆一律不记日志，不能拿它判', () => {
    const [todo, file] = readOnlyCatalog(snapshot, main);
    expect(todo).toMatchObject({ namespace: 'public', name: 'ReadOnlyTodo', displayName: '待办', unversioned: false });
    expect(file).toMatchObject({
      namespace: 'storage',
      name: 'ReadOnlyFile',
      displayName: 'ReadOnlyFile',
      unversioned: true
    });
  });
});

describe('readOnlyTargetLabel', () => {
  it('分支视图写分支名，提交视图写提交号的前 7 位', () => {
    expect(readOnlyTargetLabel({ branchId: 'feature/x' })).toBe('branch feature/x');
    expect(readOnlyTargetLabel({ commitId: '0123456789abcdef' })).toBe('commit 0123456');
  });
});

describe('READ_ONLY_REJECTION_TEXT', () => {
  it('打不开的成因换成用户看得懂的提示；与 restore 同口径的两条用同一句话', () => {
    expect(READ_ONLY_REJECTION_TEXT.unreachable_target).toBe('This commit is not reachable from the current branch.');
    expect(READ_ONLY_REJECTION_TEXT.incompatible_schema).toBe(
      'This commit contains entities the current client cannot read.'
    );
    expect(READ_ONLY_REJECTION_TEXT.restoring_working_tree).toBe(
      'A restore is in progress. Finish or discard it before opening a commit.'
    );
  });
});

/** 只读检出位视图的替身：会话只碰 `refresh()` 与 `close()`。 */
interface FakeView extends WorktreeView {
  readonly refresh: Mock<() => Promise<WorktreeView>>;
  readonly close: Mock<() => Promise<void>>;
}

const fakeView = (branchId: string): FakeView =>
  // rxdb / entityOf / release 会话用不到，替身不造
  ({
    id: `checkout-${branchId}`,
    target: { branchId },
    owner: 'session',
    refresh: vi.fn<() => Promise<WorktreeView>>(),
    close: vi.fn(() => Promise.resolve())
  }) as unknown as FakeView;

/** 搭一个会话：每次 `open()` 都挂起，用例决定它何时、以什么落地；交给页面的状态记在 `page` 里。 */
const startSession = () => {
  const opens: PromiseWithResolvers<WorktreeView>[] = [];
  const page: { viewer: ReadOnlyViewerState | null; refreshing: boolean } = { viewer: null, refreshing: false };
  const hooks = {
    open: vi.fn<(target: WorktreeTarget) => Promise<WorktreeView>>(() => {
      const pending = Promise.withResolvers<WorktreeView>();
      opens.push(pending);
      return pending.promise;
    }),
    onViewerChange: vi.fn((viewer: ReadOnlyViewerState | null) => {
      page.viewer = viewer;
    }),
    onRefreshingChange: vi.fn((refreshing: boolean) => {
      page.refreshing = refreshing;
    }),
    onError: vi.fn<(error: unknown) => void>()
  };
  return { session: new ReadOnlyViewerSession(hooks), opens, page, hooks };
};

/** 打开 `branchId` 并让它落地：查看器开着这个视图。 */
const showView = async (harness: ReturnType<typeof startSession>, branchId: string): Promise<FakeView> => {
  const view = fakeView(branchId);
  const opening = harness.session.open({ branchId });
  harness.opens.at(-1)!.resolve(view);
  await opening;
  return view;
};

describe('ReadOnlyViewerSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('打开：落地的视图连同目标标签交给查看器', async () => {
    const harness = startSession();
    const view = await showView(harness, 'feature');

    expect(harness.hooks.open).toHaveBeenCalledWith({ branchId: 'feature' });
    expect(harness.page.viewer).toEqual({ view, label: 'branch feature' });
  });

  it('打开失败：报错，查看器照旧关着', async () => {
    const { session, opens, page, hooks } = startSession();
    const failure = new Error('branch_not_found');
    const opening = session.open({ branchId: 'gone' });
    opens[0].reject(failure);
    await opening;

    expect(hooks.onError).toHaveBeenCalledWith(failure);
    expect(page.viewer).toBeNull();
  });

  it('后一次打开取代前一次：前一次后落地，当场关掉，查看器停在后一次的目标', async () => {
    const { session, opens, page } = startSession();
    const [first, second] = [fakeView('a'), fakeView('b')];
    const openingFirst = session.open({ branchId: 'a' });
    const openingSecond = session.open({ branchId: 'b' });
    opens[1].resolve(second);
    await openingSecond;
    opens[0].resolve(first);
    await openingFirst;

    expect(page.viewer).toEqual({ view: second, label: 'branch b' });
    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).not.toHaveBeenCalled();
  });

  it('后一次打开取代前一次：前一次先落地也不显示，当场关掉', async () => {
    const { session, opens, page, hooks } = startSession();
    const [first, second] = [fakeView('a'), fakeView('b')];
    const openingFirst = session.open({ branchId: 'a' });
    const openingSecond = session.open({ branchId: 'b' });
    opens[0].resolve(first);
    await openingFirst;

    expect(first.close).toHaveBeenCalledOnce();
    expect(hooks.onViewerChange).not.toHaveBeenCalled();

    opens[1].resolve(second);
    await openingSecond;
    expect(page.viewer).toEqual({ view: second, label: 'branch b' });
  });

  it('被取代的那次打开失败不报错：要看的已经是后一个目标', async () => {
    const { session, opens, page, hooks } = startSession();
    const second = fakeView('b');
    const openingFirst = session.open({ branchId: 'a' });
    const openingSecond = session.open({ branchId: 'b' });
    opens[0].reject(new Error('branch_not_found'));
    opens[1].resolve(second);
    await Promise.all([openingFirst, openingSecond]);

    expect(hooks.onError).not.toHaveBeenCalled();
    expect(page.viewer).toEqual({ view: second, label: 'branch b' });
  });

  it('查看器开着时打开另一个目标：换上新的，旧的当场关掉', async () => {
    const harness = startSession();
    const previous = await showView(harness, 'a');
    const next = await showView(harness, 'b');

    expect(harness.page.viewer).toEqual({ view: next, label: 'branch b' });
    expect(previous.close).toHaveBeenCalledOnce();
    expect(next.close).not.toHaveBeenCalled();
  });

  it('打开途中关掉查看器：落地的视图当场关掉，不落进状态', async () => {
    const { session, opens, page } = startSession();
    const view = fakeView('a');
    const opening = session.open({ branchId: 'a' });
    session.close();
    opens[0].resolve(view);
    await opening;

    expect(page.viewer).toBeNull();
    expect(view.close).toHaveBeenCalledOnce();
  });

  it('打开途中页面销毁：落地的视图当场关掉，不回调页面', async () => {
    const { session, opens, hooks } = startSession();
    const view = fakeView('a');
    const opening = session.open({ branchId: 'a' });
    session.dispose();
    opens[0].resolve(view);
    await opening;

    expect(view.close).toHaveBeenCalledOnce();
    expect(hooks.onViewerChange).not.toHaveBeenCalled();
  });

  it('刷新：查看器换绑到新视图，标签不变；旧视图由 refresh() 自己关', async () => {
    const harness = startSession();
    const current = await showView(harness, 'feature');
    const next = fakeView('feature');
    const refreshed = Promise.withResolvers<WorktreeView>();
    current.refresh.mockReturnValue(refreshed.promise);

    const refreshing = harness.session.refresh();
    expect(harness.page.refreshing).toBe(true);
    refreshed.resolve(next);
    await refreshing;

    expect(harness.page).toEqual({ viewer: { view: next, label: 'branch feature' }, refreshing: false });
    expect(current.close).not.toHaveBeenCalled();
  });

  it('刷新途中关掉查看器：新视图当场关掉，查看器不弹回来', async () => {
    const harness = startSession();
    const current = await showView(harness, 'feature');
    const next = fakeView('feature');
    const refreshed = Promise.withResolvers<WorktreeView>();
    current.refresh.mockReturnValue(refreshed.promise);

    const refreshing = harness.session.refresh();
    harness.session.close();
    expect(harness.page).toEqual({ viewer: null, refreshing: false });
    refreshed.resolve(next);
    await refreshing;

    expect(harness.page).toEqual({ viewer: null, refreshing: false });
    expect(current.close).toHaveBeenCalledOnce();
    expect(next.close).toHaveBeenCalledOnce();
  });

  it('刷新失败：保留旧视图并报错', async () => {
    const harness = startSession();
    const current = await showView(harness, 'feature');
    const failure = new Error('database_busy');
    current.refresh.mockRejectedValue(failure);

    await harness.session.refresh();

    expect(harness.page).toEqual({ viewer: { view: current, label: 'branch feature' }, refreshing: false });
    expect(harness.hooks.onError).toHaveBeenCalledWith(failure);
    expect(current.close).not.toHaveBeenCalled();
  });

  it('刷新进行中再要刷新：不叠第二个检出位', async () => {
    const harness = startSession();
    const current = await showView(harness, 'feature');
    const refreshed = Promise.withResolvers<WorktreeView>();
    current.refresh.mockReturnValue(refreshed.promise);

    const refreshing = harness.session.refresh();
    await harness.session.refresh();
    refreshed.resolve(fakeView('feature'));
    await refreshing;

    expect(current.refresh).toHaveBeenCalledOnce();
  });

  it('关掉查看器：视图关掉；关闭失败报错', async () => {
    const harness = startSession();
    const current = await showView(harness, 'feature');
    const failure = new Error('database_busy');
    current.close.mockRejectedValue(failure);

    harness.session.close();

    expect(harness.page.viewer).toBeNull();
    expect(current.close).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(harness.hooks.onError).toHaveBeenCalledWith(failure));
  });

  it('页面销毁：关掉开着的视图，不回调页面；关闭失败只打到控制台', async () => {
    const harness = startSession();
    const current = await showView(harness, 'feature');
    const failure = new Error('database_busy');
    current.close.mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    harness.hooks.onViewerChange.mockClear();

    harness.session.dispose();

    expect(current.close).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledWith('[working-tree] 关闭只读检出位失败', failure));
    expect(harness.hooks.onViewerChange).not.toHaveBeenCalled();
    expect(harness.hooks.onError).not.toHaveBeenCalled();
  });
});
