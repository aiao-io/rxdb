import { type RxDB } from '@aiao/rxdb';
import { type WorkspaceCacheEntry } from '@aiao/rxdb-plugin-workspace';
import { useCount, useFind, useRxDB } from '@aiao/rxdb-react';
import { Todo, type TodoStaticTypes } from '@aiao/rxdb-test/entities';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { firstValueFrom } from 'rxjs';

/**
 * Todo 主表每页条数。此前页面订阅的是 `findAll`（整表、不带 limit），
 * 记录一多就是「一次性拉全表 + 渲染全部 <tr>」，主线程直接卡住。
 */
const TODO_PAGE_SIZE = 20;

/**
 * 清空主表时每轮取多少条来删。刻意与页大小解耦：
 * 「页面显示多少」和「一次删多少」是两回事，删除不该被前者限制。
 */
const TODO_DELETE_BATCH_SIZE = 200;

type NoticeTone = 'info' | 'success' | 'warning' | 'error';

type Notice = {
  tone: NoticeTone;
  text: string;
};

// P1-5：插件自己已经 `declare module '@aiao/rxdb' { interface RxDB { workspace: RxDBPluginWorkspace } }`，
// `useRxDB()` 上的 `.workspace` 本来就是有类型的。原先这里手写了一份 `WorkspaceApi` 结构类型
// 再 `as WorkspaceRxDB` 断言上去 —— 断言会盖掉真类型，插件改签名时这份副本不会报错，
// 只会在运行时对不上。类型直接从插件取。
type WorkspaceEntry = WorkspaceCacheEntry;

function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('zh-CN');
}

function alertClass(tone: NoticeTone): string {
  switch (tone) {
    case 'success':
      return 'alert alert-success alert-soft';
    case 'warning':
      return 'alert alert-warning alert-soft';
    case 'error':
      return 'alert alert-error alert-soft';
    default:
      return 'alert alert-info alert-soft';
  }
}

function titleOf(entry: WorkspaceEntry): string {
  const title = entry.data['title'];
  return typeof title === 'string' && title.trim().length > 0 ? title : 'Untitled Todo';
}

function completedText(entry: WorkspaceEntry): string {
  return entry.data['completed'] === true ? 'completed' : 'open';
}

function createdAtOf(entry: WorkspaceEntry): Date | string | null {
  const createdAt = entry.data['createdAt'];
  return createdAt instanceof Date || typeof createdAt === 'string' ? createdAt : null;
}

function listTodoWorkspaceEntries(workspace: RxDB['workspace']): WorkspaceEntry[] {
  return workspace
    .list()
    .filter(entry => entry.entity === 'Todo')
    .sort((left, right) => right.cacheId.localeCompare(left.cacheId));
}

