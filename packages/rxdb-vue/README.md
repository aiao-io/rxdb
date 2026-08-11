# @aiao/rxdb-vue

`@aiao/rxdb-vue` 把 `@aiao/rxdb` 的实时查询接入 Vue 3 Composition API。该包提供依赖注入、响应式查询 hooks 和游标无限滚动，不包含 UI 组件。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-vue rxjs vue
```

`vue >= 3.5` 与 `rxjs ^7.8` 是 peer dependencies。

## 提供数据库

在会渲染业务组件的祖先组件中调用 `provideRxDB`：

```vue
<script lang="ts" setup>
import { provideRxDB } from '@aiao/rxdb-vue';
import { database } from './database';
import TodoList from './TodoList.vue';

provideRxDB(database);
</script>

<template>
  <TodoList />
</template>
```

同步消费者可以使用：

```ts
import { injectRxDB, useRxDB } from '@aiao/rxdb-vue';

const optionalDatabase = injectRxDB(); // RxDB | undefined
const database = useRxDB(); // 缺少 provider 或当前值为空时抛错
```

### 异步初始化

`provideRxDB` 也接受 `Ref<RxDB | undefined>`。需要等待数据库就绪的消费者应使用 ref API：

```ts
import type { RxDB } from '@aiao/rxdb';
import { provideRxDB, useRxDBRef } from '@aiao/rxdb-vue';
import { shallowRef } from 'vue';

const databaseRef = shallowRef<RxDB>();
provideRxDB(databaseRef);

const database = useRxDBRef();
// database.value 在初始化完成后更新
```

`injectRxDBRef()` 是可选版本；没有 provider 时返回 `undefined`。`useInfiniteScroll` 会在 provider 存在但数据库仍为 `undefined` 时等待，并在 ref 就绪后自动加载。

## 响应式查询

实体静态查询方法返回的 Observable 会驱动 Vue 响应式资源：

```ts
import { useCount, useFind, useGet } from '@aiao/rxdb-vue';
import { Todo } from './entities/Todo';

const todo = useGet(Todo, 'todo-1');
const todos = useFind(Todo, {
  where: { combinator: 'and', rules: [] }
});
const count = useCount(Todo, {
  where: { combinator: 'and', rules: [] }
});
```

每个查询资源公开：

- `value`：最近一次成功结果；重新查询期间保留旧值（stale-while-revalidate）；
- `isLoading`：是否有一轮查询正在进行；
- `error`：标准化后的 `Error | undefined`；
- `hasValue`：`value` 是否属于**当前**查询条件 —— 重新查询一开始就落回 `false`，收到新值才为 `true`；
- `isEmpty`：成功结果是否为空；未返回结果或错误时为 `undefined`。

判断「当前值可信」请看 `hasValue`，不要用 `value !== defaultValue`。

### 资源是 reactive 对象，不要直接解构

基础查询 hooks 返回的是一个 `reactive` 对象，字段是普通响应式属性而**不是** `Ref`。
直接解构只会读到一次性快照，之后永不更新：

```ts
const todo = useGet(Todo, 'todo-1'); // ✅ 整体持有，模板用 todo.value / todo.isLoading
const { value } = toRefs(useGet(Todo, 'todo-1')); // ✅ 先 toRefs 再解构
const { value } = useGet(Todo, 'todo-1'); // ❌ 一次性快照，Observable 后续发值也不会更新
```

`useInfiniteScroll` 的返回值形态不同（成员本身就是 `ComputedRef`，解构安全），两者不要互相类推。

### 查询参数

查询参数可直接传值，也可传 `Ref`、`ComputedRef` 或 getter（类型 `UseOptions<T>` 已导出）。
参数**按内容**比较而非按引用：`reactive` 对象原地改字段会触发重查，换成结构等价的新对象则不会重订阅。
代价是参数必须可序列化 —— 含函数、`Symbol` 或类实例时会抛 `TypeError`（游标分页的 `after` / `before` 实体除外，它们按 `orderBy` 字段投影后比较）。

重新查询开始时，`isLoading` 置为 `true`，`error`/`hasValue`/`isEmpty` 同步复位，`value` 保留旧值。
Angular 与 React 侧是同一份契约。

SSR 下（无 `window`）不会发起订阅，资源停在 `isLoading: true` 的初始态；客户端 hydrate 后正常查询。
订阅随组件卸载自动清理。

基础查询 API：

- `useGet`
- `useFindOne`
- `useFindOneOrFail`
- `useFind`
- `useFindByCursor`
- `useFindAll`
- `useCount`

Tree API：`useFindDescendants`、`useCountDescendants`、`useFindAncestors`、`useCountAncestors`。

Graph API：`useGraphNeighbors`、`useCountNeighbors`、`useGraphPaths`。实体仍需安装并配置对应的 RxDB tree/graph 能力。

## 无限滚动

```ts
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

