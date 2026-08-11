import { EntityStaticType } from '@aiao/rxdb';
import { useFindAll, useRxDB } from '@aiao/rxdb-react';
import { Todo } from '@aiao/rxdb-test/entities';
import { useVirtualizer } from '@tanstack/react-virtual';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, History, Pen, Plus, Redo2, Undo2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useObservable } from 'react-use';
import { HistorySidebar } from '../components/HistorySidebar';
import { useResettableTimeout } from '../hooks/useResettableTimeout';

const ITEM_SIZE = 48;

export function TodoPage(): React.JSX.Element {
  const rxdb = useRxDB();
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const fullHeaderRef = useRef<HTMLDivElement>(null);
  const editInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const { schedule: scheduleEditFocus } = useResettableTimeout();
  const { schedule: scheduleScrollEnd, cancel: cancelScrollEnd } = useResettableTimeout();
  const { schedule: scheduleScrollCleanup, cancel: cancelScrollCleanup } = useResettableTimeout();
  const stickyScrollRef = useRef<{ element: HTMLDivElement; handler: () => void } | null>(null);

  const [inputValue, setInputValue] = useState('');
  const [currentTab, setCurrentTab] = useState<'all' | 'active' | 'completed'>('all');
  const [completedSort, setCompletedSort] = useState<'asc' | 'desc'>('asc');
  const [editingTodoIds, setEditingTodoIds] = useState<Set<string>>(new Set());
  const [editValues, setEditValues] = useState<Map<string, string>>(new Map());
  const [showHistory, setShowHistory] = useState(true);
  const [showStickyHeader, setShowStickyHeader] = useState(false);
  const [addingCount, setAddingCount] = useState<number | null>(null);

  // History
  const history = useMemo(() => rxdb.versionManager.history(Todo), [rxdb]);
  const undoCount = useObservable(history.undoCount$, 0);
  const redoCount = useObservable(history.redoCount$, 0);
  const histories = useObservable(history.histories$, []);

  // 查询条件
  const todoQueryOptions = useMemo<EntityStaticType<typeof Todo, 'findAllOptions'>>(() => {
    const options: EntityStaticType<typeof Todo, 'findAllOptions'> = {
      where: {
        combinator: 'and',
        rules: []
      },
      orderBy: [
        {
          field: 'completed',
          sort: completedSort
        },
        {
          field: 'id',
          sort: 'desc'
        }
      ]
    };

    if (currentTab === 'active') {
      options.where.rules.push({
        field: 'completed',
        operator: '=',
        value: false
      });
    } else if (currentTab === 'completed') {
      options.where.rules.push({
        field: 'completed',
        operator: '=',
        value: true
      });
    }

    return options;
  }, [currentTab, completedSort]);

  const todoResource = useFindAll(Todo, todoQueryOptions);
  // P2-4：`RxDBResource.value` 非可选，`?? []` 是死代码；useMemo 随之退化成恒等映射。
  const todos = todoResource.value;

  // 虚拟滚动
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: todos.length,
    getScrollElement: () => mainContainerRef.current,
    estimateSize: () => ITEM_SIZE,
    overscan: 10
  });

  // 计算派生状态
  const activeTodoCount = useMemo(() => todos.filter(todo => !todo.completed).length, [todos]);
  const completedTodos = useMemo(() => todos.filter(todo => todo.completed), [todos]);
  const isAllCompleted = useMemo(() => todos.length > 0 && todos.every(todo => todo.completed), [todos]);
  const disabledToggleAllBtn = todos.length === 0;
  const disabledClearCompletedBtn = completedTodos.length === 0;

  // Sticky header 检测
  useEffect(() => {
    const mainElement = mainContainerRef.current;
    const headerElement = fullHeaderRef.current;

    if (!mainElement || !headerElement) return;

    const checkVisibility = () => {
      const scrollTop = mainElement.scrollTop;
      const headerOffsetTop = headerElement.offsetTop;
      const headerHeight = headerElement.offsetHeight;
      const shouldShow = scrollTop > headerOffsetTop + headerHeight;
      setShowStickyHeader(shouldShow);
    };

    mainElement.addEventListener('scroll', checkVisibility);
    checkVisibility();

    return () => mainElement.removeEventListener('scroll', checkVisibility);
  }, []);

  const addTodo = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const value = inputValue.trim();
      if (!value) return;

      const todo = new Todo({ title: value });
      await todo.save();
      setInputValue('');
    },
    [inputValue]
  );

  const toggleTodoCompletion = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>, todo: Todo) => {
      const isEditing = editingTodoIds.has(todo.id);
      if (isEditing) return;

      event.preventDefault();
      todo.completed = event.target.checked;
      await todo.save();
    },
    [editingTodoIds]
  );

  const startEditing = useCallback(
    (event: React.MouseEvent, todo: Todo) => {
      event.preventDefault();
      event.stopPropagation();
      setEditingTodoIds(prev => new Set(prev).add(todo.id));
      setEditValues(prev => new Map(prev).set(todo.id, todo.title));

      scheduleEditFocus(() => {
        const input = editInputRefs.current.get(todo.id);
        input?.focus();
        input?.select();
      }, 0);
    },
    [scheduleEditFocus]
  );

  const saveTodo = useCallback(
    async (event: React.SyntheticEvent, input: HTMLInputElement, todo: Todo) => {
      event.preventDefault();
      event.stopPropagation();

      if (!editingTodoIds.has(todo.id)) return;

      const editValue = editValues.get(todo.id);
      if (editValue !== undefined) {
        todo.title = editValue;
      }

      setEditingTodoIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(todo.id);
        return newSet;
      });
      setEditValues(prev => {
        const newMap = new Map(prev);
        newMap.delete(todo.id);
        return newMap;
      });

      await todo.save();
      input.blur();
    },
    [editingTodoIds, editValues]
  );

  const cancelEditing = useCallback(
    (todo: Todo) => {
      if (!editingTodoIds.has(todo.id)) return;

      setEditingTodoIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(todo.id);
        return newSet;
      });
      setEditValues(prev => {
        const newMap = new Map(prev);
        newMap.delete(todo.id);
        return newMap;
      });
    },
    [editingTodoIds]
  );

  const removeTodo = useCallback(async (event: React.MouseEvent, todo: Todo) => {
    event.preventDefault();
    event.stopPropagation();
    await todo.remove();
  }, []);

  const toggleAllTodos = useCallback(async () => {
    const newCompletedState = !isAllCompleted;
    const todosToUpdate = todos.filter(d => d.completed === isAllCompleted);

    todosToUpdate.forEach(todo => {
      todo.completed = newCompletedState;
    });

    console.time('saveMany');
    await rxdb.entityManager.saveMany(todosToUpdate);
    console.timeEnd('saveMany');
  }, [todos, isAllCompleted, rxdb.entityManager]);

  const clearCompleted = useCallback(async () => {
    console.time('removeMany');
    await rxdb.entityManager.removeMany(completedTodos);
    console.timeEnd('removeMany');
  }, [completedTodos, rxdb.entityManager]);

  const toggleCompletedSort = useCallback(() => {
    setCompletedSort(prev => (prev === 'asc' ? 'desc' : 'asc'));
  }, []);

  const toggleHistory = useCallback(() => {
    setShowHistory(prev => !prev);
  }, []);

  const stickyTabClick = useCallback(
    (tab: 'all' | 'active' | 'completed') => {
      const element = mainContainerRef.current;
      if (!element) return;

      const clearStickyScroll = () => {
        const active = stickyScrollRef.current;
        if (active) {
          active.element.removeEventListener('scroll', active.handler);
          stickyScrollRef.current = null;
        }
        cancelScrollEnd();
        cancelScrollCleanup();
      };

      clearStickyScroll();
      const onScrollEnd = () => {
        scheduleScrollEnd(() => {
          setCurrentTab(tab);
          clearStickyScroll();
        }, 50);
      };

      stickyScrollRef.current = { element, handler: onScrollEnd };
      element.addEventListener('scroll', onScrollEnd);
      element.scrollTo({ top: 0, behavior: 'smooth' });
      scheduleScrollCleanup(clearStickyScroll, 5000);
    },
    [cancelScrollCleanup, cancelScrollEnd, scheduleScrollCleanup, scheduleScrollEnd]
  );

  useEffect(() => {
    return () => {
      const active = stickyScrollRef.current;
      if (active) active.element.removeEventListener('scroll', active.handler);
      stickyScrollRef.current = null;
    };
  }, []);

  const addManyTodo = useCallback(
    async (total: number) => {
      setAddingCount(total);
      const newTodos: Todo[] = [];
      for (let i = 0; i < total; i++) {
        const todo = new Todo();
        todo.title = `test-${i}`;
        newTodos.push(todo);
      }
      console.time('saveMany');
      try {
        await rxdb.entityManager.saveMany(newTodos);
      } finally {
        console.timeEnd('saveMany');
        setAddingCount(null);
      }
    },
    [rxdb.entityManager]
  );

  const undo = useCallback(() => {
    void history.undo();
  }, [history]);

  const redo = useCallback(() => {
    void history.redo();
  }, [history]);

  return (
    <div className='flex h-full'>
      {/* History Sidebar */}
      <HistorySidebar
        borderSide='left'
        histories={histories}
        scopeType={history.type}
        show={showHistory}
        onClose={toggleHistory}
      />

      <main className='h-full min-w-0 flex-1 overflow-auto' data-testid='todo-page' ref={mainContainerRef}>
        {/* Sticky Header (简化版) */}
        {showStickyHeader && (
          <div className='border-base-300 bg-base-100 sticky top-0 z-10 border-b px-4 py-2 shadow-sm'>
            <div className='mx-auto flex max-w-4xl items-center justify-between'>
              <div className='flex items-center gap-3'>
                <h2 className='text-lg font-semibold'>Todos</h2>
                <div className='badge badge-primary badge-sm'>{activeTodoCount} 待办</div>
              </div>
              <div className='tabs tabs-boxed tabs-xs' role='tablist'>
                <button
                  className={clsx('tab', { 'tab-active': currentTab === 'all' })}
                  onClick={() => stickyTabClick('all')}
                  type='button'
                >
                  全部
                </button>
                <button
                  className={clsx('tab', { 'tab-active': currentTab === 'active' })}
                  onClick={() => stickyTabClick('active')}
                  type='button'
                >
                  进行中
                </button>
                <button
                  className={clsx('tab', { 'tab-active': currentTab === 'completed' })}
                  onClick={() => stickyTabClick('completed')}
                  type='button'
                >
                  已完成
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Full Header */}
        <div className='border-base-300 flex-none border-b p-4' ref={fullHeaderRef}>
          <div className='mx-auto flex max-w-4xl flex-col gap-3'>
            {/* Title Bar */}
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-3'>
                <h1 className='text-2xl font-bold'>Todos</h1>
                <div className='badge badge-primary' data-testid='todo-count'>
                  {activeTodoCount} 待办
                </div>

                {/* Batch Add Dropdown */}
                <div className='dropdown dropdown-end'>
                  <button
                    className='btn btn-circle btn-sm'
                    data-testid='todo-batch-add'
                    aria-label='批量添加'
                    tabIndex={0}
                  >
                    <Plus size={16} />
                  </button>
                  <ul className='menu dropdown-content rounded-box bg-base-200 z-[1] w-40 p-2 shadow'>
                    <li>
                      <button
                        data-testid='todo-batch-option-1'
                        disabled={addingCount === 1}
                        onClick={() => addManyTodo(1)}
                      >
                        {addingCount === 1 && <span className='loading loading-spinner loading-xs'></span>}
                        添加 1 条
                      </button>
                    </li>
                    <li>
                      <button
                        data-testid='todo-batch-option-10'
                        disabled={addingCount === 10}
                        onClick={() => addManyTodo(10)}
                      >
                        {addingCount === 10 && <span className='loading loading-spinner loading-xs'></span>}
                        添加 10 条
                      </button>
                    </li>
                    <li>
                      <button
                        data-testid='todo-batch-option-100'
                        disabled={addingCount === 100}
                        onClick={() => addManyTodo(100)}
                      >
                        {addingCount === 100 && <span className='loading loading-spinner loading-xs'></span>}
                        添加 100 条
                      </button>
                    </li>
                    <li>
                      <button
                        data-testid='todo-batch-option-1000'
                        disabled={addingCount === 1000}
                        onClick={() => addManyTodo(1000)}
                      >
                        {addingCount === 1000 && <span className='loading loading-spinner loading-xs'></span>}
                        添加 1000 条
                      </button>
                    </li>
                    <li>
                      <button
                        data-testid='todo-batch-option-10000'
                        disabled={addingCount === 10000}
                        onClick={() => addManyTodo(10000)}
                      >
                        {addingCount === 10000 && <span className='loading loading-spinner loading-xs'></span>}
                        添加 10000 条
                      </button>
                    </li>
                  </ul>
                </div>
              </div>

              <div className='flex items-center gap-2'>
                {/* Undo/Redo */}
                <div className='join'>
                  <button
                    className='btn btn-sm join-item'
                    data-testid='todo-undo'
                    disabled={undoCount === 0}
                    onClick={undo}
                    aria-label='Undo'
                  >
                    <Undo2 size={16} />
                    {undoCount > 0 && <span className='badge badge-xs'>{undoCount}</span>}
                  </button>
                  <button
                    className='btn btn-sm join-item'
                    data-testid='todo-redo'
                    disabled={redoCount === 0}
                    onClick={redo}
                    aria-label='Redo'
                  >
                    <Redo2 size={16} />
                    {redoCount > 0 && <span className='badge badge-xs'>{redoCount}</span>}
                  </button>
                </div>

                {/* History Toggle */}
                <button
                  className={clsx('btn btn-sm', { 'btn-primary': showHistory })}
                  data-testid='todo-history'
                  onClick={toggleHistory}
                  aria-label='历史记录'
                >
                  <History size={16} />
                </button>
              </div>
            </div>

            {/* Tabs and Action Buttons */}
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <div className='tabs tabs-boxed tabs-sm' role='tablist'>
                <button
                  className={clsx('tab', { 'tab-active': currentTab === 'all' })}
                  data-testid='todo-tab-all'
                  onClick={() => setCurrentTab('all')}
                  role='tab'
                >
                  全部
                </button>
                <button
                  className={clsx('tab', { 'tab-active': currentTab === 'active' })}
                  data-testid='todo-tab-active'
                  onClick={() => setCurrentTab('active')}
                  role='tab'
                >
                  进行中
                </button>
                <button
                  className={clsx('tab', { 'tab-active': currentTab === 'completed' })}
                  data-testid='todo-tab-completed'
                  onClick={() => setCurrentTab('completed')}
                  role='tab'
                >
                  已完成
                </button>
              </div>

              <div className='flex flex-wrap items-center gap-2'>
                <button
                  className='btn btn-sm'
                  data-testid='todo-toggle-all'
                  disabled={disabledToggleAllBtn}
                  onClick={toggleAllTodos}
                  aria-label='全选/取消全选当前列表'
                >
                  全选当前列表
                </button>
                <button
                  className='btn btn-sm'
                  data-testid='todo-clear-completed'
                  disabled={disabledClearCompletedBtn}
                  onClick={clearCompleted}
                  aria-label='清除当前列表中的已完成项'
                >
                  清除当前已完成
                </button>
                <button className='btn btn-sm' data-testid='todo-sort' onClick={toggleCompletedSort} aria-label='排序'>
                  {completedSort === 'asc' ?
                    <ArrowUp size={16} />
                  : <ArrowDown size={16} />}
                  排序
                </button>
              </div>
            </div>

            {/* Add Todo Input */}
            <div className='flex w-full gap-2'>
              <input
                className='input input-bordered input-sm flex-1'
                data-testid='todo-title-input'
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyUp={e => e.key === 'Enter' && addTodo(e)}
                aria-label='添加新任务'
                placeholder='添加新任务...'
                type='text'
              />
              <button
                className='btn btn-primary btn-sm'
                data-testid='todo-add'
                disabled={!inputValue}
                onClick={addTodo}
                aria-label='添加'
              >
                <Plus size={16} />
                添加
              </button>
            </div>
          </div>
        </div>

        {/* Todo List */}
        <div className='mx-auto min-h-60 max-w-4xl'>
          {todoResource.isLoading ?
            <div className='hero min-h-60'>
              <div className='hero-content text-center'>
                <span className='loading loading-spinner loading-md'></span>
              </div>
            </div>
          : todoResource.isEmpty ?
            <div className='hero min-h-60'>
              <div className='hero-content text-center'>
                <div>
                  <p className='text-base-content/60'>暂无任务</p>
                  <p className='text-base-content/40 text-sm'>添加一个新任务开始吧</p>
                </div>
              </div>
            </div>
          : <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              <ul className='divide-base-200 divide-y'>
                {virtualizer.getVirtualItems().map(virtualItem => {
                  const todo = todos[virtualItem.index];
                  const isEditing = editingTodoIds.has(todo.id);

                  return (
                    <li
                      // P1-1：key 必须是**身份**，不能是 `getEntityStatus(todo).fingerprint`
                      // （= `id@updatedAt`）—— 那样每次写入都换 key，React 会卸载重建整行，
                      // 行内正在编辑的 input 连同焦点/光标一起没了。
                      // 同一应用的 todo-cursor 页用的就是 `todo.id`。
                      key={todo.id}
                      data-testid='todo-row'
                      className='group border-base-200 hover:bg-base-200/50 flex items-center border-b px-4 py-2 transition-colors'
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${ITEM_SIZE}px`,
                        transform: `translateY(${virtualItem.start}px)`
                      }}
                    >
                      <div className='flex w-full flex-1 items-center gap-3'>
                        {isEditing ?
                          <>
                            <input
                              ref={el => {
                                if (el) editInputRefs.current.set(todo.id, el);
                              }}
                              className='todo-input input input-bordered input-sm flex-1'
                              data-testid='todo-edit-input'
                              value={editValues.get(todo.id) ?? todo.title}
                              onChange={e => setEditValues(prev => new Map(prev).set(todo.id, e.target.value))}
                              onBlur={() => cancelEditing(todo)}
                              onKeyUp={e => {
                                if (e.key === 'Enter') {
                                  const input = e.currentTarget;
                                  saveTodo(e, input, todo);
                                } else if (e.key === 'Escape') {
                                  cancelEditing(todo);
                                }
                              }}
                              placeholder='任务名称...'
                              type='text'
                            />
                            <button
                              className='btn btn-sm'
                              onMouseDown={e => e.preventDefault()}
                              onClick={e => {
                                const input = editInputRefs.current.get(todo.id);
                                if (input) saveTodo(e, input, todo);
                              }}
                              aria-label='保存'
                              data-testid='todo-save'
                            >
                              保存
                            </button>
                          </>
                        : <>
                            <input
                              className='checkbox'
                              data-testid='todo-completed'
                              checked={todo.completed}
                              onChange={e => toggleTodoCompletion(e, todo)}
                              type='checkbox'
                            />
                            <div
                              className={clsx('flex-1 cursor-pointer truncate select-none', {
                                'line-through': todo.completed,
                                'opacity-50': todo.completed
                              })}
                              data-testid='todo-title'
                              onDoubleClick={e => startEditing(e, todo)}
                            >
                              {todo.title}
                            </div>
                            <div className='flex gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
                              <button
                                className='btn btn-ghost btn-xs'
                                data-testid='todo-edit'
                                onClick={e => startEditing(e, todo)}
                                aria-label='编辑'
                              >
                                <Pen size={14} />
                              </button>
                              <button
                                className='btn btn-ghost btn-xs text-error'
                                data-testid='todo-delete'
                                onClick={e => removeTodo(e, todo)}
                                aria-label='删除'
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </>
                        }
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          }
        </div>
      </main>
    </div>
  );
}

export default TodoPage;
