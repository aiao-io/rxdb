# Angular 集成

`@aiao/rxdb-angular` 提供了 Angular 集成，包括服务注入、响应式信号 (Signals) 和指令，让你在 Angular 应用中轻松使用 RxDB。

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-angular
```

## 核心概念

### 提供 RxDB 实例

使用 `provideRxDB` 在应用或模块级别提供 RxDB 实例。参数是**工厂函数**（不是实例），工厂在注入上下文中执行：

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRxDB } from '@aiao/rxdb-angular';
import { RxDB, SyncType } from '@aiao/rxdb';
import { Todo } from './entities/Todo';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRxDB(() => {
      const rxdb = new RxDB({
        dbName: 'myapp',
        entities: [Todo],
        sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
      });
      return rxdb;
    })
  ]
};
```

组件里用 `inject(RxDB)` 取同一个实例；`useGet` / `useFind` 会自己注入，不必再包一层服务。

## Hooks API

`@aiao/rxdb-angular` 提供了一系列基于 Angular Signals 的响应式 Hooks。

### RxDBResource 接口

所有 Hooks 返回一个 `RxDBResource` 对象，包含以下信号：

```typescript
interface RxDBResource<T> {
  value: Signal<T>; // 查询结果值
  error: Signal<Error | undefined>; // 错误信息
  isLoading: Signal<boolean>; // 加载状态
  isEmpty: Signal<boolean | undefined>; // 是否为空
  hasValue: Signal<boolean>; // 是否有值
}
```

### 基础查询 Hooks

#### useGet

根据 ID 获取单个实体：

```typescript
import { Component, input } from '@angular/core';
import { useGet } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

@Component({
  selector: 'app-todo-detail',
  template: `
    @if (isLoading()) {
      <div>加载中...</div>
    } @else if (error()) {
      <div>错误: {{ error()?.message }}</div>
    } @else if (!todo()) {
      <div>未找到</div>
    } @else {
      <div>{{ todo()?.title }}</div>
    }
  `
})
export class TodoDetailComponent {
  id = input.required<string>();

  private resource = useGet(Todo, () => ({ id: this.id() }));

  todo = this.resource.value;
  isLoading = this.resource.isLoading;
  error = this.resource.error;
}
```

#### useFindOne

查找符合条件的第一个实体：

```typescript
import { Component, input } from '@angular/core';
import { useFindOne } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

@Component({
  selector: 'app-latest-todo',
  template: `
    @if (isLoading()) {
      <div>加载中...</div>
    } @else {
      <div>{{ todo()?.title || '没有未完成的待办' }}</div>
    }
  `
})
export class LatestTodoComponent {
  private resource = useFindOne(Todo, {
    where: { completed: false },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  });

  todo = this.resource.value;
  isLoading = this.resource.isLoading;
}
```

#### useFindOneOrFail

类似 `useFindOne`，但找不到时会抛出错误：

```typescript
import { Component, input } from '@angular/core';
import { useFindOneOrFail } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

@Component({
  selector: 'app-required-todo',
  template: `
    @if (error()) {
      <div>未找到匹配的待办事项</div>
    } @else {
      <div>{{ todo()?.title }}</div>
    }
  `
})
export class RequiredTodoComponent {
  filter = input.required<any>();

  private resource = useFindOneOrFail(Todo, () => ({
    where: this.filter()
  }));

  todo = this.resource.value;
  error = this.resource.error;
}
```

#### useFind

查找多个符合条件的实体：

```typescript
import { Component, input } from '@angular/core';
import { useFind } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

@Component({
  selector: 'app-todo-list',
  template: `
    @if (isLoading()) {
      <div>加载中...</div>
    } @else if (isEmpty()) {
      <div>暂无待办事项</div>
    } @else {
      <ul>
        @for (todo of todos(); track todo.id) {
          <li>{{ todo.title }}</li>
        }
      </ul>
    }
  `
})
export class TodoListComponent {
  private resource = useFind(Todo, {
    where: {
      combinator: 'and',
      rules: [{ field: 'completed', operator: '=', value: false }]
    },
    orderBy: [{ field: 'createdAt', sort: 'desc' }],
    limit: 20
  });

  todos = this.resource.value;
  isLoading = this.resource.isLoading;
  isEmpty = this.resource.isEmpty;
}
```