list.loadMore();
list.refresh();
```

`useInfiniteScroll` 返回：

- `value: ComputedRef<T[]>`
- `isEmpty: ComputedRef<boolean>`
- `isLoading: ComputedRef<boolean>`
- `error: ComputedRef<Error | undefined>`
- `hasMore: ComputedRef<boolean>`
- `loadMore()` 与 `refresh()`

字段全部是只读的 `ComputedRef`，可以安全解构。`hasMore` 由最后一页决定：页容量非正（`limit <= 0` 或 `NaN`）永远是 `false`，一次数据都没发就 complete 的流也收敛为 `false`，因此自动触底不会无界重发。`error` 原样透传底层 `Error`。

首屏在组件 mounted 后加载；后续页面自动带上上一页最后一个实体作为 `after`。options 或异步提供的数据库变化时，旧分页订阅会清理并从第一页重载。已加载页面的 live Observable 可以继续更新该页，但只有最新分页请求会结束全局 loading 或更新 `hasMore`。

## 异步操作

`useAction` 把一个异步函数包成带在途状态的 action：

```vue
<script lang="ts" setup>
import { useAction } from '@aiao/rxdb-vue';

const save = useAction((todo: Todo) => repository.save(todo));
</script>

<template>
  <button :disabled="save.isPending.value" @click="save.execute(todo)">
    {{ save.isPending.value ? '保存中…' : '保存' }}
  </button>
</template>
```

`isPending` 是**并发计数**而不是布尔开关：N 次调用同时在途时它一直为真，直到最后一个 settle；计数在 `finally` 里回退，因此失败也会正确复位。有意不做去重与取消 —— 重复点击会真的执行多次，错误原样 reject 给调用方。

## 持久化状态

`usePersistedState` 把一份状态持久化到 `localStorage`，同 `namespace + name` 始终返回同一个 `Ref`：

```ts
import { usePersistedState } from '@aiao/rxdb-vue';

const theme = usePersistedState('my-app', 'theme', 'dark');

theme.value.value = 'light'; // 立即落盘到 'my-app:theme'
```

- 后续调用传入的 `initialValue` 会被忽略，但仍参与**类型标签**校验 —— 同 key 换值类型直接抛错，而不是静默串型。
- `namespace` 与 `name` 在键里各自转义，不会互相串号；含 `:` 或 `%` 的旧键在首次读取时一次性迁移。
- 是 `shallowRef` 语义：对象原地改字段不触发响应式也不落盘，必须整体赋新值。
- 写盘失败**不抛错**，内存值照常更新，失败经 `persistError` 暴露 —— 这是唯一能知道数据没落盘的途径。
- SSR 下不读也不写 `localStorage`，退化成纯内存值；暂不监听 `storage` 事件，因此不跨标签页同步。

## 实体实时变更

实体是原地可变的类实例，引用不变，Vue 的响应式系统看不到它们的字段变化。`useEntityChange` 把实体的 `patches$` 接进渲染依赖：

```vue
<script lang="ts" setup>
import { useEntityChange } from '@aiao/rxdb-vue';

const props = defineProps<{ todo: Todo }>();
// 输入停止 200ms 后才重渲染
const live = useEntityChange(() => props.todo, { debounceTime: 200 });
</script>

<template>
  <div>{{ live.value?.title }}</div>
</template>
```

模板必须经由 `live.value` 读实体，直接读原始实例的字段不会重渲染。`debounceTime` 与 `auditTime` 单位是毫秒，同时设置时**串联**生效（顺序 `debounceTime → auditTime`），仅**正有限值**生效：`0`、负值、`NaN`、`Infinity` 一律表示禁用，两者都禁用时 patch 同步透传。两个字段都接受响应式入参。

## 三端 API 对照

同功能同 API 是本仓库的硬约束，框架惯例允许容器形态与命名差异，不允许能力缺失：

| 能力         | Vue                                  | Angular                                                | React                                   |
| ------------ | ------------------------------------ | ------------------------------------------------------ | --------------------------------------- |
| 查询         | `useGet` / `useFind` / …             | 同名                                                   | 同名                                    |
| 无限滚动     | `useInfiniteScroll`                  | `useInfiniteScroll`                                    | `useInfiniteScroll`                     |
| 异步操作     | `useAction` → `ComputedRef<boolean>` | `useAction` → `Signal<boolean>`                        | `useAction` → 渲染快照                  |
| 持久化状态   | `usePersistedState` → `Ref<T>`       | `usePersistedState` / `useState` → `WritableSignal<T>` | `usePersistedState` → 快照 + `setValue` |
| 实体实时变更 | `useEntityChange`                    | `RxDBEntityChangeDirective`（`markForCheck`）          | `useEntityChange`                       |

时间窗判定（`withTimeWindows`）与持久化内核（`PersistedStateRegistry`）都放在 `@aiao/utils` 里由三端共用，语义不会各自漂移。Angular 的 `usePersistedState` 是既有 `useState` 的扁平签名适配，与 Vue / React 侧**键格式一致**但各自持有内存状态。

## 完整示例

仓库中的 `apps/dev-rxdb-vue` 展示了完整集成。
