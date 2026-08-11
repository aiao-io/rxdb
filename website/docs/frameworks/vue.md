# Vue 集成

`@aiao/rxdb-vue` 提供了 Vue 3 集成，包括一系列响应式 Composables，让你在 Vue 应用中轻松使用 RxDB。

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-vue
```

## 核心概念

### 提供 RxDB 实例

使用 `provideRxDB` 将 RxDB 实例注入到 Vue 应用中：

```typescript
import { createApp } from 'vue';
import { provideRxDB } from '@aiao/rxdb-vue';
import { RxDB, SyncType } from '@aiao/rxdb';
import App from './App.vue';

// 创建 RxDB 实例
const rxdb = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { type: SyncType.None, local: { adapter: 'wa-sqlite' } }
});

const app = createApp(App);

// 提供 RxDB 实例
provideRxDB(rxdb);

app.mount('#app');
```

### 注入 RxDB 实例

在组件中使用 `injectRxDB` 获取 RxDB 实例：

```typescript
import { injectRxDB } from '@aiao/rxdb-vue';

export default {
  setup() {
    const rxdb = injectRxDB();
    // 使用 rxdb
  }
};
```

## Composables API

`@aiao/rxdb-vue` 提供了一系列响应式 Composables，自动管理订阅生命周期。

### RxDBResource 接口

所有 Composables 返回一个响应式的 `RxDBResource` 对象，包含以下属性：

```typescript
interface RxDBResource<T> {
  value: T; // 查询结果值
  error: Error | undefined; // 错误信息
  isLoading: boolean; // 加载状态
  isEmpty: boolean | undefined; // 是否为空
  hasValue: boolean; // 是否有值
}
```

所有属性都是响应式的，可以直接在模板中使用。

### 基础查询 Composables

#### useGet

根据 ID 获取单个实体：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useGet } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const props = defineProps<{ id: string }>();

const { value: todo, isLoading, error } = toRefs(useGet(Todo, { id: props.id }));
</script>

<template>
  <div v-if="isLoading">加载中...</div>
  <div v-else-if="error">错误: {{ error.message }}</div>
  <div v-else-if="!todo">未找到</div>
  <div v-else>{{ todo.title }}</div>
</template>
```

#### useFindOne

查找符合条件的第一个实体：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useFindOne } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const { value: todo, isLoading } = toRefs(
  useFindOne(Todo, {
    where: { completed: false },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  })
);
</script>

<template>
  <div v-if="isLoading">加载中...</div>
  <div v-else>{{ todo?.title || '没有未完成的待办' }}</div>
</template>
```

#### useFindOneOrFail

类似 `useFindOne`，但找不到时会抛出错误：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useFindOneOrFail } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const props = defineProps<{ filter: any }>();

const { value: todo, error } = toRefs(
  useFindOneOrFail(Todo, {
    where: props.filter
  })
);
</script>

<template>
  <div v-if="error">未找到匹配的待办事项</div>
  <div v-else>{{ todo?.title }}</div>
</template>
```

#### useFind

查找多个符合条件的实体：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useFind } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const {
  value: todos,
  isLoading,
  isEmpty
} = toRefs(
  useFind(Todo, {
    where: {
      combinator: 'and',
      rules: [{ field: 'completed', operator: '=', value: false }]
    },
    orderBy: [{ field: 'createdAt', sort: 'desc' }],
    limit: 20
  })
);
</script>

<template>
  <div v-if="isLoading">加载中...</div>
  <div v-else-if="isEmpty">暂无待办事项</div>
  <ul v-else>
    <li v-for="todo in todos" :key="todo.id">
      {{ todo.title }}
    </li>
  </ul>
</template>
```

#### useFindAll

查找所有实体：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useFindAll } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const { value: todos, isLoading } = toRefs(
  useFindAll(Todo, {
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  })
);
</script>

<template>
  <div v-if="isLoading">加载中...</div>
  <ul v-else>
    <li v-for="todo in todos" :key="todo.id">
      {{ todo.title }}
    </li>
  </ul>
</template>
```

#### useCount

统计符合条件的实体数量：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useCount } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const { value: totalCount } = toRefs(useCount(Todo, {}));
const { value: completedCount } = toRefs(
  useCount(Todo, {
    where: { completed: true }
  })
);
const { value: pendingCount } = toRefs(
  useCount(Todo, {
    where: { completed: false }
  })
);
</script>

