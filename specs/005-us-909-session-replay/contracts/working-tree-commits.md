# Contract: `WorkingTreeManager.commits$`

**Package**: `@aiao/rxdb-plugin-working-tree` | **Research**: [../research.md](../research.md) D7

```ts
interface WorkingTreeManager {
  /**
   * 每次 `commit()` 在事务提交后、且确实写入了新 commit 时发出一次。
   */
  readonly commits$: Observable<WorkingTreeCommitEvent>;
}

interface WorkingTreeCommitEvent {
  readonly commitId: string;
  readonly branchId: string;
}
```

## 1. 发出

| 场景                                                    | 发出？ | 值                                        |
| ------------------------------------------------------- | :----: | ----------------------------------------- |
| `commit()` 返回 `ok: true`，本次写入了新 commit         |   ✅   | `{ commitId: result.commitId, branchId }` |
| `commit()` 返回 `ok: false`（凭据冲突 / HEAD CAS 落败） |   ❌   | —                                         |
| `commit()` 抛错（`empty_commit`、图损坏、事务回滚等）   |   ❌   | —                                         |
| 同一 `operationId` 的幂等重放（返回既有 commit）        |   ❌   | —                                         |
| `enable()` / `enableIfEmpty()` 的基线、建分支的基线     |   ❌   | —                                         |
| `restore()` / `discard()`                               |   ❌   | —                                         |

## 2. 时序

- 在 `commit()` 的 Promise resolve **之前**同步发出：调用方 `await commit()` 之后，订阅者一定已经收到。
- 发出时事务已提交：订阅者在回调里 `listCommits()` 一定能读到这个 `commitId`。
- 同一个门面上的多次 `commit()` 按 resolve 顺序发出。

## 3. 订阅者隔离

- 订阅者抛错不影响 `commit()` 的返回值，也不影响其他订阅者；错误走 RxJS 的未处理错误路径（`config.onUnhandledError`，缺省异步重抛）。
- `commits$` 不会 `error`；连接纪元结束后门面不会再发值，但流不 `complete`（门面本身跨纪元存活）。

## 4. 形态

- **实例字段**（`facade-capability-gate` 测试的要求）；不经 `runEnabled()` 门禁，未启用的库上也能订阅，只是永远不发。
- `WorkingTreeManagerStub`（`testing/use-working-tree-fixtures.ts`）补同名字段，返回一个从不发值的 Observable。
- 类型 `WorkingTreeCommitEvent` 从包入口导出；API 基线随提交更新。
