import { useInfiniteScroll, useRxDB } from '@aiao/rxdb-react';
import { Todo, type TodoStaticTypes } from '@aiao/rxdb-test/entities';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp, Pen, Plus, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useResettableTimeout } from '../hooks/useResettableTimeout';

const ITEM_SIZE = 32;
const PAGE_SIZE = 50;

export function TodoCursorPage() {
  const rxdb = useRxDB();
  const todoRepository = useMemo(() => rxdb.entityManager.getRepository(Todo), [rxdb]);
  const [title, setTitle] = useState('');
  const [currentTab, setCurrentTab] = useState<'all' | 'active' | 'completed'>('all');
  const [completedSort, setCompletedSort] = useState<'asc' | 'desc'>('asc');
  const [editingMap, setEditingMap] = useState<Map<string, boolean>>(new Map());
  const [editingTitles, setEditingTitles] = useState<Map<string, string>>(new Map());

  // 操作状态管理
  const [loadingActions, setLoadingActions] = useState<Set<string>>(new Set());

  // Refs for layout and virtualization
  const parentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const { schedule: scheduleEditFocus } = useResettableTimeout();

  // Query options
  const queryOptions = useMemo<TodoStaticTypes['findByCursorOptions']>(() => {
    const options: TodoStaticTypes['findByCursorOptions'] = {
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
      ],
      limit: PAGE_SIZE
    };

    if (currentTab === 'active') {
      options.where!.rules.push({
        field: 'completed',
        operator: '=',
        value: false
      });
    } else if (currentTab === 'completed') {
      options.where!.rules.push({
        field: 'completed',
        operator: '=',
        value: true
      });
    }

    return options;
  }, [currentTab, completedSort]);

  // Infinite scroll resource
  const resource = useInfiniteScroll(Todo, queryOptions);
  const todos = resource.value;

  // Virtual scroll setup
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns non-memoizable callbacks by design
  const virtualizer = useVirtualizer({
    count: todos.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_SIZE,
    overscan: 10,
    observeElementOffset: (instance, cb) => {
      const element = instance.scrollElement;
      if (!element) return undefined;

      const onScroll = () => {
        const headerHeight = headerRef.current?.offsetHeight || 0;
        const offset = Math.max(0, element.scrollTop - headerHeight);
        cb(offset, false);
      };

      element.addEventListener('scroll', onScroll, { passive: true });
      // Initial check
      onScroll();

      return () => {
        element.removeEventListener('scroll', onScroll);
      };
    }
  });

  // Handle scroll to load more
  const handleScroll = useCallback(() => {
    if (!parentRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = parentRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceFromBottom < 600 && !resource.isLoading) {
      resource.loadMore();
    }
  }, [resource]);

  // Add todo
  const handleAddTodo = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!title.trim()) return;

      const todo = new Todo({ title });
      await todo.save();
      setTitle('');
      resource.refresh();
    },
    [title, resource]
  );

  // Toggle completed
  const handleToggleCompleted = useCallback(
    async (todo: Todo, checked: boolean) => {
      const isEditing = editingMap.get(todo.id);
      if (isEditing) return;

      await todoRepository.update(todo, { completed: checked });
      // 游标分页的 resource 不会因为一次写入自动重新分页。
      // 同文件的 `handleAddTodo` / `handleAddMany` 写完都调了 refresh，
      // 而 toggle / 编辑保存 / 删除三条路径**漏了** —— 于是写入落库了，
      // 但当前页的数据快照仍是旧的：切换排序时会按旧快照排，行序不动。
      // （这条是收口 E2E P0-2、把"点两下不断言"换成真断言时才暴露出来的。）
      resource.refresh();
    },
    [editingMap, todoRepository, resource]
  );

  // Edit mode
  const handleStartEdit = useCallback(
    (todo: Todo) => {
      setEditingMap(prev => new Map(prev).set(todo.id, true));
      setEditingTitles(prev => new Map(prev).set(todo.id, todo.title));
      scheduleEditFocus(() => {
        const input = document.querySelector(`input[data-todo-id="${todo.id}"]`) as HTMLInputElement;
        input?.focus();
      }, 0);
    },
    [scheduleEditFocus]
  );

  const handleSaveEdit = useCallback(
    async (todo: Todo) => {
      const isEditing = editingMap.get(todo.id);
      if (!isEditing) return;

      const nextTitle = editingTitles.get(todo.id);
      if (typeof nextTitle === 'string' && nextTitle !== todo.title) {
        await todoRepository.update(todo, { title: nextTitle });
        resource.refresh();
      }

      setEditingMap(prev => {
        const next = new Map(prev);
        next.delete(todo.id);
        return next;
      });
      setEditingTitles(prev => {
        const next = new Map(prev);
        next.delete(todo.id);
        return next;
      });
    },
    [editingMap, editingTitles, todoRepository, resource]
  );

  const handleCancelEdit = useCallback((todo: Todo) => {
    setEditingMap(prev => {
      const next = new Map(prev);
      next.delete(todo.id);
      return next;
    });
    setEditingTitles(prev => {
      const next = new Map(prev);
      next.delete(todo.id);
      return next;
    });
  }, []);

  // Remove todo
  const handleRemove = useCallback(
    async (todo: Todo) => {
      await todo.remove();
      resource.refresh();
    },
    [resource]
  );

  // Add many todos
  const handleAddMany = useCallback(
    async (count: number, actionKey: string) => {
      setLoadingActions(prev => new Set(prev).add(actionKey));
      try {
        const todos: Todo[] = [];
        const timestamp = Date.now();
        for (let i = 0; i < count; i++) {
          const todo = new Todo();
          todo.title = `test-${timestamp}-${i}`;
          todos.push(todo);
        }
        await rxdb.entityManager.saveMany(todos);
        resource.refresh();
      } finally {
        setLoadingActions(prev => {
          const next = new Set(prev);
          next.delete(actionKey);
          return next;
        });
      }
    },
    [rxdb, resource]
  );

  return (
    <div
      ref={parentRef}
      className='flex h-full w-full flex-col overflow-auto'
      data-loaded-count={todos.length}
      data-page-size={PAGE_SIZE}
      data-testid='todo-cursor-viewport'
      onScroll={handleScroll}
    >
      {/* Header */}
      <div ref={headerRef} className='mx-auto flex w-full max-w-sm flex-col gap-2 pt-4'>
        <div className='flex items-center justify-between'>
          <h1 className='text-2xl font-bold'>
            Todo (Cursor)
            <div className='badge badge-outline badge-primary badge-sm ml-2' data-testid='todo-cursor-count'>
              {todos.filter(t => !t.completed).length} left
            </div>
          </h1>
        </div>

        {/* Tabs */}
        <div role='tablist' className='tabs tabs-boxed tabs-sm'>
          <button
            role='tab'
            data-testid='todo-cursor-tab-all'
            className={`tab ${currentTab === 'all' ? 'tab-active' : ''}`}
            onClick={() => setCurrentTab('all')}
          >
            All
          </button>
          <button
            role='tab'
            data-testid='todo-cursor-tab-active'
            className={`tab ${currentTab === 'active' ? 'tab-active' : ''}`}
            onClick={() => setCurrentTab('active')}
          >
            Active
          </button>
          <button
            role='tab'
            data-testid='todo-cursor-tab-completed'
            className={`tab ${currentTab === 'completed' ? 'tab-active' : ''}`}
            onClick={() => setCurrentTab('completed')}
          >
            Completed
          </button>
        </div>

        {/* Feature buttons */}
        <div className='flex flex-wrap gap-2'>
          <button
            className='btn btn-sm'
            data-testid='todo-cursor-sort'
            onClick={() => setCompletedSort(completedSort === 'asc' ? 'desc' : 'asc')}
          >
            {completedSort === 'asc' ?
              <ArrowUp size={16} />
            : <ArrowDown size={16} />}
            Completed
          </button>
          {[
            { count: 1, label: 'add 1' },
            { count: 10, label: 'add 10' },
            { count: 100, label: 'add 100' },
            { count: 1000, label: 'add 1000' },
            { count: 10000, label: 'add 10000' }
          ].map(({ count, label }) => {
            const actionKey = `add-${count}`;
            const isLoading = loadingActions.has(actionKey);
            return (
              <button
                key={actionKey}
                className='btn btn-sm'
                data-testid={`todo-cursor-add-${count}`}
                disabled={isLoading}
                onClick={() => handleAddMany(count, actionKey)}
              >
                {isLoading && <span className='loading loading-spinner loading-xs'></span>}
                {label}
              </button>
            );
          })}
        </div>

        {/* Add todo */}
        <form className='flex w-full gap-2' onSubmit={handleAddTodo}>
          <input
            className='input input-sm flex-1'
            data-testid='todo-cursor-title-input'
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder='What needs to be done?'
            type='text'
          />
          <button
            className='btn btn-neutral btn-sm'
            data-testid='todo-cursor-add'
            disabled={!title.trim()}
            type='submit'
          >
            <Plus size={16} />
          </button>
        </form>
      </div>

      {/* Todo List with Virtual Scroll */}
      <div className='mx-auto min-h-40 w-full max-w-sm flex-1'>
        {resource.isEmpty && !resource.isLoading && (
          <div className='hero min-h-40'>
            <div className='hero-content text-center'>
              <h1 className='text-sm font-bold'>What needs to be done?</h1>
            </div>
          </div>
        )}

        {resource.isLoading && todos.length === 0 && (
          <div className='flex min-h-40 items-center justify-center'>
            <span className='loading loading-spinner loading-xs'></span>
            <span className='ml-2 text-xs'>loading...</span>
          </div>
        )}

        <ul
          className='mb-4 divide-y divide-gray-200'
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative'
          }}
        >
          {virtualizer.getVirtualItems().map(virtualRow => {
            const todo = todos[virtualRow.index];
            const isEditing = editingMap.get(todo.id) ?? false;

            return (
              <li
                key={todo.id}
                className='absolute top-0 left-0 flex w-full items-center px-1 py-2'
                data-testid='todo-cursor-row'
                style={{
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`
                }}
              >
                {isEditing ?
                  <input
                    data-todo-id={todo.id}
                    data-testid='todo-cursor-edit-input'
                    className='input input-sm m-2 h-8 w-full'
                    value={editingTitles.get(todo.id) ?? todo.title}
                    onChange={e => {
                      const nextTitle = e.target.value;
                      setEditingTitles(prev => new Map(prev).set(todo.id, nextTitle));
                    }}
                    onBlur={() => handleCancelEdit(todo)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveEdit(todo);
                      if (e.key === 'Escape') handleCancelEdit(todo);
                    }}
                    placeholder='What needs to be done?'
                    type='text'
                  />
                : <>
                    <input
                      className='checkbox checkbox-sm'
                      data-testid='todo-cursor-completed'
                      checked={todo.completed}
                      onChange={e => handleToggleCompleted(todo, e.target.checked)}
                      type='checkbox'
                    />
                    <div
                      className={`flex-1 cursor-pointer truncate px-1 ${todo.completed ? 'line-through opacity-50' : ''}`}
                      data-testid='todo-cursor-title'
                      onDoubleClick={() => handleStartEdit(todo)}
                    >
                      {todo.title}
                    </div>
                    <button
                      className='btn btn-ghost btn-xs text-primary px-0'
                      data-testid='todo-cursor-edit'
                      onClick={() => handleStartEdit(todo)}
                      aria-label='Edit'
                    >
                      <Pen size={16} />
                    </button>
                    <button
                      className='btn btn-ghost btn-xs text-error px-0'
                      data-testid='todo-cursor-delete'
                      onClick={() => handleRemove(todo)}
                      aria-label='Remove'
                    >
                      <X size={16} />
                    </button>
                  </>
                }
              </li>
            );
          })}
        </ul>

        {resource.isLoading && todos.length > 0 && (
          <div className='flex justify-center py-4'>
            <span className='loading loading-spinner loading-xs'></span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className='mx-auto flex h-32 w-full max-w-sm flex-col'>
        <div className='divider'>footer</div>
      </div>
    </div>
  );
}

export default TodoCursorPage;
