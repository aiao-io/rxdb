# packages/rxdb 全量代码评审

评审日期：2026-11-20（Asia/Shanghai）  
评审快照：`371493488`  
评审范围：`packages/rxdb` 全部源码与现有测试  
评审分支：`codex/review-rxdb`

## 结论

确认 2 个 P2 问题，均位于 RxDB 初始化与拆卸生命周期。没有把架构风险、测试遗漏、注释中的已知限制或已有 `Resolved` 评审记录重复列为问题。

| 严重程度 | 问题                                         | 位置                                                                         |
| -------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| P2       | `init()` 在配置校验失败后仍保持已初始化状态  | `packages/rxdb/src/RxDB.ts:707-721`                                          |
| P2       | 重叠的全局拆卸会重复销毁插件并重复断开适配器 | `packages/rxdb/src/RxDB.ts:1424-1426`、`packages/rxdb/src/RxDB.ts:1719-1778` |

## P2：`init()` 配置校验失败后实例仍被标记为已初始化

### 触发条件

调用方传入缺少库级 `sync` 的运行时配置。TypeScript 类型声明要求 `sync` 存在，但 JavaScript、反序列化旧配置或绕过类型检查的调用仍能进入构造器。

最小复现：

```ts
const db = new RxDB({
  dbName: 'review-missing-sync',
  entities: [],
  sync: undefined
} as never);

expect(() => db.init()).toThrow(/缺少库级 sync/);
expect(db.initialized).toBe(true);

expect(() => db.init()).not.toThrow();
```

### 影响

第一次 `init()` 已经抛错，但实例的 `initialized` 仍为 `true`。后续 `init()` 会命中早退分支，Schema、Entity、事件系统、插件和连接作用域不会重新初始化。

实例因此停留在半初始化状态。调用方无法通过修正配置或重新调用 `init()` 恢复该实例，只能丢弃实例并重新创建。

这与 `init()` 的文档约定冲突。文档明确说明初始化失败后应回滚初始化标志和相关状态，使后续调用可以重试。

### 根因

`packages/rxdb/src/RxDB.ts:707-708` 先执行：

```ts
if (this.#rxdb_initialized) return;
this.#rxdb_initialized = true;
```

随后 `packages/rxdb/src/RxDB.ts:719-721` 才校验 `sync`。这段校验位于初始化回滚用的 `try/catch` 之外，因此异常不会执行 `this.#rxdb_initialized = false`。

### 修复方向

把 `sync` 校验移到设置 `#rxdb_initialized` 之前，或者把校验纳入统一初始化回滚路径。回归测试需要确认：

- 配置校验失败后 `initialized === false`
- 第二次 `init()` 仍会执行初始化，而不是静默返回
- 失败期间已经创建的作用域、插件登记和管理器状态不会残留

## P2：重叠的全局拆卸会重复执行插件销毁和适配器断开

### 触发条件一：单点 `disconnect()` 与 `disconnectAll()` 重叠

1. 成功连接一个适配器。
2. 让单点 `disconnect()` 卡在插件释放或 `adapter.disconnect()`。
3. 在第一次拆卸完成前调用 `disconnectAll()`。
4. 观察同一个 legacy plugin 的 `destroy()` 和同一个 adapter 的 `disconnect()` 调用次数。

复现结果是两个生命周期调用都进入了自己的拆卸流程，同一插件会收到两次 `destroy()`，同一适配器会收到第二次 `disconnect()`。

### 触发条件二：两次 `disconnectAll()` 并发

```ts
const first = db.disconnectAll();
const second = db.disconnectAll();
```

让适配器的第一次 `disconnect()` 阻塞，在阻塞期间调用第二次 `disconnectAll()`。第二次调用会再次进入全局拆卸，并再次调用同一个适配器的 `disconnect()`。当第二次调用被设置为抛错时，第二个 `disconnectAll()` 会 reject。

### 影响

- legacy plugin 的 `destroy()` 可能并发执行两次。该接口没有为旧版 `destroy()` 声明幂等保证，监听器、句柄和外部资源可能被重复释放。
- `destroyPlugin()` 会捕获并记录 `destroy()` 的第二次错误，调用方可能只看到日志，实际资源释放失败不会成为拆卸 Promise 的唯一结果。
- `IRxDBAdapter.disconnect()` 的接口文档要求实现幂等，但核心仍会产生重复调用，非幂等实现会把重复关闭错误传给调用方。
- 两次 `#shutdown()` 会并发操作插件作用域、Repository 缓存、适配器状态和初始化标志，拆卸顺序取决于 Promise 调度。

### 根因

`packages/rxdb/src/RxDB.ts:1424-1426` 每次调用 `disconnectAll()` 都直接创建新的 `#disconnect_all()` Promise。虽然 `#track_teardown()` 会把本次调用登记到 `#teardown_map`，但它只登记和覆盖映射，不复用已经存在的拆卸 Promise。

因此以下流程会重复执行：

```text
disconnectAll()
  -> #disconnect_all()
     -> #shutdown()
     -> adapter.disconnect()
```

`packages/rxdb/src/RxDB.ts:1335-1337` 只对同名、同缓存实例的并发单点 `disconnect()` 做了 Promise 复用。`disconnectAll()` 没有对应的全局 in-flight 仲裁。

`packages/rxdb/src/rxdb.plugin-lifecycle.ts:209-223` 的 `destroyPlugin()` 会按插件顺序执行 legacy `destroy()`，但没有跨两次 `#shutdown()` 的去重保护。

### 修复方向

为全局拆卸建立唯一的 in-flight Promise。已有全局拆卸时，后续 `disconnectAll()` 应直接复用该 Promise，并保持相同的成功或失败结果。

需要补充回归测试：

- 单点 `disconnect()` 卡在适配器断连期间调用 `disconnectAll()`，适配器只断开一次
- 单点 `disconnect()` 卡在插件销毁期间调用 `disconnectAll()`，插件只销毁一次
- 两次并发 `disconnectAll()` 只执行一轮 `#shutdown()` 和适配器断连
- 任一拆卸失败时，所有调用方观察到一致的错误和最终清理状态

## 已执行验证

以下命令均通过：

```bash
pnpm nx run rxdb:lint --skipNxCache
pnpm nx run rxdb:typecheck --skipNxCache
pnpm nx run rxdb:test --skipNxCache
```

评审期间使用的临时复现用例已删除，评审分支没有修改生产代码。
