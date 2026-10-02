# @aiao/rxdb-plugin-replay

`@aiao/rxdb` 的会话录制回放插件，**默认不录**，由应用显式开始。它用 rrweb 录下页面 DOM，事件写进一个**独立的录制库**，被录的应用库里不多一行数据。回放时间轴上会标出工作树的 commit，点一下标记，就能把工作树恢复到那次提交。

rrweb 钉在精确版本 `2.1.6`。回放组件按需 `import('rrweb')`，所以不打开回放视图，rrweb 回放端就不会被加载。

## 安装

```bash
pnpm add @aiao/rxdb @aiao/rxdb-plugin-replay rxjs
# 需要 commit 标记与恢复时再装（可选 peer）
pnpm add @aiao/rxdb-plugin-working-tree
```

## 用法

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginReplay } from '@aiao/rxdb-plugin-replay';

// 录制库工厂：返回另一个 RxDB，不要返回被录的应用库
const createRecordingDb = entities =>
  new RxDB({
    dbName: 'my-app-replay',
    entities: [...entities],
    multiInstance: false,
    sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
  }).adapter('sqlite-wasm', async db => new RxDBAdapterSqlite(db, sqliteOptions));

db.use(rxDBPluginReplay, {
  createRecordingDb,
  limits: { sessionBytes: 16 * 1024 * 1024, storeBytes: 128 * 1024 * 1024 },
  record: { maskTextSelector: '.secret' }
});
await db.connect('sqlite-wasm');

const sessionId = await db.replay.start();
// …用户操作…
await db.replay.stop();

const sessions = await db.replay.listSessions(); // 状态 / 事件数 / 体积
const events = await db.replay.readEvents(sessionId);
```

录制库工厂在每个连接纪元里只调用一次，时机是第一次需要存储时。返回的库如果还没 `init()`，插件会先替它 `init()`，再 `connect()`，作用域释放时一并 `destroy()`。工厂抛错或返回的库连不上时，插件抛 `RxDBReplayError('recording_db_unavailable')`，下一次调用会重新调用工厂。

`db.replay` 是 `ReplayManager`，成员如下：

- 录制：`state$`、`start()`、`stop()`
- 读取：`listSessions()`、`readEvents(id, range?)`、`listCommitMarkers(id)`、`exportSession(id)`
- 空间：`deleteSession(id)`、`usage()`
- 恢复：`restoreToCommit(commitId)`

页面刷新时，录制会话会通过 `sessionStorage` 暂存续上同一个 id：还没冲刷的事件不会丢，暂存不完整时写一条 `gap` 标记。

## 体积上限

上限按事件 `JSON.stringify` 后的 UTF-8 字节计，两项都可配置：

| 选项                  | 默认    | 超出时                                                                           |
| --------------------- | ------- | -------------------------------------------------------------------------------- |
| `limits.sessionBytes` | 16 MiB  | 该会话停录，写一条 `truncated` 标记（`session_limit`），会话状态变为 `truncated` |
| `limits.storeBytes`   | 128 MiB | `start()` 抛 `RxDBReplayError('store_limit')`                                    |

插件**绝不自动删除**旧录像，释放空间只能调用 `deleteSession()`。

## 脱敏

- `maskAllInputs` 默认为 `true`，输入框里的值只录成同样长度的 `*`。
- 给元素加上 `data-rxdb-replay-block` 属性（`REPLAY_BLOCK_SELECTOR`），它在录像里就只剩一个同尺寸的占位块。这个选择器总会并入你传的 `record.blockSelector`。
- `record` 透传 rrweb 的 `maskInputOptions` / `maskTextSelector` / `maskTextClass` / `blockSelector` / `blockClass` / `ignoreSelector`，含义以 rrweb 文档为准。

## commit 标记与恢复

被录的库装了 `@aiao/rxdb-plugin-working-tree` 时，录制中的每次提交都会写一条 `commit` 标记（rrweb Custom 事件，`tag` 为 `rxdb-replay:commit`）。标记来自工作树门面的 `commits$`。

`restoreToCommit(commitId)` 每次调用时都现取工作树凭据，再调 `workingTree.restore()`。被拒绝时用 `replayRestoreHint(reason)` 取提示文案，可能的 `reason`：

- `conflict`
- `dirty_working_tree`
- `incompatible_schema`
- `unreachable_target`

没装工作树插件时抛 `working_tree_unavailable`。

## 回放

`mountReplayer(host, { replay, sessionId, initialTime, onTimeChange, onCommitRestore })` 会在 `host` 里挂出以下内容：

- rrweb 回放 iframe
- 播放 / 暂停按钮
- 时间轴
- commit 标记列表

它返回 `play` / `pause` / `seek` / `update` / `destroy` 句柄。三个框架的封装 API 对称：

- Angular：[`@aiao/rxdb-plugin-replay-angular`](../rxdb-plugin-replay-angular)
- React：[`@aiao/rxdb-plugin-replay-react`](../rxdb-plugin-replay-react)
- Vue：[`@aiao/rxdb-plugin-replay-vue`](../rxdb-plugin-replay-vue)

## 错误

插件的业务错误统一抛 `RxDBReplayError`，请按 `code` 分支处理，不要匹配 `message`。可能的 `code`：

- `no_dom`
- `already_recording`
- `store_limit`
- `recording_db_unavailable`
- `session_not_found`
- `session_recording`
- `working_tree_unavailable`
- `invalid_marker`
- `not_installed`

## 测试

以下命令在仓库根目录执行；pnpm 的 preinstall 门禁要求 Node 26。

### 包内测试

```bash
pnpm nx test rxdb-plugin-replay                                 # node 环境：上限、续录、commit 标记、恢复、选项校验、三框架 parity 契约
pnpm nx run rxdb-plugin-replay:test-browser                     # 真实 chromium：*.browser.spec.ts（rrweb 录制 / 回放、脱敏）
REPLAY_BENCH=1 pnpm nx test rxdb-plugin-replay -- store.bench   # 写入基准，中位数 < 100 ms；默认不跑
```

`test` 只跑 node 环境，`*.browser.spec.ts` 只有 `test-browser` 会跑：改了录制、回放或脱敏，记得跑后者。

### 在 demo 里手动验证

1. `pnpm nx serve dev-rxdb-angular`，打开 `http://localhost:4200/replay`，打开录制开关（页面会重新加载）。
2. 在 `/todo` 建两条 Todo，各提交一次，回到 `/replay` 停止录制。
3. 在会话列表里点「回放」：时间轴可以拖动，两个 commit 标记按提交顺序排列。
4. 点第一个标记：回放跳到第一次提交那一刻，状态区显示 `Restored …`，`/working-tree` 上工作树变脏。
5. 在「脱敏演示」的输入框里打字再回放：输入只剩同样长度的 `*`，`data-rxdb-replay-block` 区块只剩占位块。
6. 关掉开关后重新加载：DevTools Network 里不出现 `rrweb` 与 `rxdb-plugin-replay` 的 chunk，IndexedDB 里不新建 `*-replay` 库。