<template>
  <div>
    <p>总计: {{ totalCount }}</p>
    <p>已完成: {{ completedCount }}</p>
    <p>未完成: {{ pendingCount }}</p>
  </div>
</template>
```

#### useFindByCursor

基于游标的分页查询，适合无限滚动与稳定翻页（不依赖 `offset`，而是以某条实体作为游标定位）：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useFindByCursor } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const props = defineProps<{ after?: Todo }>();

const { value: todos, isLoading } = toRefs(
  useFindByCursor(Todo, {
    where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] },
    orderBy: [{ field: 'createdAt', sort: 'desc' }],
    after: props.after,
    limit: 20
  })
);
</script>

<template>
  <div v-if="isLoading">加载中...</div>
  <ul v-else>
    <li v-for="todo in todos" :key="todo.id">{{ todo.title }}</li>
  </ul>
</template>
```

#### useRepositoryQuery

底层通用查询 composable：其他查询 composable（`useFind`、`useCount` 等）都构建于其上。当内建 composable 不能覆盖某个仓库方法时，用它直接驱动任意仓库查询方法并订阅结果：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useRepositoryQuery } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

// 参数：实体、仓库方法名、默认值、查询选项
const { value: todos } = toRefs(
  useRepositoryQuery<typeof Todo, unknown, Todo[]>(Todo, 'find', [], {
    where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] }
  })
);
</script>

<template>
  <span>{{ todos.length }} 项</span>
</template>
```

### 无限滚动

`useInfiniteScroll` 通过仓库的 `findByCursor` 加载页面，返回 `{ value, error, isLoading, isEmpty, hasMore, loadMore, refresh }`：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useInfiniteScroll } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const list = useInfiniteScroll(Todo, {
  where: { combinator: 'and', rules: [] },
  orderBy: [
    { field: 'createdAt', sort: 'desc' },
    { field: 'id', sort: 'desc' }
  ],
  limit: 50
});

const { value: todos, isLoading, isEmpty, hasMore } = toRefs(list);
</script>

<template>
  <ul>
    <li v-for="todo in todos" :key="todo.id">{{ todo.title }}</li>
  </ul>
  <spinner v-if="isLoading" />
  <empty-state v-if="isEmpty" />
  <button v-if="hasMore" @click="list.loadMore()">加载更多</button>
</template>
```

`loadMore()` 在加载中或没有下一页时不会重复请求。`refresh()` 会取消现有页面订阅并从第一页重新加载。

### 树结构 Composables

用于查询树形结构的实体（使用 `@TreeEntity` 定义）。

#### useFindDescendants

查找所有后代节点：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useFindDescendants } from '@aiao/rxdb-vue';
import { Menu } from './entities/Menu';

const props = defineProps<{ rootId: string }>();

const { value: descendants, isLoading } = toRefs(
  useFindDescendants(Menu, {
    id: props.rootId,
    depth: 3 // 查询深度
  })
);
</script>

<template>
  <div v-if="isLoading">加载中...</div>
  <ul v-else>
    <li v-for="item in descendants" :key="item.id">
      {{ item.name }}
    </li>
  </ul>
</template>
```

#### useCountDescendants

统计后代节点数量：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useCountDescendants } from '@aiao/rxdb-vue';
import { Menu } from './entities/Menu';

const props = defineProps<{ id: string }>();

const { value: count } = toRefs(useCountDescendants(Menu, { id: props.id }));
</script>

<template>
  <span>子项数量: {{ count }}</span>
</template>
```

#### useFindAncestors

查找所有祖先节点：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useFindAncestors } from '@aiao/rxdb-vue';
import { Menu } from './entities/Menu';

const props = defineProps<{ currentId: string }>();

const { value: ancestors } = toRefs(
  useFindAncestors(Menu, {
    id: props.currentId
  })
);
</script>

<template>
  <nav>
    <template v-for="(item, index) in ancestors" :key="item.id">
      <span v-if="index > 0"> > </span>
      <span>{{ item.name }}</span>
    </template>
  </nav>
</template>
```

#### useCountAncestors

统计祖先节点数量：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useCountAncestors } from '@aiao/rxdb-vue';
import { Menu } from './entities/Menu';

const props = defineProps<{ id: string }>();

const { value: level } = toRefs(useCountAncestors(Menu, { id: props.id }));
</script>

<template>
  <span>层级: {{ level }}</span>
</template>
```

