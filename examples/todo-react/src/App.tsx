import { useMemo, useState, type FormEvent } from 'react';
import type { EntityStaticType } from '@aiao/rxdb';
import { useFindAll, useRxDB } from '@aiao/rxdb-react';
import { Todo } from './todo';

type Filter = 'all' | 'active' | 'completed';

const FILTERS: Filter[] = ['all', 'active', 'completed'];

export function App() {
  const rxdb = useRxDB();
  const [title, setTitle] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const options = useMemo<EntityStaticType<typeof Todo, 'findAllOptions'>>(
    () => ({
      where: {
        combinator: 'and',
        rules:
          filter === 'all'
            ? []
            : [{ field: 'completed', operator: '=', value: filter === 'completed' }]
      },
      orderBy: [
        { field: 'completed', sort: 'asc' },
        { field: 'createdAt', sort: 'desc' }
      ]
    }),
    [filter]
  );

  const { value: todos, isLoading } = useFindAll(Todo, options);

  const remaining = todos.filter(todo => !todo.completed).length;
  const completedTodos = todos.filter(todo => todo.completed);
  const allCompleted = todos.length > 0 && todos.every(todo => todo.completed);

  async function add(event: FormEvent) {
    event.preventDefault();
    const text = title.trim();
    if (!text) return;
    await new Todo({ title: text }).save();
    setTitle('');
  }

  async function toggle(todo: Todo) {
    todo.completed = !todo.completed;
    await todo.save();
  }

  async function remove(todo: Todo) {
    await todo.remove();
  }

  async function toggleAll() {
    const targets = todos.filter(todo => todo.completed === allCompleted);
    for (const todo of targets) todo.completed = !allCompleted;
    await rxdb.entityManager.saveMany(targets);
  }

  async function clearCompleted() {
    await rxdb.entityManager.removeMany(completedTodos);
  }

  return (
    <main className="todo-app">
      <h1>RxDB Todo</h1>
      <form onSubmit={add}>
        <input
          value={title}
          onChange={event => setTitle(event.target.value)}
          placeholder="What needs to be done?"
        />
      </form>

      <div className="filters">
        {FILTERS.map(item => (
          <button
            key={item}
            type="button"
            className={filter === item ? 'active' : ''}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <ul className="todo-list">
        {todos.map(todo => (
          <li key={todo.id} className={todo.completed ? 'completed' : ''}>
            <input type="checkbox" checked={todo.completed} onChange={() => toggle(todo)} />
            <span>{todo.title}</span>
            <button type="button" onClick={() => remove(todo)}>
              ×
            </button>
          </li>
        ))}
      </ul>

      {isLoading && <p className="hint">Loading…</p>}

      <footer className="toolbar">
        <span>
          {remaining} item{remaining === 1 ? '' : 's'} left
        </span>
        <button type="button" onClick={toggleAll} disabled={todos.length === 0}>
          {allCompleted ? 'Uncheck all' : 'Check all'}
        </button>
        <button type="button" onClick={clearCompleted} disabled={completedTodos.length === 0}>
          Clear completed
        </button>
      </footer>
    </main>
  );
}
