# React 集成

`@aiao/rxdb-react` 提供了 React 集成，包括 Context Provider 和一系列响应式 Hooks，让你在 React 应用中轻松使用 RxDB。

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-react
```

## 核心概念

### RxDBProvider

使用 `RxDBProvider` 将 RxDB 实例注入到 React 组件树中：

```tsx
import { RxDBProvider } from '@aiao/rxdb-react';
import { RxDB } from '@aiao/rxdb';

// 创建 RxDB 实例
const rxdb = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
});

function App() {
  return (
    <RxDBProvider db={rxdb}>
      <TodoList />
    </RxDBProvider>
  );
}
```

### 自定义 Provider

如果需要更强的类型安全性，可以创建自定义的 Provider：

```tsx
import { makeRxDBProvider } from '@aiao/rxdb-react';
import { RxDB } from '@aiao/rxdb';

// 创建类型安全的 Provider 和 Hook
const { RxDBProvider, useRxDB } = makeRxDBProvider<RxDB>();

export { RxDBProvider, useRxDB };
```

## Hooks API

`@aiao/rxdb-react` 提供了一系列响应式 Hooks，自动管理订阅生命周期。

### RxDBResource 接口

所有 Hooks 返回一个 `RxDBResource` 对象，包含以下属性：

```typescript
interface RxDBResource<T> {
  value: T; // 查询结果值
  error: Error | undefined; // 错误信息
  isLoading: boolean; // 加载状态
  isEmpty: boolean | undefined; // 是否为空
  hasValue: boolean; // 是否有值
}
```

### 基础查询 Hooks

#### useGet

根据 ID 获取单个实体：

```tsx
import { useGet } from '@aiao/rxdb-react';

function TodoDetail({ id }: { id: string }) {
  const { value: todo, isLoading, error } = useGet(Todo, { id });

  if (isLoading) return <div>加载中...</div>;
  if (error) return <div>错误: {error.message}</div>;
  if (!todo) return <div>未找到</div>;

  return <div>{todo.title}</div>;
}
```

#### useFindOne

查找符合条件的第一个实体：

```tsx
import { useFindOne } from '@aiao/rxdb-react';

function LatestTodoComponent() {
  const { value: todo, isLoading } = useFindOne(Todo, {
    where: { completed: false },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  });

  if (isLoading) return <div>加载中...</div>;
  return <div>{todo?.title || '没有未完成的待办'}</div>;
}
```

#### useFindOneOrFail

类似 `useFindOne`，但找不到时会抛出错误：

```tsx
import { useFindOneOrFail } from '@aiao/rxdb-react';

type TodoFilter = {
  completed?: boolean;
  title?: string;
};

function RequiredTodo({ filter }: { filter: TodoFilter }) {
  const { value: todo, error } = useFindOneOrFail(Todo, { where: filter });

  if (error) return <div>未找到匹配的待办事项</div>;
  return <div>{todo?.title}</div>;
}
```

#### useFind

查找多个符合条件的实体：

```tsx
import { useFind } from '@aiao/rxdb-react';

function TodoListComponent() {
  const {
    value: todos,
    isLoading,
    isEmpty
  } = useFind(Todo, {
    where: {
      combinator: 'and',
      rules: [{ field: 'completed', operator: '=', value: false }]
    },
    orderBy: [{ field: 'createdAt', sort: 'desc' }],
    limit: 20
  });

  if (isLoading) return <div>加载中...</div>;
  if (isEmpty) return <div>暂无待办事项</div>;

  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
}
```

#### useFindAll

查找所有实体：

```tsx
import { useFindAll } from '@aiao/rxdb-react';

function AllTodos() {
  const { value: todos, isLoading } = useFindAll(Todo, {
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  });

  if (isLoading) return <div>加载中...</div>;

  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
}
```

#### useCount

统计符合条件的实体数量：

```tsx
import { useCount } from '@aiao/rxdb-react';