#### useFindAll

查找所有实体：

```typescript
import { Component, input } from '@angular/core';
import { useFindAll } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

@Component({
  selector: 'app-all-todos',
  template: `
    @if (isLoading()) {
      <div>加载中...</div>
    } @else {
      <ul>
        @for (todo of todos(); track todo.id) {
          <li>{{ todo.title }}</li>
        }
      </ul>
    }
  `
})
export class AllTodosComponent {
  private resource = useFindAll(Todo, {
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  });

  todos = this.resource.value;
  isLoading = this.resource.isLoading;
}
```

#### useCount

统计符合条件的实体数量：

```typescript
import { Component, input } from '@angular/core';
import { useCount } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

@Component({
  selector: 'app-todo-stats',
  template: `
    <div>
      <p>总计: {{ totalCount() }}</p>
      <p>已完成: {{ completedCount() }}</p>
      <p>未完成: {{ pendingCount() }}</p>
    </div>
  `
})
export class TodoStatsComponent {
  totalCount = useCount(Todo, {}).value;
  completedCount = useCount(Todo, { where: { completed: true } }).value;
  pendingCount = useCount(Todo, { where: { completed: false } }).value;
}
```

#### useFindByCursor

基于游标的分页查询，适合无限滚动与稳定翻页（不依赖 `offset`，而是以某条实体作为游标定位）：

```typescript
import { Component, input } from '@angular/core';
import { useFindByCursor } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

@Component({
  selector: 'app-todo-page',
  template: `
    @if (isLoading()) {
      <div>加载中...</div>
    } @else {
      <ul>
        @for (todo of todos(); track todo.id) {
          <li>{{ todo.title }}</li>
        }
      </ul>
    }
  `
})
export class TodoPageComponent {
  after = input<Todo>();

  private resource = useFindByCursor(Todo, () => ({
    where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] },
    orderBy: [{ field: 'createdAt', sort: 'desc' }],
    after: this.after(),
    limit: 20
  }));

  todos = this.resource.value;
  isLoading = this.resource.isLoading;
}
```

#### useRepositoryQuery

底层通用查询 hook：其他查询 hook（`useFind`、`useCount` 等）都构建于其上。当内建 hook 不能覆盖某个仓库方法时，用它直接驱动任意仓库查询方法并订阅结果：

```typescript
import { Component } from '@angular/core';
import { useRepositoryQuery } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

@Component({
  selector: 'app-custom-query',
  template: `<span>{{ todos().length }} 项</span>`
})
export class CustomQueryComponent {
  // 参数：实体、仓库方法名、默认值、查询选项
  todos = useRepositoryQuery<typeof Todo, unknown, Todo[]>(Todo, 'find', [], {
    where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] }
  }).value;
}
```

### 无限滚动

`useInfiniteScroll` 通过仓库的 `findByCursor` 加载页面，返回 signal 资源（与 React / Vue 同名同形），随注入上下文自动释放：

```typescript
import { Component } from '@angular/core';
import { useInfiniteScroll } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

@Component({
  selector: 'app-todo-list',
  template: `
    @for (todo of todos.value(); track todo.id) {
      <li>{{ todo.title }}</li>
    }
    @if (todos.isLoading()) {
      <spinner />
    }
    @if (todos.isEmpty()) {
      <empty-state />
    }
    @if (todos.hasMore()) {
      <button (click)="todos.loadMore()">加载更多</button>
    }
  `
})
export class TodoListComponent {
  readonly todos = useInfiniteScroll(Todo, {
    where: { combinator: 'and', rules: [] },
    orderBy: [
      { field: 'createdAt', sort: 'desc' },
      { field: 'id', sort: 'asc' }
    ],
    limit: 50
  });
}
```

