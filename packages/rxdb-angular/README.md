# @aiao/rxdb-angular

Angular 框架集成库，为 Angular 应用提供 RxDB 支持。基于 Angular Signals 实现响应式数据流。

## 功能特性

- **Angular Signals 集成**: 查询结果以 Signal 暴露，天然融入 Angular 响应式渲染
- **响应式查询 Hooks**: `useGet` / `useFind` / `useFindByCursor` 等，覆盖基础/树/图仓库查询
- **无限滚动**: `useInfiniteScroll` 返回 signal 资源（与 React/Vue 同名同形），底层类 `InfiniteScrollingList` 亦可直接使用
- **变更检测指令**: `RxDBEntityChangeDirective` 在 OnPush 下实时反映实体编辑
- **依赖注入**: 通过 `provideRxDB` 完全接入 Angular 依赖注入系统
- **类型安全**: 完整的 TypeScript 类型支持

## 何时使用

- 构建 Angular 应用并需要本地优先数据库
- 需要响应式数据流与 Angular Signals 无缝集成
- 需要离线优先的 Angular 应用

## 安装

```bash
npm install @aiao/rxdb @aiao/rxdb-angular
# 或
pnpm add @aiao/rxdb @aiao/rxdb-angular
```

## 使用

### 注册 RxDB

`provideRxDB` 接受 `RxDBSource`：实例、`Promise`，或返回二者之一的工厂。三个框架包收的是同一个联合类型。

```typescript
import { provideRxDB } from '@aiao/rxdb-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    // 工厂 / 实例 / Promise / 异步工厂都可以
    provideRxDB(() => rxdb)
  ]
};
```

异步形态用于「后端按运行环境动态选择」这类场景 —— 静态 import 会把桌面分支打进 web bundle：

```typescript
provideRxDB(async () => {
  const { setupDesktop } = await import('./setup-desktop');
  return setupDesktop();
});
```

`provideRxDB` 自带 app initializer，会在 bootstrap 阶段建好数据库再放行首帧，因此组件里 `inject(RxDB)` 始终同步可用。**初始化器不会 reject** —— 创建失败时 bootstrap 照常完成（否则窗口全白，为这种失败准备的诊断界面反而被失败本身挡在门外），原始异常留到读取时抛出。

在初始化器之外（比如 bootstrap 途中）读取时，用哪个入口取决于「没就绪该怎么办」：

```typescript
import { useRxDB, useRxDBOptional } from '@aiao/rxdb-angular';

const database = useRxDB(); // 等价于 inject(RxDB)：未就绪抛错，创建失败原样抛出创建异常
const maybe = useRxDBOptional(); // 无 provider 或未就绪时返回 undefined，用于渲染 loading 态
```

**生命周期所有权：provider 只销毁自己造的东西。** 传工厂或 `Promise`，实例由 provider 等来，注入器销毁时它负责 `disconnectAll()`；传已就绪的实例，它归调用方所有，provider 不碰 —— 否则一个模块级单例会被某个子注入器的销毁顺手断掉，而没有人会去重连。这条规则三端逐字相同。

### 查询数据

```typescript
import { Component } from '@angular/core';
import { useGet, useFind } from '@aiao/rxdb-angular';

@Component({
  selector: 'app-todo',
  template: `
    @if (todo.isLoading()) {
      <span>Loading…</span>
    } @else {
      <span>{{ todo.value()?.title }}</span>
    }
  `
})
export class TodoComponent {
  readonly todo = useGet(Todo, 'todo-1');
  readonly todos = useFind(Todo, { where: { combinator: 'and', rules: [] } });
}
```

### 无限滚动

推荐入口 —— 与 React / Vue 侧的 `useInfiniteScroll` 同名同形，随注入上下文自动释放：

```typescript
@Component({/* ... */})
export class TodoListComponent {
  // 必须在注入上下文中调用（构造器/字段初始化器）
  readonly todos = useInfiniteScroll(Todo, { limit: 50 });

  next() {
    this.todos.loadMore(); // isLoading 为真或 hasMore 为假时是 no-op
  }
}
```

模板里直接读 signal：

```html
@for (todo of todos.value(); track todo.id) {
<li>{{ todo.title }}</li>
} @if (todos.isLoading()) { <spinner /> } @if (todos.isEmpty()) { <empty-state /> }
```

也可以直接用底层类：

```typescript
@Component({/* ... */})
export class TodoListComponent {
  // 必须在注入上下文中构造：类内部经 inject(DestroyRef) 注册销毁钩子，
  // 并在构造器里建立 effect —— 在普通函数或 service 方法里裸 new 会抛 NG0203。
  readonly list = new InfiniteScrollingList(inject(RxDB), Todo, { limit: 50 });
}

list.loadMore(); // 加载下一页
list.refresh(); // 丢弃已加载页面，从头刷新（宿主销毁后是 no-op）
```