### 图结构 Composables

用于查询图形结构的实体（使用 `@GraphEntity` 定义）。

#### useGraphNeighbors

查找图结构中的邻接节点：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useGraphNeighbors } from '@aiao/rxdb-vue';
import { UserNode } from './entities/UserNode';

const props = defineProps<{ userId: string }>();

const {
  value: neighbors,
  isLoading,
  isEmpty
} = toRefs(
  useGraphNeighbors(UserNode, () => ({
    entityId: props.userId,
    level: 2, // 查询 2 跳邻居
    direction: 'both' // 双向查询
  }))
);
</script>

<template>
  <div v-if="isLoading">加载中...</div>
  <div v-else-if="isEmpty">暂无好友</div>
  <ul v-else>
    <li v-for="neighbor in neighbors" :key="neighbor.node.id">{{ neighbor.node.name }} (距离: {{ neighbor.level }})</li>
  </ul>
</template>
```

#### useCountNeighbors

统计邻接节点数量：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useCountNeighbors } from '@aiao/rxdb-vue';
import { UserNode } from './entities/UserNode';

const props = defineProps<{ id: string }>();

const { value: count } = toRefs(
  useCountNeighbors(UserNode, {
    entityId: props.id,
    level: 1,
    direction: 'out'
  })
);
</script>

<template>
  <span>好友数量: {{ count }}</span>
</template>
```

#### useGraphPaths

查找图结构中两个节点之间的路径：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useGraphPaths } from '@aiao/rxdb-vue';
import { UserNode } from './entities/UserNode';

const props = defineProps<{ fromId: string; toId: string }>();

const {
  value: paths,
  isLoading,
  isEmpty
} = toRefs(
  useGraphPaths(UserNode, () => ({
    fromId: props.fromId,
    toId: props.toId,
    maxDepth: 5,
    direction: 'both'
  }))
);
</script>

<template>
  <div v-if="isLoading">查找路径中...</div>
  <div v-else-if="isEmpty">没有找到连接路径</div>
  <div v-else>
    <h3>找到 {{ paths.length }} 条路径</h3>
    <div class="path" v-for="(path, index) in paths" :key="index">
      <span>路径长度: {{ path.nodes.length }}</span>
      <span>总权重: {{ path.totalWeight }}</span>
      <div>
        <template v-for="(node, i) in path.nodes" :key="node.id">
          <span v-if="i > 0"> → </span>
          {{ node.name }}
        </template>
      </div>
    </div>
  </div>
</template>
```

## 动态选项

所有 Composables 都支持函数式选项，可以动态计算查询参数：

```vue
<script lang="ts" setup>
import { ref, computed, toRefs } from 'vue';
import { useFind } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const filter = ref('');

const { value: todos } = toRefs(
  useFind(Todo, () => ({
    where: {
      combinator: 'and',
      rules: [{ field: 'title', operator: 'like', value: `%${filter.value}%` }]
    }
  }))
);
</script>

<template>
  <input v-model="filter" placeholder="搜索..." />
  <ul>
    <li v-for="todo in todos" :key="todo.id">
      {{ todo.title }}
    </li>
  </ul>
</template>
```

当 `filter` 变化时，Composable 会自动重新订阅并更新数据。

## 响应式更新

所有 Composables 都基于 RxJS 实现响应式更新。当数据库中的数据变化时，Vue 组件会自动重新渲染：

```vue
<script lang="ts" setup>
import { toRefs } from 'vue';
import { useFind } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const { value: todos } = toRefs(
  useFind(Todo, {
    where: { completed: false }
  })
);

const handleComplete = async (todo: Todo) => {
  todo.completed = true;
  await todo.save();
  // 列表会自动更新
};

const handleDelete = async (todo: Todo) => {
  await todo.remove();
  // 列表会自动更新
};
</script>

<template>
  <ul>
    <li v-for="todo in todos" :key="todo.id">
      {{ todo.title }}
      <button @click="handleComplete(todo)">完成</button>
      <button @click="handleDelete(todo)">删除</button>
    </li>
  </ul>
</template>
```

## 完整示例

```vue
<script lang="ts" setup>
import { ref, toRefs } from 'vue';
import { useFind, useCount } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const filter = ref<'all' | 'active' | 'completed'>('all');
const newTodoTitle = ref('');

