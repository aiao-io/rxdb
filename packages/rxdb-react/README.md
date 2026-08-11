# @aiao/rxdb-react

`@aiao/rxdb-react` 把 `@aiao/rxdb` 的响应式仓库查询接入 React 19。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-react react react-dom rxjs
```

## Provider

`RxDBProvider` 必须接收已经创建完成的数据库实例。`useRxDB()` 会读取最近的 Provider；也可以把数据库实例直接传给 `useRxDB(db)`。

```tsx
import type { RxDB } from '@aiao/rxdb';
import { RxDBProvider } from '@aiao/rxdb-react';

interface AppProps {
  db: RxDB;
}

export function App({ db }: AppProps) {
  return (
    <RxDBProvider db={db}>
      <Routes />
    </RxDBProvider>
  );
}
```

需要隔离多个数据库 context 时使用 `makeRxDBProvider<T>()` 创建独立的 Provider/hook 对。

## 查询 Hooks

所有查询 hook 返回 `{ value, error, isLoading, isEmpty, hasValue }`。查询参数既可以直接传值，也可以传返回参数的函数。参数函数可能在一次 render 中被调用多次，每次必须返回结构相等的值；非幂等函数会抛出 `TypeError`，避免形成无限重渲染。结构相等的 inline 参数不会重复订阅；参数语义变化时会取消旧订阅并启动新查询。

- `useGet`
- `useFindOne`
- `useFindOneOrFail`
- `useFind`
- `useFindByCursor`
- `useFindAll`
- `useCount`
- `useFindDescendants`
- `useCountDescendants`
- `useFindAncestors`
- `useCountAncestors`
- `useGraphNeighbors`
- `useCountNeighbors`
- `useGraphPaths`

查询失败采用 stale-while-error 语义：`value` 保留最后一次成功值，`error` 保存原始 `Error`，`hasValue` 变为 `false`，`isEmpty` 变为 `undefined`。

## 无限滚动

`useInfiniteScroll` 通过仓库的 `findByCursor` 加载页面，返回 `{ value, error, isLoading, isEmpty, hasMore, loadMore, refresh }`。

```tsx
const todos = useInfiniteScroll(Todo, {
  where: { combinator: 'and', rules: [] },
  orderBy: [
    { field: 'createdAt', sort: 'desc' },
    { field: 'id', sort: 'asc' }
  ],
  limit: 50
});
```

`loadMore()` 在加载中或没有下一页时不会重复请求。`refresh()` 会取消现有页面订阅并从第一页重新加载。

## 异步操作

`useAction` 把一个异步函数包成带在途状态的 action：

```tsx
const save = useAction((todo: Todo) => repository.save(todo));

return (
  <button disabled={save.isPending} onClick={() => save.execute(todo)}>
    {save.isPending ? '保存中…' : '保存'}
  </button>
);
```

`isPending` 是**并发计数**而不是布尔开关：N 次调用同时在途时它一直为真，直到最后一个 settle；计数在 `finally` 里回退，因此失败也会正确复位。有意不做去重与取消 —— 重复点击会真的执行多次，错误原样 reject 给调用方。

`execute` 的函数 identity 跨渲染稳定，可以直接进 `useEffect` / `useCallback` 的依赖数组，同时调用的始终是最新一次渲染传入的函数。

## 持久化状态

`usePersistedState` 把一份状态持久化到 `localStorage`，同 `namespace + name` 共享同一份状态：

```tsx
const theme = usePersistedState('my-app', 'theme', 'dark');

return <button onClick={() => theme.setValue('light')}>{theme.value}</button>;
```

- 后续调用传入的 `initialValue` 会被忽略，但仍参与**类型标签**校验 —— 同 key 换值类型直接抛错，而不是静默串型。
- `namespace` 与 `name` 在键里各自转义，不会互相串号；含 `:` 或 `%` 的旧键在首次读取时一次性迁移。
- 是**快照**语义：对象原地改字段不会重渲染也不会落盘，必须整体 `setValue`。`setValue` 的 identity 跨渲染稳定。
- 订阅走 `useSyncExternalStore`，并发渲染与 `StrictMode` 下都不会读到撕裂的快照。
- 写盘失败**不抛错**，内存值照常更新，失败经 `persistError` 暴露 —— 这是唯一能知道数据没落盘的途径。
- SSR 下不读也不写 `localStorage`，退化成纯内存值；暂不监听 `storage` 事件，因此不跨标签页同步。

## 实体实时变更

实体是原地可变的类实例，引用不变，React 的 props/state 比较看不到它们的字段变化。`useEntityChange` 把实体的 `patches$` 接进渲染依赖：

```tsx
// 输入停止 200ms 后才重渲染
const live = useEntityChange(todo, { debounceTime: 200 });

return <div>{live.value?.title}</div>;
```

`debounceTime` 与 `auditTime` 单位是毫秒，同时设置时**串联**生效（顺序 `debounceTime → auditTime`），仅**正有限值**生效：`0`、负值、`NaN`、`Infinity` 一律表示禁用，两者都禁用时 patch 同步透传。`revision` 记录已收到的 patch 次数，跨实体切换继续累加；`error` 在实体或时间窗切换时复位。

## 三端 API 对照

同功能同 API 是本仓库的硬约束，框架惯例允许容器形态与命名差异，不允许能力缺失：

| 能力         | React                                   | Angular                                                | Vue                                  |
| ------------ | --------------------------------------- | ------------------------------------------------------ | ------------------------------------ |
| 查询         | `useGet` / `useFind` / …                | 同名                                                   | 同名                                 |
| 无限滚动     | `useInfiniteScroll`                     | `useInfiniteScroll`                                    | `useInfiniteScroll`                  |
| 异步操作     | `useAction` → 渲染快照                  | `useAction` → `Signal<boolean>`                        | `useAction` → `ComputedRef<boolean>` |
| 持久化状态   | `usePersistedState` → 快照 + `setValue` | `usePersistedState` / `useState` → `WritableSignal<T>` | `usePersistedState` → `Ref<T>`       |
| 实体实时变更 | `useEntityChange`                       | `RxDBEntityChangeDirective`（`markForCheck`）          | `useEntityChange`                    |

时间窗判定（`withTimeWindows`）与持久化内核（`PersistedStateRegistry`）都放在 `@aiao/utils` 里由三端共用，语义不会各自漂移。Angular 的 `usePersistedState` 是既有 `useState` 的扁平签名适配，与 Vue / React 侧**键格式一致**但各自持有内存状态。
