# 快速开始

本页带你跑通 RxDB 的最小本地数据链路。

第一次接触时，先完成 **模型定义 → 本地数据库 → 查询 → 写入 → UI 绑定**。确认这条主线符合项目需求后，再继续评估同步、分支与协作能力。

## 跑通后你会确认

- 浏览器内真实的关系型数据库能力
- 响应式查询与写入链路
- 类型安全的实体模型
- Angular / React / Vue 三套对等接口

## 想先看现成应用

仓库内提供三套可运行演示，任选一个启动：

```bash
pnpm nx serve dev-rxdb-angular
pnpm nx serve dev-rxdb-react
pnpm nx serve dev-rxdb-vue
```

如需从最小代码开始，请继续阅读。

## 安装

### 核心包

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite
```

### 框架集成（按需）

```bash npm2yarn
# React
npm install @aiao/rxdb-react

# Vue 3
npm install @aiao/rxdb-vue

# Angular
npm install @aiao/rxdb-angular
```

完整的环境要求、WASM 路径与 Vite 配置详见 [安装与初始化](./install.md)。

## 最小可运行示例

### 1. 定义数据模型

```typescript
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false },
    { name: 'createdAt', type: PropertyType.date }
  ]
})
export class Todo extends EntityBase {}
```

模型定义完成后，查询、写入与类型推断都围绕它展开。

### 2. 初始化数据库

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { checkOPFSAvailable } from '@aiao/utils';

const rxdb = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
});

rxdb.adapter('wa-sqlite', async db => {
  const available = await checkOPFSAvailable();

  return new RxDBAdapterWaSqlite(db, {
    vfs: available ? 'OPFSCoopSyncVFS' : 'IDBBatchAtomicVFS',
    worker: available,
    workerInstance: available ? new Worker(new URL('./sqlite.worker', import.meta.url), { type: 'module' }) : undefined,
    sharedWorker: !available,
    sharedWorkerInstance:
      !available ? new SharedWorker(new URL('./sqlite-shared.worker', import.meta.url), { type: 'module' }) : undefined,
    wasmPath: available ? '/wa-sqlite/wa-sqlite.wasm' : '/wa-sqlite/wa-sqlite-async.wasm'
  });
});

await rxdb.connect('wa-sqlite');
```

以上配置会根据浏览器能力选择 VFS 与 Worker 方案，并在支持时优先使用 OPFS。

### 3. 读写数据

```typescript
import { firstValueFrom } from 'rxjs';

// 创建
const todo = new Todo();
todo.title = '完成 RxDB 文档';
todo.createdAt = new Date();
await todo.save();

// 查询
const todos = await firstValueFrom(
  Todo.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'completed', operator: '=', value: false }]
    },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  })
);

// 更新
todo.completed = true;
await todo.save();

// 删除
await todo.remove();
```

### 4. 订阅数据变化

`Todo.find()` 返回的是响应式 `Observable`：数据一变，查询结果就可能跟着变（详见[响应式查询](../model-query/query-realtime.md)）。连接状态则由 `rxdb.connected$` 提供——它是全实例聚合信号，任意一个适配器连上即为 `true`。等待数据库连上后再订阅查询，是典型的最小响应式链路：

```typescript
import { Subscription, filter, first, switchMap } from 'rxjs';

const subscription: Subscription = rxdb.connected$
  .pipe(
    filter(Boolean),
    first(),
    switchMap(() =>
      Todo.find({
        where: {
          combinator: 'and',
          rules: [{ field: 'completed', operator: '=', value: false }]
        }
      })
    )
  )
  .subscribe({
    next: todos => console.log('未完成的待办：', todos),
    error: err => console.error('查询错误：', err)
  });

// 记得在卸载时取消
subscription.unsubscribe();
```

除了 `connected$`，`rxdb.localAdapter$` 与 `rxdb.remoteAdapter$` 分别发射当前生效的本地 / 远端适配器实例，可供需要感知适配器生命周期的代码订阅。

至此，本地读写与响应式查询链路已经完成。下一步是把 Observable 接入界面。

## 接到 UI 框架

三个框架共享模型与查询语义，差异集中在各自的 UI 绑定 API。

### React

```tsx
import { RxDBProvider, useFind } from '@aiao/rxdb-react';

function App() {
  return (
    <RxDBProvider db={rxdb}>
      <TodoList />
    </RxDBProvider>
  );
}

function TodoList() {
  const {
    value: todos,
    isLoading,
    isEmpty
  } = useFind(Todo, {
    where: {
      combinator: 'and',
      rules: [{ field: 'completed', operator: '=', value: false }]
    },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  });

  if (isLoading) return <div>加载中…</div>;
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

完整接入见 [React 集成 →](../frameworks/react.md)

### Vue

```vue
<script lang="ts" setup>
import { useFind } from '@aiao/rxdb-vue';

const {
  value: todos,
  isLoading,
  isEmpty
} = useFind(Todo, {
  where: {
    combinator: 'and',
    rules: [{ field: 'completed', operator: '=', value: false }]
  },
  orderBy: [{ field: 'createdAt', sort: 'desc' }]
});
</script>

<template>
  <div v-if="isLoading">加载中…</div>
  <div v-else-if="isEmpty">暂无待办事项</div>
  <ul v-else>
    <li v-for="todo in todos" :key="todo.id">{{ todo.title }}</li>
  </ul>
</template>
```

完整接入见 [Vue 集成 →](../frameworks/vue.md)

### Angular

```typescript
import { Component } from '@angular/core';
import { provideRxDB, useFind } from '@aiao/rxdb-angular';

@Component({
  selector: 'app-todo-list',
  standalone: true,
  template: `
    @if (isLoading()) {
      <div>加载中…</div>
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
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  });

  todos = this.resource.value;
  isLoading = this.resource.isLoading;
  isEmpty = this.resource.isEmpty;
}
```

完整接入见 [Angular 集成 →](../frameworks/angular.md)

## 下一步

建议按以下顺序阅读，先理解数据层主线，再选择框架绑定与数据库适配器：

1. [安装与初始化](./install.md) — 环境要求、WASM 路径、Vite 配置
2. [模型定义](../model-definition/README.md) — 字段、关系、索引与级联
3. [模型查询](../model-query/README.md) — 从基础查询到树形、图形与实时订阅
4. [模型修改](../model-mutation/README.md) — 创建、更新、删除与事务
5. [框架集成](../frameworks/README.md) — Angular / React / Vue 的绑定细节
6. [数据库适配器](../adapters/README.md) — SQLite、PGlite、Supabase 的选型
7. [数据协作](../collaboration/README.md) — 分支、撤销重做、同步（可选）

名字撞车的说明见[与 rxdb.info 的区别](./compare.md)：本项目与 npm 上的 `rxdb` 无关。8. [客户端代码生成](../client-generator.md) — 从模型自动产出类型安全的辅助代码