export default function WorkspacePage() {
  const rxdb = useRxDB();

  /** 用户点出来的页码。记录被删后可能越界，对外一律读 todoPage。 */
  const [requestedTodoPage, setRequestedTodoPage] = useState(0);

  /** 主表总数走 count，不再靠「把整表拉下来数数组长度」。 */
  const savedTodoTotal = useCount(Todo, { where: { combinator: 'and', rules: [] } }).value;
  const todoPageCount = Math.max(1, Math.ceil(savedTodoTotal / TODO_PAGE_SIZE));
  // 越界自愈：清空主表、或删到剩下的页数比当前页少时，总数一变页码自己回落，
  // 不需要再挂一个 effect 去纠正 requestedTodoPage。
  const todoPage = Math.min(requestedTodoPage, todoPageCount - 1);

  const savedTodosResource = useFind(Todo, {
    where: { combinator: 'and', rules: [] },
    orderBy: [
      { field: 'updatedAt', sort: 'desc' },
      { field: 'id', sort: 'desc' }
    ],
    limit: TODO_PAGE_SIZE,
    offset: todoPage * TODO_PAGE_SIZE
  } satisfies TodoStaticTypes['findOptions']);

  // P2-4：见 todo.tsx 中的同名说明。
  const savedTodos = savedTodosResource.value;
  const initialWorkspaceEntries = useMemo(() => listTodoWorkspaceEntries(rxdb.workspace), [rxdb]);
  const [workspaceEntries, setWorkspaceEntries] = useState<WorkspaceEntry[]>(initialWorkspaceEntries);
  const [recoveredIds, setRecoveredIds] = useState<Set<string>>(new Set());
  const [activeDraftId, setActiveDraftId] = useState<string | null>(initialWorkspaceEntries[0]?.id ?? null);
  const [draftTitle, setDraftTitle] = useState('整理需求清单');
  const [draftCompleted, setDraftCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const activeDraftIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeDraftIdRef.current = activeDraftId;
  }, [activeDraftId]);

  const readWorkspaceEntries = useCallback(() => {
    return listTodoWorkspaceEntries(rxdb.workspace);
  }, [rxdb]);

  const refreshWorkspace = useCallback(
    (preferredId: string | null = activeDraftIdRef.current) => {
      const entries = readWorkspaceEntries();
      setWorkspaceEntries(entries);

      const nextId =
        preferredId && entries.some(entry => entry.id === preferredId) ? preferredId : (entries[0]?.id ?? null);
      setActiveDraftId(nextId);
    },
    [readWorkspaceEntries]
  );

  const syncWorkspace = useCallback(
    async (preferredId: string | null = activeDraftIdRef.current) => {
      await Promise.resolve();
      await rxdb.workspace.flush();
      refreshWorkspace(preferredId);
    },
    [refreshWorkspace, rxdb]
  );

  const restoreWorkspaceEntries = useCallback(async () => {
    try {
      await rxdb.workspace.ready;
      const restoredEntries = readWorkspaceEntries();
      setRecoveredIds(new Set(restoredEntries.map(entry => entry.id)));
      refreshWorkspace(activeDraftIdRef.current ?? restoredEntries[0]?.id ?? null);
    } catch (error) {
      setNotice({
        text: error instanceof Error ? `读取 workspace 草稿失败: ${error.message}` : '读取 workspace 草稿失败',
        tone: 'error'
      });
    }
  }, [readWorkspaceEntries, refreshWorkspace, rxdb]);

  useEffect(() => {
    const subscription = rxdb.workspace.changes$.subscribe(() => {
      refreshWorkspace(activeDraftIdRef.current);
    });

    queueMicrotask(() => {
      void restoreWorkspaceEntries();
    });

    return () => subscription.unsubscribe();
  }, [refreshWorkspace, restoreWorkspaceEntries, rxdb]);

  const resolveDraft = useCallback(
    (entry: WorkspaceEntry): Todo | null => {
      return (
        rxdb.entityManager.getEntityRef(Todo, entry.id as Todo['id']) ??
        rxdb.entityManager.createEntityRef(Todo, entry.data as Partial<Todo> & { id: Todo['id'] }, {
          local: false,
          remote: false,
          modified: true
        })
      );
    },
    [rxdb]
  );

  const activeDraftEntry = useMemo(() => {
    if (!activeDraftId) return null;
    return workspaceEntries.find(entry => entry.id === activeDraftId) ?? null;
  }, [activeDraftId, workspaceEntries]);

  const canCreateDraft = draftTitle.trim().length > 0;

  const createDraft = useCallback(async () => {
    const title = draftTitle.trim();
    if (!title) return;

    setBusy(true);
    try {
      const todo = new Todo({ title, completed: draftCompleted });
      setActiveDraftId(todo.id);
      setDraftTitle('');
      setDraftCompleted(false);
      await syncWorkspace(todo.id);
      setNotice({ text: `已创建未保存草稿：${todo.title}`, tone: 'success' });
    } catch (error) {
      setNotice({ text: error instanceof Error ? `创建草稿失败: ${error.message}` : '创建草稿失败', tone: 'error' });
    } finally {
      setBusy(false);
    }
  }, [draftCompleted, draftTitle, syncWorkspace]);

  const saveDraft = useCallback(
    async (entry: WorkspaceEntry) => {
      const todo = resolveDraft(entry);
      if (!todo) {
        setNotice({ text: '未找到可恢复的 Todo 草稿', tone: 'error' });
        return;
      }

      setBusy(true);
      try {
        await todo.save();
        await syncWorkspace(activeDraftIdRef.current);
        setNotice({ text: `已保存 Todo：${todo.title}`, tone: 'success' });
      } catch (error) {
        setNotice({ text: error instanceof Error ? `保存草稿失败: ${error.message}` : '保存草稿失败', tone: 'error' });
      } finally {
        setBusy(false);
      }
    },
    [resolveDraft, syncWorkspace]
  );

  const discardDraft = useCallback(
    async (entry: WorkspaceEntry) => {
      setBusy(true);
      try {
        const discarded = rxdb.workspace.discard(entry.cacheId);
        await syncWorkspace(activeDraftIdRef.current === entry.id ? null : activeDraftIdRef.current);
        setNotice({
          text: discarded ? `已丢弃草稿：${titleOf(entry)}` : '草稿已经不存在',
          tone: discarded ? 'warning' : 'info'
        });
      } finally {
        setBusy(false);
      }
    },
    [rxdb, syncWorkspace]
  );

  /**
   * 分批取、分批删。页面只订阅一页之后 `savedTodos` 不再是全表，
   * 拿它去 `removeMany` 只会删掉当前这一页 —— 「清空」必须自己去翻整表。
   */
  const deleteAllTodos = useCallback(async () => {
    let lastBatchHeadId: Todo['id'] | null = null;
    for (;;) {
      const batch = await firstValueFrom(
        Todo.find({ where: { combinator: 'and', rules: [] }, limit: TODO_DELETE_BATCH_SIZE })
      );
      if (batch.length === 0) return;
      // 游标没推进说明这一批根本没删掉，继续循环就是死循环，宁可把失败抛给调用方。
      if (batch[0].id === lastBatchHeadId) throw new Error('批量删除没有推进：仍有 Todo 未被删除');
      lastBatchHeadId = batch[0].id;
      await rxdb.entityManager.removeMany(batch);
    }
  }, [rxdb]);

  const clearSavedTodos = useCallback(async () => {
    if (savedTodoTotal === 0) return;

    setBusy(true);
    try {
      await deleteAllTodos();
      setRequestedTodoPage(0);
      setNotice({ text: '已清空 Todo 主表', tone: 'warning' });
    } catch (error) {
      setNotice({
        text: error instanceof Error ? `清空 Todo 主表失败: ${error.message}` : '清空 Todo 主表失败',
        tone: 'error'
      });
    } finally {
      setBusy(false);
    }
  }, [deleteAllTodos, savedTodoTotal]);

  const resetDemo = useCallback(async () => {
    setBusy(true);
    try {
      for (const entry of readWorkspaceEntries()) {
        rxdb.workspace.discard(entry.cacheId);
      }
      await syncWorkspace(null);

      await deleteAllTodos();
      setRequestedTodoPage(0);

      setRecoveredIds(new Set());
      setNotice({ text: '已重置 workspace 草稿和 Todo 主表', tone: 'warning' });
    } catch (error) {
      setNotice({
        text: error instanceof Error ? `重置演示数据失败: ${error.message}` : '重置演示数据失败',
        tone: 'error'
      });
    } finally {
      setBusy(false);
    }
  }, [deleteAllTodos, readWorkspaceEntries, rxdb, syncWorkspace]);

  return (
    <div className='page-host flex h-full flex-col overflow-hidden'>
      {/* 顶部 toolbar */}
      <div className='border-base-300 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <h1 className='text-lg font-semibold'>Workspace 草稿恢复</h1>
          <span className='badge badge-ghost badge-sm'>{workspaceEntries.length} 草稿</span>
          <span className='text-base-content/55 hidden text-xs lg:inline'>
            new Todo() 先入 workspace 缓存，刷新后从 IndexedDB 恢复
          </span>
        </div>
        <div className='flex items-center gap-2'>
          <button className='btn btn-ghost btn-sm' disabled={busy} onClick={() => refreshWorkspace()} type='button'>
            刷新
          </button>
          <button
            className='btn btn-ghost btn-sm'
            disabled={busy}
            onClick={() => window.location.reload()}
            type='button'
          >
            刷新页面验证恢复
          </button>
          <button
            className='btn btn-ghost btn-sm text-error'
            disabled={busy}
            onClick={() => void resetDemo()}
            type='button'
          >
            重置
          </button>
        </div>
      </div>

      {/* 主体（可滚动） */}
      <div className='min-h-0 flex-1 overflow-auto p-4'>
        {notice && (
          <div className={`${alertClass(notice.tone)} mb-4`} role='alert'>
            <span className='text-sm'>{notice.text}</span>
          </div>
        )}

        {/* 紧凑统计行 */}
        <div className='stats stats-vertical bg-base-100 border-base-300 md:stats-horizontal mb-4 w-full border shadow-sm'>
          <div className='stat py-3'>
            <div className='stat-title text-xs'>Workspace 草稿</div>
            <div className='stat-value text-primary text-2xl'>{workspaceEntries.length}</div>
            <div className='stat-desc'>还没保存到主表的草稿</div>
          </div>
          <div className='stat py-3'>
            <div className='stat-title text-xs'>Todo 主表</div>
            <div className='stat-value text-2xl'>{savedTodoTotal}</div>
            <div className='stat-desc'>已写入数据库的全部记录</div>
          </div>
          <div className='stat py-3'>
            <div className='stat-title text-xs'>当前活动草稿</div>
            <div className='stat-value text-secondary text-2xl'>{activeDraftEntry ? 1 : 0}</div>
            <div className='stat-desc'>恢复面板聚焦的草稿</div>
          </div>
        </div>

        <div className='grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_360px]'>
          <div className='flex flex-col gap-4'>
            {/* 创建草稿 */}
            <section className='card border-base-300 bg-base-100 border shadow-sm'>
              <div className='card-body gap-3 p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <h2 className='text-base font-semibold'>创建未保存草稿</h2>
                  <span className='badge badge-outline badge-sm'>Workspace only</span>
                </div>
                <p className='text-base-content/65 text-xs'>
                  只创建草稿对象，不直接写入 Todo 主表。草稿先落 workspace，刷新后还能继续处理。
                </p>

                <div className='grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end'>
                  <label className='floating-label'>
                    <input
                      className='input input-sm w-full'
                      onChange={event => setDraftTitle(event.target.value)}
                      placeholder='例如：整理需求清单'
                      type='text'
                      value={draftTitle}
                    />
                    <span>草稿标题</span>
                  </label>
                  <label className='label rounded-box border-base-300 cursor-pointer gap-2 border px-3 py-2'>
                    <span className='label-text text-xs'>已完成</span>
                    <input
                      className='checkbox checkbox-sm checkbox-primary'
                      checked={draftCompleted}
                      onChange={event => setDraftCompleted(event.target.checked)}
                      type='checkbox'
                    />
                  </label>
                  <button
                    className='btn btn-primary btn-sm'
                    disabled={!canCreateDraft || busy}
                    onClick={createDraft}
                    type='button'
                  >
                    创建草稿
                  </button>
                </div>
              </div>
            </section>

            {/* 草稿列表 */}
            <section className='card border-base-300 bg-base-100 border shadow-sm'>
              <div className='card-body gap-3 p-4'>
                <div className='flex items-center justify-between'>
                  <h2 className='text-base font-semibold'>草稿列表</h2>
                  <span className='badge badge-ghost badge-sm'>{workspaceEntries.length} drafts</span>
                </div>

                {workspaceEntries.length === 0 ?
                  <div className='border-base-300 text-base-content/55 rounded-box border border-dashed p-6 text-center text-sm'>
                    当前没有未保存草稿。先创建一个，再刷新页面验证恢复链路。
                  </div>
                : <div className='space-y-2'>
                    {workspaceEntries.map(entry => (
                      <article
                        className={`rounded-box border-base-300 space-y-2 border p-3 transition-colors ${
                          entry.id === activeDraftId ? 'bg-primary/5 border-primary' : 'bg-base-100'
                        }`}
                        key={entry.cacheId}
                      >
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                          <div className='flex min-w-0 flex-1 items-center gap-2'>
                            <h3 className='truncate text-sm font-medium'>{titleOf(entry)}</h3>
                            {recoveredIds.has(entry.id) && (
                              <span className='badge badge-secondary badge-soft badge-xs'>已恢复</span>
                            )}
                          </div>
                          <div className='flex flex-wrap gap-1.5'>
                            <button
                              className='btn btn-xs btn-ghost'
                              onClick={() => setActiveDraftId(entry.id)}
                              type='button'
                            >
                              查看
                            </button>
                            <button
                              className='btn btn-xs btn-primary'
                              disabled={busy}
                              onClick={() => void saveDraft(entry)}
                              type='button'
                            >
                              保存
                            </button>
                            <button
                              className='btn btn-xs btn-ghost text-error'
                              disabled={busy}
                              onClick={() => void discardDraft(entry)}
                              type='button'
                            >
                              丢弃
                            </button>
                          </div>
                        </div>
                        <div className='text-base-content/55 grid gap-1 font-mono text-xs sm:grid-cols-3'>
                          <span className='truncate'>完成: {completedText(entry)}</span>
                          <span className='truncate'>{formatDateTime(createdAtOf(entry))}</span>
                          <span className='truncate'>{entry.cacheId}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                }
              </div>
            </section>

            {/* Todo 主表 */}
            <section className='card border-base-300 bg-base-100 border shadow-sm'>
              <div className='card-body gap-3 p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <div>
                    <h2 className='text-base font-semibold'>Todo 主表</h2>
                    <p className='text-base-content/55 text-xs'>
                      草稿保存后落到这里，最新在前。只查询当前这一页（每页 {TODO_PAGE_SIZE} 条）
                    </p>
                  </div>
                  <button
                    className='btn btn-ghost btn-sm'
                    disabled={busy || savedTodoTotal === 0}
                    onClick={() => void clearSavedTodos()}
                    type='button'
                  >
                    清空主表
                  </button>
                </div>
                <div className='rounded-box border-base-300 overflow-x-auto border'>
                  <table className='table-zebra table-sm table'>
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Status</th>
                        <th>ID</th>
                        <th>Updated At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedTodos.length === 0 ?
                        <tr>
                          <td className='text-base-content/55 text-center text-sm' colSpan={4}>
                            主表还没有记录。保存一条草稿看它落库。
                          </td>
                        </tr>
                      : savedTodos.map(todo => (
                          <tr key={todo.id}>
                            <td className='font-medium'>{todo.title}</td>
                            <td>
                              <span className='badge badge-outline badge-sm'>
                                {todo.completed ? 'completed' : 'open'}
                              </span>
                            </td>
                            <td className='font-mono text-xs'>{todo.id.slice(0, 8)}</td>
                            <td className='text-xs'>{formatDateTime(todo.updatedAt)}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>

                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <span className='text-base-content/55 text-xs'>
                    共 {savedTodoTotal} 条 · 第 {todoPage + 1} / {todoPageCount} 页
                  </span>
                  <div className='join'>
                    <button
                      className='btn btn-sm join-item'
                      disabled={todoPage === 0}
                      onClick={() => setRequestedTodoPage(Math.max(0, todoPage - 1))}
                      type='button'
                    >
                      上一页
                    </button>
                    <button
                      className='btn btn-sm join-item'
                      disabled={todoPage >= todoPageCount - 1}
                      onClick={() => setRequestedTodoPage(Math.min(todoPageCount - 1, todoPage + 1))}
                      type='button'
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* 侧栏 */}
          <aside className='flex flex-col gap-4'>
            <section className='card border-base-300 bg-base-100 border shadow-sm'>
              <div className='card-body gap-3 p-4'>
                <h2 className='text-base font-semibold'>恢复面板</h2>
                {activeDraftEntry ?
                  <div className='space-y-3'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <h3 className='font-semibold'>{titleOf(activeDraftEntry)}</h3>
                      {recoveredIds.has(activeDraftEntry.id) && (
                        <span className='badge badge-secondary badge-soft badge-sm'>刷新后恢复</span>
                      )}
                    </div>
                    <div className='space-y-1.5 text-sm'>
                      <div className='flex items-center justify-between gap-3'>
                        <span className='text-base-content/55'>草稿 ID</span>
                        <span className='font-mono text-xs'>{activeDraftEntry.id}</span>
                      </div>
                      <div className='flex items-center justify-between gap-3'>
                        <span className='text-base-content/55'>完成状态</span>
                        <span>{completedText(activeDraftEntry)}</span>
                      </div>
                      <div className='flex items-center justify-between gap-3'>
                        <span className='text-base-content/55'>创建时间</span>
                        <span>{formatDateTime(createdAtOf(activeDraftEntry))}</span>
                      </div>
                    </div>
                    <div className='flex gap-2'>
                      <button
                        className='btn btn-primary btn-sm flex-1'
                        disabled={busy}
                        onClick={() => void saveDraft(activeDraftEntry)}
                        type='button'
                      >
                        保存
                      </button>
                      <button
                        className='btn btn-ghost btn-sm text-error'
                        disabled={busy}
                        onClick={() => void discardDraft(activeDraftEntry)}
                        type='button'
                      >
                        丢弃
                      </button>
                    </div>
                  </div>
                : <div className='border-base-300 text-base-content/55 rounded-box border border-dashed p-4 text-sm'>
                    还没有选中的草稿。先创建一个，或从左侧列表点"查看"。
                  </div>
                }
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