`loadMore()` 在加载中或没有下一页时不会重复请求。`refresh()` 会取消现有页面订阅并从第一页重新加载。

### 树结构 Hooks

用于查询树形结构的实体（使用 `@TreeEntity` 定义）。

#### useFindDescendants

查找所有后代节点：

```typescript
import { Component, input } from '@angular/core';
import { useFindDescendants } from '@aiao/rxdb-angular';
import { Menu } from './entities/Menu';

@Component({
  selector: 'app-menu-tree',
  template: `
    @if (isLoading()) {
      <div>加载中...</div>
    } @else {
      <ul>
        @for (item of descendants(); track item.id) {
          <li>{{ item.name }}</li>
        }
      </ul>
    }
  `
})
export class MenuTreeComponent {
  rootId = input.required<string>();

  private resource = useFindDescendants(Menu, () => ({
    id: this.rootId(),
    depth: 3
  }));

  descendants = this.resource.value;
  isLoading = this.resource.isLoading;
}
```

#### useCountDescendants

统计后代节点数量：

```typescript
import { Component, input } from '@angular/core';
import { useCountDescendants } from '@aiao/rxdb-angular';
import { Menu } from './entities/Menu';

@Component({
  selector: 'app-menu-item-count',
  template: `<span>子项数量: {{ count() }}</span>`
})
export class MenuItemCountComponent {
  id = input.required<string>();

  count = useCountDescendants(Menu, () => ({ id: this.id() })).value;
}
```

#### useFindAncestors

查找所有祖先节点：

```typescript
import { Component, input } from '@angular/core';
import { useFindAncestors } from '@aiao/rxdb-angular';
import { Menu } from './entities/Menu';

@Component({
  selector: 'app-breadcrumb',
  template: `
    <nav>
      @for (item of ancestors(); track item.id; let i = $index) {
        @if (i > 0) {
          >
        }
        <span>{{ item.name }}</span>
      }
    </nav>
  `
})
export class BreadcrumbComponent {
  currentId = input.required<string>();

  ancestors = useFindAncestors(Menu, () => ({
    id: this.currentId()
  })).value;
}
```

#### useCountAncestors

统计祖先节点数量：

```typescript
import { Component, input } from '@angular/core';
import { useCountAncestors } from '@aiao/rxdb-angular';
import { Menu } from './entities/Menu';

@Component({
  selector: 'app-menu-level',
  template: `<span>层级: {{ level() }}</span>`
})
export class MenuLevelComponent {
  id = input.required<string>();

  level = useCountAncestors(Menu, () => ({ id: this.id() })).value;
}
```

### 图结构 Hooks

用于查询图形结构的实体（使用 `@GraphEntity` 定义）。

#### useGraphNeighbors

查找图结构中的邻接节点：

```typescript
import { Component, input } from '@angular/core';
import { useGraphNeighbors } from '@aiao/rxdb-angular';
import { UserNode } from './entities/UserNode';

@Component({
  selector: 'app-friends-list',
  template: `
    @if (isLoading()) {
      <div>加载中...</div>
    } @else {
      <ul>
        @for (neighbor of neighbors(); track neighbor.node.id) {
          <li>{{ neighbor.node.name }} (距离: {{ neighbor.level }})</li>
        }
      </ul>
    }
  `
})
export class FriendsListComponent {
  userId = input.required<string>();

  private resource = useGraphNeighbors(UserNode, () => ({
    entityId: this.userId(),
    level: 2, // 查询 2 跳邻居
    direction: 'both' // 双向查询
  }));

  neighbors = this.resource.value;
  isLoading = this.resource.isLoading;
}
```

#### useCountNeighbors

统计邻接节点数量：

```typescript
import { Component, input } from '@angular/core';
import { useCountNeighbors } from '@aiao/rxdb-angular';
import { UserNode } from './entities/UserNode';

@Component({
  selector: 'app-friend-count',
  template: `<span>好友数量: {{ count() }}</span>`
})
export class FriendCountComponent {
  id = input.required<string>();

  count = useCountNeighbors(UserNode, () => ({
    entityId: this.id(),
    level: 1,
    direction: 'out'
  })).value;
}
```