function TodoStatsComponent() {
  const { value: totalCount } = useCount(Todo, {});
  const { value: completedCount } = useCount(Todo, {
    where: { completed: true }
  });
  const { value: pendingCount } = useCount(Todo, {
    where: { completed: false }
  });

  return (
    <div>
      <p>总计: {totalCount}</p>
      <p>已完成: {completedCount}</p>
      <p>未完成: {pendingCount}</p>
    </div>
  );
}
```

#### useFindByCursor

基于游标的分页查询，适合无限滚动与稳定翻页（不依赖 `offset`，而是以某条实体作为游标定位）：

```tsx
import { useFindByCursor } from '@aiao/rxdb-react';

function TodoPage({ after }: { after?: Todo }) {
  const { value: todos, isLoading } = useFindByCursor(Todo, {
    where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] },
    orderBy: [{ field: 'createdAt', sort: 'desc' }],
    after,
    limit: 20
  });

  if (isLoading) return <div>加载中...</div>;

  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
}
```

#### useRepositoryQuery

底层通用查询 hook：其他查询 hook（`useFind`、`useCount` 等）都构建于其上。当内建 hook 不能覆盖某个仓库方法时，用它直接驱动任意仓库查询方法并订阅结果：

```tsx
import { useRepositoryQuery } from '@aiao/rxdb-react';

function CustomQuery() {
  // 参数：实体、仓库方法名、默认值、查询选项
  const { value: todos, isLoading } = useRepositoryQuery<typeof Todo, unknown, Todo[]>(Todo, 'find', [], {
    where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] }
  });

  if (isLoading) return <div>加载中...</div>;

  return <span>{todos.length} 项</span>;
}
```

### 无限滚动

`useInfiniteScroll` 通过仓库的 `findByCursor` 加载页面，返回 `{ value, error, isLoading, isEmpty, hasMore, loadMore, refresh }`：

```tsx
import { useInfiniteScroll } from '@aiao/rxdb-react';