### demo e2e

```bash
pnpm nx e2e dev-rxdb-angular-e2e -- replay.spec
```

`apps/dev-rxdb-angular-e2e/src/replay.spec.ts` 覆盖：刷新后续录同一会话、录制不进应用库、commit 标记与恢复、输入遮蔽与 block 占位。

### 与 e2e 失败现场的关系

Angular e2e 默认不打开录制，e2e 失败时留下的现场里**没有** rrweb 录像：

| 产物                                    | 何时产生                                               | 怎么看                                                            |
| --------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| Playwright trace（`trace.zip`）         | 用例失败时保留，通过的用例不留                         | `npx playwright show-trace <trace.zip>`，或在 HTML 报告里点 Trace |
| 数据归档（附件 `rxdb-failure-archive`） | 用例失败时自动导出；`failure-archive.spec.ts` 主动导出 | demo 的 `/failure-archive` 页导入                                 |

两者都在 `apps/dev-rxdb-angular-e2e/test-output/playwright/` 下：trace 在 `output/<用例>/`，附件在 `report/data/*.bin`（以 `RXDBBAK` 开头）。用
`npx playwright show-report apps/dev-rxdb-angular-e2e/test-output/playwright/report` 打开报告，能看出每个附件属于哪个用例。每次跑 e2e 都会覆盖这个目录。

导入页的验证（`http://localhost:4200/failure-archive`，页面根节点的 `data-phase` 反映状态）：

| 场景       | 操作                             | 预期                                             |
| ---------- | -------------------------------- | ------------------------------------------------ |
| 解析       | 选择归档文件                     | `idle` → `parsed`，显示库名、创建时间、格式版本  |
| 导入       | 点「导入并打开」                 | `importing` 后整页重载，顶部出现导入库提示条     |
| 非法文件   | 选一个非归档文件                 | `error`，显示错误码，没有「打开该库」            |
| 重复导入   | 「回到默认库」后再导入同一份归档 | `target_not_empty`，「打开该库」打开之前导入的库 |
| 目标被占用 | 导入库还在别的标签页开着时再导入 | `target_busy`，同样提供「打开该库」              |

- 归档恢复到**原库名**：在生成归档的同一个浏览器 profile 里导入会直接 `target_not_empty`，手动测请用无痕窗口或另一个 profile。
- 导入后应用一直打开导入库（localStorage 键 `rxdb-demo-imported-db-name`），点提示条上的「回到默认库」恢复。
- 在导入库上同样可以打开 `/replay` 的录制开关，录下自己复现的过程；commit 标记照常和工作树联动。

想看一个完整的失败现场，临时让某条 Angular e2e 用例失败（例如断言一个不存在的 test id），跑完后同一个用例下会同时有
trace、`rxdb-failure-archive` 与 `rxdb-failure-summary`：先看 trace 了解「做了什么」，再导入归档查看「数据当时的状态」。

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 插件指南见项目文档站

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