#### useGraphPaths

查找图结构中两个节点之间的路径：

```typescript
import { Component, input } from '@angular/core';
import { useGraphPaths } from '@aiao/rxdb-angular';
import { UserNode } from './entities/UserNode';

@Component({
  selector: 'app-connection-paths',
  template: `
    @if (isLoading()) {
      <div>查找路径中...</div>
    } @else if (isEmpty()) {
      <div>没有找到连接路径</div>
    } @else {
      <div>
        <h3>找到 {{ paths().length }} 条路径</h3>
        @for (path of paths(); track $index) {
          <div class="path">
            <span>路径长度: {{ path.nodes.length }}</span>
            <span>总权重: {{ path.totalWeight }}</span>
            <div>
              @for (node of path.nodes; track node.id; let i = $index) {
                @if (i > 0) {
                  →
                }
                {{ node.name }}
              }
            </div>
          </div>
        }
      </div>
    }
  `
})
export class ConnectionPathsComponent {
  fromId = input.required<string>();
  toId = input.required<string>();

  private resource = useGraphPaths(UserNode, () => ({
    fromId: this.fromId(),
    toId: this.toId(),
    maxDepth: 5,
    direction: 'both'
  }));

  paths = this.resource.value;
  isLoading = this.resource.isLoading;
  isEmpty = this.resource.isEmpty;
}
```

## 动态选项

所有 Hooks 都支持函数式选项，可以基于信号动态计算查询参数：

```typescript
import { Component, signal } from '@angular/core';
import { useFind } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

@Component({
  selector: 'app-dynamic-todo-list',
  template: `
    <input [value]="filter()" (input)="filter.set($any($event.target).value)" />
    <ul>
      @for (todo of todos(); track todo.id) {
        <li>{{ todo.title }}</li>
      }
    </ul>
  `
})
export class DynamicTodoListComponent {
  filter = signal('');

  private resource = useFind(Todo, () => ({
    where: {
      combinator: 'and',
      rules: [{ field: 'title', operator: 'like', value: `%${this.filter()}%` }]
    }
  }));

  todos = this.resource.value;
}
```

当 `filter` 信号变化时，Hook 会自动重新订阅并更新数据。

## 变更检测指令

`RxDBEntityChangeDirective` 可以自动触发变更检测：

```typescript
import { Component, input } from '@angular/core';
import { RxDBEntityChangeDirective } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

@Component({
  selector: 'app-todo-item',
  standalone: true,
  imports: [RxDBEntityChangeDirective],
  template: `
    <div [rxdbEntityChange]="todo">
      <h3>{{ todo.title }}</h3>
      <p>完成状态: {{ todo.completed }}</p>
    </div>
  `
})
export class TodoItemComponent {
  todo = input.required<Todo>();
}
```

当实体数据变化时，指令会自动触发 Angular 的变更检测。

## 完整示例