function TodoList() {
  const todos = useInfiniteScroll(Todo, {
    where: { combinator: 'and', rules: [] },
    orderBy: [
      { field: 'createdAt', sort: 'desc' },
      { field: 'id', sort: 'asc' }
    ],
    limit: 50
  });

  return (
    <div>
      <ul>
        {todos.value.map(todo => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
      {todos.isLoading && <spinner />}
      {todos.isEmpty && <empty-state />}
      {todos.hasMore && <button onClick={() => todos.loadMore()}>加载更多</button>}
    </div>
  );
}
```

`loadMore()` 在加载中或没有下一页时不会重复请求。`refresh()` 会取消现有页面订阅并从第一页重新加载。

### 树结构 Hooks

用于查询树形结构的实体（使用 `@TreeEntity` 定义）。

#### useFindDescendants

查找所有后代节点：

```tsx
import { useFindDescendants } from '@aiao/rxdb-react';

function MenuTree({ rootId }: { rootId: string }) {
  const { value: descendants, isLoading } = useFindDescendants(Menu, {
    id: rootId,
    depth: 3 // 查询深度
  });

  if (isLoading) return <div>加载中...</div>;

  return (
    <ul>
      {descendants.map(item => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

#### useCountDescendants

统计后代节点数量：

```tsx
import { useCountDescendants } from '@aiao/rxdb-react';

function MenuItemCount({ id }: { id: string }) {
  const { value: count } = useCountDescendants(Menu, { id });
  return <span>子项数量: {count}</span>;
}
```

#### useFindAncestors

查找所有祖先节点：

```tsx
import { useFindAncestors } from '@aiao/rxdb-react';

function Breadcrumb({ currentId }: { currentId: string }) {
  const { value: ancestors } = useFindAncestors(Menu, { id: currentId });

  return (
    <nav>
      {ancestors.map((item, index) => (
        <span key={item.id}>
          {index > 0 && ' > '}
          {item.name}
        </span>
      ))}
    </nav>
  );
}
```

#### useCountAncestors

统计祖先节点数量：

```tsx
import { useCountAncestors } from '@aiao/rxdb-react';

function MenuLevel({ id }: { id: string }) {
  const { value: level } = useCountAncestors(Menu, { id });
  return <span>层级: {level}</span>;
}
```

### 图结构 Hooks

用于查询图形结构的实体（使用 `@GraphEntity` 定义）。

#### useGraphNeighbors

查找图结构中的邻接节点：

```tsx
import { useGraphNeighbors } from '@aiao/rxdb-react';

function FriendsList({ userId }: { userId: string }) {
  const {
    value: neighbors,
    isLoading,
    isEmpty
  } = useGraphNeighbors(UserNode, {
    entityId: userId,
    level: 2, // 查询 2 跳邻居
    direction: 'both' // 双向查询
  });

  if (isLoading) return <div>加载中...</div>;
  if (isEmpty) return <div>暂无好友</div>;

  return (
    <ul>
      {neighbors.map(neighbor => (
        <li key={neighbor.node.id}>
          {neighbor.node.name} (距离: {neighbor.level})
        </li>
      ))}
    </ul>
  );
}
```

#### useCountNeighbors

统计邻接节点数量：

```tsx
import { useCountNeighbors } from '@aiao/rxdb-react';

function FriendCount({ id }: { id: string }) {
  const { value: count } = useCountNeighbors(UserNode, {
    entityId: id,
    level: 1,
    direction: 'out'
  });

  return <span>好友数量: {count}</span>;
}
```

#### useGraphPaths

查找图结构中两个节点之间的路径：

```tsx
import { useGraphPaths } from '@aiao/rxdb-react';

function ConnectionPaths({ fromId, toId }: { fromId: string; toId: string }) {
  const {
    value: paths,
    isLoading,
    isEmpty
  } = useGraphPaths(UserNode, {
    fromId,
    toId,
    maxDepth: 5,
    direction: 'both'
  });

  if (isLoading) return <div>查找路径中...</div>;
  if (isEmpty) return <div>没有找到连接路径</div>;

  return (
    <div>
      <h3>找到 {paths.length} 条路径</h3>
      {paths.map((path, index) => (
        <div key={index} className="path">
          <span>路径长度: {path.nodes.length}</span>
          <span>总权重: {path.totalWeight}</span>
          <div>
            {path.nodes.map((node, i) => (
              <span key={node.id}>
                {i > 0 && ' → '}
                {node.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

## 动态选项

所有 Hooks 都支持函数式选项，可以动态计算查询参数：

```tsx
function DynamicTodoList({ filter }: { filter: string }) {
  const { value: todos } = useFind(Todo, () => ({
    where: {
      combinator: 'and',
      rules: [{ field: 'title', operator: 'like', value: `%${filter}%` }]
    }
  }));

  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
}
```

当 `filter` 变化时，Hook 会自动重新订阅并更新数据。

## 响应式更新

所有 Hooks 都基于 RxJS 实现响应式更新。当数据库中的数据变化时，组件会自动重新渲染：

```tsx
function LiveTodoList() {
  // 数据变化时自动更新
  const { value: todos } = useFind(Todo, {
    where: { completed: false }
  });

  const handleComplete = async (todo: Todo) => {
    todo.completed = true;
    await todo.save();
    // 列表会自动更新
  };

  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>
          {todo.title}
          <button onClick={() => handleComplete(todo)}>完成</button>
        </li>
      ))}
    </ul>
  );
}
```

## 完整示例

```tsx
import React, { useState } from 'react';
import { RxDBProvider, useFind, useCount } from '@aiao/rxdb-react';
import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from './entities/Todo';

// 初始化数据库
const rxdb = new RxDB({
  dbName: 'todo-app',
  entities: [Todo],
  sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
});

function TodoApp() {
  const [filter, setFilter] = useState('all');

  const { value: todos, isLoading } = useFind(Todo, () => ({
    where: filter === 'all' ? undefined : { completed: filter === 'completed' },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  }));

  const { value: totalCount } = useCount(Todo, {});
  const { value: activeCount } = useCount(Todo, {
    where: { completed: false }
  });

  const handleAdd = async (title: string) => {
    const todo = new Todo();
    todo.title = title;
    await todo.save();
  };

  const handleToggle = async (todo: Todo) => {
    todo.completed = !todo.completed;
    await todo.save();
  };

  const handleDelete = async (todo: Todo) => {
    await todo.remove();
  };

  if (isLoading) return <div>加载中...</div>;

  return (
    <div>
      <h1>
        待办事项 ({activeCount}/{totalCount})
      </h1>

      <div>
        <button onClick={() => setFilter('all')}>全部</button>
        <button onClick={() => setFilter('active')}>未完成</button>
        <button onClick={() => setFilter('completed')}>已完成</button>
      </div>

      <ul>
        {todos.map(todo => (
          <li key={todo.id}>
            <input type="checkbox" checked={todo.completed} onChange={() => handleToggle(todo)} />
            <span
              style={{
                textDecoration: todo.completed ? 'line-through' : 'none'
              }}
            >
              {todo.title}
            </span>
            <button onClick={() => handleDelete(todo)}>删除</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function App() {
  return (
    <RxDBProvider db={rxdb}>
      <TodoApp />
    </RxDBProvider>
  );
}

export default App;
```

## 类型安全

所有 Hooks 都是完全类型安全的，TypeScript 会自动推断实体类型和查询选项：

```tsx
// TypeScript 会自动推断 todo 的类型为 Todo | undefined
const { value: todo } = useGet(Todo, { id: '123' });

// TypeScript 会验证查询选项的有效性
const { value: todos } = useFind(Todo, {
  where: {
    combinator: 'and',
    rules: [
      { field: 'title', operator: 'like', value: '%test%' },
      { field: 'completed', operator: '=', value: true }
    ]
  },
  // TypeScript 会提示可用的字段和操作符
  orderBy: [{ field: 'createdAt', sort: 'desc' }]
});
```

## 性能优化

### 避免不必要的重新订阅

使用 `useMemo` 或 `useCallback` 来缓存查询选项：

```tsx
import { useMemo } from 'react';

function OptimizedTodoList({ filter }: { filter: string }) {
  const options = useMemo(
    () => ({
      where: {
        combinator: 'and',
        rules: [{ field: 'title', operator: 'like', value: `%${filter}%` }]
      }
    }),
    [filter]
  );

  const { value: todos } = useFind(Todo, options);

  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>{todo.title}</li>
      ))}
    </ul>
  );
}
```

### 分页加载

对于大量数据，使用分页查询：

```tsx
function PaginatedTodoList() {
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { value: todos } = useFind(Todo, {
    limit: pageSize,
    offset: page * pageSize,
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  });

  return (
    <div>
      <ul>
        {todos.map(todo => (
          <li key={todo.id}>{todo.title}</li>
        ))}
      </ul>
      <button onClick={() => setPage(p => Math.max(0, p - 1))}>上一页</button>
      <button onClick={() => setPage(p => p + 1)}>下一页</button>
    </div>
  );
}
```

## 注意事项

1. **生命周期管理**：Hooks 会自动管理订阅的生命周期，在组件卸载时自动取消订阅
2. **错误处理**：始终检查 `error` 属性来处理查询错误
3. **加载状态**：使用 `isLoading` 来显示加载状态，提供更好的用户体验
4. **空状态**：使用 `isEmpty` 来判断查询结果是否为空
5. **性能考虑**：避免在 render 函数中创建新的选项对象，使用 `useMemo` 或函数式选项

## 参考

- [模型定义](../model-definition/)
- [模型查询 - findOne](../model-query/findOne.md)
- [模型查询 - find](../model-query/find.md)
- [客户端生成](../client-generator.md)