const { value: todos, isLoading } = toRefs(
  useFind(Todo, () => ({
    where: filter.value === 'all' ? undefined : { completed: filter.value === 'completed' },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  }))
);

const { value: totalCount } = toRefs(useCount(Todo, {}));
const { value: activeCount } = toRefs(
  useCount(Todo, {
    where: { completed: false }
  })
);

const handleAdd = async () => {
  if (!newTodoTitle.value.trim()) return;

  const todo = new Todo();
  todo.title = newTodoTitle.value;
  await todo.save();

  newTodoTitle.value = '';
};

const handleToggle = async (todo: Todo) => {
  todo.completed = !todo.completed;
  await todo.save();
};

const handleDelete = async (todo: Todo) => {
  await todo.remove();
};
</script>

<template>
  <div class="todo-app">
    <h1>待办事项 ({{ activeCount }}/{{ totalCount }})</h1>

    <div class="todo-input">
      <input v-model="newTodoTitle" @keyup.enter="handleAdd" placeholder="添加新待办..." />
      <button @click="handleAdd">添加</button>
    </div>

    <div class="filters">
      <button :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
      <button :class="{ active: filter === 'active' }" @click="filter = 'active'">未完成</button>
      <button :class="{ active: filter === 'completed' }" @click="filter = 'completed'">已完成</button>
    </div>

    <div v-if="isLoading">加载中...</div>
    <ul class="todo-list" v-else>
      <li class="todo-item" v-for="todo in todos" :key="todo.id">
        <input :checked="todo.completed" @change="handleToggle(todo)" type="checkbox" />
        <span :class="{ completed: todo.completed }">
          {{ todo.title }}
        </span>
        <button @click="handleDelete(todo)">删除</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
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
</style>
```

## Options API 支持

虽然 `@aiao/rxdb-vue` 主要为 Composition API 设计，但也可以在 Options API 中使用：

```vue
<script lang="ts">
import { defineComponent } from 'vue';
import { useFind } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

export default defineComponent({
  setup() {
    const resource = useFind(Todo, {
      where: { completed: false }
    });

    return {
      todos: resource.value,
      isLoading: resource.isLoading
    };
  }
});
</script>

<template>
  <div v-if="isLoading">加载中...</div>
  <ul v-else>
    <li v-for="todo in todos" :key="todo.id">
      {{ todo.title }}
    </li>
  </ul>
</template>
```

## 类型安全

所有 Composables 都是完全类型安全的，TypeScript 会自动推断实体类型和查询选项：

```typescript
import { useGet, useFind } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

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

使用 `computed` 来缓存查询选项：

```vue
<script lang="ts" setup>
import { ref, computed } from 'vue';
import { useFind } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const filter = ref('');

const options = computed(() => ({
  where: {
    combinator: 'and',
    rules: [{ field: 'title', operator: 'like', value: `%${filter.value}%` }]
  }
}));

const { value: todos } = useFind(Todo, options);
</script>
```

### 分页加载

对于大量数据，使用分页查询：

```vue
<script lang="ts" setup>
import { ref } from 'vue';
import { useFind } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const page = ref(0);
const pageSize = 20;

const { value: todos } = useFind(Todo, () => ({
  limit: pageSize,
  offset: page.value * pageSize,
  orderBy: [{ field: 'createdAt', sort: 'desc' }]
}));

const prevPage = () => {
  if (page.value > 0) page.value--;
};

const nextPage = () => {
  page.value++;
};
</script>

<template>
  <ul>
    <li v-for="todo in todos" :key="todo.id">
      {{ todo.title }}
    </li>
  </ul>
  <button :disabled="page === 0" @click="prevPage">上一页</button>
  <button @click="nextPage">下一页</button>
</template>
```

## 注意事项

1. **生命周期管理**：Composables 会自动管理订阅的生命周期，在组件卸载时自动取消订阅
2. **错误处理**：始终检查 `error` 属性来处理查询错误
3. **加载状态**：使用 `isLoading` 来显示加载状态，提供更好的用户体验
4. **空状态**：使用 `isEmpty` 来判断查询结果是否为空
5. **响应式**：所有返回的属性都是响应式的，可以直接在模板中使用
6. **性能考虑**：使用 `computed` 或函数式选项来避免不必要的重新订阅

## 参考

- [模型定义](../model-definition/)
- [模型查询 - findOne](../model-query/findOne.md)
- [模型查询 - find](../model-query/find.md)
- [客户端生成](../client-generator.md)