```typescript
import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { useFind, useCount } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

type FilterType = 'all' | 'active' | 'completed';

@Component({
  selector: 'app-todo-app',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="todo-app">
      <h1>待办事项 ({{ activeCount() }}/{{ totalCount() }})</h1>

      <div class="todo-input">
        <input [(ngModel)]="newTodoTitle" (keyup.enter)="handleAdd()" placeholder="添加新待办..." />
        <button (click)="handleAdd()">添加</button>
      </div>

      <div class="filters">
        <button [class.active]="filter() === 'all'" (click)="filter.set('all')">全部</button>
        <button [class.active]="filter() === 'active'" (click)="filter.set('active')">未完成</button>
        <button [class.active]="filter() === 'completed'" (click)="filter.set('completed')">已完成</button>
      </div>

      @if (isLoading()) {
        <div>加载中...</div>
      } @else {
        <ul class="todo-list">
          @for (todo of todos(); track todo.id) {
            <li class="todo-item">
              <input [checked]="todo.completed" (change)="handleToggle(todo)" type="checkbox" />
              <span [class.completed]="todo.completed">
                {{ todo.title }}
              </span>
              <button (click)="handleDelete(todo)">删除</button>
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [
    `
      .todo-app {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }

      .todo-input {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
      }

      .todo-input input {
        flex: 1;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }

      .filters {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
      }

      .filters button {
        padding: 8px 16px;
        border: 1px solid #ddd;
        background: white;
        border-radius: 4px;
        cursor: pointer;
      }

      .filters button.active {
        background: #007bff;
        color: white;
        border-color: #007bff;
      }

      .todo-list {
        list-style: none;
        padding: 0;
      }

      .todo-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px;
        border-bottom: 1px solid #eee;
      }

      .todo-item span {
        flex: 1;
      }

      .todo-item span.completed {
        text-decoration: line-through;
        color: #999;
      }

      .todo-item button {
        padding: 4px 8px;
        background: #dc3545;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
      }
    `
  ]
})
export class TodoAppComponent {
  filter = signal<FilterType>('all');
  newTodoTitle = '';

  private todosResource = useFind(Todo, () => ({
    where: this.filter() === 'all' ? undefined : { completed: this.filter() === 'completed' },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  }));

  todos = this.todosResource.value;
  isLoading = this.todosResource.isLoading;

  totalCount = useCount(Todo, {}).value;
  activeCount = useCount(Todo, { where: { completed: false } }).value;

  async handleAdd() {
    if (!this.newTodoTitle.trim()) return;

    const todo = new Todo();
    todo.title = this.newTodoTitle;
    await todo.save();

    this.newTodoTitle = '';
  }

  async handleToggle(todo: Todo) {
    todo.completed = !todo.completed;
    await todo.save();
  }

  async handleDelete(todo: Todo) {
    await todo.remove();
  }
}
```

## 类型安全

所有 Hooks 都是完全类型安全的，TypeScript 会自动推断实体类型和查询选项：

```typescript
// TypeScript 会自动推断 todo 的类型为 Signal<Todo | undefined>
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

### 使用 computed 优化查询选项

```typescript
import { Component, signal, computed } from '@angular/core';
import { useFind } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

@Component({
  selector: 'app-optimized-list',
  template: `...`
})
export class OptimizedListComponent {
  filter = signal('');

  private options = computed(() => ({
    where: {
      combinator: 'and',
      rules: [{ field: 'title', operator: 'like', value: `%${this.filter()}%` }]
    }
  }));

  private resource = useFind(Todo, this.options);
  todos = this.resource.value;
}
```

### OnPush 变更检测策略

与 Signals 配合使用 OnPush 策略以获得最佳性能：

```typescript
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { useFind } from '@aiao/rxdb-angular';
import { Todo } from './entities/Todo';

@Component({
  selector: 'app-todo-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (todo of todos(); track todo.id) {
      <div>{{ todo.title }}</div>
    }
  `
})
export class TodoListComponent {
  todos = useFind(Todo, {
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  }).value;
}
```

## 注意事项

1. **生命周期管理**：Hooks 会自动管理订阅的生命周期，在组件销毁时自动取消订阅
2. **Signals 响应式**：所有返回的属性都是 Angular Signals，可以直接在模板中使用
3. **错误处理**：始终检查 `error()` 信号来处理查询错误
4. **加载状态**：使用 `isLoading()` 来显示加载状态
5. **空状态**：使用 `isEmpty()` 来判断查询结果是否为空
6. **变更检测**：使用 OnPush 策略和 Signals 可以获得最佳性能
7. **函数式选项**：使用函数式选项或 `computed` 来创建动态查询

## 参考

- [模型定义](../model-definition/)
- [模型查询 - findOne](../model-query/findOne.md)
- [模型查询 - find](../model-query/find.md)
- [客户端生成](../client-generator.md)
