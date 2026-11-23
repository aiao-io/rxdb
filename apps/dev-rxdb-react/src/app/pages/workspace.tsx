import { type RxDB } from '@aiao/rxdb';
import { useI18n } from '@aiao/rxdb-i18n-react';
import { type WorkspaceCacheEntry } from '@aiao/rxdb-plugin-workspace';
import { useCount, useFind, useRxDB } from '@aiao/rxdb-react';
import { Todo, type TodoStaticTypes } from '@aiao/rxdb-test/entities';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { firstValueFrom } from 'rxjs';
import {
  formatWorkspaceDate,
  workspaceError,
  workspaceNoticeText,
  type WorkspaceNotice
} from '@modules/demo-i18n/workspace';

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

// P1-5：插件自己已经 `declare module '@aiao/rxdb' { interface RxDB { workspace: RxDBPluginWorkspace } }`，
// `useRxDB()` 上的 `.workspace` 本来就是有类型的。原先这里手写了一份 `WorkspaceApi` 结构类型
// 再 `as WorkspaceRxDB` 断言上去 —— 断言会盖掉真类型，插件改签名时这份副本不会报错，
// 只会在运行时对不上。类型直接从插件取。
type WorkspaceEntry = WorkspaceCacheEntry;

function alertClass(tone: WorkspaceNotice['tone']): string {
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
  const { locale, t, formatNumber } = useI18n();

  const titleOf = useCallback(
    (entry: WorkspaceEntry): string => {
      const title = entry.data['title'];
      return typeof title === 'string' && title.trim().length > 0 ? title : t('page.workspace.untitled');
    },
    [t]
  );

  function completedText(entry: WorkspaceEntry): string {
    return entry.data['completed'] === true ? t('page.workspace.statusCompleted') : t('page.workspace.statusOpen');
  }

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
  const [draftTitleInput, setDraftTitle] = useState<string | null>(null);
  const draftTitle = draftTitleInput ?? t('page.workspace.defaultTitle');
  const [draftCompleted, setDraftCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<WorkspaceNotice | null>(null);
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
      setNotice(workspaceError('page.workspace.errorLoad', error));
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
      setNotice({ key: 'page.workspace.noticeCreated', params: { title: todo.title }, tone: 'success' });
    } catch (error) {
      setNotice(workspaceError('page.workspace.errorCreate', error));
    } finally {
      setBusy(false);
    }
  }, [draftCompleted, draftTitle, syncWorkspace]);

  const saveDraft = useCallback(
    async (entry: WorkspaceEntry) => {
      const todo = resolveDraft(entry);
      if (!todo) {
        setNotice({ key: 'page.workspace.errorNoDraft', tone: 'error' });
        return;
      }

      setBusy(true);
      try {
        await todo.save();
        await syncWorkspace(activeDraftIdRef.current);
        setNotice({ key: 'page.workspace.noticeSaved', params: { title: todo.title }, tone: 'success' });
      } catch (error) {
        setNotice(workspaceError('page.workspace.errorSave', error));
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
          key: discarded ? 'page.workspace.noticeDiscarded' : 'page.workspace.errorMissingDraft',
          params: { title: titleOf(entry) },
          tone: discarded ? 'warning' : 'info'
        });
      } finally {
        setBusy(false);
      }
    },
    [rxdb, syncWorkspace, titleOf]
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
      if (batch[0].id === lastBatchHeadId) throw new Error(t('page.workspace.deleteStalled'));
      lastBatchHeadId = batch[0].id;
      await rxdb.entityManager.removeMany(batch);
    }
  }, [rxdb, t]);

  const clearSavedTodos = useCallback(async () => {
    if (savedTodoTotal === 0) return;

    setBusy(true);
    try {
      await deleteAllTodos();
      setRequestedTodoPage(0);
      setNotice({ key: 'page.workspace.noticeCleared', tone: 'warning' });
    } catch (error) {
      setNotice(workspaceError('page.workspace.errorClear', error));
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
      setNotice({ key: 'page.workspace.noticeReset', tone: 'warning' });
    } catch (error) {
      setNotice(workspaceError('page.workspace.errorReset', error));
    } finally {
      setBusy(false);
    }
  }, [deleteAllTodos, readWorkspaceEntries, rxdb, syncWorkspace]);

  return (
    <div className='page-host flex h-full flex-col overflow-hidden'>
      {/* 顶部 toolbar */}
      <div className='border-base-300 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3'>
        <div className='flex flex-wrap items-center gap-2'>
          <h1 className='text-lg font-semibold'>{t('page.workspace.title')}</h1>
          <span className='badge badge-ghost badge-sm'>
            {t('page.workspace.drafts', { count: workspaceEntries.length })}
          </span>
          <span className='text-base-content/55 hidden text-xs lg:inline'>{t('page.workspace.cacheHint')}</span>
        </div>
        <div className='flex items-center gap-2'>
          <button className='btn btn-ghost btn-sm' disabled={busy} onClick={() => refreshWorkspace()} type='button'>
            {t('common.refresh')}
          </button>
          <button
            className='btn btn-ghost btn-sm'
            disabled={busy}
            onClick={() => window.location.reload()}
            type='button'
          >
            {t('page.workspace.reloadVerify')}
          </button>
          <button
            className='btn btn-ghost btn-sm text-error'
            disabled={busy}
            onClick={() => void resetDemo()}
            type='button'
          >
            {t('common.reset')}
          </button>
        </div>
      </div>

      {/* 主体（可滚动） */}
      <div className='min-h-0 flex-1 overflow-auto p-4'>
        {notice && (
          <div className={`${alertClass(notice.tone)} mb-4`} role='alert'>
            <span className='text-sm'>{workspaceNoticeText(notice, t)}</span>
          </div>
        )}

        {/* 紧凑统计行 */}
        <div className='stats stats-vertical bg-base-100 border-base-300 md:stats-horizontal mb-4 w-full border shadow-sm'>
          <div className='stat py-3'>
            <div className='stat-title text-xs'>{t('page.workspace.draftStat')}</div>
            <div className='stat-value text-primary text-2xl'>{formatNumber(workspaceEntries.length)}</div>
            <div className='stat-desc'>{t('page.workspace.draftStatDescription')}</div>
          </div>
          <div className='stat py-3'>
            <div className='stat-title text-xs'>{t('page.workspace.todoStat')}</div>
            <div className='stat-value text-2xl'>{formatNumber(savedTodoTotal)}</div>
            <div className='stat-desc'>{t('page.workspace.todoStatDescription')}</div>
          </div>
          <div className='stat py-3'>
            <div className='stat-title text-xs'>{t('page.workspace.activeDraftStat')}</div>
            <div className='stat-value text-secondary text-2xl'>{formatNumber(activeDraftEntry ? 1 : 0)}</div>
            <div className='stat-desc'>{t('page.workspace.activeDraftStatDescription')}</div>
          </div>
        </div>

        <div className='grid gap-4 2xl:grid-cols-[minmax(0,1.15fr)_360px]'>
          <div className='flex flex-col gap-4'>
            {/* 创建草稿 */}
            <section className='card border-base-300 bg-base-100 border shadow-sm'>
              <div className='card-body gap-3 p-4'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <h2 className='text-base font-semibold'>{t('page.workspace.createDraft')}</h2>
                  <span className='badge badge-outline badge-sm'>{t('page.workspace.workspaceOnly')}</span>
                </div>
                <p className='text-base-content/65 text-xs'>{t('page.workspace.createDescription')}</p>

                <div className='grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end'>
                  <label className='floating-label'>
                    <input
                      className='input input-sm w-full'
                      onChange={event => setDraftTitle(event.target.value)}
                      placeholder={t('page.workspace.titlePlaceholder')}
                      type='text'
                      value={draftTitle}
                    />
                    <span>{t('page.workspace.draftTitle')}</span>
                  </label>
                  <label className='label rounded-box border-base-300 cursor-pointer gap-2 border px-3 py-2'>
                    <span className='label-text text-xs'>{t('page.workspace.completed')}</span>
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
                    {t('page.workspace.createButton')}
                  </button>
                </div>
              </div>
            </section>

            {/* 草稿列表 */}
            <section className='card border-base-300 bg-base-100 border shadow-sm'>
              <div className='card-body gap-3 p-4'>
                <div className='flex items-center justify-between'>
                  <h2 className='text-base font-semibold'>{t('page.workspace.draftList')}</h2>
                  <span className='badge badge-ghost badge-sm'>
                    {t('page.workspace.drafts', { count: workspaceEntries.length })}
                  </span>
                </div>

                {workspaceEntries.length === 0 ?
                  <div className='border-base-300 text-base-content/55 rounded-box border border-dashed p-6 text-center text-sm'>
                    {t('page.workspace.emptyDrafts')}
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
                              <span className='badge badge-secondary badge-soft badge-xs'>
                                {t('page.workspace.recovered')}
                              </span>
                            )}
                          </div>
                          <div className='flex flex-wrap gap-1.5'>
                            <button
                              className='btn btn-xs btn-ghost'
                              onClick={() => setActiveDraftId(entry.id)}
                              type='button'
                            >
                              {t('page.workspace.view')}
                            </button>
                            <button
                              className='btn btn-xs btn-primary'
                              disabled={busy}
                              onClick={() => void saveDraft(entry)}
                              type='button'
                            >
                              {t('common.save')}
                            </button>
                            <button
                              className='btn btn-xs btn-ghost text-error'
                              disabled={busy}
                              onClick={() => void discardDraft(entry)}
                              type='button'
                            >
                              {t('common.discard')}
                            </button>
                          </div>
                        </div>
                        <div className='text-base-content/55 grid gap-1 font-mono text-xs sm:grid-cols-3'>
                          <span className='truncate'>
                            {t('page.workspace.completedValue', { value: completedText(entry) })}
                          </span>
                          <span className='truncate'>{formatWorkspaceDate(createdAtOf(entry), locale)}</span>
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
                    <h2 className='text-base font-semibold'>{t('page.workspace.todoTable')}</h2>
                    <p className='text-base-content/55 text-xs'>
                      {t('page.workspace.todoDescription', { size: TODO_PAGE_SIZE })}
                    </p>
                  </div>
                  <button
                    className='btn btn-ghost btn-sm'
                    disabled={busy || savedTodoTotal === 0}
                    onClick={() => void clearSavedTodos()}
                    type='button'
                  >
                    {t('page.workspace.clearTable')}
                  </button>
                </div>
                <div className='rounded-box border-base-300 overflow-x-auto border'>
                  <table className='table-zebra table-sm table'>
                    <thead>
                      <tr>
                        <th>{t('page.workspace.titleColumn')}</th>
                        <th>{t('page.workspace.statusColumn')}</th>
                        <th>{t('page.workspace.idColumn')}</th>
                        <th>{t('page.workspace.updatedAtColumn')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {savedTodos.length === 0 ?
                        <tr>
                          <td className='text-base-content/55 text-center text-sm' colSpan={4}>
                            {t('page.workspace.emptyTodos')}
                          </td>
                        </tr>
                      : savedTodos.map(todo => (
                          <tr key={todo.id}>
                            <td className='font-medium'>{todo.title}</td>
                            <td>
                              <span className='badge badge-outline badge-sm'>
                                {t(todo.completed ? 'page.workspace.statusCompleted' : 'page.workspace.statusOpen')}
                              </span>
                            </td>
                            <td className='font-mono text-xs'>{todo.id.slice(0, 8)}</td>
                            <td className='text-xs'>{formatWorkspaceDate(todo.updatedAt, locale)}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>

                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <span className='text-base-content/55 text-xs'>
                    {t('page.workspace.pagination', {
                      count: savedTodoTotal,
                      current: todoPage + 1,
                      total: todoPageCount
                    })}
                  </span>
                  <div className='join'>
                    <button
                      className='btn btn-sm join-item'
                      disabled={todoPage === 0}
                      onClick={() => setRequestedTodoPage(Math.max(0, todoPage - 1))}
                      type='button'
                    >
                      {t('common.previous')}
                    </button>
                    <button
                      className='btn btn-sm join-item'
                      disabled={todoPage >= todoPageCount - 1}
                      onClick={() => setRequestedTodoPage(Math.min(todoPageCount - 1, todoPage + 1))}
                      type='button'
                    >
                      {t('common.next')}
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
                <h2 className='text-base font-semibold'>{t('page.workspace.recoveryPanel')}</h2>
                {activeDraftEntry ?
                  <div className='space-y-3'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <h3 className='font-semibold'>{titleOf(activeDraftEntry)}</h3>
                      {recoveredIds.has(activeDraftEntry.id) && (
                        <span className='badge badge-secondary badge-soft badge-sm'>
                          {t('page.workspace.recoveredAfterRefresh')}
                        </span>
                      )}
                    </div>
                    <div className='space-y-1.5 text-sm'>
                      <div className='flex items-center justify-between gap-3'>
                        <span className='text-base-content/55'>{t('page.workspace.draftId')}</span>
                        <span className='font-mono text-xs'>{activeDraftEntry.id}</span>
                      </div>
                      <div className='flex items-center justify-between gap-3'>
                        <span className='text-base-content/55'>{t('page.workspace.completedStatus')}</span>
                        <span>{completedText(activeDraftEntry)}</span>
                      </div>
                      <div className='flex items-center justify-between gap-3'>
                        <span className='text-base-content/55'>{t('page.workspace.createdAt')}</span>
                        <span>{formatWorkspaceDate(createdAtOf(activeDraftEntry), locale)}</span>
                      </div>
                    </div>
                    <div className='flex gap-2'>
                      <button
                        className='btn btn-primary btn-sm flex-1'
                        disabled={busy}
                        onClick={() => void saveDraft(activeDraftEntry)}
                        type='button'
                      >
                        {t('common.save')}
                      </button>
                      <button
                        className='btn btn-ghost btn-sm text-error'
                        disabled={busy}
                        onClick={() => void discardDraft(activeDraftEntry)}
                        type='button'
                      >
                        {t('common.discard')}
                      </button>
                    </div>
                  </div>
                : <div className='border-base-300 text-base-content/55 rounded-box border border-dashed p-4 text-sm'>
                    {t('page.workspace.emptySelection')}
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