> 类没有公开的 `destroy()` —— 清理由 `DestroyRef` 接管，宿主销毁时自动退订全部页查询。
> 需要在注入上下文之外持有实例时，用 `runInInjectionContext(injector, () => new InfiniteScrollingList(...))`，
> 生命周期即绑定到该 injector。

> **破坏性变更（下一个 major）**：`isLoading` / `error` / `hasMore` 由
> `WritableSignal` 收窄为只读 `Signal`。这三个字段是内部状态机的一部分 ——
> 外部把 `isLoading` 改成 `false` 能绕过 `loadMore` 的并发 guard 发出重复页请求，
> 把 `hasMore` 改成 `true` 能越过终页。状态现在只能经 `loadMore` / `refresh` 改变，
> 与 React 侧「返回纯值」的只读语义一致。若此前依赖 `todos.isLoading.set(...)`
> 之类的写法，请改为调用 `loadMore()` / `refresh()`，或在组件里自持一个 signal。

### OnPush 下的实时变更检测

实体是原地可变的类实例，引用不变，OnPush 视图看不到它们的字段变化。`rxdbChangeDetector`
把实体的 `patches$` 接上 `markForCheck`：

```html
<div [rxdbChangeDetector]="entity"></div>
<div [debounceTime]="200" [rxdbChangeDetector]="entity"></div>
```

`debounceTime` 与 `auditTime` 单位是毫秒，同时设置时**串联**生效（顺序 `debounceTime → auditTime`），
仅**正有限值**生效：`0`、负值、`NaN`、`Infinity` 一律表示禁用，两者都禁用时 patch 同步透传。

### 异步操作

```ts
const save = useAction((todo: Todo) => repository.save(todo));

save.isPending(); // Signal<boolean>
save.execute(todo);
```

`isPending` 是**并发计数**而不是布尔开关：N 次调用同时在途时它一直为真，直到最后一个 settle；
计数在 `finally` 里回退，因此失败也会正确复位。有意不做去重与取消 ——
重复点击会真的执行多次，错误原样冒泡给调用方。

### 持久化状态

`usePersistedState` 与既有的柯里化 `useState` 是**同一份**状态，只是签名扁平：

```ts
const theme = usePersistedState('my-app', 'theme', 'dark');
theme.value.set('light'); // 落盘到 'my-app:theme'

// 等价写法
const same = useState('my-app')('theme').signal('dark'); // === theme.value
```

两者共用同一张 root 注册表、同一套键格式与失败语义。扁平签名的存在是为了三端对齐：
React 的 hooks 规则不允许「从返回对象的方法里再调 hook」，柯里化形态在 React 侧无法复现。

- 必须在 Angular 注入上下文中调用。
- 后续调用传入的 `initialValue` 会被忽略，但仍参与**类型标签**校验 —— 同 key 换值类型直接抛错。
- `namespace` 与 `name` 在键里各自转义，不会互相串号；含 `:` 或 `%` 的旧键在首次读取时一次性迁移。
- 写盘失败**不抛错**，signal 值照常更新，失败经 `persistError` 暴露。
- SSR 下不读也不写 `localStorage`；暂不监听 `storage` 事件，因此不跨标签页同步。

## 三端 API 对照

同功能同 API 是本仓库的硬约束，框架惯例允许容器形态与命名差异，不允许能力缺失：

| 能力         | Angular                                                | Vue                                  | React                                   |
| ------------ | ------------------------------------------------------ | ------------------------------------ | --------------------------------------- |
| 查询         | `useGet` / `useFind` / …                               | 同名                                 | 同名                                    |
| 无限滚动     | `useInfiniteScroll`                                    | `useInfiniteScroll`                  | `useInfiniteScroll`                     |
| 异步操作     | `useAction` → `Signal<boolean>`                        | `useAction` → `ComputedRef<boolean>` | `useAction` → 渲染快照                  |
| 持久化状态   | `usePersistedState` / `useState` → `WritableSignal<T>` | `usePersistedState` → `Ref<T>`       | `usePersistedState` → 快照 + `setValue` |
| 实体实时变更 | `RxDBEntityChangeDirective`（`markForCheck`）          | `useEntityChange`                    | `useEntityChange`                       |

时间窗判定（`withTimeWindows`）放在 `@aiao/utils` 里由三端共用。Vue / React 的持久化内核是
`@aiao/utils` 的 `PersistedStateRegistry`，与 Angular 的 root 服务 `StateRegistry`
**键格式一致**但各自持有内存状态 —— 同一页面里混用两端框架时，盘上数据互通，内存值不互通。

## 完整示例

参考 [dev-rxdb-angular](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-angular) 中的完整集成示例。
